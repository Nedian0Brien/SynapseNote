import { describe, expect, test } from 'bun:test';
import type { PasskeyRecord } from '../auth/account-store.ts';
import {
  CHALLENGE_TTL_MS,
  createChallengeStore,
  isCounterRegression,
  relyingPartyFromOrigin,
  startPasskeyAuthentication,
  startPasskeyRegistration,
  verifyPasskey,
} from './ceremony.ts';

const RP = relyingPartyFromOrigin('https://notes.example.com');

const passkey = (overrides: Partial<PasskeyRecord> = {}): PasskeyRecord => ({
  id: 'cred-1',
  // 32 zero bytes, base64url. Never actually verified in these tests — the
  // paths exercised here refuse before any signature check.
  publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  counter: 0,
  label: 'MacBook',
  deviceType: 'multiDevice',
  backedUp: true,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('relyingPartyFromOrigin', () => {
  test('splits the origin into the id and origin WebAuthn needs', () => {
    // rpID is the bare domain; expectedOrigin is the full origin. Passing one
    // where the other belongs fails every ceremony.
    expect(RP).toEqual({
      name: 'SynapseNote',
      id: 'notes.example.com',
      origin: 'https://notes.example.com',
    });
  });

  test('drops an explicit port from the id but keeps it in the origin', () => {
    const rp = relyingPartyFromOrigin('https://notes.example.com:8443');
    expect(rp.id).toBe('notes.example.com');
    expect(rp.origin).toBe('https://notes.example.com:8443');
  });
});

describe('challenge store', () => {
  test('a remembered challenge comes back once', () => {
    const store = createChallengeStore();
    const handle = store.remember('authentication', 'chal-1');
    expect(store.spend('authentication', handle)).toBe('chal-1');
  });

  test('spending it twice fails', () => {
    // A challenge that survives redemption is replayable, which defeats the
    // point of the ceremony.
    const store = createChallengeStore();
    const handle = store.remember('authentication', 'chal-1');
    store.spend('authentication', handle);
    expect(store.spend('authentication', handle)).toBeNull();
  });

  test('a registration challenge cannot be spent as an authentication one', () => {
    const store = createChallengeStore();
    const handle = store.remember('registration', 'chal-1');
    expect(store.spend('authentication', handle)).toBeNull();
  });

  test('a wrong-kind attempt still consumes it', () => {
    // Otherwise the mismatch is a free probe that leaves the challenge live.
    const store = createChallengeStore();
    const handle = store.remember('registration', 'chal-1');
    store.spend('authentication', handle);
    expect(store.spend('registration', handle)).toBeNull();
  });

  test('an unknown handle fails', () => {
    const store = createChallengeStore();
    expect(store.spend('authentication', 'never-issued')).toBeNull();
  });

  test('expires after the TTL', () => {
    let clock = 1_000_000;
    const store = createChallengeStore({ now: () => clock });
    const handle = store.remember('authentication', 'chal-1');
    clock += CHALLENGE_TTL_MS + 1;
    expect(store.spend('authentication', handle)).toBeNull();
  });

  test('prunes expired entries', () => {
    let clock = 1_000_000;
    const store = createChallengeStore({ now: () => clock });
    store.remember('authentication', 'chal-1');
    store.remember('authentication', 'chal-2');
    clock += CHALLENGE_TTL_MS + 1;
    expect(store.prune()).toBe(2);
    expect(store.prune()).toBe(0);
  });

  test('handles are unguessable and distinct', () => {
    const store = createChallengeStore();
    const a = store.remember('authentication', 'chal-1');
    const b = store.remember('authentication', 'chal-2');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe('startPasskeyRegistration', () => {
  test('asks for user verification and a discoverable credential', async () => {
    // `required` is what makes the authenticator actually prompt for Touch ID
    // rather than silently asserting presence.
    const store = createChallengeStore();
    const { options } = await startPasskeyRegistration(
      RP,
      { username: 'libera3920', webauthnUserId: 'dXNlcg', passkeys: [] },
      store,
    );
    expect(options.authenticatorSelection?.userVerification).toBe('required');
    expect(options.authenticatorSelection?.residentKey).toBe('preferred');
    expect(options.rp.id).toBe('notes.example.com');
    expect(options.user.name).toBe('libera3920');
  });

  test('excludes already-registered authenticators', async () => {
    const store = createChallengeStore();
    const { options } = await startPasskeyRegistration(
      RP,
      { username: 'libera3920', webauthnUserId: 'dXNlcg', passkeys: [passkey()] },
      store,
    );
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual(['cred-1']);
  });

  test('registers the challenge under the registration kind', async () => {
    const store = createChallengeStore();
    const { challengeHandle, options } = await startPasskeyRegistration(
      RP,
      { username: 'libera3920', webauthnUserId: 'dXNlcg', passkeys: [] },
      store,
    );
    expect(store.spend('authentication', challengeHandle)).toBeNull();
    const reissued = await startPasskeyRegistration(
      RP,
      { username: 'libera3920', webauthnUserId: 'dXNlcg', passkeys: [] },
      store,
    );
    expect(store.spend('registration', reissued.challengeHandle)).toBe(reissued.options.challenge);
    expect(options.challenge).toBeString();
  });
});

describe('startPasskeyAuthentication', () => {
  test('requires user verification and lists no credentials', async () => {
    // Listing them would need to know who is signing in before they have, and
    // would disclose which credential IDs exist to an unauthenticated caller.
    const store = createChallengeStore();
    const { options } = await startPasskeyAuthentication(RP, store);
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials ?? []).toEqual([]);
    expect(options.rpId).toBe('notes.example.com');
  });
});

describe('verifyPasskey — refusals before any signature check', () => {
  const anyResponse = {
    id: 'cred-1',
    rawId: 'cred-1',
    response: { clientDataJSON: '', authenticatorData: '', signature: '' },
    clientExtensionResults: {},
    type: 'public-key',
  } as unknown as Parameters<typeof verifyPasskey>[3];

  test('an unknown challenge handle', async () => {
    const store = createChallengeStore();
    const outcome = await verifyPasskey(RP, store, 'never-issued', anyResponse, () => passkey());
    expect(outcome).toEqual({ ok: false, reason: 'challenge-unknown' });
  });

  test('a credential the account does not hold', async () => {
    const store = createChallengeStore();
    const handle = store.remember('authentication', 'chal-1');
    const outcome = await verifyPasskey(RP, store, handle, anyResponse, () => undefined);
    expect(outcome).toEqual({ ok: false, reason: 'unknown-credential' });
  });

  test('a malformed response is a refusal, not a crash', async () => {
    const store = createChallengeStore();
    const handle = store.remember('authentication', 'chal-1');
    const outcome = await verifyPasskey(RP, store, handle, anyResponse, () => passkey());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(['error', 'not-verified']).toContain(outcome.reason);
  });

  test('the challenge is spent even when verification fails', async () => {
    const store = createChallengeStore();
    const handle = store.remember('authentication', 'chal-1');
    await verifyPasskey(RP, store, handle, anyResponse, () => passkey());
    expect(store.spend('authentication', handle)).toBeNull();
  });
});

describe('isCounterRegression', () => {
  test('accepts an advancing counter', () => {
    expect(isCounterRegression(5, 6)).toBe(false);
    expect(isCounterRegression(1, 1000)).toBe(false);
  });

  test('refuses a counter that fails to advance', () => {
    // Two devices answering for one credential is what a cloned authenticator
    // looks like.
    expect(isCounterRegression(5, 5)).toBe(true);
    expect(isCounterRegression(5, 4)).toBe(true);
    expect(isCounterRegression(5, 0)).toBe(true);
  });

  test('tolerates authenticators that never implement counters', () => {
    // Most platform passkeys, Apple's included, report zero forever. Treating
    // that as a regression would refuse every sign-in on exactly the devices
    // this feature exists for.
    expect(isCounterRegression(0, 0)).toBe(false);
  });

  test('starts checking once a non-zero counter has been seen', () => {
    expect(isCounterRegression(0, 7)).toBe(false);
    expect(isCounterRegression(7, 7)).toBe(true);
  });
});
