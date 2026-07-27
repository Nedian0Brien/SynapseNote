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
}

export type DatabaseMarkdownCrdtConflictCode = 'same_cell' | 'delete_vs_edit' | 'duplicate_owner';

export interface DatabaseMarkdownCrdtConflict {
  code: DatabaseMarkdownCrdtConflictCode;
  cellKey: string;
  ours: DatabaseMarkdownCrdtMutation;
  theirs: DatabaseMarkdownCrdtMutation;
}

function assertIdentity(input: { ownerBlockId: string; sourceId: string; recordId: string; propertyId?: string }): void {
  if (!/^dbb_[A-Za-z0-9_-]{1,127}$/.test(input.ownerBlockId)) throw new Error('CRDT ownerBlockId is invalid');
  DataSourceIdSchema.parse(input.sourceId);
  DatabaseRecordIdSchema.parse(input.recordId);
  if (input.propertyId !== undefined && !/^prop_[A-Za-z0-9_-]{1,127}$/.test(input.propertyId)) throw new Error('CRDT propertyId is invalid');
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
}): DatabaseMarkdownCrdtMutation {
  assertIdentity(input);
  if (input.operation === 'update_cell' && !input.propertyId) throw new Error('A CRDT cell update requires propertyId');
  if (input.operation === 'delete_row' && input.propertyId) throw new Error('A CRDT row deletion cannot carry propertyId');
  const cellKey = input.operation === 'delete_row' ? `${input.recordId}\0*` : `${input.recordId}\0${input.propertyId}`;
  return { ...input, cellKey };
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
    if (ours.operation === 'update_cell' && theirs.operation === 'update_cell' && JSON.stringify(ours.value) !== JSON.stringify(theirs.value)) {
      return { code: 'same_cell', cellKey: ours.cellKey, ours, theirs };
    }
  }
  return null;
}
