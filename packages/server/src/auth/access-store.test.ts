import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACCESS_STORE_FILENAME,
  accessStorePath,
  openAccessStore,
  TOKEN_PREFIX,
} from './access-store.ts';

const dirs: string[] = [];

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-access-store-'));
  dirs.push(dir);
  return dir;
}

function freshStorePath(): string {
  return accessStorePath(freshDir());
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('token lifecycle', () => {
  test('a minted token verifies as a bearer credential', () => {
    const store = openAccessStore(freshStorePath());
    const { record, secret } = store.createToken('chatgpt');
    expect(secret.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(store.verify({ scheme: 'bearer', value: secret })).toEqual({
      kind: 'bearer',
      id: record.id,
      label: 'chatgpt',
    });
  });

  test('the plaintext secret is never written to disk', () => {
    const path = freshStorePath();
    const store = openAccessStore(path);
    const { secret } = store.createToken('chatgpt');
    expect(readFileSync(path, 'utf-8')).not.toContain(secret);
  });

  test('the store file is owner-only', () => {
    const path = freshStorePath();
    openAccessStore(path).createToken('chatgpt');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test('an unknown secret verifies as nothing', () => {
    const store = openAccessStore(freshStorePath());
    store.createToken('chatgpt');
    expect(store.verify({ scheme: 'bearer', value: `${TOKEN_PREFIX}nope` })).toBeNull();
  });

  test('a foreign-shaped string verifies as nothing', () => {
    const store = openAccessStore(freshStorePath());
    store.createToken('chatgpt');
    expect(store.verify({ scheme: 'bearer', value: 'hunter2' })).toBeNull();
  });

  test('two mints never collide', () => {
    const store = openAccessStore(freshStorePath());
    const a = store.createToken('a');
    const b = store.createToken('b');
    expect(a.secret).not.toBe(b.secret);
    expect(a.record.id).not.toBe(b.record.id);
    expect(store.tokenCount()).toBe(2);
  });

  test('an empty name is refused', () => {
    const store = openAccessStore(freshStorePath());
    expect(() => store.createToken('   ')).toThrow('token name must not be empty');
  });

  test('revoking a token stops its secret working', () => {
    const store = openAccessStore(freshStorePath());
    const { record, secret } = store.createToken('chatgpt');
    expect(store.revokeToken(record.id)).toBe(true);
    expect(store.verify({ scheme: 'bearer', value: secret })).toBeNull();
    expect(store.tokenCount()).toBe(0);
  });

  test('revoking an unknown id reports no change', () => {
    const store = openAccessStore(freshStorePath());
    expect(store.revokeToken('not-an-id')).toBe(false);
  });

  test('tokens survive a reopen', () => {
    const path = freshStorePath();
    const { secret, record } = openAccessStore(path).createToken('chatgpt');
    const reopened = openAccessStore(path);
    expect(reopened.verify({ scheme: 'bearer', value: secret })).toMatchObject({ id: record.id });
  });

  test('a token secret is not accepted as a session cookie', () => {
    // Scheme decides which list is scanned. A long-lived token presented as a
    // cookie must not short-circuit into session admission.
    const store = openAccessStore(freshStorePath());
    const { secret } = store.createToken('chatgpt');
    expect(store.verify({ scheme: 'session', value: secret })).toBeNull();
  });

  test('records last use', () => {
    const store = openAccessStore(freshStorePath());
    const { record, secret } = store.createToken('chatgpt');
    expect(store.listTokens()[0]?.lastUsedAt).toBeUndefined();
    store.verify({ scheme: 'bearer', value: secret });
    const touched = store.listTokens().find((t) => t.id === record.id);
    expect(touched?.lastUsedAt).toBeString();
  });
});

describe('session lifecycle', () => {
  test('a session verifies as its owning token’s principal', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id);
    expect(store.verify({ scheme: 'session', value: session.secret })).toEqual({
      kind: 'session',
      id: token.record.id,
      label: 'browser',
    });
  });

  test('a session secret is not accepted as a bearer token', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id);
    expect(store.verify({ scheme: 'bearer', value: session.secret })).toBeNull();
  });

  test('an expired session is refused', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id, -1);
    expect(store.verify({ scheme: 'session', value: session.secret })).toBeNull();
  });

  test('revoking the token kills its sessions immediately', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id);
    store.revokeToken(token.record.id);
    expect(store.verify({ scheme: 'session', value: session.secret })).toBeNull();
  });

  test('a session revoked on its own leaves the token usable', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id);
    expect(store.revokeSession(session.record.id)).toBe(true);
    expect(store.verify({ scheme: 'session', value: session.secret })).toBeNull();
    expect(store.verify({ scheme: 'bearer', value: token.secret })).not.toBeNull();
  });

  test('sessions cannot be minted for an unknown token', () => {
    const store = openAccessStore(freshStorePath());
    expect(() => store.createSession('not-an-id')).toThrow('no access token with id');
  });

  test('expired sessions are pruned on the next mint', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    store.createSession(token.record.id, -1);
    store.createSession(token.record.id);
    // The dead record is gone; only the live one remains.
    expect(store.pruneSessions()).toBe(0);
  });

  test('sessions survive a reopen', () => {
    const path = freshStorePath();
    const first = openAccessStore(path);
    const token = first.createToken('browser');
    const session = first.createSession(token.record.id);
    expect(
      openAccessStore(path).verify({ scheme: 'session', value: session.secret }),
    ).not.toBeNull();
  });

  test('a revocation written by another process is honored on reopen', () => {
    // The CLI mints and revokes in its own process against the same file.
    const path = freshStorePath();
    const minting = openAccessStore(path);
    const token = minting.createToken('browser');
    const session = minting.createSession(token.record.id);
    openAccessStore(path).revokeToken(token.record.id);
    expect(openAccessStore(path).verify({ scheme: 'session', value: session.secret })).toBeNull();
  });
});

describe('store file handling', () => {
  test('an absent file opens as an empty store', () => {
    const store = openAccessStore(freshStorePath());
    expect(store.tokenCount()).toBe(0);
    expect(store.listTokens()).toEqual([]);
  });

  test('corrupt JSON fails loudly rather than reading as empty', () => {
    // Silently treating an unreadable credential file as "no credentials"
    // would turn a read failure into an authorization outcome.
    const dir = freshDir();
    const path = join(dir, ACCESS_STORE_FILENAME);
    writeFileSync(path, '{ not json');
    expect(() => openAccessStore(path)).toThrow('is not valid JSON');
  });

  test('an unsupported version fails loudly', () => {
    const dir = freshDir();
    const path = join(dir, ACCESS_STORE_FILENAME);
    writeFileSync(path, JSON.stringify({ version: 99, tokens: [], sessions: [] }));
    expect(() => openAccessStore(path)).toThrow('unsupported version 99');
  });

  test('a non-object payload fails loudly', () => {
    const dir = freshDir();
    const path = join(dir, ACCESS_STORE_FILENAME);
    writeFileSync(path, '[]');
    expect(() => openAccessStore(path)).toThrow('unsupported version');
  });

  test('the parent directory is created on first write', () => {
    const path = join(freshDir(), 'nested', 'deeper', ACCESS_STORE_FILENAME);
    openAccessStore(path).createToken('chatgpt');
    expect(statSync(path).isFile()).toBe(true);
  });
});
