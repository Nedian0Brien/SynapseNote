/**
 * Stable workspace controller facade.
 *
 * The runtime coordinator lives behind this boundary so table surfaces only
 * depend on the public controller contract while the remaining extraction
 * work can move state and command groups independently.
 */
export { useDatabaseWorkspaceController } from './use-database-workspace-controller-runtime';
