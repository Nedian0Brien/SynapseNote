import { describe, expect, test } from 'bun:test';
import { DatabaseCatalogClientError } from './database-catalog-client';
import { DatabaseMutationClientError } from './database-mutation-client';
import { DatabaseQueryClientError } from './database-query-client';
import {
  classifyDatabaseUiProblem,
  databaseMutationUiMessage,
  databaseUiProblemMessage,
  isDatabaseTransactionInProgress,
} from './database-ui-problem';

describe('classifyDatabaseUiProblem', () => {
  test('distinguishes offline transport failures', () => {
    expect(classifyDatabaseUiProblem(new TypeError('Failed to fetch'), 'fallback')).toEqual({
      kind: 'offline',
      message: 'Failed to fetch',
      retryable: true,
    });
  });

  test('uses typed recovery metadata for stale indexes and permissions', () => {
    expect(
      classifyDatabaseUiProblem(
        new DatabaseQueryClientError('Index is behind', {
          status: 503,
          problem: {
            code: 'stale_index',
            retryable: true,
            recovery: { action: 'rebuild_index' },
          },
        }),
        'fallback',
      ),
    ).toMatchObject({ kind: 'stale_index', retryable: true });

    expect(
      classifyDatabaseUiProblem(
        new DatabaseQueryClientError('Property is hidden', {
          status: 403,
          problem: {
            code: 'permission_denied',
            retryable: false,
            recovery: { action: 'request_access' },
          },
        }),
        'fallback',
      ),
    ).toMatchObject({ kind: 'permission', retryable: false });
  });

  test('classifies stale writes as conflicts and invalid payloads as schema failures', () => {
    expect(
      classifyDatabaseUiProblem(
        new DatabaseMutationClientError('Target changed', {
          status: 409,
          problem: { code: 'target_changed', recovery: { action: 'recreate_plan' } },
        }),
        'fallback',
      ),
    ).toMatchObject({ kind: 'conflict', retryable: false });

    expect(
      classifyDatabaseUiProblem(
        new DatabaseCatalogClientError('Database description returned an invalid response', 502, {
          issues: [{ path: ['database'] }],
        }),
        'fallback',
      ),
    ).toMatchObject({ kind: 'invalid_schema', retryable: true });
  });

  test('classifies missing database routes separately from retryable failures', () => {
    expect(
      classifyDatabaseUiProblem(
        new DatabaseCatalogClientError('Database source not found', 404, {
          code: 'source_not_found',
        }),
        'fallback',
      ),
    ).toEqual({ kind: 'missing', message: 'Database source not found', retryable: false });
  });

  test('distinguishes validation, lock conflicts, and unknown server failures', () => {
    expect(
      classifyDatabaseUiProblem(
        new DatabaseMutationClientError('Invalid value', {
          status: 422,
          problem: { code: 'invalid_value', issues: [{ path: ['score'] }] },
        }),
        'fallback',
      ),
    ).toMatchObject({ kind: 'invalid_schema', retryable: true });
    expect(
      classifyDatabaseUiProblem(
        new DatabaseMutationClientError('Lock held', {
          status: 423,
          problem: { code: 'lock_unavailable', retryable: true },
        }),
        'fallback',
      ),
    ).toMatchObject({ kind: 'lock', retryable: true });
    expect(
      classifyDatabaseUiProblem(
        new DatabaseMutationClientError('Server exploded', { status: 500 }),
        'fallback',
      ),
    ).toEqual({ kind: 'error', message: 'Server exploded', retryable: true });
  });

  test('identifies a transient read barrier without treating it as a stale user edit', () => {
    expect(
      isDatabaseTransactionInProgress(
        new DatabaseQueryClientError('Database description failed with HTTP 409', {
          status: 409,
          problem: { code: 'transaction_in_progress' },
        }),
      ),
    ).toBe(true);
    expect(isDatabaseTransactionInProgress(new Error('Target changed'))).toBe(false);
  });

  test('classifies an exhausted transaction read barrier as recoverable updating state', () => {
    const error = new Error('database is settling') as Error & { problem?: unknown };
    error.problem = { code: 'transaction_in_progress', retryable: true };
    expect(classifyDatabaseUiProblem(error, 'Unable to read database')).toEqual({
      kind: 'stale_index',
      message: 'The database is still updating. Try again shortly.',
      retryable: true,
    });
  });

  test('maps every primary status to product copy without transport vocabulary', () => {
    const kinds = [
      'offline',
      'missing',
      'invalid_schema',
      'stale_index',
      'lock',
      'conflict',
      'permission',
      'error',
    ] as const;
    for (const kind of kinds) {
      const copy = databaseUiProblemMessage({ kind });
      expect(copy).not.toMatch(/HTTP\s*\d{3}|canonical state|stable id/i);
      expect(copy.length).toBeGreaterThan(10);
    }
    expect(databaseMutationUiMessage('error')).toBe(
      'Unable to save the database change. Try again.',
    );
    expect(databaseMutationUiMessage('conflict')).toContain('Reload the latest state');
  });
});
