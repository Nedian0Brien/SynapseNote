import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  markdownTableDefaultValues,
  markdownTableDocumentMarkdown,
  markdownTableDocumentPath,
  mutateDatabaseMarkdownTable,
} from './database-markdown-table-client.ts';

describe('database Markdown table client', () => {
  test('posts the exact v2 mutation and validates the receipt', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          operation: 'update_cell',
          changed: true,
          receipt: { mutationId: 'mut_1', ownerPath: 'tasks.md' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    const result = await mutateDatabaseMarkdownTable(
      {
        operation: 'update_cell',
        input: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId: 'rec_1',
          propertyId: 'prop_status',
          value: 'done',
          expectedOwnerRevision: `sha256:${'a'.repeat(64)}`,
        },
      },
      { fetch },
    );

    expect(requests[0]?.url).toBe('/api/databases/markdown-table/mutate');
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({
      operation: 'update_cell',
      input: { recordId: 'rec_1', propertyId: 'prop_status' },
    });
    expect(result.receipt.mutationId).toBe('mut_1');
  });

  test('rejects a response for another operation', async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ operation: 'delete_row', changed: true, receipt: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof globalThis.fetch;
    await expect(
      mutateDatabaseMarkdownTable(
        {
          operation: 'update_cell',
          input: {
            databaseId: 'db_tasks',
            sourceId: 'ds_tasks',
            recordId: 'rec_1',
            propertyId: 'prop_status',
            value: 'done',
            expectedOwnerRevision: `sha256:${'a'.repeat(64)}`,
          },
        },
        { fetch },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  test('builds a user-visible document path and codec-safe defaults', () => {
    const definition = DatabaseDefinitionSchema.parse({
      version: 2,
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      contract: {
        purpose: 'Track tasks',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'notes',
          properties: [
            { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
            {
              id: 'prop_done',
              key: 'done',
              name: 'Done',
              type: 'checkbox',
              semantics: {
                inferencePolicy: 'explicit_only',
                sensitivity: 'internal',
                defaultValue: false,
              },
            },
          ],
          storage: {
            kind: 'markdown_table',
            formatVersion: 2,
            owner: { path: 'tasks.md', blockId: 'dbb_tasks_primary' },
            titlePropertyId: 'prop_title',
            storedPropertyIds: ['prop_title', 'prop_done'],
          },
        },
      ],
    });
    const [source] = definition.sources;
    if (!source) throw new Error('normalized definition must expose its source');
    expect(markdownTableDocumentPath(source.folder, '  Ship / Plan  ')).toBe('notes/Ship-Plan.md');
    expect(markdownTableDocumentMarkdown('Ship\nPlan')).toBe('# Ship Plan\n\n');
    expect(markdownTableDefaultValues(source)).toEqual({ prop_done: false });
  });
});
