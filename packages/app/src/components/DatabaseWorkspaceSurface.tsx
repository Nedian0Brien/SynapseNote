/**
 * Compatibility entry point for the canonical database workspace.
 *
 * The workspace runtime and its presentation slices live in dedicated
 * modules; this file intentionally contains no network, mutation, or dialog
 * orchestration so existing route imports remain stable during the split.
 */

export type {
  DatabaseInitialRecordAction,
  DatabaseSelectProperty,
  DatabaseTableDialogProps,
  DatabaseTableSelection,
  DatabaseTableTarget,
  DatabaseTableViewState,
  LoadStatus,
} from './DatabaseWorkspaceRuntime';
export {
  DatabaseAtomicApprovalScope,
  DatabaseStateNotice,
  DatabaseTable,
  DatabaseTableDialog,
  DatabaseWorkspacePage,
} from './DatabaseWorkspaceRuntime';
