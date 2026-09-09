/**
 * The password sign-in rule, in one place.
 *
 * Two surfaces sign an operator in with a password: `/api/auth/password` for
 * the browser app, and the OAuth consent page's sign-in leg. They must behave
 * identically, and the parts that matter are the ones easiest to get subtly
 * different in a second copy — the uniform refusal, the hash spent on an
 * unknown username, and the throttle running before the comparison rather than
 * after it. So the rule lives here and both call it.
 */

import type { AccountRecord, AccountStore } from './account-store.ts';
import { normalizeUsername } from './account-store.ts';
import type { LoginThrottle } from './login-throttle.ts';
import { consumeTimingBudget, verifyPassword } from './password-hash.ts';

export type PasswordLoginOutcome =
  | { readonly ok: true; readonly account: AccountRecord }
  /** Wrong password, unknown username, or no account at all. Indistinguishable. */
  | { readonly ok: false; readonly reason: 'refused' }
  | { readonly ok: false; readonly reason: 'locked'; readonly retryAfterSeconds: number };

export interface PasswordLoginDeps {
  readonly store: AccountStore;
  readonly throttle: LoginThrottle;
}

/**
 * Verify a username and password.
 *
 * The refusal is deliberately uniform: a wrong username and a wrong password
 * return the same outcome, and an unknown username still costs one password
 * hash, so neither the answer nor the time taken says whether an account
 * exists.
 */
export async function attemptPasswordLogin(
  deps: PasswordLoginDeps,
  username: string,
  password: string,
): Promise<PasswordLoginOutcome> {
  const account = deps.store.findByUsername(username);
  // Throttle by the account when there is one, and by the submitted name when
  // there is not. Skipping the throttle for unknown names would make the
  // endpoint enumerable through its own rate limit: a name that can be locked
  // exists, one that cannot does not.
  const key = account?.id ?? `unknown:${normalizeUsername(username)}`;
  const gate = deps.throttle.check(key);
  if (!gate.allowed) {
    return { ok: false, reason: 'locked', retryAfterSeconds: gate.retryAfterSeconds };
  }

  if (account === undefined) {
    await consumeTimingBudget();
    deps.throttle.recordFailure(key);
    return { ok: false, reason: 'refused' };
  }
  if (!(await verifyPassword(password, account.password))) {
    deps.throttle.recordFailure(key);
    return { ok: false, reason: 'refused' };
  }
  deps.throttle.recordSuccess(key);
  return { ok: true, account };
}
