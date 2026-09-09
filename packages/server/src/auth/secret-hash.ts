/**
 * Minting and comparing the opaque secrets this server hands out.
 *
 * Shared by the personal-token store and the OAuth store so the two cannot
 * drift into different entropy or different comparison behavior — the kind of
 * divergence that is invisible until one of them is the weak one.
 *
 * ## Why a plain SHA-256 and not a password KDF
 *
 * Every secret here is 32 bytes of CSPRNG output that this process generated,
 * never a human-chosen string. A password KDF exists to make guessing a
 * low-entropy secret expensive, and there is nothing to guess: brute-forcing
 * 256 bits is infeasible regardless of how the digest is computed. Paying
 * scrypt's cost per request would add latency to every API call and buy
 * nothing. This is a deliberate choice, not an omission — a store that ever
 * accepts a user-chosen passphrase needs a real KDF on that path.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Prefix on every minted secret. Makes a leaked credential recognizable in a
 * log, a paste, or a secret scanner, and lets an obviously-foreign string be
 * rejected before it is hashed.
 */
export const SECRET_PREFIX = 'snote_';

/** Bytes of entropy per secret. 32 bytes = 256 bits. */
const SECRET_BYTES = 32;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

/**
 * Compare two hex digests without leaking their difference through timing.
 *
 * Both sides are fixed-length SHA-256 hex, so a length mismatch means a
 * corrupted record rather than an attacker probe; it short-circuits false.
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

/** Mint a fresh opaque secret. */
export function mintSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
}

/** Whether a presented string could plausibly be one of ours. */
export function looksLikeOurSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX);
}
