import type {
  DatabasePermissionAction,
  DatabaseSource,
  DatabaseValue,
} from '@nedian0brien/synapsenote-core';
import {
  createDatabaseMarkdownTableExport,
  type DatabaseMarkdownTableExport,
} from '@nedian0brien/synapsenote-core/server';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  type DatabaseMarkdownTableBulkCellMutationInput,
  type DatabaseMarkdownTableCellMutationInput,
  type DatabaseMarkdownTableDocumentMoveInput,
  type DatabaseMarkdownTableLifecycleMutationInput,
  type DatabaseMarkdownTableMutationResult,
  type DatabaseMarkdownTableRowCopyInput,
  type DatabaseMarkdownTableRowCreateInput,
  type DatabaseMarkdownTableRowMutationInput,
  type DatabaseMarkdownTableTitleMutationInput,
  type DatabaseMarkdownTableUndoInput,
  type DatabaseMarkdownTableWriter,
  DatabaseMarkdownTableWriterError,
} from './database-markdown-table-writer.ts';

export interface DatabaseMarkdownTableExportInput {
  databaseId: string;
  sourceId: string;
  mode: 'canonical_markdown' | 'computed_snapshot';
  query?: unknown;
}

export type DatabaseMarkdownTableMutationInput =
  | DatabaseMarkdownTableCellMutationInput
  | DatabaseMarkdownTableBulkCellMutationInput
  | DatabaseMarkdownTableRowMutationInput
  | Omit<DatabaseMarkdownTableRowMutationInput, 'values'>
  | DatabaseMarkdownTableRowCreateInput
  | DatabaseMarkdownTableRowCopyInput
  | DatabaseMarkdownTableTitleMutationInput
  | DatabaseMarkdownTableDocumentMoveInput
  | DatabaseMarkdownTableLifecycleMutationInput
  | DatabaseMarkdownTableUndoInput;

export interface DatabaseMarkdownTableMutationRequest {
  operation:
    | 'update_cell'
    | 'update_cells'
    | 'replace_row'
    | 'delete_row'
    | 'create_row'
    | 'copy_row'
    | 'update_title'
    | 'move_document'
    | 'update_lifecycle'
    | 'undo';
  input: DatabaseMarkdownTableMutationInput;
}

interface DatabaseMarkdownTableExportPort {
  describeCanonical(input: { databaseId: string; sourceId: string }): {
    manifestRevision: string;
    source: DatabaseSource | null;
  };
  getV2CanonicalDocuments(
    databaseId: string,
    sourceId: string,
  ): {
    ownerPath: string;
    ownerMarkdown: string;
    linkedDocuments: readonly { path: string; markdown: string }[];
  } | null;
  query(input: { databaseId: string; sourceId: string; query: unknown }): {
    manifestRevision: string;
    derivedRevision?: string | null;
    snapshotRevision: string;
    records: readonly {
      id: string;
      path: string;
      values: Record<string, DatabaseValue>;
      computedResults?: Record<string, unknown>;
    }[];
  };
  now(): Date;
}

/** Adapts v2 owner-table documents to either canonical or computed exports. */
export function exportDatabaseMarkdownTable(
  port: DatabaseMarkdownTableExportPort,
  input: DatabaseMarkdownTableExportInput,
): DatabaseMarkdownTableExport {
  const described = port.describeCanonical({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
  });
  const source = described.source;
  if (!source || source.storage?.kind !== 'markdown_table') {
    throw new DatabaseDataPlaneError(
      'source_not_found',
      'The requested source does not use v2 Markdown owner-table storage',
      { databaseId: input.databaseId, sourceId: input.sourceId },
    );
  }
  const canonical = port.getV2CanonicalDocuments(input.databaseId, input.sourceId);
  if (!canonical) {
    throw new DatabaseDataPlaneError(
      'index_unavailable',
      'Canonical v2 Markdown files are not available from the current index snapshot',
      { databaseId: input.databaseId, sourceId: input.sourceId },
    );
  }
  if (input.mode === 'canonical_markdown') {
    return createDatabaseMarkdownTableExport({
      mode: input.mode,
      manifestRevision: described.manifestRevision,
      ownerPath: canonical.ownerPath,
      ownerMarkdown: canonical.ownerMarkdown,
      linkedDocuments: canonical.linkedDocuments,
    });
  }
  const query = port.query({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
    query: {
      ...(input.query && typeof input.query === 'object' ? input.query : {}),
      page: {
        ...(input.query &&
        typeof input.query === 'object' &&
        'page' in input.query &&
        input.query.page &&
        typeof input.query.page === 'object'
          ? input.query.page
          : {}),
        limit: 500,
      },
    },
  });
  return createDatabaseMarkdownTableExport({
    mode: input.mode,
    manifestRevision: query.manifestRevision,
    ownerPath: canonical.ownerPath,
    ownerMarkdown: canonical.ownerMarkdown,
    evaluatedAt: port.now().toISOString(),
    derivedRevision: query.derivedRevision ?? query.snapshotRevision,
    records: query.records.map((record) => ({
      recordId: record.id,
      path: record.path,
      values: structuredClone(record.values),
      ...(record.computedResults ? { computed: structuredClone(record.computedResults) } : {}),
    })),
  });
}

