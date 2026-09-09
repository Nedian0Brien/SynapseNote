import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
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

/** A store plus the path it writes to, for tests that inspect the file. */
function freshStore(): { store: ReturnType<typeof openAccessStore>; path: string } {
  const path = freshStorePath();
  return { store: openAccessStore(path), path };
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

describe('token-for-session exchange', () => {
  test('a valid token secret mints a session', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const minted = store.exchangeToken(token.secret);
    expect(minted).not.toBeNull();
    expect(store.verify({ scheme: 'session', value: minted?.secret ?? '' })).toMatchObject({
      kind: 'session',
      label: 'browser',
    });
  });

  test('an unknown secret mints nothing', () => {
    const store = openAccessStore(freshStorePath());
    store.createToken('browser');
    expect(store.exchangeToken(`${TOKEN_PREFIX}nope`)).toBeNull();
  });

  test('a revoked token cannot be exchanged', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    store.revokeToken(token.record.id);
    expect(store.exchangeToken(token.secret)).toBeNull();
  });

  test('a session secret cannot be exchanged for another session', () => {
    // Otherwise a stolen cookie could be rolled forward indefinitely without
    // ever holding the long-lived token.
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id);
    expect(store.exchangeToken(session.secret)).toBeNull();
  });

  test('signing out revokes by the cookie secret', () => {
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const session = store.createSession(token.record.id);
    expect(store.revokeSessionBySecret(session.secret)).toBe(true);
    expect(store.verify({ scheme: 'session', value: session.secret })).toBeNull();
  });

  test('signing out with an unknown secret reports no change', () => {
    const store = openAccessStore(freshStorePath());
    expect(store.revokeSessionBySecret(`${TOKEN_PREFIX}nope`)).toBe(false);
    expect(store.revokeSessionBySecret('not-ours')).toBe(false);
  });

  test('exchange works when destructured off the store', () => {
    // The CLI and handlers pull methods off the object; a `this`-dependent
    // implementation would throw here.
    const store = openAccessStore(freshStorePath());
    const token = store.createToken('browser');
    const { exchangeToken } = store;
    expect(exchangeToken(token.secret)).not.toBeNull();
  });
});

describe('picking up another process’s writes', () => {
  test('a token minted elsewhere verifies without reopening', async () => {
    // The CLI mints in its own process while the server runs. Without this,
    // `access token create` looks like it worked and the server keeps
    // answering 401 until the next restart.
    const path = freshStorePath();
    const server = openAccessStore(path);
    server.createToken('first');
    // A distinct mtime — the filesystem timestamp resolution is coarse enough
    // that two writes in the same millisecond would look identical.
    await Bun.sleep(10);
    const cli = openAccessStore(path);
    const minted = cli.createToken('added-later');
    expect(server.verify({ scheme: 'bearer', value: minted.secret })).toMatchObject({
      label: 'added-later',
    });
  });

  test('a revocation made elsewhere takes effect without reopening', async () => {
    const path = freshStorePath();
    const server = openAccessStore(path);
    const token = server.createToken('phone');
    expect(server.verify({ scheme: 'bearer', value: token.secret })).not.toBeNull();
    await Bun.sleep(10);
    openAccessStore(path).revokeToken(token.record.id);
    expect(server.verify({ scheme: 'bearer', value: token.secret })).toBeNull();
  });

  test('the store’s own writes do not trigger a redundant reload', async () => {
    // A self-inflicted reload would be harmless but would discard the
    // in-memory `lastUsedAt` the throttled flush has not written yet.
    const path = freshStorePath();
    const store = openAccessStore(path);
    const token = store.createToken('phone');
    store.verify({ scheme: 'bearer', value: token.secret });
    expect(store.listTokens().find((t) => t.id === token.record.id)?.lastUsedAt).toBeString();
    await Bun.sleep(10);
    store.createToken('second');
    expect(store.listTokens().find((t) => t.id === token.record.id)?.lastUsedAt).toBeString();
  });
});

