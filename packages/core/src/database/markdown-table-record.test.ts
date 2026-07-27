import { describe, expect, test } from 'bun:test';
import { materializeDatabaseMarkdownOwner } from './markdown-table-record.ts';
import type { DatabaseSource } from './schema.ts';

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
      .replace('| [[orders/two\\|Order \\| Two]] | Second order |', '| [[orders/missing]] | Second order |');
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
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'storage_mismatch' }),
    );
  });
});
