import { afterEach, describe, expect, test } from 'bun:test';
import type {
  DatabaseContextInspection,
  DatabaseContextPack,
} from '@nedian0brien/synapsenote-server';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DatabaseContextInspectorBody,
  fetchContextInspection,
  fetchContextInspectionList,
  projectContextPackForProperties,
} from './DatabaseContextInspectorDialog';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function inspection(): DatabaseContextInspection {
  return {
    packId: 'pack_123456789012345678901234',
    capturedAt: '2026-07-19T12:00:00.000Z',
    goal: 'Prepare a grounded support brief',
    database: { id: 'db_feedback', name: 'Feedback' },
    sourceId: 'ds_feedback',
    agentView: { id: 'view_support', revision: `sha256:${'a'.repeat(64)}` },
    disclosure: 'evidence',
    returned: 2,
    tokenCount: {
      tokenizer: 'utf8_bytes_div3',
      estimated: 720,
      available: 1_800,
      max: 2_000,
      reserve: 200,
    },
    redactions: {
      evaluated: true,
      rootRecords: 1,
      rootProperties: 2,
      relationRecords: 0,
      relationProperties: 0,
    },
    freshness: {
      manifestRevision: 'sha256:manifest',
      schemaRevision: 'sha256:schema',
      indexRevision: 'sha256:index',
      indexState: 'idle',
      indexFreshness: 'snapshot',
      expectation: { expectation: 'realtime', maxAgeSeconds: 60 },
    },
    omissions: {
      records: 3,
      propertyIds: ['prop_private'],
      evidence: 1,
      fullBodies: 0,
      relation: {
        depthLimit: 0,
        recordLimit: 0,
        fanOutLimit: 0,
        missingRecords: 0,
        permissionRecords: 0,
        permissionProperties: 0,
        cycles: 0,
        deduplicatedRecords: 0,
      },
    },
    truncation: {
      truncated: true,
      cause: 'token_budget',
      continuationAvailable: true,
    },
    exactPack: {
      id: 'pack_123456789012345678901234',
      goal: 'Prepare a grounded support brief',
      schema: {
        properties: [
          {
            id: 'prop_title',
            key: 'title',
            name: 'Title',
            type: 'title',
            required: true,
          },
          {
            id: 'prop_private',
            key: 'private',
            name: 'Private note',
            type: 'text',
            required: false,
          },
        ],
      },
      disclosure: {
        level: 'evidence',
        searchText: 'evidence',
        matched: 1,
        isComplete: true,
        evidence: [
          {
            id: 'ev_visible',
            recordId: 'rec_visible',
            path: 'feedback/visible.md',
            field: 'body',
            start: 4,
            end: 12,
            offsetEncoding: 'utf16_code_units',
            snippet: 'Visible evidence',
            snippetStart: 4,
            snippetEnd: 20,
            matchedTerms: ['evidence'],
          },
        ],
      },
      records: [
        {
          id: 'rec_visible',
          values: { prop_title: 'Visible evidence', prop_private: 'Do not disclose' },
        },
      ],
    } as unknown as DatabaseContextInspection['exactPack'],
  };
}

describe('DatabaseContextInspectorDialog', () => {
  test('renders exact pack, tokens, redactions, omissions, freshness, and truncation', () => {
    const selected = inspection();
    const html = renderToStaticMarkup(
      <DatabaseContextInspectorBody
        inspections={[selected]}
        selected={selected}
        status="success"
        error={null}
        onSelect={() => {}}
        onRetry={() => {}}
      />,
    );

    expect(html).toContain('Prepare a grounded support brief');
    expect(html).toContain('720');
    expect(html).toContain('Permission redactions');
    expect(html).toContain('prop_private');
    expect(html).toContain('sha256:index');
    expect(html).toContain('token_budget');
    expect(html).toContain('Exact Context Pack');
    expect(html).toContain('rec_visible');
    expect(html).toContain('ev_visible');
    expect(html).toContain('feedback/visible.md');
    expect(html).toContain('Fields in preview');
    expect(html).toContain('Include Title');
    expect(html).toContain('Selected field preview');
  });

  test('projects only selected properties without mutating the captured pack', () => {
    const selected = inspection();
    const projected = projectContextPackForProperties(selected.exactPack, ['prop_title']);
    expect(projected).not.toBe(selected.exactPack);
    expect(projected.schema.properties.map((property) => property.id)).toEqual(['prop_title']);
    expect(projected.records).toEqual([
      { id: 'rec_visible', values: { prop_title: 'Visible evidence' } },
    ]);
    expect(selected.exactPack.schema.properties).toHaveLength(2);
    expect(selected.exactPack.records).toEqual([
      {
        id: 'rec_visible',
        values: { prop_title: 'Visible evidence', prop_private: 'Do not disclose' },
      },
    ]);
  });

  test('keeps columnar identity columns while dropping unselected property columns', () => {
    const selected = inspection();
    const columnarPack = {
      ...selected.exactPack,
      encoding: 'columnar_dictionary',
      records: {
        columns: ['record_id', 'path', 'revision', 'prop_title', 'prop_private'],
        dictionaries: { prop_private: ['Do not disclose'] },
        rows: [['rec_visible', 'feedback/visible.md', null, 'Visible evidence', 0]],
      },
    } as unknown as DatabaseContextPack;
    const projected = projectContextPackForProperties(columnarPack, ['prop_title']);
    expect(projected.records).toEqual({
      columns: ['record_id', 'path', 'revision', 'prop_title'],
      dictionaries: {},
      rows: [['rec_visible', 'feedback/visible.md', null, 'Visible evidence']],
    });
  });

  test('fetches list and exact detail through distinct no-store inspector reads', async () => {
    const selected = inspection();
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      return Response.json(
        url.includes('packId=')
          ? { kind: 'detail', inspection: selected }
          : { kind: 'list', inspections: [selected] },
      );
    }) as typeof fetch;

    await expect(fetchContextInspectionList()).resolves.toEqual([selected]);
    await expect(fetchContextInspection(selected.packId)).resolves.toEqual(selected);
    expect(requests).toEqual([
      '/api/databases/inspect',
      `/api/databases/inspect?packId=${selected.packId}`,
    ]);
  });

  test('encodes a database/view/record scope for compact inspector handoff', async () => {
    const selected = inspection();
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return Response.json({ kind: 'list', inspections: [selected] });
    }) as typeof fetch;

    await expect(
      fetchContextInspectionList(undefined, {
        databaseId: selected.database.id,
        sourceId: selected.sourceId,
        viewId: selected.agentView?.id,
        recordId: 'rec_visible',
        recordIds: ['rec_visible', 'rec_second'],
      }),
    ).resolves.toEqual([selected]);
    expect(requests).toEqual([
      `/api/databases/inspect?databaseId=${selected.database.id}&sourceId=${selected.sourceId}&viewId=${selected.agentView?.id}&recordId=rec_visible&recordIds=rec_visible%2Crec_second`,
    ]);
  });

  test('rejects a mismatched exact-pack response instead of displaying it', async () => {
    globalThis.fetch = (async () =>
      Response.json({ kind: 'detail', inspection: inspection() })) as typeof fetch;
    await expect(fetchContextInspection('pack_different')).rejects.toThrow(/does not match/);
  });
});
