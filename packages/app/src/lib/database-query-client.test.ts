import { describe, expect, test } from 'bun:test';
import {
  DATABASE_QUERY_CONFORMANCE_RECORDS,
  DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION,
  DATABASE_QUERY_CONFORMANCE_SOURCE,
  queryDatabaseRecords,
  runDatabaseQueryConformance,
} from '@nedian0brien/synapsenote-core';
import {
  appendDatabaseQueryPage,
  DatabaseQueryClientError,
  fetchDatabaseRecord,
  previewDatabaseComputedProperty,
  queryDatabase,
} from './database-query-client.ts';

describe('database query client conformance', () => {
  test('merges only non-overlapping pages from one exact snapshot', () => {
    const page = (
      id: string,
      snapshotRevision = 'sha256:snapshot',
      fileStates?: Record<string, 'available' | 'missing'>,
      relationRecords?: Array<{ id: string; sourceId: string; title: string }>,
    ) => ({
      sourceId: 'ds_tasks',
      snapshotRevision,
      matched: 2,
      returned: 1,
      isComplete: id === 'rec_second',
      nextCursor: id === 'rec_first' ? 'cursor_next' : null,
      truncatedBy: id === 'rec_first' ? ('page_limit' as const) : null,
      indexFreshness: 'snapshot' as const,
      records: [{ id, path: `tasks/${id}.md`, revision: null, values: {} }],
      aggregation: null,
      fileStates,
      relationRecords,
    });
    expect(
      appendDatabaseQueryPage(
        page('rec_first', undefined, { 'assets/first.pdf': 'available' }, [
          { id: 'rec_target_first', sourceId: 'ds_targets', title: 'First target' },
        ]),
        page('rec_second', undefined, { 'assets/missing.pdf': 'missing' }, [
          { id: 'rec_target_second', sourceId: 'ds_targets', title: 'Second target' },
        ]),
      ),
    ).toMatchObject({
      returned: 2,
      isComplete: true,
      nextCursor: null,
      records: [{ id: 'rec_first' }, { id: 'rec_second' }],
      fileStates: {
        'assets/first.pdf': 'available',
        'assets/missing.pdf': 'missing',
      },
      relationRecords: [
        { id: 'rec_target_first', title: 'First target' },
        { id: 'rec_target_second', title: 'Second target' },
      ],
    });
    expect(() => appendDatabaseQueryPage(page('rec_first'), page('rec_first'))).toThrow(/overlaps/);
    expect(() =>
      appendDatabaseQueryPage(page('rec_first'), page('rec_second', 'sha256:changed')),
    ).toThrow(/snapshot/);
  });

  test('retains permission-scoped conditional color matches across appended pages', () => {
    const rule = {
      id: 'ccr_hot',
      key: 'hot',
      name: 'Hot',
      color: 'red' as const,
      applyTo: { type: 'page' as const },
    };
    const page = (id: string) => ({
      sourceId: 'ds_tasks',
      snapshotRevision: 'sha256:snapshot',
      matched: 2,
      returned: 1,
      isComplete: id === 'rec_second',
      nextCursor: id === 'rec_first' ? 'cursor_next' : null,
      truncatedBy: id === 'rec_first' ? ('page_limit' as const) : null,
      indexFreshness: 'snapshot' as const,
      records: [{ id, path: `tasks/${id}.md`, revision: null, values: {} }],
      aggregation: null,
      conditionalColors: { rules: [rule], records: { [id]: { pageRuleId: rule.id } } },
    });
    expect(
      appendDatabaseQueryPage(page('rec_first'), page('rec_second')).conditionalColors,
    ).toEqual({
      rules: [rule],
      records: {
        rec_first: { pageRuleId: rule.id },
        rec_second: { pageRuleId: rule.id },
      },
    });
  });

  test('retains only returned-record Board memberships across appended pages', () => {
    const page = (id: 'rec_first' | 'rec_second', value: string) => ({
      sourceId: 'ds_tasks',
      snapshotRevision: 'sha256:snapshot',
      matched: 2,
      returned: 1,
      isComplete: id === 'rec_second',
      nextCursor: id === 'rec_first' ? 'cursor_next' : null,
      truncatedBy: id === 'rec_first' ? ('page_limit' as const) : null,
      indexFreshness: 'snapshot' as const,
      records: [{ id, path: `tasks/${id}.md`, revision: null, values: {} }],
      aggregation: null,
      groupMemberships: {
        [id]: [[{ propertyId: 'prop_status', value }]],
      },
    });

    expect(
      appendDatabaseQueryPage(page('rec_first', 'opt_todo'), page('rec_second', 'opt_done'))
        .groupMemberships,
    ).toEqual({
      rec_first: [[{ propertyId: 'prop_status', value: 'opt_todo' }]],
      rec_second: [[{ propertyId: 'prop_status', value: 'opt_done' }]],
    });
  });

  test('runs the public query vectors through browser request serialization and parsing', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      const input = JSON.parse(String(init?.body)) as { query: unknown };
      const result = queryDatabaseRecords({
        source: DATABASE_QUERY_CONFORMANCE_SOURCE,
        records: DATABASE_QUERY_CONFORMANCE_RECORDS,
        snapshotRevision: DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION,
        query: input.query,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    const report = await runDatabaseQueryConformance((input) =>
      queryDatabase(input, { fetch: fetchImplementation }),
    );

    expect(report).toMatchObject({ passed: true });
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.url === '/api/databases/query')).toBe(true);
    expect(requests.every((request) => request.init?.method === 'POST')).toBe(true);
    const continuation = JSON.parse(String(requests[1]?.init?.body)) as {
      query?: { page?: { cursor?: unknown } };
    };
    expect(continuation.query?.page?.cursor).toEqual(expect.any(String));
  });

  test('preserves machine-readable HTTP problems', async () => {
    const problem = {
      type: 'https://synapsenote.dev/problems/database-not-found',
      status: 404,
      code: 'database_not_found',
      detail: 'Database does not exist',
    };
    const fetchImplementation = (async () =>
      new Response(JSON.stringify(problem), {
        status: 404,
        headers: { 'content-type': 'application/problem+json' },
      })) as typeof globalThis.fetch;

    try {
      await queryDatabase(
        { databaseId: 'db_missing', sourceId: 'ds_tasks' },
        { fetch: fetchImplementation },
      );
      throw new Error('expected queryDatabase to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseQueryClientError);
      expect(error).toMatchObject({ status: 404, problem });
    }
  });

  test('looks up one exact record by stable ID and rejects a mismatched response', async () => {
    const requestBodies: unknown[] = [];
    const response = {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      manifestRevision: 'manifest-1',
      indexRevision: `sha256:${'a'.repeat(64)}`,
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: `sha256:${'b'.repeat(64)}`,
        values: { prop_title: 'First' },
      },
    };
    const fetchImplementation = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return Response.json(response);
    }) as typeof globalThis.fetch;

    await expect(
      fetchDatabaseRecord(
        { databaseId: 'db_tasks', sourceId: 'ds_tasks', recordId: 'rec_first' },
        { fetch: fetchImplementation },
      ),
    ).resolves.toEqual(response);
    expect(requestBodies).toEqual([
      { databaseId: 'db_tasks', sourceId: 'ds_tasks', recordId: 'rec_first' },
    ]);

    await expect(
      fetchDatabaseRecord(
        { databaseId: 'db_tasks', sourceId: 'ds_tasks', recordId: 'rec_other' },
        { fetch: fetchImplementation },
      ),
    ).rejects.toThrow('different record');
  });

  test('previews an unsaved computed property through the read-only endpoint', async () => {
    const property = {
      id: 'prop_total',
      key: 'total',
      name: 'Total',
      type: 'rollup' as const,
      relationPropertyId: 'prop_project',
      targetPropertyId: 'prop_budget',
      function: 'sum' as const,
      targetValueType: 'number' as const,
    };
    const response = {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_first',
      propertyId: 'prop_total',
      manifestRevision: 'manifest-1',
      indexRevision: `sha256:${'a'.repeat(64)}`,
      evaluatedAt: '2026-07-20T00:00:00.000Z',
      permissionRevision: `sha256:${'b'.repeat(64)}`,
      result: { kind: 'value' as const, valueType: 'number' as const, value: 42 },
    };
    let captured: { url: string; body: unknown } | null = null;
    const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return Response.json(response);
    }) as typeof globalThis.fetch;

    await expect(
      previewDatabaseComputedProperty(
        {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId: 'rec_first',
          property,
        },
        { fetch: fetchImplementation },
      ),
    ).resolves.toEqual(response);
    expect(captured).toEqual({
      url: '/api/databases/computed-preview',
      body: {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
        property,
      },
    });
  });
});
