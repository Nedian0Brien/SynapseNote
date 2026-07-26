export type DatabaseUiProblemKind =
  | 'offline'
  | 'missing'
  | 'invalid_schema'
  | 'stale_index'
  | 'lock'
  | 'conflict'
  | 'permission'
  | 'error';

export interface DatabaseUiProblem {
  readonly kind: DatabaseUiProblemKind;
  readonly message: string;
  readonly retryable: boolean;
}

interface ErrorWithProblem extends Error {
  readonly status?: number;
  readonly problem?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function problemMetadata(value: unknown): {
  code: string | null;
  type: string | null;
  recoveryAction: string | null;
  retryable: boolean | null;
  hasSchemaIssues: boolean;
} {
  const problem = record(value);
  const recovery = record(problem?.recovery);
  return {
    code: typeof problem?.code === 'string' ? problem.code : null,
    type: typeof problem?.type === 'string' ? problem.type : null,
    recoveryAction: typeof recovery?.action === 'string' ? recovery.action : null,
    retryable: typeof problem?.retryable === 'boolean' ? problem.retryable : null,
    hasSchemaIssues: Array.isArray(problem?.issues),
  };
}

function isNetworkFailure(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  if ('status' in cause && (cause as ErrorWithProblem).status === 0) return true;
  return (
    cause.name === 'TypeError' &&
    /fetch|network|load failed|internet|offline|connection/i.test(cause.message)
  );
}

/**
 * Converts browser transport failures and the database RFC 9457 extensions into
 * a small, stable set of UI states. Typed problem metadata wins over prose so
 * the UI does not depend on server message wording.
 */
export function classifyDatabaseUiProblem(cause: unknown, fallback: string): DatabaseUiProblem {
  const error = cause instanceof Error ? (cause as ErrorWithProblem) : null;
  const message = error?.message || fallback;
  if (isNetworkFailure(cause)) return { kind: 'offline', message, retryable: true };

  const status = error?.status;
  const metadata = problemMetadata(error?.problem);
  const code = metadata.code ?? '';
  const type = metadata.type ?? '';
  const action = metadata.recoveryAction ?? '';

  // A canonical commit briefly blocks reads while its transaction is being
  // verified. The read clients already perform a bounded typed retry; if that
  // window is exhausted, keep the state recoverable instead of mislabelling it
  // as a user edit conflict.
  if (isDatabaseTransactionInProgress(cause)) {
    return {
      kind: 'stale_index',
      message: 'The database is still updating. Try again shortly.',
      retryable: true,
    };
  }

  if (
    status === 404 ||
    code === 'not_found' ||
    code === 'database_not_found' ||
    code === 'source_not_found'
  ) {
    return { kind: 'missing', message, retryable: false };
  }

  if (code === 'stale_index' || code === 'index_unavailable' || action === 'rebuild_index') {
    return {
      kind: 'stale_index',
      message,
      retryable: metadata.retryable ?? true,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    code === 'permission_denied' ||
    code === 'approval_required' ||
    action === 'request_access' ||
    action === 'request_approval' ||
    type.includes('permission-denied')
  ) {
    return { kind: 'permission', message, retryable: false };
  }

  if (
    status === 409 ||
    type.includes('stale-target') ||
    action === 'recreate_plan' ||
    action === 'restart_query'
  ) {
    return {
      kind: 'conflict',
      message: 'The database changed while this action was in progress. Reload the latest state.',
      retryable: false,
    };
  }

  if (
    status === 423 ||
    code === 'lock_unavailable' ||
    code === 'transaction_locked' ||
    action === 'retry_after_lock'
  ) {
    return {
      kind: 'lock',
      message: 'The database is busy with another write. Try again shortly.',
      retryable: metadata.retryable ?? true,
    };
  }

  if (
    action === 'refresh_schema' ||
    metadata.hasSchemaIssues ||
    code === 'invalid_schema' ||
    /invalid (response|schema|manifest)/i.test(message)
  ) {
    return { kind: 'invalid_schema', message, retryable: true };
  }

  return {
    kind: 'error',
    message,
    retryable: metadata.retryable ?? (status === undefined || status >= 500),
  };
}

/**
 * A canonical write briefly blocks reads while its transaction is being
 * verified. The Data Plane marks that interval explicitly so page surfaces can
 * retry without presenting a false stale-target conflict to the user.
 */
export function isDatabaseTransactionInProgress(cause: unknown): boolean {
  const error = cause instanceof Error ? (cause as ErrorWithProblem) : null;
  return problemMetadata(error?.problem).code === 'transaction_in_progress';
}

export function databaseConflictProblem(message: string): DatabaseUiProblem {
  return { kind: 'conflict', message, retryable: false };
}

export function databaseIndexProblem(
  state: 'rebuilding' | 'error',
  message: string,
): DatabaseUiProblem {
  return { kind: 'stale_index', message, retryable: state === 'error' };
}

/**
 * Product copy for a write failure.  Mutation responses can contain transport
 * details, stable IDs, and server-internal terminology; those details are
 * useful in logs but are not a safe primary status message.  Keep this mapping
 * deliberately small so every inline and workspace write exposes the same
 * recovery action.
 */
export function databaseMutationUiMessage(kind: DatabaseUiProblemKind): string {
  switch (kind) {
    case 'offline':
      return 'You are offline. The change will be retried when the connection returns.';
    case 'missing':
      return 'This database is no longer available. Reload the document to choose another one.';
    case 'invalid_schema':
      return 'The database schema needs attention. Reload the latest database state and try again.';
    case 'stale_index':
      return 'The database is still updating. Try again shortly.';
    case 'lock':
      return 'The database is busy with another write. Try again shortly.';
    case 'permission':
      return 'You do not have permission to make this database change.';
    case 'conflict':
      return 'The database changed while this action was in progress. Reload the latest state.';
    case 'error':
      return 'Unable to save the database change. Try again.';
  }
}

/** Primary copy for read/state notices. Transport details remain available to
 * diagnostics/logging, but status and alert regions use stable product copy. */
export function databaseUiProblemMessage(problem: Pick<DatabaseUiProblem, 'kind'>): string {
  switch (problem.kind) {
    case 'offline':
      return 'Database is offline. Cached pages remain available when possible.';
    case 'missing':
      return 'This linked database is unavailable. Choose a replacement or reload the document.';
    case 'invalid_schema':
      return 'The database setup needs attention. Reload the latest schema and try again.';
    case 'stale_index':
      return 'The database is still updating. Try again shortly.';
    case 'lock':
      return 'The database is busy with another write. Try again shortly.';
    case 'conflict':
      return 'The database changed elsewhere. Reload the latest state before retrying.';
    case 'permission':
      return 'You do not have access to this database operation.';
    case 'error':
      return 'The database could not be loaded. Try again.';
  }
}
