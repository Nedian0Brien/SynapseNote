/** Framework-free state contract for database workspace composition. */

export type DatabaseTablePhase =
  | 'initial-loading'
  | 'ready'
  | 'background-refreshing'
  | 'mutation-pending';

export interface DatabaseWorkspacePhaseInput {
  hasLoadedSource: boolean;
  sourceIdentityChanged: boolean;
  backgroundRefreshing: boolean;
  mutationPending: boolean;
}

/**
 * Mutation and overlay activity must never promote an already-mounted table to
 * `initial-loading`. That transition is reserved for a new source identity.
 */
export function deriveDatabaseTablePhase(input: DatabaseWorkspacePhaseInput): DatabaseTablePhase {
  if (!input.hasLoadedSource || input.sourceIdentityChanged) return 'initial-loading';
  if (input.mutationPending) return 'mutation-pending';
  if (input.backgroundRefreshing) return 'background-refreshing';
  return 'ready';
}

export interface DatabaseTableIdentityInput {
  sourceId: string;
  viewId: string;
}

/** Overlay, search and mutation tokens are intentionally absent from identity. */
export function databaseTableIdentity({ sourceId, viewId }: DatabaseTableIdentityInput): string {
  return `${sourceId}\u0000${viewId}`;
}

export type DatabaseCommandError = {
  code: string;
  message: string;
  retryable?: boolean;
};

export type DatabaseCommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DatabaseCommandError };

export function commandFailure(
  code: string,
  message: string,
  retryable = false,
): DatabaseCommandResult<never> {
  return { ok: false, error: { code, message, retryable } };
}
