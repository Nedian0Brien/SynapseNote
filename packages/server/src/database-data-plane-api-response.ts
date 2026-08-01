import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DatabasePublicSharePolicy, DatabaseQueryError } from '@nedian0brien/synapsenote-core';
import { DatabaseAgentPromptRetentionError } from './database-agent-prompt-retention.ts';
import { DatabaseAgentRunStoreError } from './database-agent-run-store.ts';
import { DatabaseAutonomyStoreError } from './database-autonomy-store.ts';
import { DatabaseButtonPlanError } from './database-button.ts';
import { DatabaseButtonExecutionError } from './database-button-executor.ts';
import { DatabaseCommitError } from './database-commit.ts';
import { DatabaseContextPackError } from './database-context-pack.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import { DatabasePermissionStoreError } from './database-permission-store.ts';
import { DatabasePlanError } from './database-plan-artifacts.ts';
import { databaseProblemExtensions } from './database-problem.ts';
import { DatabaseRepairError } from './database-repair.ts';
import { DatabaseTaskServiceError } from './database-task-service.ts';
import type { DatabaseTaskStoreErrorCode } from './database-task-store.ts';
import { errorResponse, type HttpErrorStatus } from './http/error-response.ts';

export const DATABASE_API_SCHEMA_VERSION = 1 as const;
export const DATABASE_API_SCHEMA_VERSION_HEADER = 'X-SynapseNote-Database-Schema-Version';

export function parseRevisionTag(value: string | string[] | undefined): string | undefined {
  const tag = Array.isArray(value) ? value[0] : value;
  if (!tag) return undefined;
  const normalized = tag.trim().replace(/^W\//, '');
  return normalized.startsWith('"') && normalized.endsWith('"')
    ? normalized.slice(1, -1)
    : normalized;
}

export function revisionHeaders(revision: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    [DATABASE_API_SCHEMA_VERSION_HEADER]: String(DATABASE_API_SCHEMA_VERSION),
    ETag: `"${revision}"`,
  };
}

export function noStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    [DATABASE_API_SCHEMA_VERSION_HEADER]: String(DATABASE_API_SCHEMA_VERSION),
  };
}

export function requestCancellationCheckpoint(
  request: IncomingMessage,
  response: ServerResponse,
): () => void {
  return () => {
    if (!request.aborted && !response.destroyed) return;
    const error = new Error('Database request was cancelled by the client');
    error.name = 'AbortError';
    throw error;
  };
}

export function cancelledConnection(
  error: unknown,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  return (
    error instanceof Error && error.name === 'AbortError' && (request.aborted || response.destroyed)
  );
}

export function publicShareView(policy: DatabasePublicSharePolicy) {
  const { tokenHash: _tokenHash, createdBy: _createdBy, ...view } = policy;
  return view;
}

export function respondUnavailable(response: ServerResponse, handler: string): void {
  errorResponse(
    response,
    503,
    'urn:ok:error:internal-server-error',
    'Database data plane is unavailable.',
    {
      handler,
      extensions: databaseProblemExtensions('data_plane_unavailable'),
    },
  );
}

function isTaskStoreError(error: unknown): error is Error & {
  code: DatabaseTaskStoreErrorCode;
  details: Record<string, unknown>;
} {
  return (
    error instanceof Error &&
    error.name === 'DatabaseTaskStoreError' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'details' in error &&
    error.details !== null &&
    typeof error.details === 'object'
  );
}

export function respondTaskStoreError(response: ServerResponse, error: unknown): void {
  if (error instanceof DatabaseTaskServiceError) {
    const status: HttpErrorStatus =
      error.code === 'task_database_not_found'
        ? 404
        : error.code === 'task_target_limit_exceeded'
          ? 413
          : error.code === 'task_invalid_request'
            ? 400
            : 409;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 413
          ? 'urn:ok:error:payload-too-large'
          : status === 400
            ? 'urn:ok:error:invalid-request'
            : 'urn:ok:error:stale-target',
      error.message,
      {
        handler: 'database-task',
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (!isTaskStoreError(error)) {
    respondDataPlaneError(response, 'database-task', error);
    return;
  }
  const status: HttpErrorStatus =
    error.code === 'task_not_found'
      ? 404
      : error.code === 'task_revision_changed' ||
          error.code === 'task_not_cancellable' ||
          error.code === 'invalid_task_transition'
        ? 409
        : error.code === 'invalid_task' || error.code === 'invalid_task_cursor'
          ? 400
          : 500;
  errorResponse(
    response,
    status,
    status === 404
      ? 'urn:ok:error:not-found'
      : status === 409
        ? 'urn:ok:error:stale-target'
        : status === 400
          ? 'urn:ok:error:invalid-request'
          : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-task',
      extensions: databaseProblemExtensions(error.code, error.details),
    },
  );
}

export function respondAutonomyStoreError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabaseAutonomyStoreError)) {
    respondDataPlaneError(response, 'database-autonomy', error);
    return;
  }
  const status: HttpErrorStatus = error.code === 'autonomy_revision_changed' ? 409 : 503;
  errorResponse(
    response,
    status,
    status === 409 ? 'urn:ok:error:stale-target' : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-autonomy',
      extensions: databaseProblemExtensions(error.code, error.details),
    },
  );
}

