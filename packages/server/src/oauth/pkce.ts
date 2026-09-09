/**
 * PKCE (RFC 7636) verification.
 *
 * OAuth 2.1 makes PKCE mandatory for every authorization code flow, and this
 * server supports only the `S256` method. `plain` exists in RFC 7636 and is
 * exactly as useful as no PKCE at all against an attacker who can read the
 * authorization request, so it is refused rather than accepted-and-warned.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** The only challenge method this server accepts. */
export const SUPPORTED_CODE_CHALLENGE_METHODS = ['S256'] as const;

/**
 * RFC 7636 §4.1: the verifier is 43–128 characters from the unreserved set.
 * Enforced because a short verifier is guessable, which is the one thing PKCE
 * exists to prevent.
 */
const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

/** RFC 7636 §4.2 challenges are base64url of a SHA-256 digest: 43 characters. */
const CODE_CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeVerifier(verifier: string): boolean {
  return CODE_VERIFIER_RE.test(verifier);
}

export function isValidCodeChallenge(challenge: string): boolean {
  return CODE_CHALLENGE_RE.test(challenge);
}

/** `BASE64URL(SHA256(ASCII(verifier)))`, per RFC 7636 §4.6. */
export function deriveCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/**
 * Whether `verifier` proves possession of the secret behind `challenge`.
 *
 * A malformed verifier fails without being compared, so the shape check does
 * not become an oracle for the challenge.
 */
export function verifyCodeChallenge(verifier: string, challenge: string): boolean {
  if (!isValidCodeVerifier(verifier) || !isValidCodeChallenge(challenge)) return false;
  const derived = deriveCodeChallenge(verifier);
  if (derived.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(derived, 'utf-8'), Buffer.from(challenge, 'utf-8'));
}
