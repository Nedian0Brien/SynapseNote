import { describe, expect, test } from 'bun:test';
import {
  classifyDatabaseMarkdownCrdtConflict,
  createDatabaseMarkdownCrdtMutation,
} from './markdown-table-crdt.ts';

describe('Markdown owner-table CRDT semantic mapping', () => {
  test('uses stable record/property identity instead of a mutable row index', () => {
    const mutation = createDatabaseMarkdownCrdtMutation({
      operation: 'update_cell',
      ownerBlockId: 'dbb_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_alpha',
      propertyId: 'prop_title',
      value: 'Alpha',
    });
    expect(mutation.cellKey).toBe('rec_alpha\0prop_title');
  });

  test('classifies same-cell and delete-vs-edit races before source merge', () => {
    const edit = createDatabaseMarkdownCrdtMutation({
      operation: 'update_cell',
      ownerBlockId: 'dbb_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_alpha',
      propertyId: 'prop_title',
      value: 'Alpha',
    });
    const other = createDatabaseMarkdownCrdtMutation({ ...edit, value: 'Beta' });
    expect(classifyDatabaseMarkdownCrdtConflict(edit, other)).toMatchObject({ code: 'same_cell' });
    const deletion = createDatabaseMarkdownCrdtMutation({
      operation: 'delete_row',
      ownerBlockId: 'dbb_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_alpha',
    });
    expect(classifyDatabaseMarkdownCrdtConflict(edit, deletion)).toMatchObject({ code: 'delete_vs_edit' });
  });

  test('fails closed when a transaction lacks stable identity', () => {
    expect(() =>
      createDatabaseMarkdownCrdtMutation({
        operation: 'update_cell',
        ownerBlockId: 'dbb_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_alpha',
      }),
    ).toThrow('propertyId');
  });
});
