/**
 * Browser side of signing in to a remote server.
 *
 * Two ways in, both ending at the same place: the server answers with an
 * `HttpOnly` cookie this code cannot read. Nothing here ever holds a
 * credential — a password crosses this module once, on its way into a `fetch`
 * body, and a passkey assertion never leaves the authenticator in a form that
 * would be worth stealing.
 *
 * Inert against a local server. These endpoints answer 404 there, which is
 * reported as `unavailable` rather than as a refusal, because telling someone
 * their password was wrong when the server never asked for one sends them
 * hunting for a better password.
 */

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

export const AUTH_PASSWORD_PATH = '/api/auth/password';
export const AUTH_PASSKEY_AUTH_OPTIONS_PATH = '/api/auth/passkey/authenticate/options';
export const AUTH_PASSKEY_AUTH_VERIFY_PATH = '/api/auth/passkey/authenticate/verify';
export const AUTH_PASSKEY_REGISTER_OPTIONS_PATH = '/api/auth/passkey/register/options';
export const AUTH_PASSKEY_REGISTER_VERIFY_PATH = '/api/auth/passkey/register/verify';
export const AUTH_PASSKEYS_PATH = '/api/auth/passkeys';

/**
 * Paths that must not be read as "you are signed out" when they answer 401.
 *
 * They answer 401 for a password the user just typed wrong, and re-opening the
 * prompt the user is already looking at would wipe what they typed.
 */
export const LOGIN_PATHS: readonly string[] = [
  AUTH_PASSWORD_PATH,
  AUTH_PASSKEY_AUTH_OPTIONS_PATH,
  AUTH_PASSKEY_AUTH_VERIFY_PATH,
];

export type LoginResult =
  | { readonly ok: true; readonly label: string }
  /** The credential was refused. */
  | { readonly ok: false; readonly reason: 'rejected' }
  /** Too many failures. `retryAfterSeconds` is what the server asked for. */
  | { readonly ok: false; readonly reason: 'locked'; readonly retryAfterSeconds: number }
  /** The server is not running in remote mode. */
  | { readonly ok: false; readonly reason: 'unavailable' }
  /** The user dismissed the authenticator prompt, or it was never shown. */
  | { readonly ok: false; readonly reason: 'cancelled' }
  /** The request never completed. */
  | { readonly ok: false; readonly reason: 'network' };

/** Whether this browser can do WebAuthn at all. */
export function supportsPasskeys(): boolean {
  return browserSupportsWebAuthn();
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

/** Read `label` out of a success body, tolerating one that did not parse. */
async function labelFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { label?: unknown };
    return typeof body.label === 'string' ? body.label : '';
  } catch {
    // The cookie is set regardless of whether the body parsed, so a malformed
    // body is still a successful sign-in — stranding the user on a form that
    // already worked would be worse.
    return '';
  }
}

/** Turn a refusal response into the reason the UI shows. */
async function refusalFrom(res: Response): Promise<LoginResult> {
  if (res.status === 404) return { ok: false, reason: 'unavailable' };
  if (res.status === 429) {
    const header = Number(res.headers.get('Retry-After'));
    return {
      ok: false,
      reason: 'locked',
      retryAfterSeconds: Number.isFinite(header) && header > 0 ? header : 60,
    };
  }
  return { ok: false, reason: 'rejected' };
}

/** Sign in with the account password. */
export async function signInWithPassword(username: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(AUTH_PASSWORD_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!res.ok) return refusalFrom(res);
  return { ok: true, label: await labelFrom(res) };
}

/**
 * Sign in with a passkey.
 *
 * The ceremony is three legs: ask the server for options, hand them to the
 * authenticator, post what comes back. The middle leg is the only one that
 * can be cancelled by the user, and a cancellation is not a refusal — it is
 * someone deciding to type a password instead.
 */
