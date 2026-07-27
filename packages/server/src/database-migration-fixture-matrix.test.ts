import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema, planDatabaseMarkdownV2Migration } from '@nedian0brien/synapsenote-core';

function definition(withRelation = false) {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_matrix',
    key: 'matrix',
    name: 'Migration matrix',
    contract: {
      purpose: 'Exercise the v1 to v2 migration boundaries',
      canonicality: 'canonical',
      vocabulary: ['fixture'],
      freshness: { expectation: 'manual' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_items',
        key: 'items',
        name: 'Items',
        recordMeaning: 'One item',
        folder: 'items',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_text', key: 'text', name: 'Text', type: 'text' },
          { id: 'prop_number', key: 'number', name: 'Number', type: 'number' },
          { id: 'prop_checked', key: 'checked', name: 'Checked', type: 'checkbox' },
          { id: 'prop_date', key: 'date', name: 'Date', type: 'date' },
          {
            id: 'prop_status', key: 'status', name: 'Status', type: 'select',
            options: [
              { id: 'opt_todo', key: 'todo', name: 'Todo' },
              { id: 'opt_done', key: 'done', name: 'Done' },
            ],
          },
          {
            id: 'prop_tags', key: 'tags', name: 'Tags', type: 'multi_select',
            options: [
              { id: 'opt_a', key: 'a', name: 'A' },
              { id: 'opt_b', key: 'b', name: 'B' },
            ],
          },
          ...(withRelation
            ? [{
                id: 'prop_related', key: 'related', name: 'Related', type: 'relation',
                targetSourceId: 'ds_targets', cardinality: 'many',
              }]
            : []),
        ],
      },
      ...(withRelation
        ? [{
            id: 'ds_targets', key: 'targets', name: 'Targets', recordMeaning: 'One target', folder: 'targets',
            properties: [{ id: 'prop_target_title', key: 'title', name: 'Title', type: 'title' }],
          }]
        : []),
    ],
  });
}

function record(markdownValues: string, path = 'items/one.md'): { databaseId: string; sourceId: string; path: string; markdown: string } {
  return {
    databaseId: 'db_matrix', sourceId: 'ds_items', path,
    markdown: `---\n_sn:\n  database_id: db_matrix\n  source_id: ds_items\n  record_id: rec_one\ntitle: One\n${markdownValues}\n---\n# One\nBody\n`,
  };
}

describe('v1→v2 migration fixture matrix', () => {
  test('covers generated blank, existing folder, inline/full-page, relation, codecs, lifecycle, and line endings', () => {
    const cases = [
      {
        id: 'MIG-001 generated blank',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' }], records: [] },
        expected: 'ready',
      },
      {
        id: 'MIG-006 existing folder',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' }], records: [record('text: Keep body\nnumber: 2\nchecked: true\ndate: 2026-07-27\nstatus: todo\ntags: [a, b]')] },
        expected: 'ready',
      },
      {
        id: 'MIG-004 inline owner',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'notes/inline.md', blockId: 'dbb_inline' }], records: [record('text: Inline')] },
        expected: 'ready',
      },
      {
        id: 'MIG-005 full-page owner',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items/full-page.md', blockId: 'dbb_full' }], records: [record('text: Full page')] },
        expected: 'ready',
      },
      {
        id: 'MIG-009 multi-source relation',
        input: {
          definition: definition(true),
          owners: [
            { sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' },
            { sourceId: 'ds_targets', path: 'targets.md', blockId: 'dbb_targets' },
          ],
          records: [record('related: [rec_target]', 'items/one.md'), {
            databaseId: 'db_matrix', sourceId: 'ds_targets', path: 'targets/target.md',
            markdown: '---\n_sn:\n  database_id: db_matrix\n  source_id: ds_targets\n  record_id: rec_target\ntitle: Target\n---\n# Target\n',
          }],
        },
        expected: 'ready',
      },
      {
        id: 'MIG-013 invalid raw',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' }], records: [record('number: not-a-number')] },
        expected: 'blocked',
      },
      {
        id: 'MIG-012 lifecycle metadata',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' }], migrationCommittedAt: '2026-07-27T00:00:00.000Z', records: [{ ...record('text: lifecycle'), markdown: record('text: lifecycle').markdown.replace('  record_id: rec_one', '  record_id: rec_one\n  archived_at: 2026-07-26T00:00:00.000Z') }] },
        expected: 'ready',
      },
      {
        id: 'MIG-014 CRLF/BOM/Unicode',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' }], records: [{ ...record('text: "한글 — unicode"'), markdown: record('text: "한글 — unicode"').markdown.replaceAll('\n', '\r\n').replace(/^/, '\uFEFF') }] },
        expected: 'ready',
      },
      {
        id: 'MIG-017 size boundary',
        input: { definition: definition(), owners: [{ sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items' }], records: [{ ...record(`text: ${'x'.repeat(70_000)}`) }] },
        expected: 'blocked',
      },
    ] as const;

    const outcomes = cases.map((fixture) => {
      const result = planDatabaseMarkdownV2Migration(fixture.input as never);
      return { id: fixture.id, status: result.status, blockers: result.blockers.map((blocker) => blocker.code) };
    });
    expect(outcomes).toHaveLength(cases.length);
    for (const [index, fixture] of cases.entries()) {
      expect(outcomes[index]?.status, fixture.id).toBe(fixture.expected);
      if (fixture.expected === 'blocked') expect(outcomes[index]?.blockers.length, fixture.id).toBeGreaterThan(0);
    }
    expect(outcomes.find((entry) => entry.id.startsWith('MIG-009'))?.blockers).toEqual([]);
  });
});
