/**
 * Password hashing for the operator account.
 *
 * Deliberately separate from `secret-hash.ts`. That module hashes secrets this
 * process generated — 256 bits of CSPRNG output, where a single SHA-256 is
 * correct because there is nothing to guess. A password is the opposite: a
 * human chose it, its entropy is low enough to enumerate, and the only defense
 * is making each guess expensive. Two kinds of secret, two rules; keeping them
 * in one file is how the wrong rule eventually gets applied.
 *
 * ## scrypt, and why the parameters travel with the hash
 *
 * Node ships scrypt in `node:crypto`, so no dependency is needed. The cost
 * parameters are stored in the record rather than hardcoded at the comparison
 * site, so raising them later re-hashes new passwords without invalidating the
 * ones already stored. A verifier that assumed today's parameters would lock
 * the operator out the moment those parameters changed.
 */

import {
  randomBytes,
  type ScryptOptions,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify` resolves to the three-argument overload, which cannot carry the
 * cost parameters. The cast names the overload actually being used — the one
 * that takes options — rather than leaving the call sites to fight the
 * inferred signature.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Cost parameters for newly hashed passwords.
 *
 * N=2^15 with r=8 is the interactive-login end of the range RFC 7914 §2
 * suggests, and lands around 100ms on the target hardware — slow enough to
 * make offline guessing expensive, fast enough that a sign-in does not feel
 * stalled.
 */
export const DEFAULT_SCRYPT_PARAMS = {
  N: 32_768,
  r: 8,
  p: 1,
  keyLength: 32,
} as const;

const SALT_BYTES = 16;

/**
 * scrypt's working memory is roughly `128 * N * r` — 32 MiB at these
 * parameters, which is exactly Node's default `maxmem` and therefore fails.
 * The cap is raised to twice the requirement so a future parameter bump does
 * not silently start throwing at the verification site.
 */
function maxmemFor(params: ScryptParams): number {
  return 256 * params.N * params.r;
}

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLength: number;
}

export interface PasswordHashRecord extends ScryptParams {
  readonly algorithm: 'scrypt';
  /** base64. Unique per password; regenerated on every change. */
  readonly salt: string;
  /** base64 of the derived key. */
  readonly hash: string;
}

/** The shortest password this server will store. */
export const MIN_PASSWORD_LENGTH = 12;

export type PasswordRejection = 'too-short' | 'empty';

export function validatePassword(password: string): PasswordRejection | null {
  if (password.length === 0) return 'empty';
  // A length floor and nothing else. Composition rules ("one digit, one
  // symbol") shrink the search space more than they enlarge it, and NIST
  // SP 800-63B has advised against them since 2017.
  if (password.length < MIN_PASSWORD_LENGTH) return 'too-short';
  return null;
}

/** Hash a password for storage. Generates a fresh salt every time. */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<PasswordHashRecord> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params),
  })) as Buffer;
  return {
    algorithm: 'scrypt',
    N: params.N,
    r: params.r,
    p: params.p,
    keyLength: params.keyLength,
    salt: salt.toString('base64'),
    hash: derived.toString('base64'),
  };
}

/**
 * Check a password against a stored record.
 *
 * Uses the record's own parameters, not the current defaults, so a record
 * hashed under older settings still verifies.
 */
export async function verifyPassword(
  password: string,
  record: PasswordHashRecord,
): Promise<boolean> {
  if (record.algorithm !== 'scrypt') return false;
  let derived: Buffer;
  try {
    derived = (await scrypt(password, Buffer.from(record.salt, 'base64'), record.keyLength, {
      N: record.N,
      r: record.r,
      p: record.p,
      maxmem: maxmemFor(record),
    })) as Buffer;
  } catch {
    // A record with nonsense parameters must not crash a login request. It
    // fails closed, and the store's own validation is what surfaces the
    // corruption.
    return false;
  }
  const expected = Buffer.from(record.hash, 'base64');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/**
 * Burn one password hash's worth of time without checking anything.
 *
 * Called when the username does not exist. Without it, a missing account
 * answers in microseconds and a real one in ~100ms, which turns the login
 * endpoint into an account-enumeration oracle no matter how carefully the
 * error messages are worded.
 */
export async function consumeTimingBudget(
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<void> {
  await scrypt('', randomBytes(SALT_BYTES), params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params),
  });
}