export function respondPermissionStoreError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabasePermissionStoreError)) {
    respondDataPlaneError(response, 'database-permissions', error);
    return;
  }
  const status: HttpErrorStatus = error.code === 'permission_revision_changed' ? 409 : 503;
  errorResponse(
    response,
    status,
    status === 409 ? 'urn:ok:error:stale-target' : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-permissions',
      extensions: databaseProblemExtensions(
        error.code === 'permission_revision_changed' ? 'permission_changed' : 'internal_error',
        error.details,
      ),
    },
  );
}

export function respondAgentRunStoreError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabaseAgentRunStoreError)) {
    respondDataPlaneError(response, 'database-agent-runs', error);
    return;
  }
  const status: HttpErrorStatus =
    error.code === 'agent_run_not_found'
      ? 404
      : error.code === 'agent_run_plan_unavailable' ||
          error.code === 'agent_run_not_retryable' ||
          error.code === 'agent_run_revision_changed'
        ? 409
        : 503;
  errorResponse(
    response,
    status,
    status === 404
      ? 'urn:ok:error:not-found'
      : status === 409
        ? 'urn:ok:error:stale-target'
        : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-agent-runs',
      extensions: databaseProblemExtensions(error.code),
    },
  );
}

export function respondAgentPromptRetentionError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabaseAgentPromptRetentionError)) {
    respondDataPlaneError(response, 'database-agent-runs', error);
    return;
  }
  errorResponse(
    response,
    error.code === 'prompt_retention_not_found' ? 404 : 400,
    error.code === 'prompt_retention_not_found'
      ? 'urn:ok:error:not-found'
      : 'urn:ok:error:invalid-request',
    error.message,
    {
      handler: 'database-agent-runs',
      extensions: databaseProblemExtensions(error.code),
    },
  );
}