interface DatabaseMarkdownTableMutationPort {
  assertMutationAllowed(): void;
  writer: DatabaseMarkdownTableWriter | null;
  authorizeOperation(input: {
    action: DatabasePermissionAction;
    databaseId: string;
    sourceId?: string;
    recordIds?: readonly string[];
    propertyIds?: readonly string[];
  }): void;
  mutationInput(input: DatabaseMarkdownTableMutationInput): DatabaseMarkdownTableMutationInput;
}

/** Maps transport-neutral row operations to the v2 owner-table writer. */
export async function mutateDatabaseMarkdownTable(
  port: DatabaseMarkdownTableMutationPort,
  input: DatabaseMarkdownTableMutationRequest,
): Promise<DatabaseMarkdownTableMutationResult> {
  port.assertMutationAllowed();
  const writer = port.writer;
  if (!writer) {
    throw new DatabaseDataPlaneError(
      'mutation_unavailable',
      'Markdown owner-table mutation is unavailable on this server',
    );
  }
  const raw = input.input as Record<string, unknown>;
  const scope =
    input.operation === 'undo' && raw.receipt && typeof raw.receipt === 'object'
      ? (raw.receipt as Record<string, unknown>)
      : raw;
  const databaseId = String(scope.databaseId ?? '');
  const sourceId = String(scope.sourceId ?? '');
  const recordId = typeof scope.recordId === 'string' ? scope.recordId : undefined;
  const propertyIds = typeof scope.propertyId === 'string' ? [scope.propertyId] : undefined;
  const undoAction =
    input.operation === 'undo'
      ? scope.operation === 'create_row' || scope.operation === 'copy_row'
        ? 'delete_record'
        : scope.operation === 'delete_row'
          ? 'create_record'
          : 'update_record'
      : null;
  port.authorizeOperation({
    action:
      undoAction ??
      (input.operation === 'create_row' || input.operation === 'copy_row'
        ? 'create_record'
        : input.operation === 'delete_row'
          ? 'delete_record'
          : 'update_record'),
    databaseId,
    ...(sourceId ? { sourceId } : {}),
    ...(recordId ? { recordIds: [recordId] } : {}),
    ...(propertyIds ? { propertyIds } : {}),
  });
  const mutationInput = port.mutationInput(input.input);
  try {
    switch (input.operation) {
      case 'update_cell':
        return await writer.updateCell(mutationInput as DatabaseMarkdownTableCellMutationInput);
      case 'update_cells':
        return await writer.updateCells(
          mutationInput as DatabaseMarkdownTableBulkCellMutationInput,
        );
      case 'replace_row':
        return await writer.replaceRow(mutationInput as DatabaseMarkdownTableRowMutationInput);
      case 'delete_row':
        return await writer.deleteRow(
          mutationInput as Omit<DatabaseMarkdownTableRowMutationInput, 'values'>,
        );
      case 'create_row':
        return await writer.createRow(mutationInput as DatabaseMarkdownTableRowCreateInput);
      case 'copy_row':
        return await writer.copyRow(mutationInput as DatabaseMarkdownTableRowCopyInput);
      case 'update_title':
        return await writer.updateTitle(mutationInput as DatabaseMarkdownTableTitleMutationInput);
      case 'move_document':
        return await writer.moveDocument(mutationInput as DatabaseMarkdownTableDocumentMoveInput);
      case 'update_lifecycle':
        return await writer.updateLifecycle(
          mutationInput as DatabaseMarkdownTableLifecycleMutationInput,
        );
      case 'undo':
        return await writer.undo(mutationInput as DatabaseMarkdownTableUndoInput);
    }
  } catch (error) {
    if (error instanceof DatabaseMarkdownTableWriterError) {
      const code =
        error.code === 'target_changed' || error.code === 'owner_invalid'
          ? 'stale_index'
          : error.code === 'source_not_found'
            ? 'source_not_found'
            : error.code === 'record_not_found'
              ? 'record_not_found'
              : error.code === 'property_not_stored'
                ? 'property_not_found'
                : error.code === 'resource_limit'
                  ? 'resource_limit'
                  : error.code === 'v2_storage_required'
                    ? 'storage_read_only'
                    : 'mutation_failed';
      throw new DatabaseDataPlaneError(code, error.message, {
        ...error.details,
        writerCode: error.code,
      });
    }
    throw error;
  }
}
