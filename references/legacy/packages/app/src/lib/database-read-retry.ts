import {
  classifyDatabaseUiProblem,
  databaseProblemRetryAfterMs,
  isDatabaseTransactionInProgress,
} from './database-ui-problem.ts';

export interface DatabaseReadRetryOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (cause: unknown) => boolean;
}

/**
 * Attempts one read spends before its problem reaches the caller. Exported so
 * tests can size a settling window against the real budget instead of
 * hard-coding a call count — a duplicated literal here silently stops
 * exercising the exhaustion path the moment the budget moves.
 */
export const DATABASE_READ_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 50;
const DEFAULT_MAX_DELAY_MS = 1_000;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const onAbort = () => {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(
        signal ? abortReason(signal) : new DOMException('The operation was aborted', 'AbortError'),
      );
    };
    timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs a read operation with a small, typed settling retry window.
 *
 * A canonical database commit can briefly block description/query reads or
 * leave the record index rebuilding after the commit response is returned.
 * The local server can also miss one fetch while its database surface settles.
 * Those transient conditions should settle silently instead of flashing an
 * offline/stale banner over an otherwise verified view.
 */
export async function withDatabaseReadRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: DatabaseReadRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DATABASE_READ_MAX_ATTEMPTS));
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);
  const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const shouldRetry =
    options.shouldRetry ??
    ((cause: unknown) => {
      if (isDatabaseTransactionInProgress(cause)) return true;
      const problem = classifyDatabaseUiProblem(cause, 'Database read temporarily unavailable');
      return problem.kind === 'stale_index' || problem.kind === 'offline';
    });

  let attempt = 0;
  while (true) {
    throwIfAborted(options.signal);
    try {
      return await operation(attempt);
    } catch (cause) {
      attempt += 1;
      if (attempt >= maxAttempts || !shouldRetry(cause)) throw cause;
      // The Data Plane states how long the condition needs (`retryAfterMs`).
      // Honour it as a floor — retrying sooner just spends an attempt while the
      // server is still returning the same problem.
      const backoffMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const serverDelayMs = databaseProblemRetryAfterMs(cause) ?? 0;
      await waitForRetry(Math.min(Math.max(backoffMs, serverDelayMs), maxDelayMs), options.signal);
    }
  }
}
