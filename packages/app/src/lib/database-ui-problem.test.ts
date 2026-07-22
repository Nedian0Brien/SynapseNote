import { describe, expect, test } from 'bun:test';
import { DatabaseCatalogClientError } from './database-catalog-client';
import { DatabaseMutationClientError } from './database-mutation-client';
import { DatabaseQueryClientError } from './database-query-client';
import { classifyDatabaseUiProblem } from './database-ui-problem';

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
});
