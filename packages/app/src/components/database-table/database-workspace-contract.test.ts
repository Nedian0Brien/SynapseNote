import { describe, expect, test } from 'bun:test';
import {
  commandFailure,
  databaseTableIdentity,
  deriveDatabaseTablePhase,
} from './database-workspace-contract';

describe('database workspace state contract', () => {
  test('only a new source identity can enter initial loading', () => {
    expect(
      deriveDatabaseTablePhase({
        hasLoadedSource: true,
        sourceIdentityChanged: false,
        backgroundRefreshing: false,
        mutationPending: true,
      }),
    ).toBe('mutation-pending');
    expect(
      deriveDatabaseTablePhase({
        hasLoadedSource: true,
        sourceIdentityChanged: false,
        backgroundRefreshing: true,
        mutationPending: false,
      }),
    ).toBe('background-refreshing');
    expect(
      deriveDatabaseTablePhase({
        hasLoadedSource: true,
        sourceIdentityChanged: true,
        backgroundRefreshing: true,
        mutationPending: true,
      }),
    ).toBe('initial-loading');
  });

  test('table identity excludes overlay state', () => {
    expect(databaseTableIdentity({ sourceId: 'db', viewId: 'table' })).toBe('db\u0000table');
  });

  test('commands expose an explicit error instead of silently no-oping', () => {
    expect(commandFailure('unsupported', 'This command is not available.', true)).toEqual({
      ok: false,
      error: { code: 'unsupported', message: 'This command is not available.', retryable: true },
    });
  });
});
