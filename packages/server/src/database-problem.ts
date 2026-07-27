import type { DatabaseQueryErrorCode } from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import type { DatabaseAgentPromptRetentionErrorCode } from './database-agent-prompt-retention.ts';
import type { DatabaseAgentRunStoreErrorCode } from './database-agent-run-store.ts';
import type { DatabaseAutonomyStoreErrorCode } from './database-autonomy-store.ts';
import type { DatabaseButtonPlanErrorCode } from './database-button.ts';
import type { DatabaseButtonExecutionErrorCode } from './database-button-executor.ts';
import type { DatabaseCommitErrorCode } from './database-commit.ts';
import type { DatabaseContextPackErrorCode } from './database-context-pack.ts';
import type { DatabaseDataPlaneErrorCode } from './database-data-plane.ts';
import type { DatabasePlanErrorCode } from './database-plan.ts';
import type { DatabaseRepairErrorCode } from './database-repair.ts';
import type { DatabaseTaskServiceErrorCode } from './database-task-service.ts';
import type { DatabaseTaskStoreErrorCode } from './database-task-store.ts';
import type { RequestValidationErrorKind } from './http/request-validation.ts';

export const DatabaseRecoveryActionSchema = z.enum([
  'fix_request',
  'use_allowed_method',
  'reduce_request',
  'retry',
  'wait_and_retry',
  'refresh_catalog',
  'refresh_schema',
  'restart_query',
  'rebuild_index',
  'increase_budget',
  'recreate_draft',
  'recreate_plan',
  'restart_task',
  'review_plan',
  'start_migration',
  'request_approval',
  'request_access',
  'use_new_idempotency_key',
  'use_current_undo_token',
  'manual_recovery',
]);
export type DatabaseRecoveryAction = z.infer<typeof DatabaseRecoveryActionSchema>;

export const DatabaseRecoverySchema = z
  .object({
    action: DatabaseRecoveryActionSchema,
    instruction: z.string().min(1),
    endpoint: z.string().startsWith('/api/databases/').optional(),
    retryAfterMs: z.number().int().positive().optional(),
    preserveIdempotencyKey: z.boolean().optional(),
  })
  .strict();
export type DatabaseRecovery = z.infer<typeof DatabaseRecoverySchema>;

export const DatabaseProblemExtensionsSchema = z
  .object({
    code: z.string().min(1),
    retryable: z.boolean(),
    recovery: DatabaseRecoverySchema,
  })
  .loose();
export type DatabaseProblemExtensions = z.infer<typeof DatabaseProblemExtensionsSchema>;

export type DatabaseProblemCode =
  | DatabaseDataPlaneErrorCode
  | DatabaseQueryErrorCode
  | DatabaseContextPackErrorCode
  | DatabasePlanErrorCode
  | DatabaseCommitErrorCode
  | DatabaseAutonomyStoreErrorCode
  | DatabaseAgentRunStoreErrorCode
  | DatabaseAgentPromptRetentionErrorCode
  | DatabaseButtonPlanErrorCode
  | DatabaseButtonExecutionErrorCode
  | DatabaseRepairErrorCode
  | DatabaseTaskStoreErrorCode
  | DatabaseTaskServiceErrorCode
  | 'data_plane_unavailable'
  | 'invalid_request'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'request_timeout'
  | 'transport_error'
  | 'internal_error';