export function respondDataPlaneError(
  response: ServerResponse,
  handler: string,
  error: unknown,
): void {
  if (error instanceof DatabaseButtonExecutionError) {
    const status: HttpErrorStatus =
      error.code === 'button_permission_denied'
        ? 403
        : error.code === 'button_approval_required'
          ? 409
          : 400;
    errorResponse(
      response,
      status,
      status === 403
        ? 'urn:ok:error:permission-denied'
        : status === 409
          ? 'urn:ok:error:stale-target'
          : 'urn:ok:error:invalid-request',
      error.message,
      { handler, extensions: databaseProblemExtensions(error.code) },
    );
    return;
  }
  if (error instanceof DatabaseButtonPlanError) {
    const status: HttpErrorStatus =
      error.code === 'database_not_found' ||
      error.code === 'record_not_found' ||
      error.code === 'button_not_found'
        ? 404
        : error.code === 'permission_denied'
          ? 403
          : error.code === 'record_revision_changed' || error.code === 'record_scope_mismatch'
            ? 409
            : 400;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 403
          ? 'urn:ok:error:permission-denied'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : 'urn:ok:error:invalid-request',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabaseDataPlaneError) {
    const status: HttpErrorStatus =
      error.code === 'database_not_found' ||
      error.code === 'source_not_found' ||
      error.code === 'property_not_found' ||
      error.code === 'record_not_found' ||
      error.code === 'view_not_found' ||
      error.code === 'form_not_found' ||
      error.code === 'agent_view_not_found' ||
      error.code === 'context_inspection_not_found'
        ? 404
        : error.code === 'permission_denied' || error.code === 'form_access_denied'
          ? 403
          : error.code === 'transaction_in_progress' ||
              error.code === 'storage_read_only' ||
              error.code === 'button_plan_expired' ||
              error.code === 'form_closed' ||
              error.code === 'form_duplicate_submission'
            ? 409
            : error.code === 'invalid_computed_property' ||
                error.code === 'delta_query_mismatch' ||
                error.code === 'view_source_mismatch' ||
                error.code === 'agent_view_source_mismatch' ||
                error.code === 'agent_view_scope_violation' ||
                error.code === 'agent_view_budget_exceeded' ||
                error.code === 'form_invalid_submission'
              ? 400
              : error.code === 'resource_limit'
                ? 413
                : error.code === 'form_rate_limited'
                  ? 429
                  : 503;
    const type =
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 403
          ? 'urn:ok:error:permission-denied'
          : status === 400
            ? 'urn:ok:error:invalid-request'
            : status === 413
              ? 'urn:ok:error:payload-too-large'
              : status === 429
                ? 'urn:ok:error:invalid-request'
                : error.code === 'stale_index' ||
                    error.code === 'transaction_in_progress' ||
                    error.code === 'mutation_failed' ||
                    error.code === 'button_plan_expired'
                  ? 'urn:ok:error:stale-target'
                  : 'urn:ok:error:internal-server-error';
    errorResponse(response, status, type, error.message, {
      handler,
      extensions: databaseProblemExtensions(error.code, error.details),
    });
    return;
  }
  if (error instanceof DatabaseQueryError) {
    errorResponse(response, 400, 'urn:ok:error:invalid-request', error.message, {
      handler,
      extensions: databaseProblemExtensions(error.code, error.details),
    });
    return;
  }
  if (error instanceof DatabaseContextPackError) {
    const status: HttpErrorStatus = error.code === 'stale_pack_cursor' ? 409 : 400;
    errorResponse(
      response,
      status,
      status === 409 ? 'urn:ok:error:stale-target' : 'urn:ok:error:invalid-request',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabasePlanError) {
    const status: HttpErrorStatus =
      error.code === 'draft_not_found' || error.code === 'plan_not_found'
        ? 404
        : error.code === 'draft_expired' ||
            error.code === 'plan_expired' ||
            error.code === 'snapshot_changed'
          ? 409
          : 400;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 409
          ? 'urn:ok:error:stale-target'
          : 'urn:ok:error:invalid-request',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabaseCommitError) {
    const status: HttpErrorStatus =
      error.code === 'undo_not_found'
        ? 404
        : error.code === 'approval_required'
          ? 403
          : error.code === 'snapshot_changed' ||
              error.code === 'plan_hash_mismatch' ||
              error.code === 'plan_not_committable' ||
              error.code === 'assertion_failed' ||
              error.code === 'target_changed' ||
              error.code === 'idempotency_conflict'
            ? 409
            : error.code === 'commit_unavailable' || error.code === 'agent_run_unavailable'
              ? 503
              : error.code === 'invalid_commit_request' || error.code === 'undo_invalid_request'
                ? 400
                : 500;
    errorResponse(
      response,
      status,
      status === 403
        ? 'urn:ok:error:invalid-request'
        : status === 404
          ? 'urn:ok:error:not-found'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : status === 400
              ? 'urn:ok:error:invalid-request'
              : 'urn:ok:error:internal-server-error',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabaseRepairError) {
    const status: HttpErrorStatus =
      error.code === 'repair_plan_not_found'
        ? 404
        : error.code === 'repair_approval_required'
          ? 403
          : error.code === 'repair_plan_expired' ||
              error.code === 'repair_plan_hash_mismatch' ||
              error.code === 'repair_snapshot_changed' ||
              error.code === 'repair_idempotency_conflict' ||
              error.code === 'repair_file_changed' ||
              error.code === 'repair_undo_intervening_edit' ||
              error.code === 'repair_undo_idempotency_conflict' ||
              error.code === 'repair_blocked'
            ? 409
            : error.code === 'repair_nothing_to_repair' ||
                error.code === 'repair_undo_not_found' ||
                error.code === 'repair_undo_token_mismatch'
              ? 400
              : 500;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 403 || status === 400
          ? 'urn:ok:error:invalid-request'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : 'urn:ok:error:internal-server-error',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  errorResponse(response, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
    handler,
    cause: error,
    extensions: databaseProblemExtensions('internal_error'),
  });
}
