import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from './schema.ts';
import { DATABASE_MARKDOWN_LIMITS } from './markdown-table.ts';
import { planDatabaseMarkdownV2Migration } from './markdown-table-migration.ts';

const definition = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_matrix',
  key: 'matrix',
  name: 'Migration matrix',
  contract: {
    purpose: 'Exercise the v1 to v2 fixture matrix',
    canonicality: 'canonical',
    vocabulary: ['matrix'],
    freshness: { expectation: 'manual' },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_items',
      key: 'items',
      name: 'Items',
      recordMeaning: 'One migration fixture item',
      folder: 'items',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_text', key: 'text', name: 'Text', type: 'text' },
        { id: 'prop_number', key: 'number', name: 'Number', type: 'number' },
        { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
        { id: 'prop_date', key: 'date', name: 'Date', type: 'date' },
        {
          id: 'prop_select',
          key: 'select',
          name: 'Select',
          type: 'select',
          options: [{ id: 'opt_alpha', key: 'alpha', name: 'Alpha' }],
        },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'status',
          groups: [
            { id: 'stg_todo', key: 'todo', name: 'To-do', category: 'todo' },
            { id: 'stg_doing', key: 'in_progress', name: 'In progress', category: 'in_progress' },
            { id: 'stg_done', key: 'complete', name: 'Complete', category: 'complete' },
          ],
          options: [
            { id: 'opt_status_todo', key: 'not_started', name: 'Not started', groupId: 'stg_todo' },
            { id: 'opt_status_doing', key: 'doing', name: 'Doing', groupId: 'stg_doing' },
            { id: 'opt_status_done', key: 'done', name: 'Done', groupId: 'stg_done' },
          ],
        },
        {
          id: 'prop_multi',
          key: 'multi',
          name: 'Multi',
          type: 'multi_select',
          options: [
            { id: 'opt_tag', key: 'tag', name: 'Tag' },
            { id: 'opt_other', key: 'other', name: 'Other' },
          ],
        },
        { id: 'prop_url', key: 'url', name: 'URL', type: 'url' },
        { id: 'prop_email', key: 'email', name: 'Email', type: 'email' },
        { id: 'prop_phone', key: 'phone', name: 'Phone', type: 'phone' },
        {
          id: 'prop_unique',
          key: 'unique_id',
          name: 'Unique ID',
          type: 'unique_id',
          prefix: 'ROW',
          nextNumber: 2,
        },
        { id: 'prop_place', key: 'place', name: 'Place', type: 'place' },
        { id: 'prop_person', key: 'person', name: 'Person', type: 'person', multiple: true },
        { id: 'prop_files', key: 'files', name: 'Files', type: 'files' },
        {
          id: 'prop_relation',
          key: 'relation',
          name: 'Relation',
          type: 'relation',
          targetSourceId: 'ds_targets',
          cardinality: 'many',
        },
      ],
    },
    {
      id: 'ds_targets',
      key: 'targets',
      name: 'Targets',
      recordMeaning: 'One migration fixture target',
      folder: 'targets',
      properties: [{ id: 'prop_target_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
  people: [
    { id: 'person_alice', key: 'alice', name: 'Alice', kind: 'local', subjectId: 'principal-alice' },
  ],
});

const owners = [
  { sourceId: 'ds_items', path: 'items.md', blockId: 'dbb_items_matrix' },
  { sourceId: 'ds_targets', path: 'targets.md', blockId: 'dbb_targets_matrix' },
] as const;

function itemMarkdown(options: {
  lineEnding?: '\n' | '\r\n';
  bom?: boolean;
  text?: string;
} = {}): string {
  const eol = options.lineEnding ?? '\n';
  const source = [
    '---',
    '_sn:',
    '  database_id: db_matrix',
    '  source_id: ds_items',
    '  record_id: rec_item',
    'title: "유니코드 🚀 item"',
    `text: ${JSON.stringify(options.text ?? 'preserve this body')}`,
    'number: 42',
    'done: true',
    'date:',
    '  start: 2026-07-27',
    '  end: 2026-07-28',
    '  timeZone: Asia/Seoul',
    'select: alpha',
    'status: not_started',
    'multi: [tag, other]',
    'url: https://example.test/item',
    'email: owner@example.test',
    'phone: "+82-10-1234-5678"',
    'unique_id: 7',
    'place:',
    '  label: Seoul',
    '  address: Seoul, Korea',
    '  lat: 37.5665',
    '  lon: 126.9780',
    '  precision: exact',
    '  source: manual',
    'person: [alice]',
    'files: [{ kind: local, path: assets/item.pdf, name: Item }]',
    'relation: [rec_target]',
    'unrelated: keep-me',
    '---',
    '# 유니코드 🚀 item',
    '',
    'Body bytes stay with the linked document.',
    '',
  ].join(eol);
  return `${options.bom ? '\uFEFF' : ''}${source}`;
}

function targetMarkdown(): string {
  return '---\n_sn:\n  database_id: db_matrix\n  source_id: ds_targets\n  record_id: rec_target\ntitle: Target\n---\nTarget body\n';
}

describe('v1→v2 migration fixture matrix', () => {
  test.each([
    ['generated blank', [], 'items.md'],
    ['existing folder', [{ path: 'items/rec_item.md', markdown: itemMarkdown() }], 'items.md'],
    ['inline owner block', [{ path: 'items/rec_item.md', markdown: itemMarkdown() }], 'notes/page.md'],
    ['full-page owner document', [{ path: 'items/rec_item.md', markdown: itemMarkdown() }], 'databases/items.md'],
    ['CRLF BOM Unicode', [{ path: 'items/rec_item.md', markdown: itemMarkdown({ lineEnding: '\r\n', bom: true }) }], 'items.md'],
  ] as const)('%s creates a deterministic plan for %s', (_name, records, ownerPath) => {
    const result = planDatabaseMarkdownV2Migration({
      definition,
      owners: owners.map((owner) => (owner.sourceId === 'ds_items' ? { ...owner, path: ownerPath } : owner)),
      records: [
        ...records.map((record) => ({ databaseId: 'db_matrix', sourceId: 'ds_items', ...record })),
        ...(records.length > 0
          ? [{ databaseId: 'db_matrix', sourceId: 'ds_targets', path: 'targets/target.md', markdown: targetMarkdown() }]
          : []),
      ],
    });
    expect(result.status).toBe('ready');
    expect(result.blockers).toEqual([]);
    expect(result.ownerDocuments[ownerPath]).toContain('synapsenote:database');
    expect(result.ownerDocuments[ownerPath]).toContain('prop_title');
    if (records.length > 0) {
      expect(result.ownerDocuments[ownerPath]).toContain('유니코드');
      expect(result.linkedDocuments['items/rec_item.md']).toContain('document_id:');
      expect(result.linkedDocuments['items/rec_item.md']).toContain('Body bytes stay');
      expect(result.linkedDocuments['items/rec_item.md']).not.toContain('database_id:');
      expect(result.linkedDocuments['items/rec_item.md']).toContain('unrelated: keep-me');
    }
  });

  test('blocks an invalid select value before producing owner bytes', () => {
    const result = planDatabaseMarkdownV2Migration({
      definition,
      owners,
      records: [
        {
          databaseId: 'db_matrix',
          sourceId: 'ds_items',
          path: 'items/invalid.md',
          markdown: itemMarkdown().replace('select: alpha', 'select: unknown'),
        },
        { databaseId: 'db_matrix', sourceId: 'ds_targets', path: 'targets/target.md', markdown: targetMarkdown() },
      ],
    });
    expect(result.status).toBe('blocked');
    expect(result.ownerDocuments).toEqual({});
    expect(result.blockers.some((blocker) => blocker.code === 'unsupported_property_value')).toBe(true);
  });

  test('blocks a frontmatter value that exceeds the canonical byte budget before activation', () => {
    const result = planDatabaseMarkdownV2Migration({
      definition,
      owners,
      records: [
        {
          databaseId: 'db_matrix',
          sourceId: 'ds_items',
          path: 'items/large.md',
          markdown: itemMarkdown({ text: JSON.stringify('x'.repeat(DATABASE_MARKDOWN_LIMITS.cellBytes + 1)) }),
        },
        { databaseId: 'db_matrix', sourceId: 'ds_targets', path: 'targets/target.md', markdown: targetMarkdown() },
      ],
    });
    expect(result.status).toBe('blocked');
    expect(result.ownerDocuments).toEqual({});
    expect(result.blockers.map((blocker) => blocker.code)).toContain('record_materialization_failed');
  });
});
