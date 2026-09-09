import { describe, expect, test } from 'bun:test';
import {
  deriveCodeChallenge,
  isValidCodeChallenge,
  isValidCodeVerifier,
  verifyCodeChallenge,
} from './pkce.ts';

/** RFC 7636 Appendix B's worked example. */
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('deriveCodeChallenge', () => {
  test('matches the worked example in RFC 7636', () => {
    expect(deriveCodeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  test('produces base64url with no padding', () => {
    const challenge = deriveCodeChallenge('a'.repeat(43));
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });
});

describe('isValidCodeVerifier', () => {
  test('accepts the RFC example', () => {
    expect(isValidCodeVerifier(RFC_VERIFIER)).toBe(true);
  });

  test('enforces the 43-character floor', () => {
    // A short verifier is guessable, which is the one thing PKCE prevents.
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
  });

  test('enforces the 128-character ceiling', () => {
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
  });

  test('rejects characters outside the unreserved set', () => {
    expect(isValidCodeVerifier(`${'a'.repeat(42)}+`)).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}/`)).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}=`)).toBe(false);
  });

  test('accepts every unreserved character', () => {
    expect(isValidCodeVerifier(`${'-._~'.repeat(10)}abc`)).toBe(true);
  });
});

describe('isValidCodeChallenge', () => {
  test('accepts a 43-character base64url digest', () => {
    expect(isValidCodeChallenge(RFC_CHALLENGE)).toBe(true);
  });

  test('rejects other lengths and padded base64', () => {
    expect(isValidCodeChallenge('a'.repeat(42))).toBe(false);
    expect(isValidCodeChallenge('a'.repeat(44))).toBe(false);
    expect(isValidCodeChallenge(`${'a'.repeat(42)}=`)).toBe(false);
  });
});

describe('verifyCodeChallenge', () => {
  test('accepts the matching verifier', () => {
    expect(verifyCodeChallenge(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  test('rejects a different verifier', () => {
    expect(verifyCodeChallenge('b'.repeat(43), RFC_CHALLENGE)).toBe(false);
  });

  test('rejects a malformed verifier without comparing', () => {
    expect(verifyCodeChallenge('short', RFC_CHALLENGE)).toBe(false);
  });

  test('rejects a malformed challenge', () => {
    expect(verifyCodeChallenge(RFC_VERIFIER, 'not-a-challenge')).toBe(false);
  });

  test('refuses the plain method by construction', () => {
    // `plain` sends the verifier as the challenge. Accepting it would make
    // PKCE decorative against anyone who can read the authorization request.
    expect(verifyCodeChallenge(RFC_VERIFIER, RFC_VERIFIER)).toBe(false);
  });
});
