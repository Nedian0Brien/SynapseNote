/**
 * Compatibility entry point for the canonical database workspace.
 *
 * The workspace runtime and its presentation slices live in dedicated
 * modules; this file intentionally contains no network, mutation, or dialog
 * orchestration so existing route imports remain stable during the split.
 */

// The grid symbols this barrel used to forward (DatabaseTable,
// DatabaseStateNotice, DatabaseAtomicApprovalScope and the table types) reach
// their consumers through DatabaseTableDialog's own re-export from
// DatabaseTableGrid. Forwarding them here as well was a second, unused path.
export type { DatabaseTableDialogProps } from './DatabaseWorkspaceRuntime';
export { DatabaseTableDialog, DatabaseWorkspacePage } from './DatabaseWorkspaceRuntime';
