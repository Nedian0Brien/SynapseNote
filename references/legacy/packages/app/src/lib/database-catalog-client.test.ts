import { describe, expect, mock, test } from 'bun:test';
import { describeDatabase, fetchDatabaseCatalog } from './database-catalog-client.ts';

const hash = `sha256:${'a'.repeat(64)}`;
const database = {
  version: 1 as const,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical' as const,
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
    sensitivity: 'internal' as const,
  },
  sources: [
    {
      id: 'ds_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'tasks',
      properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const }],
    },
  ],
};

test('loads a validated compact catalog and exact source description', async () => {
  const requests: Array<{ path: string; body?: unknown }> = [];
  const fetchImplementation = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.startsWith('/api/databases/catalog')) {
      return Response.json({
        query: 'task',
        manifestRevision: hash,
        catalogRevision: hash,
        complete: true,
        candidates: [
          {
            id: database.id,
            key: database.key,
            name: database.name,
            purpose: database.contract.purpose,
            sources: [
              {
                id: 'ds_tasks',
                key: 'tasks',
                name: 'Tasks',
                recordMeaning: 'One task',
                propertyCount: 1,
              },
            ],
            viewCount: 0,
            relationCount: 0,
            score: 10,
            matchedBy: ['name'],
          },
        ],
      });
    }
    return Response.json({
      manifestRevision: hash,
      schemaRevision: hash,
      database,
      source: database.sources[0],
      index: {
        state: 'idle',
        revision: hash,
        manifestRevision: hash,
        recordCount: 0,
        issueCount: 0,
        progress: null,
        lastRebuiltAt: null,
        lastIncrementalAt: null,
        lastError: null,
      },
      allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
    });
  });

  await expect(
    fetchDatabaseCatalog({ fetch: fetchImplementation as typeof fetch, query: ' task ' }),
  ).resolves.toMatchObject({ complete: true, candidates: [{ id: 'db_tasks' }] });
  await expect(
    describeDatabase(
      { databaseId: 'db_tasks', sourceId: 'ds_tasks' },
      { fetch: fetchImplementation as typeof fetch },
    ),
  ).resolves.toMatchObject({ database: { id: 'db_tasks' }, source: { id: 'ds_tasks' } });
  expect(requests).toEqual([
    { path: '/api/databases/catalog?q=task', body: undefined },
    {
      path: '/api/databases/describe',
      body: { databaseId: 'db_tasks', sourceId: 'ds_tasks' },
    },
  ]);
});

test('retries transient catalog conflicts while the index settles', async () => {
  let calls = 0;
  const fetchImplementation = mock(async () => {
    calls += 1;
    if (calls <= 2) {
      return Response.json(
        {
          code: 'transaction_in_progress',
          detail: 'catalog is still settling',
          retryable: true,
        },
        { status: 409 },
      );
    }
    return Response.json({
      query: null,
      manifestRevision: hash,
      catalogRevision: hash,
      complete: true,
      candidates: [],
    });
  });

  await expect(
    fetchDatabaseCatalog({ fetch: fetchImplementation as typeof fetch }),
  ).resolves.toMatchObject({ complete: true, candidates: [] });
  expect(calls).toBe(3);
});

describe('database catalog client validation', () => {
  test('rejects mismatched described source and problem responses', async () => {
    const mismatch = mock(async () =>
      Response.json({
        manifestRevision: hash,
        schemaRevision: hash,
        database,
        source: { ...database.sources[0], id: 'ds_other' },
        index: {
          state: 'idle',
          revision: hash,
          manifestRevision: hash,
          recordCount: 0,
          issueCount: 0,
          progress: null,
          lastRebuiltAt: null,
          lastIncrementalAt: null,
          lastError: null,
        },
        allowedOperations: [],
      }),
    );
    await expect(
      describeDatabase(
        { databaseId: 'db_tasks', sourceId: 'ds_other' },
        { fetch: mismatch as typeof fetch },
      ),
    ).rejects.toThrow(/invalid response/);

    const denied = mock(async () =>
      Response.json({ detail: 'Database access denied' }, { status: 403 }),
    );
    await expect(fetchDatabaseCatalog({ fetch: denied as typeof fetch })).rejects.toThrow(
      'Database access denied',
    );
  });
});
