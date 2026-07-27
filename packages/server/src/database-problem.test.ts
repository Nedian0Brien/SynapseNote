import { describe, expect, test } from 'bun:test';
import {
  DATABASE_REQUEST_ERROR_EXTENSIONS,
  DatabaseProblemExtensionsSchema,
  databaseProblemExtensions,
} from './database-problem.ts';

describe('database problem recovery contract', () => {
  test('routes stale IDs, transient state, approval, and rollback failures to distinct actions', () => {
    expect(databaseProblemExtensions('database_not_found')).toMatchObject({
      retryable: false,
      recovery: { action: 'refresh_catalog', endpoint: '/api/databases/catalog' },
    });
    expect(databaseProblemExtensions('transaction_in_progress')).toMatchObject({
      retryable: true,
      recovery: { action: 'wait_and_retry', retryAfterMs: 250 },
    });
    expect(databaseProblemExtensions('approval_required')).toMatchObject({
      retryable: false,
      recovery: { action: 'request_approval', endpoint: '/api/databases/commit' },
    });
    expect(databaseProblemExtensions('rollback_failed')).toMatchObject({
      retryable: false,
      recovery: { action: 'manual_recovery' },
    });
  });

  test('routes repair failures to repair-specific recovery instructions', () => {
    expect(databaseProblemExtensions('repair_file_changed')).toMatchObject({
      retryable: false,
      recovery: { action: 'recreate_plan', endpoint: '/api/databases/repair' },
    });
    expect(databaseProblemExtensions('repair_approval_required')).toMatchObject({
      retryable: false,
      recovery: { action: 'request_approval', endpoint: '/api/databases/repair' },
    });
    expect(databaseProblemExtensions('repair_idempotency_conflict')).toMatchObject({
      retryable: false,
      recovery: { action: 'use_new_idempotency_key', endpoint: '/api/databases/repair' },
    });
    expect(databaseProblemExtensions('repair_transaction_failed')).toMatchObject({
      retryable: true,
      recovery: {
        action: 'retry',
        endpoint: '/api/databases/repair',
        preserveIdempotencyKey: true,
      },
    });
  });

  test('routes task conflicts and durable corruption without unsafe automatic retries', () => {
    expect(databaseProblemExtensions('task_revision_changed')).toMatchObject({
      retryable: false,
      recovery: { action: 'retry', endpoint: '/api/databases/task' },
    });
    expect(databaseProblemExtensions('task_not_cancellable')).toMatchObject({
      retryable: false,
      recovery: { action: 'fix_request' },
    });
    expect(databaseProblemExtensions('task_store_corrupt')).toMatchObject({
      retryable: false,
      recovery: { action: 'manual_recovery' },
    });
    expect(databaseProblemExtensions('agent_run_unavailable')).toMatchObject({
      retryable: true,
      recovery: {
        action: 'retry',
        endpoint: '/api/databases/commit',
        preserveIdempotencyKey: true,
      },
    });
  });

  test('routes legacy writer guards to the shared migration recovery action', () => {
    for (const code of ['storage_read_only', 'v2_storage_read_only'] as const) {
      expect(databaseProblemExtensions(code)).toMatchObject({
        retryable: false,
        recovery: {
          action: 'start_migration',
          endpoint: '/api/databases/task',
        },
      });
    }
  });

  test('routes permission denials to an explicit access request with schema recovery', () => {
    expect(
      databaseProblemExtensions('permission_denied', {
        deniedPropertyIds: ['prop_private'],
        allowedPropertyIds: ['prop_title'],
      }),
    ).toMatchObject({
      code: 'permission_denied',
      retryable: false,
      deniedPropertyIds: ['prop_private'],
      allowedPropertyIds: ['prop_title'],
      recovery: {
        action: 'request_access',
        endpoint: '/api/databases/describe',
      },
    });
  });

  test('keeps canonical dispatch fields authoritative over error details', () => {
    const problem = databaseProblemExtensions('stale_index', {
      code: 'spoofed',
      retryable: false,
      recovery: { action: 'fix_request', instruction: 'spoofed' },
      observedRevision: 'sha256:old',
    });
    expect(problem).toMatchObject({
      code: 'stale_index',
      retryable: true,
      recovery: { action: 'rebuild_index' },
      observedRevision: 'sha256:old',
    });
    expect(DatabaseProblemExtensionsSchema.safeParse(problem).success).toBe(true);
  });

  test('covers every HTTP request-boundary failure with recovery metadata', () => {
    expect(Object.keys(DATABASE_REQUEST_ERROR_EXTENSIONS).sort()).toEqual([
      'invalid_json',
      'method_not_allowed',
      'payload_too_large',
      'request_timeout',
      'transport_error',
      'validation_failed',
    ]);
    for (const extension of Object.values(DATABASE_REQUEST_ERROR_EXTENSIONS)) {
      expect(DatabaseProblemExtensionsSchema.safeParse(extension).success).toBe(true);
    }
  });
});
