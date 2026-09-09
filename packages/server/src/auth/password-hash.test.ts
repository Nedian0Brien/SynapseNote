import { describe, expect, test } from 'bun:test';
import {
  consumeTimingBudget,
  DEFAULT_SCRYPT_PARAMS,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  type PasswordHashRecord,
  validatePassword,
  verifyPassword,
} from './password-hash.ts';

/** Cheap parameters so the suite is not dominated by the KDF it is testing. */
const FAST = { N: 1024, r: 8, p: 1, keyLength: 32 } as const;

describe('hashPassword', () => {
  test('produces a record that verifies', async () => {
    const record = await hashPassword('correct horse battery', FAST);
    expect(await verifyPassword('correct horse battery', record)).toBe(true);
  });

  test('rejects a different password', async () => {
    const record = await hashPassword('correct horse battery', FAST);
    expect(await verifyPassword('correct horse batterz', record)).toBe(false);
    expect(await verifyPassword('', record)).toBe(false);
  });

  test('stores the parameters alongside the hash', async () => {
    // Verification reads these rather than today's defaults, which is what
    // lets the cost be raised without invalidating stored passwords.
    const record = await hashPassword('correct horse battery', FAST);
    expect(record).toMatchObject({ algorithm: 'scrypt', N: 1024, r: 8, p: 1, keyLength: 32 });
  });

  test('salts every hash separately', async () => {
    const a = await hashPassword('same password', FAST);
    const b = await hashPassword('same password', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // Both still verify — the salt is what differs, not the password.
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  test('never stores the password itself', async () => {
    const record = await hashPassword('correct horse battery', FAST);
    expect(JSON.stringify(record)).not.toContain('correct horse battery');
  });
});

describe('verifyPassword — records it should refuse', () => {
  test('a record hashed under different parameters still verifies', async () => {
    // The migration case: an old record, a new default. Verification must
    // follow the record.
    const old = await hashPassword('correct horse battery', { ...FAST, N: 512 });
    expect(old.N).toBe(512);
    expect(await verifyPassword('correct horse battery', old)).toBe(true);
  });

  test('an unknown algorithm fails closed', async () => {
    const record = {
      ...(await hashPassword('correct horse battery', FAST)),
      algorithm: 'md5',
    } as unknown as PasswordHashRecord;
    expect(await verifyPassword('correct horse battery', record)).toBe(false);
  });

  test('nonsense parameters fail closed instead of throwing', async () => {
    // A corrupt record must not take down a login request.
    const record = { ...(await hashPassword('x', FAST)), N: 3 } as PasswordHashRecord;
    expect(await verifyPassword('x', record)).toBe(false);
  });

  test('a truncated hash is refused', async () => {
    const record = await hashPassword('correct horse battery', FAST);
    const truncated: PasswordHashRecord = {
      ...record,
      hash: Buffer.from(record.hash, 'base64').subarray(0, 16).toString('base64'),
    };
    expect(await verifyPassword('correct horse battery', truncated)).toBe(false);
  });
});

describe('the default parameters', () => {
  test('work — the memory cap is the thing that breaks silently', async () => {
    // scrypt needs ~128*N*r bytes, which at the defaults is exactly Node's
    // default maxmem. Getting this wrong throws only at the real parameters,
    // so it has to be exercised here rather than at the fast ones.
    const record = await hashPassword('correct horse battery');
    expect(record.N).toBe(DEFAULT_SCRYPT_PARAMS.N);
    expect(await verifyPassword('correct horse battery', record)).toBe(true);
  });

  test('consumeTimingBudget runs without throwing', async () => {
    await consumeTimingBudget(FAST);
  });
});

describe('validatePassword', () => {
  test('accepts a long password', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  test('rejects an empty one', () => {
    expect(validatePassword('')).toBe('empty');
  });

  test('rejects one under the floor', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('too-short');
  });

  test('imposes no composition rule', () => {
    // Composition rules shrink the search space more than they enlarge it;
    // NIST SP 800-63B has advised against them since 2017.
    expect(validatePassword('aaaaaaaaaaaaaaaaaaaa')).toBeNull();
  });
});
