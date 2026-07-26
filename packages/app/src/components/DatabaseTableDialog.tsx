/**
 * Compatibility entry point for existing imports.
 *
 * The table renderer and the canonical workspace deliberately live in
 * separate modules. Keeping this adapter stable lets document, route, and
 * test callers migrate independently without reintroducing a megamodule.
 */

export type {
  DatabaseInitialRecordAction,
  DatabaseSelectProperty,
  DatabaseTableSelection,
  DatabaseTableTarget,
  DatabaseTableViewState,
  LoadStatus,
} from './DatabaseTableGrid';
export {
  DATABASE_CONDITIONAL_COLOR_CLASSES,
  DATABASE_EXPORT_RECORD_LIMIT,
  DATABASE_TABLE_RENDERED_COLUMN_LIMIT,
  DatabaseAtomicApprovalScope,
  DatabaseStateNotice,
  DatabaseTable,
  databaseSchemaMutationPolicy,
  downloadTextFile,
  isDatabaseSelectProperty,
  searchDatabaseRelationRecords,
} from './DatabaseTableGrid';
export type { DatabaseTableDialogProps } from './DatabaseWorkspaceSurface';
export { DatabaseTableDialog, DatabaseWorkspacePage } from './DatabaseWorkspaceSurface';
