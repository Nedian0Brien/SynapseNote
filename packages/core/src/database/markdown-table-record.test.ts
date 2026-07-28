import { describe, expect, test } from 'bun:test';
import {
  DATABASE_STORED_PROPERTY_TYPES,
  databaseStoredPropertyIds,
  isStoredDatabasePropertyType,
  materializeDatabaseMarkdownOwner,
} from './markdown-table-record.ts';
import { DATABASE_PROPERTY_TYPES, type DatabaseSource } from './schema.ts';

const source: DatabaseSource = {
  id: 'ds_orders',
  key: 'orders',
  name: 'Orders',
  recordMeaning: 'One order',
  folder: '.',
  includeSubfolders: true,
  storage: {
    kind: 'markdown_table',
    formatVersion: 2,
    owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
    titlePropertyId: 'prop_title',
    storedPropertyIds: ['prop_title', 'prop_notes'],
  },
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
  ],
};

const markdown = [
  '<!-- synapsenote:database',
  'version=2',
  'database=db_orders',
  'source=ds_orders',
  'block=dbb_orders_primary',
  'columns=prop_title,prop_notes',
  '-->',
  '',
  '| 문서 | 메모 |',
  '| --- | --- |',
  '| [[orders/one]] | First order |',
  '| [[orders/two\\|Order \\| Two]] | Second order |',
  '',
].join('\n');

describe('materializeDatabaseMarkdownOwner', () => {
  test('materializes rows into storage-neutral IDs and typed values', () => {
    const result = materializeDatabaseMarkdownOwner({
      databaseId: 'db_orders',
      source,
      markdown,
      resolveDocument: (link) => ({
        path: `${link.target}.md`,
        documentId: link.target.endsWith('one') ? 'doc_one' : 'doc_two',
      }),
    });
    expect('rows' in result).toBe(true);
    if (!('rows' in result)) return;
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      documentId: 'doc_one',
      documentPath: 'orders/one.md',
      values: { prop_notes: 'First order' },
    });
    expect(result.rows[1]?.documentLink).toEqual({
      kind: 'wikilink',
      target: 'orders/two',
      alias: 'Order | Two',
    });
    expect(result.rows[0]?.recordId).toMatch(/^rec_[a-z2-7]+$/);
  });

  test('keeps invalid rows visible and reports broken or duplicate documents', () => {
    const invalidMarkdown = markdown
      .replace('| [[orders/one]] | First order |', '| [[orders/missing]] | First order |')
      .replace(
        '| [[orders/two\\|Order \\| Two]] | Second order |',
        '| [[orders/missing]] | Second order |',
      );
    const result = materializeDatabaseMarkdownOwner({
      databaseId: 'db_orders',
      source,
      markdown: invalidMarkdown,
      resolveDocument: () => ({ path: 'orders/missing.md', documentId: 'doc_missing' }),
    });
    expect('rows' in result).toBe(true);
    if (!('rows' in result)) return;
    expect(result.errors.some((error) => error.code === 'duplicate_document')).toBe(true);
    expect(result.rows.every((row) => row.documentId === 'doc_missing')).toBe(true);
  });

  test('rejects an owner marker that does not match manifest storage', () => {
    const result = materializeDatabaseMarkdownOwner({
      databaseId: 'db_other',
      source,
      markdown,
      resolveDocument: () => ({ path: 'orders/one.md', documentId: 'doc_one' }),
    });
    expect('rows' in result).toBe(true);
    if (!('rows' in result)) return;
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'storage_mismatch' }));
  });
});

describe('stored / derived property partition', () => {
  test('every declared property type is on exactly one side', () => {
    const derived = DATABASE_PROPERTY_TYPES.filter((type) => !isStoredDatabasePropertyType(type));
    const stored = DATABASE_PROPERTY_TYPES.filter((type) => isStoredDatabasePropertyType(type));
    // A new property type that lands in neither half would silently be dropped
    // from owner tables; one in both is impossible by construction, so the
    // count check is what keeps the partition total as the vocabulary grows.
    expect(stored.length + derived.length).toBe(DATABASE_PROPERTY_TYPES.length);
    expect(stored.length).toBe(DATABASE_STORED_PROPERTY_TYPES.size);
    expect(derived).toEqual([
      'created_time',
      'last_edited_time',
      'created_by',
      'last_edited_by',
      'verification',
      'button',
      'formula',
      'rollup',
    ]);
  });

  test('databaseStoredPropertyIds keeps schema order and drops derived columns', () => {
    expect(
      databaseStoredPropertyIds({
        ...source,
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_made', key: 'made', name: 'Created time', type: 'created_time' },
          { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
        ],
      }),
    ).toEqual(['prop_title', 'prop_notes']);
  });
});
