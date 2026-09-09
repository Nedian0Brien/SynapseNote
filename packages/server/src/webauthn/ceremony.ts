/**
 * The four WebAuthn ceremonies, wrapped so the rest of the server never sees
 * `@simplewebauthn` types or the byte encodings they use.
 *
 * Two things live here that the library does not do for you:
 *
 * 1. **Challenge storage.** The library generates a challenge and later
 *    expects it back; keeping it, expiring it, and spending it exactly once is
 *    the caller's job. A replayable challenge defeats the point of the
 *    ceremony.
 * 2. **Encoding.** `WebAuthnCredential.publicKey` is a `Uint8Array`, and the
 *    account store is JSON. The conversion happens at this boundary in both
 *    directions so base64url never leaks into callers.
 *
 * The signature-counter check also lives here — see `verifyPasskey`.
 */

import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { PasskeyRecord } from '../auth/account-store.ts';

/** Challenges expire in five minutes. A ceremony takes seconds. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Ceremony a challenge was issued for. A registration challenge cannot be
 *  redeemed as an authentication one. */
export type ChallengeKind = 'registration' | 'authentication';

export interface ChallengeStore {
  /** Issue a handle for a challenge and remember it. */
  remember(kind: ChallengeKind, challenge: string): string;
  /** Take a challenge back, removing it. Null when unknown, expired, or the
   *  wrong kind. */
  spend(kind: ChallengeKind, handle: string): string | null;
  /** Drop expired entries. */
  prune(): number;
}

interface ChallengeEntry {
  readonly kind: ChallengeKind;
  readonly challenge: string;
  readonly expiresAt: number;
}

/**
 * Challenges live in memory.
 *
 * They are valid for five minutes and meaningless afterwards, so persisting
 * them would buy nothing but a disk write per sign-in attempt. A restart
 * mid-ceremony makes the user press the button again.
 */
export function createChallengeStore(options: { now?: () => number } = {}): ChallengeStore {
  const now = options.now ?? Date.now;
  const entries = new Map<string, ChallengeEntry>();

  function prune(): number {
    const at = now();
    let dropped = 0;
    for (const [handle, entry] of entries) {
      if (entry.expiresAt <= at) {
        entries.delete(handle);
        dropped += 1;
      }
    }
    return dropped;
  }

  return {
    remember(kind, challenge) {
      prune();
      const handle = randomBytes(16).toString('base64url');
      entries.set(handle, { kind, challenge, expiresAt: now() + CHALLENGE_TTL_MS });
      return handle;
    },

    spend(kind, handle) {
      const entry = entries.get(handle);
      if (entry === undefined) return null;
      // Removed before the checks below, so a challenge presented once is
      // spent whatever the outcome. A challenge that survived a failed
      // verification would be replayable.
      entries.delete(handle);
      if (entry.kind !== kind) return null;
      if (entry.expiresAt <= now()) return null;
      return entry.challenge;
    },

    prune,
  };
}

export interface RelyingParty {
  /** Human-visible name shown in the authenticator prompt. */
  readonly name: string;
  /** The domain, without scheme or port. Passkeys are bound to it. */
  readonly id: string;
  /** The full origin the browser will report. */
  readonly origin: string;
}

/** Derive the relying party from the configured public origin. */
export function relyingPartyFromOrigin(publicOrigin: string, name = 'SynapseNote'): RelyingParty {
  const url = new URL(publicOrigin);
  return { name, id: url.hostname, origin: url.origin };
}

export interface CeremonyOptions<T> {
  /** Opaque handle the browser sends back with its response. */
  readonly challengeHandle: string;
  readonly options: T;
}

/** Build registration options for an account that is already signed in. */
export async function startPasskeyRegistration(
  rp: RelyingParty,
  account: { username: string; webauthnUserId: string; passkeys: readonly PasskeyRecord[] },
  challenges: ChallengeStore,
): Promise<CeremonyOptions<Awaited<ReturnType<typeof generateRegistrationOptions>>>> {
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: account.username,
    userID: Buffer.from(account.webauthnUserId, 'base64url'),
    attestationType: 'none',
    // Registering the same authenticator twice is a confusing no-op for the
    // user; the browser refuses it up front when told what is already there.
    excludeCredentials: account.passkeys.map((p) => ({
      id: p.id,
      transports: p.transports === undefined ? undefined : [...p.transports],
    })),
    authenticatorSelection: {
      // A discoverable credential is what lets the user sign in without first
      // typing a username.
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });
  return {
    challengeHandle: challenges.remember('registration', options.challenge),
    options,
  };
}

