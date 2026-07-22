export type DatabaseUiProblemKind =
  | 'offline'
  | 'missing'
  | 'invalid_schema'
  | 'stale_index'
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
    return { kind: 'conflict', message, retryable: false };
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
