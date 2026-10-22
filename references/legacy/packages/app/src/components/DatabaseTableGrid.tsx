/**
 * Stable compatibility entry point for the database table.
 *
 * The implementation is intentionally split into a runtime coordinator,
 * canvas, controls, header/body, and cell primitives. Existing callers keep
 * importing this module while the internal pieces can evolve independently.
 */

export {
  DatabaseAtomicApprovalScope,
  DatabaseStateNotice,
  DatabaseTable,
  databaseSchemaMutationPolicy,
  downloadTextFile,
  searchDatabaseRelationRecords,
} from './DatabaseTableRuntime';
export type {
  DatabaseCreatedRecordFocusRequest,
  DatabaseInitialRecordAction,
  DatabaseSelectProperty,
  DatabaseTableSelection,
  DatabaseTableTarget,
  DatabaseTableViewState,
  LoadStatus,
} from './database-table-types';
export {
  DATABASE_EXPORT_RECORD_LIMIT,
  DATABASE_TABLE_RENDERED_COLUMN_LIMIT,
  isDatabaseSelectProperty,
} from './database-table-types';
export { DATABASE_CONDITIONAL_COLOR_CLASSES } from './database-table-utils';
