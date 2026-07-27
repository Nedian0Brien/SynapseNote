import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  appendDatabaseMarkdownCrdtMutation,
  classifyDatabaseMarkdownCrdtConflict,
  classifyDatabaseMarkdownCrdtDocumentConflicts,
  createDatabaseMarkdownCrdtMutation,
  databaseMarkdownCrdtMutationFromProseMirrorTransaction,
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
    expect(classifyDatabaseMarkdownCrdtConflict(edit, deletion)).toMatchObject({
      code: 'delete_vs_edit',
    });
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

  test('maps ProseMirror metadata and converges two Yjs clients by stable cell key', () => {
    const transaction = {
      docChanged: true,
      getMeta: (key: string) =>
        key === 'synapsenote:database-owner-table'
          ? {
              operation: 'update_cell',
              recordId: 'rec_alpha',
              propertyId: 'prop_title',
              value: 'Alpha',
            }
          : undefined,
    };
    const mutation = databaseMarkdownCrdtMutationFromProseMirrorTransaction({
      transaction,
      ownerBlockId: 'dbb_tasks',
      sourceId: 'ds_tasks',
      actor: { principal_id: 'human:one', kind: 'human' },
    });
    expect(mutation).toMatchObject({
      cellKey: 'rec_alpha\0prop_title',
      actor: { principal_id: 'human:one' },
    });

    const first = new Y.Doc();
    const second = new Y.Doc();
    appendDatabaseMarkdownCrdtMutation(
      first,
      createDatabaseMarkdownCrdtMutation({
        operation: 'update_cell',
        ownerBlockId: 'dbb_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_alpha',
        propertyId: 'prop_title',
        value: 'Alpha',
      }),
    );
    appendDatabaseMarkdownCrdtMutation(
      second,
      createDatabaseMarkdownCrdtMutation({
        operation: 'update_cell',
        ownerBlockId: 'dbb_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_alpha',
        propertyId: 'prop_status',
        value: 'todo',
      }),
    );
    const firstUpdate = Y.encodeStateAsUpdate(first);
    const secondUpdate = Y.encodeStateAsUpdate(second);
    Y.applyUpdate(first, secondUpdate);
    Y.applyUpdate(second, firstUpdate);
    expect(first.getArray<string>('synapsenote.database.owner-table.mutations').length).toBe(2);
    expect(classifyDatabaseMarkdownCrdtDocumentConflicts(first)).toEqual([]);
  });

  test('retains same-cell and row-delete races as explicit semantic conflicts after sync', () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    appendDatabaseMarkdownCrdtMutation(
      first,
      createDatabaseMarkdownCrdtMutation({
        operation: 'update_cell',
        ownerBlockId: 'dbb_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_alpha',
        propertyId: 'prop_title',
        value: 'Alpha',
      }),
    );
    appendDatabaseMarkdownCrdtMutation(
      second,
      createDatabaseMarkdownCrdtMutation({
        operation: 'update_cell',
        ownerBlockId: 'dbb_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_alpha',
        propertyId: 'prop_title',
        value: 'Beta',
      }),
    );
    appendDatabaseMarkdownCrdtMutation(
      second,
      createDatabaseMarkdownCrdtMutation({
        operation: 'delete_row',
        ownerBlockId: 'dbb_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_alpha',
      }),
    );
    const firstUpdate = Y.encodeStateAsUpdate(first);
    const secondUpdate = Y.encodeStateAsUpdate(second);
    Y.applyUpdate(first, secondUpdate);
    Y.applyUpdate(second, firstUpdate);
    expect(
      classifyDatabaseMarkdownCrdtDocumentConflicts(first).map((conflict) => conflict.code),
    ).toEqual(expect.arrayContaining(['same_cell', 'delete_vs_edit']));
  });
});
