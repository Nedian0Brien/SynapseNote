import type * as Y from 'yjs';
import { type DatabaseRecordActor, DatabaseRecordActorSchema } from './schema.ts';
import { DatabaseRecordIdSchema, DataSourceIdSchema } from './stable-ids.ts';

export type DatabaseMarkdownCrdtOperation = 'update_cell' | 'delete_row';

export interface DatabaseMarkdownCrdtMutation {
  operation: DatabaseMarkdownCrdtOperation;
  ownerBlockId: string;
  sourceId: string;
  recordId: string;
  propertyId?: string;
  value?: unknown;
  expectedCellRevision?: string;
  expectedRowRevision?: string;
  /** Stable CRDT map key; never a mutable table row index. */
  cellKey: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownProseMirrorTransactionLike {
  docChanged?: boolean;
  getMeta: (key: string) => unknown;
}

export const DATABASE_MARKDOWN_CRDT_MUTATION_ARRAY = 'synapsenote.database.owner-table.mutations';

export type DatabaseMarkdownCrdtConflictCode = 'same_cell' | 'delete_vs_edit' | 'duplicate_owner';

export interface DatabaseMarkdownCrdtConflict {
  code: DatabaseMarkdownCrdtConflictCode;
  cellKey: string;
  ours: DatabaseMarkdownCrdtMutation;
  theirs: DatabaseMarkdownCrdtMutation;
}

function assertIdentity(input: {
  ownerBlockId: string;
  sourceId: string;
  recordId: string;
  propertyId?: string;
}): void {
  if (!/^dbb_[A-Za-z0-9_-]{1,127}$/.test(input.ownerBlockId))
    throw new Error('CRDT ownerBlockId is invalid');
  DataSourceIdSchema.parse(input.sourceId);
  DatabaseRecordIdSchema.parse(input.recordId);
  if (input.propertyId !== undefined && !/^prop_[A-Za-z0-9_-]{1,127}$/.test(input.propertyId))
    throw new Error('CRDT propertyId is invalid');
}

/** Map a UI/Yjs transaction to the stable semantic target consumed by the v2 writer. */
export function createDatabaseMarkdownCrdtMutation(input: {
  operation: DatabaseMarkdownCrdtOperation;
  ownerBlockId: string;
  sourceId: string;
  recordId: string;
  propertyId?: string;
  value?: unknown;
  expectedCellRevision?: string;
  expectedRowRevision?: string;
  actor?: DatabaseMarkdownCrdtMutation['actor'];
}): DatabaseMarkdownCrdtMutation {
  assertIdentity(input);
  if (input.operation === 'update_cell' && !input.propertyId)
    throw new Error('A CRDT cell update requires propertyId');
  if (input.operation === 'delete_row' && input.propertyId)
    throw new Error('A CRDT row deletion cannot carry propertyId');
  const cellKey =
    input.operation === 'delete_row'
      ? `${input.recordId}\0*`
      : `${input.recordId}\0${input.propertyId}`;
  const actor = input.actor ? DatabaseRecordActorSchema.parse(input.actor) : undefined;
  return { ...input, ...(actor ? { actor } : {}), cellKey };
}

/**
 * Convert the metadata attached by the table ProseMirror command into the
 * storage-neutral mutation consumed by the server writer. The editor is free
 * to keep formatting and cursor state in its own Y.XmlFragment; only this
 * stable semantic envelope is exchanged with the database owner-table CRDT.
 */
export function databaseMarkdownCrdtMutationFromProseMirrorTransaction(input: {
  transaction: DatabaseMarkdownProseMirrorTransactionLike;
  ownerBlockId: string;
  sourceId: string;
  actor?: DatabaseMarkdownCrdtMutation['actor'];
}): DatabaseMarkdownCrdtMutation | null {
  const metadata = input.transaction.getMeta('synapsenote:database-owner-table');
  if (!metadata || typeof metadata !== 'object') return null;
  const value = metadata as Record<string, unknown>;
  if (value.operation !== 'update_cell' && value.operation !== 'delete_row') return null;
  if (typeof value.recordId !== 'string')
    throw new Error('Database transaction metadata requires recordId');
  return createDatabaseMarkdownCrdtMutation({
    operation: value.operation,
    ownerBlockId: input.ownerBlockId,
    sourceId: input.sourceId,
    recordId: value.recordId,
    ...(typeof value.propertyId === 'string' ? { propertyId: value.propertyId } : {}),
    ...(value.value !== undefined ? { value: value.value } : {}),
    ...(typeof value.expectedCellRevision === 'string'
      ? { expectedCellRevision: value.expectedCellRevision }
      : {}),
    ...(typeof value.expectedRowRevision === 'string'
      ? { expectedRowRevision: value.expectedRowRevision }
      : {}),
    ...(input.actor ? { actor: input.actor } : {}),
  });
}

/** Append a semantic mutation to a real Y.Doc without using a mutable row index. */
export function appendDatabaseMarkdownCrdtMutation(
  doc: Y.Doc,
  mutation: DatabaseMarkdownCrdtMutation,
): void {
  const array = doc.getArray<string>(DATABASE_MARKDOWN_CRDT_MUTATION_ARRAY);
  doc.transact(() => {
    array.push([JSON.stringify(mutation)]);
  }, 'synapsenote:database-owner-table');
}

export function readDatabaseMarkdownCrdtMutations(doc: Y.Doc): DatabaseMarkdownCrdtMutation[] {
  return doc
    .getArray<string>(DATABASE_MARKDOWN_CRDT_MUTATION_ARRAY)
    .toArray()
    .map((serialized) => JSON.parse(serialized) as DatabaseMarkdownCrdtMutation);
}

/** Return every deterministic conflict represented by a merged Y.Doc. */
export function classifyDatabaseMarkdownCrdtDocumentConflicts(
  doc: Y.Doc,
): DatabaseMarkdownCrdtConflict[] {
  const mutations = readDatabaseMarkdownCrdtMutations(doc);
  const conflicts: DatabaseMarkdownCrdtConflict[] = [];
  for (let left = 0; left < mutations.length; left += 1) {
    for (let right = left + 1; right < mutations.length; right += 1) {
      const ours = mutations[left];
      const theirs = mutations[right];
      if (!ours || !theirs) throw new Error('CRDT mutation index unexpectedly missing');
      const conflict = classifyDatabaseMarkdownCrdtConflict(ours, theirs);
      if (conflict) conflicts.push(conflict);
    }
  }
  return conflicts;
}

/** Deterministically classify concurrent semantic mutations before any byte merge. */
export function classifyDatabaseMarkdownCrdtConflict(
  ours: DatabaseMarkdownCrdtMutation,
  theirs: DatabaseMarkdownCrdtMutation,
): DatabaseMarkdownCrdtConflict | null {
  if (ours.ownerBlockId !== theirs.ownerBlockId && ours.sourceId === theirs.sourceId) {
    return { code: 'duplicate_owner', cellKey: ours.cellKey, ours, theirs };
  }
  if (
    ours.recordId === theirs.recordId &&
    ((ours.operation === 'delete_row' && theirs.operation === 'update_cell') ||
      (theirs.operation === 'delete_row' && ours.operation === 'update_cell'))
  ) {
    return { code: 'delete_vs_edit', cellKey: `${ours.recordId}\0*`, ours, theirs };
  }
  if (ours.cellKey === theirs.cellKey) {
    if (
      ours.operation === 'update_cell' &&
      theirs.operation === 'update_cell' &&
      JSON.stringify(ours.value) !== JSON.stringify(theirs.value)
    ) {
      return { code: 'same_cell', cellKey: ours.cellKey, ours, theirs };
    }
  }
  return null;
}