describe('session subject — the pre-account record shape', () => {
  test('a record written before account login still authenticates', () => {
    // Sessions live 30 days, so records in the old shape are in flight on
    // every deployed server the moment this lands. Reading them wrong would
    // silently sign the operator out of every device.
    const path = freshStorePath();
    const seeded = openAccessStore(path);
    const token = seeded.createToken('laptop');
    const secret = `${TOKEN_PREFIX}legacy-session-secret`;

    const file = JSON.parse(readFileSync(path, 'utf-8'));
    file.sessions = [
      {
        id: 'legacy-1',
        // The old field, and no `subject`.
        tokenId: token.record.id,
        hash: createHash('sha256').update(secret, 'utf-8').digest('hex'),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ];
    writeFileSync(path, JSON.stringify(file, null, 2));

    expect(openAccessStore(path).verify({ scheme: 'session', value: secret })).toMatchObject({
      kind: 'session',
      id: token.record.id,
      label: 'laptop',
    });
  });

  test('revoking the token still sweeps a legacy session', () => {
    const path = freshStorePath();
    const seeded = openAccessStore(path);
    const token = seeded.createToken('laptop');
    const secret = `${TOKEN_PREFIX}legacy-session-secret`;
    const file = JSON.parse(readFileSync(path, 'utf-8'));
    file.sessions = [
      {
        id: 'legacy-1',
        tokenId: token.record.id,
        hash: createHash('sha256').update(secret, 'utf-8').digest('hex'),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ];
    writeFileSync(path, JSON.stringify(file, null, 2));

    const store = openAccessStore(path);
    store.revokeToken(token.record.id);
    expect(store.verify({ scheme: 'session', value: secret })).toBeNull();
  });

  test('a record with neither field is refused rather than guessed at', () => {
    const path = freshStorePath();
    const seeded = openAccessStore(path);
    seeded.createToken('laptop');
    const secret = `${TOKEN_PREFIX}orphan-session-secret`;
    const file = JSON.parse(readFileSync(path, 'utf-8'));
    file.sessions = [
      {
        id: 'orphan-1',
        hash: createHash('sha256').update(secret, 'utf-8').digest('hex'),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ];
    writeFileSync(path, JSON.stringify(file, null, 2));
    expect(openAccessStore(path).verify({ scheme: 'session', value: secret })).toBeNull();
  });

  test('new token sessions are written with a subject', () => {
    const { store, path } = freshStore();
    const token = store.createToken('laptop');
    store.createSession(token.record.id);
    const file = JSON.parse(readFileSync(path, 'utf-8'));
    expect(file.sessions[0].subject).toEqual({ kind: 'token', id: token.record.id });
    expect(file.sessions[0].tokenId).toBeUndefined();
  });
});

describe('account sessions', () => {
  test('authenticate as the account, carrying its label', () => {
    const { store } = freshStore();
    const minted = store.createAccountSession('acct-1', 'libera3920');
    expect(store.verify({ scheme: 'session', value: minted.secret })).toEqual({
      kind: 'session',
      id: 'acct-1',
      label: 'libera3920',
    });
  });

  test('need no access token to exist', () => {
    // Login is a separate path; an operator with an account but no tokens
    // must still be able to sign in.
    const { store } = freshStore();
    expect(store.tokenCount()).toBe(0);
    const minted = store.createAccountSession('acct-1', 'libera3920');
    expect(store.verify({ scheme: 'session', value: minted.secret })).not.toBeNull();
  });

  test('are not accepted as a bearer token', () => {
    const { store } = freshStore();
    const minted = store.createAccountSession('acct-1', 'libera3920');
    expect(store.verify({ scheme: 'bearer', value: minted.secret })).toBeNull();
  });

  test('revoking the account drops them and leaves token sessions alone', () => {
    const { store } = freshStore();
    const token = store.createToken('laptop');
    const tokenSession = store.createSession(token.record.id);
    const accountSession = store.createAccountSession('acct-1', 'libera3920');
    expect(store.revokeAccountSessions('acct-1')).toBe(1);
    expect(store.verify({ scheme: 'session', value: accountSession.secret })).toBeNull();
    expect(store.verify({ scheme: 'session', value: tokenSession.secret })).not.toBeNull();
  });

  test('revoking an access token leaves account sessions alone', () => {
    const { store } = freshStore();
    const token = store.createToken('laptop');
    const accountSession = store.createAccountSession('acct-1', 'libera3920');
    store.revokeToken(token.record.id);
    expect(store.verify({ scheme: 'session', value: accountSession.secret })).not.toBeNull();
  });

  test('expire like any other session', () => {
    const { store } = freshStore();
    const minted = store.createAccountSession('acct-1', 'libera3920', -1);
    expect(store.verify({ scheme: 'session', value: minted.secret })).toBeNull();
  });
});