export async function signInWithPasskey(): Promise<LoginResult> {
  let optionsRes: Response;
  try {
    optionsRes = await fetch(AUTH_PASSKEY_AUTH_OPTIONS_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!optionsRes.ok) return refusalFrom(optionsRes);

  let challengeHandle: string;
  let options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
  try {
    const body = (await optionsRes.json()) as {
      challengeHandle: string;
      options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
    };
    challengeHandle = body.challengeHandle;
    options = body.options;
  } catch {
    return { ok: false, reason: 'rejected' };
  }

  let assertion: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch {
    // `NotAllowedError` covers both "the user dismissed the sheet" and "it
    // timed out", and the browser deliberately does not distinguish them.
    return { ok: false, reason: 'cancelled' };
  }

  let verifyRes: Response;
  try {
    verifyRes = await fetch(AUTH_PASSKEY_AUTH_VERIFY_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ challengeHandle, response: assertion }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!verifyRes.ok) return refusalFrom(verifyRes);
  return { ok: true, label: await labelFrom(verifyRes) };
}

/** A passkey as the settings panel shows it. No public key, no counter. */
export interface PasskeySummary {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
  readonly lastUsedAt?: string;
  readonly backedUp: boolean;
}

export type PasskeyListResult =
  | { readonly ok: true; readonly passkeys: readonly PasskeySummary[] }
  | { readonly ok: false; readonly reason: 'unavailable' | 'rejected' | 'network' };

async function passkeyListFrom(res: Response): Promise<PasskeyListResult> {
  if (!res.ok) {
    return { ok: false, reason: res.status === 404 ? 'unavailable' : 'rejected' };
  }
  try {
    const body = (await res.json()) as { passkeys?: PasskeySummary[] };
    return { ok: true, passkeys: body.passkeys ?? [] };
  } catch {
    return { ok: false, reason: 'rejected' };
  }
}

/** List the registered passkeys. Requires a session. */
export async function listPasskeys(): Promise<PasskeyListResult> {
  try {
    return await passkeyListFrom(await fetch(AUTH_PASSKEYS_PATH, { headers: JSON_HEADERS }));
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type PasskeyRegisterResult =
  | { readonly ok: true; readonly passkeys: readonly PasskeySummary[] }
  | {
      readonly ok: false;
      readonly reason: 'unavailable' | 'rejected' | 'network' | 'cancelled' | 'duplicate';
    };

/**
 * Register a new passkey for the signed-in account.
 *
 * `label` is what the settings list shows. It is the user's own name for the
 * device, so an empty one is fine — the server falls back to the device type.
 */
export async function registerPasskey(label: string): Promise<PasskeyRegisterResult> {
  let optionsRes: Response;
  try {
    optionsRes = await fetch(AUTH_PASSKEY_REGISTER_OPTIONS_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!optionsRes.ok) {
    return { ok: false, reason: optionsRes.status === 404 ? 'unavailable' : 'rejected' };
  }

  let challengeHandle: string;
  let options: Parameters<typeof startRegistration>[0]['optionsJSON'];
  try {
    const body = (await optionsRes.json()) as {
      challengeHandle: string;
      options: Parameters<typeof startRegistration>[0]['optionsJSON'];
    };
    challengeHandle = body.challengeHandle;
    options = body.options;
  } catch {
    return { ok: false, reason: 'rejected' };
  }

  let attestation: Awaited<ReturnType<typeof startRegistration>>;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch (err) {
    // The browser refuses an authenticator that is already registered, which
    // is a different thing to explain than a dismissed prompt.
    const name = (err as { name?: string } | null)?.name;
    return { ok: false, reason: name === 'InvalidStateError' ? 'duplicate' : 'cancelled' };
  }

  try {
    const res = await fetch(AUTH_PASSKEY_REGISTER_VERIFY_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ challengeHandle, response: attestation, label }),
    });
    return await passkeyListFrom(res);
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Remove a registered passkey. */
export async function removePasskey(id: string): Promise<PasskeyListResult> {
  try {
    const res = await fetch(`${AUTH_PASSKEYS_PATH}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
    });
    return await passkeyListFrom(res);
  } catch {
    return { ok: false, reason: 'network' };
  }
}
