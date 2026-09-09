/**
 * Failure counting for password login.
 *
 * A password is guessable in a way an access token is not, and this endpoint
 * is reachable from the whole internet. Without a limit, an attacker gets
 * unlimited attempts against whatever the operator chose, and scrypt's ~100ms
 * only slows that to a few hundred thousand guesses a day.
 *
 * ## Why the counter lives in memory
 *
 * Persisting it would mean a disk write on every failed login — a write
 * primitive handed to an unauthenticated caller. Restarting the process clears
 * the counters, but an attacker who can restart the server already holds it.
 * The trade runs the right way.
 *
 * ## Keyed by account, not by address
 *
 * The address is behind a proxy and trivially rotated; the account is what is
 * actually under attack. Keying by address would also let one hostile client
 * lock out nobody, or lock out everyone sharing an egress IP. The cost is that
 * an attacker can lock the real operator out for the window — acceptable when
 * a passkey remains available and the window is short.
 */

/** Failures allowed inside the window before the account is locked. */
export const MAX_FAILURES = 10;

/** How far back failures are counted. */
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** How long a lock lasts once the threshold is crossed. */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface ThrottleDecision {
  readonly allowed: boolean;
  /** Seconds until the next attempt is allowed. Zero when allowed. */
  readonly retryAfterSeconds: number;
}

export interface LoginThrottle {
  /** Ask before verifying a password. */
  check(key: string): ThrottleDecision;
  /** Record a failure. Returns the decision that now applies. */
  recordFailure(key: string): ThrottleDecision;
  /** Clear a key's history. Called on a successful login. */
  recordSuccess(key: string): void;
  /** Test seam. */
  reset(): void;
}

interface Entry {
  /** Timestamps of failures inside the current window. */
  failures: number[];
  lockedUntil: number;
}

export interface LoginThrottleOptions {
  readonly maxFailures?: number;
  readonly windowMs?: number;
  readonly lockMs?: number;
  readonly now?: () => number;
}

export function createLoginThrottle(options: LoginThrottleOptions = {}): LoginThrottle {
  const maxFailures = options.maxFailures ?? MAX_FAILURES;
  const windowMs = options.windowMs ?? FAILURE_WINDOW_MS;
  const lockMs = options.lockMs ?? LOCK_DURATION_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function prune(entry: Entry, at: number): void {
    entry.failures = entry.failures.filter((t) => at - t < windowMs);
  }

  function decide(entry: Entry | undefined, at: number): ThrottleDecision {
    if (entry === undefined || entry.lockedUntil <= at) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      // Rounded up so a caller told to wait N seconds is not refused again at
      // exactly N.
      retryAfterSeconds: Math.ceil((entry.lockedUntil - at) / 1000),
    };
  }

  return {
    check(key) {
      const at = now();
      const entry = entries.get(key);
      if (entry !== undefined && entry.lockedUntil <= at && entry.failures.length === 0) {
        // Nothing left to remember. Dropping it keeps the map from growing
        // without bound across a long-running process.
        entries.delete(key);
        return { allowed: true, retryAfterSeconds: 0 };
      }
      return decide(entry, at);
    },

    recordFailure(key) {
      const at = now();
      const entry = entries.get(key) ?? { failures: [], lockedUntil: 0 };
      prune(entry, at);
      entry.failures.push(at);
      if (entry.failures.length >= maxFailures) {
        entry.lockedUntil = at + lockMs;
        // The window is cleared with the lock so the account is not locked
        // again by the same failures the moment the lock lifts.
        entry.failures = [];
      }
      entries.set(key, entry);
      return decide(entry, at);
    },

    recordSuccess(key) {
      entries.delete(key);
    },

    reset() {
      entries.clear();
    },
  };
}
