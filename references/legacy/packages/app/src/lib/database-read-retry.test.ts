import { describe, expect, test } from 'bun:test';
import { withDatabaseReadRetry } from './database-read-retry.ts';

function transactionError(): Error {
  const error = new Error('database is settling') as Error & { problem?: unknown };
  error.problem = { code: 'transaction_in_progress', retryable: true };
  return error;
}

function staleIndexError(): Error {
  const error = new Error('database index is rebuilding') as Error & {
    status?: number;
    problem?: unknown;
  };
  error.status = 503;
  error.problem = { code: 'stale_index', retryable: true };
  return error;
}

describe('withDatabaseReadRetry', () => {
  test('retries a transaction settling barrier and returns the eventual value', async () => {
    let attempts = 0;
    await expect(
      withDatabaseReadRetry(
        async () => {
          attempts += 1;
          if (attempts < 3) throw transactionError();
          return 'ready';
        },
        { initialDelayMs: 0 },
      ),
    ).resolves.toBe('ready');
    expect(attempts).toBe(3);
  });

  test('does not retry a real conflict or malformed read', async () => {
    let attempts = 0;
    const conflict = new Error('stale target');
    await expect(
      withDatabaseReadRetry(
        async () => {
          attempts += 1;
          throw conflict;
        },
        { initialDelayMs: 0 },
      ),
    ).rejects.toBe(conflict);
    expect(attempts).toBe(1);
  });

  test('retries a post-commit index rebuild and a brief local fetch failure', async () => {
    let staleAttempts = 0;
    await expect(
      withDatabaseReadRetry(
        async () => {
          staleAttempts += 1;
          if (staleAttempts < 3) throw staleIndexError();
          return 'indexed';
        },
        { initialDelayMs: 0 },
      ),
    ).resolves.toBe('indexed');
    expect(staleAttempts).toBe(3);

    let offlineAttempts = 0;
    await expect(
      withDatabaseReadRetry(
        async () => {
          offlineAttempts += 1;
          if (offlineAttempts === 1) throw new TypeError('Failed to fetch');
          return 'connected';
        },
        { initialDelayMs: 0 },
      ),
    ).resolves.toBe('connected');
    expect(offlineAttempts).toBe(2);
  });

  test('honors an explicit retry predicate for typed retryable errors', async () => {
    let attempts = 0;
    const retryable = new Error('temporarily unavailable');
    await expect(
      withDatabaseReadRetry(
        async () => {
          attempts += 1;
          if (attempts === 1) throw retryable;
          return true;
        },
        {
          initialDelayMs: 0,
          shouldRetry: (cause) => cause === retryable,
        },
      ),
    ).resolves.toBe(true);
    expect(attempts).toBe(2);
  });

  test('stops during the retry delay when aborted', async () => {
    const controller = new AbortController();
    const promise = withDatabaseReadRetry(
      async () => {
        controller.abort();
        throw transactionError();
      },
      { initialDelayMs: 10_000, signal: controller.signal },
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