export type RegistrationOutcome =
  | { readonly ok: true; readonly passkey: Omit<PasskeyRecord, 'label' | 'createdAt'> }
  | { readonly ok: false; readonly reason: 'challenge-unknown' | 'not-verified' | 'error' };

/** Verify a registration response and produce a storable record. */
export async function finishPasskeyRegistration(
  rp: RelyingParty,
  challenges: ChallengeStore,
  challengeHandle: string,
  // The browser's JSON; typed loosely here and validated by the library.
  response: Parameters<typeof verifyRegistrationResponse>[0]['response'],
): Promise<RegistrationOutcome> {
  const expectedChallenge = challenges.spend('registration', challengeHandle);
  if (expectedChallenge === null) return { ok: false, reason: 'challenge-unknown' };
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
  } catch {
    // The library throws on a malformed or mismatched response. That is a
    // refusal, not a server fault.
    return { ok: false, reason: 'error' };
  }
  if (!verification.verified) return { ok: false, reason: 'not-verified' };
  const info = verification.registrationInfo;
  return {
    ok: true,
    passkey: {
      id: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
      counter: info.credential.counter,
      transports:
        info.credential.transports === undefined ? undefined : [...info.credential.transports],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
    },
  };
}

/**
 * Build authentication options.
 *
 * `allowCredentials` is left empty so the browser offers whatever discoverable
 * passkey it holds for this domain. Listing the account's credentials would
 * require knowing which account is signing in before they have signed in, and
 * would tell an unauthenticated caller which credential IDs exist.
 */
export async function startPasskeyAuthentication(
  rp: RelyingParty,
  challenges: ChallengeStore,
): Promise<CeremonyOptions<Awaited<ReturnType<typeof generateAuthenticationOptions>>>> {
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'required',
  });
  return {
    challengeHandle: challenges.remember('authentication', options.challenge),
    options,
  };
}

export type AuthenticationOutcome =
  | { readonly ok: true; readonly passkeyId: string; readonly newCounter: number }
  | {
      readonly ok: false;
      readonly reason:
        | 'challenge-unknown'
        | 'unknown-credential'
        | 'counter-regressed'
        | 'not-verified'
        | 'error';
    };

/**
 * Whether a reported signature counter indicates a cloned authenticator.
 *
 * This is the one piece of WebAuthn the library reports but does not decide
 * for you. An authenticator that implements the counter increments it on every
 * assertion, so a value that fails to advance means two devices are answering
 * for one credential.
 *
 * Authenticators that do not implement counters — most platform passkeys,
 * including Apple's — report zero forever. Treating that as a regression would
 * refuse every sign-in on exactly the devices this feature exists for, so the
 * check only applies once a non-zero counter has been seen.
 *
 * Extracted from `verifyPasskey` because reaching it there requires a genuine
 * signature, which a test cannot produce.
 */
export function isCounterRegression(storedCounter: number, newCounter: number): boolean {
  if (storedCounter === 0) return false;
  return newCounter <= storedCounter;
}

/**
 * Verify an authentication response against a stored passkey.
 */
export async function verifyPasskey(
  rp: RelyingParty,
  challenges: ChallengeStore,
  challengeHandle: string,
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response'],
  lookup: (credentialId: string) => PasskeyRecord | undefined,
): Promise<AuthenticationOutcome> {
  const expectedChallenge = challenges.spend('authentication', challengeHandle);
  if (expectedChallenge === null) return { ok: false, reason: 'challenge-unknown' };
  const stored = lookup(response.id);
  if (stored === undefined) return { ok: false, reason: 'unknown-credential' };

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
        counter: stored.counter,
        transports: stored.transports === undefined ? undefined : [...stored.transports],
      },
    });
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (!verification.verified) return { ok: false, reason: 'not-verified' };

  const newCounter = verification.authenticationInfo.newCounter;
  if (isCounterRegression(stored.counter, newCounter)) {
    return { ok: false, reason: 'counter-regressed' };
  }
  return { ok: true, passkeyId: stored.id, newCounter };
}
