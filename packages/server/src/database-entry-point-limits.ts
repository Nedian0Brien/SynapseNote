export const DATABASE_AGENT_REQUESTS_PER_WINDOW = 600;
export const DATABASE_AGENT_REQUEST_WINDOW_MS = 60_000;
export const DATABASE_AGENT_MAX_CONCURRENT_REQUESTS = 8;
const DATABASE_AGENT_MAX_TRACKED_SESSIONS = 10_000;

export type DatabaseAgentLimitDecision =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'rate_limit' | 'concurrency_limit' | 'capacity_limit';
      readonly retryAfterSeconds: number;
    };

interface DatabaseAgentWindow {
  startedAt: number;
  requests: number;
  active: number;
}

/**
 * Process-local abuse boundary for authenticated agent API sessions.
 * Canonical write concurrency is still enforced by exact revision guards;
 * this limiter protects request slots and CPU before domain work begins.
 */
export class DatabaseAgentEntryPointLimiter {
  readonly #windows = new Map<string, DatabaseAgentWindow>();
  readonly #requestsPerWindow: number;
  readonly #windowMs: number;
  readonly #maxConcurrent: number;
  readonly #maxTrackedSessions: number;
  readonly #now: () => number;

  constructor(
    options: {
      requestsPerWindow?: number;
      windowMs?: number;
      maxConcurrent?: number;
      maxTrackedSessions?: number;
      now?: () => number;
    } = {},
  ) {
    this.#requestsPerWindow = options.requestsPerWindow ?? DATABASE_AGENT_REQUESTS_PER_WINDOW;
    this.#windowMs = options.windowMs ?? DATABASE_AGENT_REQUEST_WINDOW_MS;
    this.#maxConcurrent = options.maxConcurrent ?? DATABASE_AGENT_MAX_CONCURRENT_REQUESTS;
    this.#maxTrackedSessions = options.maxTrackedSessions ?? DATABASE_AGENT_MAX_TRACKED_SESSIONS;
    this.#now = options.now ?? Date.now;
  }

  acquire(key: string): DatabaseAgentLimitDecision {
    const now = this.#now();
    let window = this.#windows.get(key);
    if (window && now - window.startedAt >= this.#windowMs && window.active === 0) {
      this.#windows.delete(key);
      window = undefined;
    }
    if (!window) {
      this.#prune(now);
      if (this.#windows.size >= this.#maxTrackedSessions) {
        return { ok: false, reason: 'capacity_limit', retryAfterSeconds: 1 };
      }
      window = { startedAt: now, requests: 0, active: 0 };
      this.#windows.set(key, window);
    }
    if (window.active >= this.#maxConcurrent) {
      return { ok: false, reason: 'concurrency_limit', retryAfterSeconds: 1 };
    }
    if (window.requests >= this.#requestsPerWindow) {
      return {
        ok: false,
        reason: 'rate_limit',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((window.startedAt + this.#windowMs - now) / 1_000),
        ),
      };
    }
    window.requests += 1;
    window.active += 1;
    return { ok: true };
  }

  release(key: string): void {
    const window = this.#windows.get(key);
    if (!window) return;
    window.active = Math.max(0, window.active - 1);
  }

  #prune(now: number): void {
    if (this.#windows.size < this.#maxTrackedSessions) return;
    for (const [key, window] of this.#windows) {
      if (window.active === 0 && now - window.startedAt >= this.#windowMs) {
        this.#windows.delete(key);
      }
    }
  }
}