function recoveryFor(code: DatabaseProblemCode): {
  retryable: boolean;
  recovery: DatabaseRecovery;
} {
  switch (code) {
    case 'database_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'refresh_catalog',
          instruction: 'Refresh the catalog and retry with one returned database ID.',
          endpoint: '/api/databases/catalog',
        },
      };
    case 'record_not_found':
    case 'record_scope_mismatch':
    case 'record_revision_changed':
      return {
        retryable: false,
        recovery: {
          action: 'restart_query',
          instruction:
            'Refresh the source query and retry with a record ID from its current snapshot.',
          endpoint: '/api/databases/query',
        },
      };
    case 'source_not_found':
    case 'property_not_found':
    case 'unknown_property':
    case 'wrong_source':
    case 'unknown_relation_projection_source':
    case 'unknown_relation_projection_property':
    case 'view_not_found':
    case 'form_not_found':
    case 'agent_view_not_found':
    case 'button_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'refresh_schema',
          instruction: 'Describe the current database schema and retry with returned stable IDs.',
          endpoint: '/api/databases/describe',
        },
      };
    case 'invalid_computed_property':
    case 'invalid_property_conversion':
    case 'invalid_button_action':
      return {
        retryable: false,
        recovery: {
          action: 'fix_request',
          instruction:
            'Fix the candidate schema or action against the current database description, then retry the preview.',
          endpoint: '/api/databases/describe',
        },
      };
    case 'permission_denied':
    case 'button_permission_denied':
    case 'form_access_denied':
      return {
        retryable: false,
        recovery: {
          action: 'request_access',
          instruction:
            'Request access or remove the denied filter, sort, group, or calculation properties using the returned allowed property IDs.',
          endpoint: '/api/databases/describe',
        },
      };
    case 'transaction_in_progress':
      return {
        retryable: true,
        recovery: {
          action: 'wait_and_retry',
          instruction: 'Wait for the active database transaction to finish, then retry unchanged.',
          retryAfterMs: 250,
        },
      };
    case 'mutation_unavailable':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction:
            'The v2 Markdown mutation boundary is not ready on this server; retry after it is configured.',
          endpoint: '/api/databases/markdown-table/mutate',
          retryAfterMs: 1_000,
        },
      };
    case 'v2_storage_read_only':
    case 'storage_read_only':
      return {
        retryable: false,
        recovery: {
          action: 'start_migration',
          instruction:
            'This source is still v1/read-only. Preview and approve the v1→v2 migration before editing it.',
          endpoint: '/api/databases/task',
        },
      };
    case 'mutation_failed':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'The v2 owner-table transaction did not complete. Inspect its durable journal and retry only after the state is explicit.',
          endpoint: '/api/databases/diagnostics',
        },
      };
    case 'form_rate_limited':
      return {
        retryable: true,
        recovery: {
          action: 'wait_and_retry',
          instruction: 'Wait for the form submission window to reset, then retry unchanged.',
          endpoint: '/api/databases/forms/submit',
          retryAfterMs: 60_000,
          preserveIdempotencyKey: true,
        },
      };
    case 'form_closed':
    case 'form_duplicate_submission':
      return {
        retryable: false,
        recovery: {
          action: 'fix_request',
          instruction:
            'The form no longer accepts this response; refresh the form before attempting another submission.',
          endpoint: '/api/databases/describe',
        },
      };
    case 'stale_index':
    case 'index_unavailable':
    case 'semantic_index_unavailable':
      return {
        retryable: true,
        recovery: {
          action: 'rebuild_index',
          instruction: 'Wait for or trigger an index rebuild, then retry against the new revision.',
          retryAfterMs: 500,
        },
      };
    case 'delta_query_mismatch':
    case 'invalid_cursor':
    case 'invalid_pack_cursor':
    case 'stale_pack_cursor':
      return {
        retryable: false,
        recovery: {
          action: 'restart_query',
          instruction: 'Discard the stale cursor or receipt and restart from the first page.',
          endpoint: '/api/databases/query',
        },
      };
    case 'context_inspection_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'restart_query',
          instruction:
            'The bounded in-memory inspection has expired; create a fresh Context Pack to inspect.',
          endpoint: '/api/databases/pack',
        },
      };
    case 'budget_too_small':
    case 'invalid_pack_budget':
      return {
        retryable: false,
        recovery: {
          action: 'increase_budget',
          instruction: 'Increase maxTokens or reduce the selected properties and disclosure level.',
          endpoint: '/api/databases/pack',
        },
      };
    case 'draft_not_found':
    case 'draft_expired':
      return {
        retryable: false,
        recovery: {
          action: 'recreate_draft',
          instruction: 'Create a fresh desired-state draft before requesting a new plan.',
          endpoint: '/api/databases/plan',
        },
      };
    case 'button_plan_expired':
    case 'button_plan_mismatch':
      return {
        retryable: false,
        recovery: {
          action: 'recreate_plan',
          instruction: 'Create and review a fresh Button plan before executing it.',
          endpoint: '/api/databases/button',
        },
      };
    case 'plan_not_found':
    case 'plan_expired':
    case 'plan_hash_mismatch':
    case 'snapshot_changed':
    case 'permission_changed':
    case 'query_snapshot_changed':
    case 'write_guard_unavailable':
    case 'target_changed':
      return {
        retryable: false,
        recovery: {
          action: 'recreate_plan',
          instruction:
            'Create and review a new plan against the current schema, target, permission, and query snapshots before committing.',
          endpoint: '/api/databases/plan',
        },
      };
    case 'task_snapshot_changed':
    case 'task_plan_hash_mismatch':
    case 'task_plan_hash_required':
      return {
        retryable: false,
        recovery: {
          action: 'restart_task',
          instruction:
            'Re-read the current schema or plan, then launch a new task with fresh revisions.',
          endpoint: '/api/databases/task',
        },
      };
    case 'task_database_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'refresh_catalog',
          instruction: 'Refresh the database catalog and launch the task with a current ID.',
          endpoint: '/api/databases/catalog',
        },
      };
    case 'task_target_limit_exceeded':
      return {
        retryable: false,
        recovery: {
          action: 'reduce_request',
          instruction: 'Split the source into bounded import scopes before launching new tasks.',
          endpoint: '/api/databases/task',
        },
      };
    case 'task_invalid_request':
      return {
        retryable: false,
        recovery: {
          action: 'fix_request',
          instruction: 'Correct the task launch request and submit it again.',
          endpoint: '/api/databases/task',
        },
      };
    case 'task_rollback_unavailable':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'The task has no applicable rollback checkpoint. Inspect its result and local task history before changing files manually.',
          endpoint: '/api/databases/task',
        },
      };
    case 'task_rollback_conflict':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'One or more imported files changed after the task. Review the reported paths and preserve those edits before attempting manual recovery.',
          endpoint: '/api/databases/task',
        },
      };
    case 'repair_plan_not_found':
    case 'repair_plan_expired':
    case 'repair_plan_hash_mismatch':
    case 'repair_snapshot_changed':
    case 'repair_file_changed':
    case 'repair_undo_intervening_edit':
      return {
        retryable: false,
        recovery: {
          action: 'recreate_plan',
          instruction: 'Preview repair again and review it against the current canonical state.',
          endpoint: '/api/databases/repair',
        },
      };
    case 'button_approval_required':
      return {
        retryable: false,
        recovery: {
          action: 'request_approval',
          instruction: 'Approve the exact unchanged composite Button plan hash.',
          endpoint: '/api/databases/button',
        },
      };
    case 'approval_required':
    case 'autonomy_policy_unavailable':
    case 'autonomy_budget_exceeded':
      return {
        retryable: false,
        recovery: {
          action: 'request_approval',
          instruction: 'Request explicit approval for the exact unchanged plan hash.',
          endpoint: '/api/databases/commit',
        },
      };
    case 'autonomy_revision_changed':
      return {
        retryable: false,
        recovery: {
          action: 'request_approval',
          instruction: 'Read the current autonomy policy, review it, and submit the change again.',
          endpoint: '/api/databases/autonomy',
        },
      };
    case 'autonomy_store_unsafe':
    case 'autonomy_store_corrupt':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'Stop automatic writes and inspect the local database autonomy policy store.',
        },
      };
    case 'autonomy_store_io_error':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction: 'Retry after local database autonomy policy storage becomes available.',
          endpoint: '/api/databases/autonomy',
          retryAfterMs: 1_000,
        },
      };
    case 'agent_run_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'retry',
          instruction: 'Refresh Agent Runs and select one returned run ID.',
          endpoint: '/api/databases/runs',
        },
      };
    case 'agent_run_plan_unavailable':
      return {
        retryable: false,
        recovery: {
          action: 'recreate_plan',
          instruction:
            'The immutable Agent Run plan was not available after restart; create and review a fresh plan before retrying.',
          endpoint: '/api/databases/plan',
        },
      };
    case 'agent_run_revision_changed':
      return {
        retryable: false,
        recovery: {
          action: 'retry',
          instruction: 'Refresh the Agent Run and retry with its latest revision.',
          endpoint: '/api/databases/runs',
        },
      };
    case 'agent_run_not_retryable':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction: 'Only a failed agent run can be retried or resumed.',
          endpoint: '/api/databases/runs',
        },
      };
    case 'prompt_retention_invalid':
      return {
        retryable: false,
        recovery: {
          action: 'fix_request',
          instruction:
            'Provide explicit consent and a prompt retention TTL between 60 seconds and 7 days.',
          endpoint: '/api/databases/runs',
        },
      };
    case 'prompt_retention_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'retry',
          instruction: 'The retained prompt expired or was deleted; opt in again if still needed.',
          endpoint: '/api/databases/runs',
        },
      };
    case 'agent_run_store_unsafe':
    case 'agent_run_store_corrupt':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction: 'Stop run inspection and repair the owner-only Agent Runs store.',
        },
      };
    case 'agent_run_unavailable':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction:
            'Retry the unchanged commit after the owner-only Agent Runs store becomes available.',
          endpoint: '/api/databases/commit',
          retryAfterMs: 1_000,
          preserveIdempotencyKey: true,
        },
      };
    case 'repair_approval_required':
      return {
        retryable: false,
        recovery: {
          action: 'request_approval',
          instruction: 'Approve the exact unchanged repair plan hash before applying it.',
          endpoint: '/api/databases/repair',
        },
      };
    case 'plan_not_committable':
    case 'assertion_failed':
      return {
        retryable: false,
        recovery: {
          action: 'review_plan',
          instruction: 'Resolve every plan conflict or failed assertion, then create a new plan.',
          endpoint: '/api/databases/plan',
        },
      };
    case 'repair_blocked':
    case 'repair_nothing_to_repair':
      return {
        retryable: false,
        recovery: {
          action: 'review_plan',
          instruction: 'Resolve every repair blocker, then request a fresh repair preview.',
          endpoint: '/api/databases/repair',
        },
      };
    case 'button_idempotency_conflict':
      return {
        retryable: false,
        recovery: {
          action: 'use_new_idempotency_key',
          instruction: 'Use a new Button idempotency key for a different reviewed plan.',
          endpoint: '/api/databases/button',
        },
      };
    case 'idempotency_conflict':
      return {
        retryable: false,
        recovery: {
          action: 'use_new_idempotency_key',
          instruction:
            'Use a new idempotency key for different input; reuse the old key only unchanged.',
          endpoint: '/api/databases/commit',
        },
      };
    case 'repair_idempotency_conflict':
      return {
        retryable: false,
        recovery: {
          action: 'use_new_idempotency_key',
          instruction: 'Use a new idempotency key for a different repair apply request.',
          endpoint: '/api/databases/repair',
        },
      };
    case 'repair_undo_not_found':
    case 'repair_undo_token_mismatch':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'Use the exact durable repair receipt and undo token, or follow the recovery runbook.',
          endpoint: '/api/databases/repair',
        },
      };
    case 'repair_undo_idempotency_conflict':
      return {
        retryable: false,
        recovery: {
          action: 'use_new_idempotency_key',
          instruction: 'Use a new idempotency key only for a different repair undo request.',
          endpoint: '/api/databases/repair',
        },
      };
    case 'undo_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'use_current_undo_token',
          instruction: 'Use the undo token from the durable receipt of the transaction to reverse.',
          endpoint: '/api/databases/undo',
        },
      };
    case 'task_not_found':
      return {
        retryable: false,
        recovery: {
          action: 'fix_request',
          instruction: 'List current database tasks and retry with one returned stable task ID.',
          endpoint: '/api/databases/task',
        },
      };
    case 'task_revision_changed':
      return {
        retryable: false,
        recovery: {
          action: 'retry',
          instruction:
            'Get the task again and decide whether cancellation is still appropriate for its current state and revision.',
          endpoint: '/api/databases/task',
        },
      };
    case 'task_store_unsafe':
    case 'task_store_corrupt':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'Stop database jobs and inspect the local database task store before retrying.',
        },
      };
    case 'task_store_io_error':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction: 'Retry after local database task storage becomes available.',
          endpoint: '/api/databases/task',
          retryAfterMs: 1_000,
        },
      };
    case 'rollback_failed':
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction: 'Stop writes and follow the database recovery runbook before retrying.',
        },
      };
    case 'transaction_failed':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction:
            'Retry the identical commit with the same idempotency key after rollback completes.',
          endpoint: '/api/databases/commit',
          retryAfterMs: 500,
          preserveIdempotencyKey: true,
        },
      };
    case 'repair_transaction_failed':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction: 'Retry the identical repair only after rollback and index refresh complete.',
          endpoint: '/api/databases/repair',
          retryAfterMs: 500,
          preserveIdempotencyKey: true,
        },
      };
    case 'commit_unavailable':
    case 'repair_unavailable':
    case 'data_plane_unavailable':
    case 'request_timeout':
    case 'transport_error':
    case 'internal_error':
      return {
        retryable: true,
        recovery: {
          action: 'retry',
          instruction: 'Retry after the database service becomes available.',
          retryAfterMs: 1_000,
        },
      };
    case 'method_not_allowed':
      return {
        retryable: false,
        recovery: {
          action: 'use_allowed_method',
          instruction: 'Retry using the HTTP method named by the Allow response header.',
        },
      };
    case 'payload_too_large':
    case 'resource_limit':
      return {
        retryable: false,
        recovery: {
          action: 'reduce_request',
          instruction: 'Reduce the request body below the documented limit before retrying.',
        },
      };
    case 'invalid_request':
    case 'invalid_query':
    case 'duplicate_property':
    case 'invalid_operator':
    case 'invalid_value':
    case 'invalid_calculation':
    case 'duplicate_calculation':
    case 'duplicate_record_id':
    case 'unknown_pack_property':
    case 'duplicate_pack_property':
    case 'invalid_relation_expansion':
    case 'invalid_pack_scope':
    case 'duplicate_relation_projection':
    case 'view_source_mismatch':
    case 'agent_view_source_mismatch':
    case 'agent_view_scope_violation':
    case 'agent_view_budget_exceeded':
    case 'invalid_desired_state':
    case 'invalid_commit_request':
    case 'undo_invalid_request':
    case 'invalid_task':
    case 'invalid_task_cursor':
    case 'task_not_cancellable':
    case 'invalid_task_transition':
    case 'form_invalid_submission':
      return {
        retryable: false,
        recovery: {
          action: 'fix_request',
          instruction:
            'Correct the request using the error details and current schema, then retry.',
        },
      };
    default:
      return {
        retryable: false,
        recovery: {
          action: 'manual_recovery',
          instruction:
            'The database returned an unclassified problem. Preserve the canonical files and follow the recovery runbook.',
          endpoint: '/api/databases/repair',
        },
      };
  }
}

export function databaseProblemExtensions(
  code: DatabaseProblemCode,
  details: Readonly<Record<string, unknown>> = {},
): DatabaseProblemExtensions {
  return DatabaseProblemExtensionsSchema.parse({
    ...details,
    code,
    ...recoveryFor(code),
  });
}

const requestCode: Record<RequestValidationErrorKind, DatabaseProblemCode> = {
  method_not_allowed: 'method_not_allowed',
  payload_too_large: 'payload_too_large',
  request_timeout: 'request_timeout',
  transport_error: 'transport_error',
  invalid_json: 'invalid_request',
  validation_failed: 'invalid_request',
};

export const DATABASE_REQUEST_ERROR_EXTENSIONS: Readonly<
  Record<RequestValidationErrorKind, DatabaseProblemExtensions>
> = Object.fromEntries(
  Object.entries(requestCode).map(([kind, code]) => [kind, databaseProblemExtensions(code)]),
) as Record<RequestValidationErrorKind, DatabaseProblemExtensions>;
