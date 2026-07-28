import type { DatabaseValue } from '@nedian0brien/synapsenote-core';
import type {
  DatabaseDesiredStateDraftInput,
  DatabaseMarkdownTableMutationRequest as ServerDatabaseMarkdownTableMutationRequest,
} from '@nedian0brien/synapsenote-server';
import {
  type DatabaseMarkdownTableMutationResponse,
  mutateDatabaseMarkdownTable,
} from '../database-markdown-table-client';
import {
  type ExecuteDatabaseUiMutationInput,
  type ExecuteDatabaseUiMutationResult,
  executeDatabaseUiMutation,
} from '../database-mutation-client';

/**
 * The only transport seam used by database UI mutation commands.
 *
 * Keeping this adapter deliberately small is useful: UI hooks own intent and
 * optimistic state, while the client owns plan/commit protocol details. New
 * mutation families should depend on this module rather than reaching into
 * the HTTP client directly.
 */
export type DatabaseMutationTarget = {
  databaseId: string;
  sourceId?: string;
  recordId?: string;
  propertyId?: string;
  viewId?: string;
};

export type DatabaseMutationRequest = ExecuteDatabaseUiMutationInput & {
  target?: DatabaseMutationTarget;
  operationId?: string;
};

/** Explicit storage-aware command used by owner-table editors. */
export type DatabaseMarkdownTableMutationRequest = {
  storage: 'markdown_table';
  mutation: ServerDatabaseMarkdownTableMutationRequest;
};

export function executeDatabaseMutation(
  request: DatabaseMutationRequest,
): Promise<ExecuteDatabaseUiMutationResult>;
export function executeDatabaseMutation(
  request: DatabaseMarkdownTableMutationRequest,
): Promise<DatabaseMarkdownTableMutationResponse>;

export function executeDatabaseMutation(
  request: DatabaseMutationRequest | DatabaseMarkdownTableMutationRequest,
): Promise<ExecuteDatabaseUiMutationResult | DatabaseMarkdownTableMutationResponse> {
  if ('storage' in request && request.storage === 'markdown_table') {
    return mutateDatabaseMarkdownTable(request.mutation);
  }
  return executeDatabaseUiMutation(request as DatabaseMutationRequest);
}

export function optimisticCellKey(recordId: string, propertyId: string): string {
  return `${recordId}:${propertyId}`;
}

export function setOptimisticCellValue(
  current: ReadonlyMap<string, DatabaseValue | undefined>,
  key: string,
  value: DatabaseValue | undefined,
): Map<string, DatabaseValue | undefined> {
  const next = new Map(current);
  next.set(key, value);
  return next;
}

export function clearOptimisticCellValue(
  current: ReadonlyMap<string, DatabaseValue | undefined>,
  key: string,
): Map<string, DatabaseValue | undefined> {
  if (!current.has(key)) return new Map(current);
  const next = new Map(current);
  next.delete(key);
  return next;
}

export function clearOptimisticCellValues(
  current: ReadonlyMap<string, DatabaseValue | undefined>,
  keys: readonly string[],
): Map<string, DatabaseValue | undefined> {
  if (keys.every((key) => !current.has(key))) return new Map(current);
  const next = new Map(current);
  for (const key of keys) next.delete(key);
  return next;
}

export type {
  DatabaseDesiredStateDraftInput,
  ExecuteDatabaseUiMutationInput,
  ExecuteDatabaseUiMutationResult,
};
