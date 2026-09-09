import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACCOUNT_STORE_FILENAME,
  type AccountStore,
  accountStorePath,
  normalizeUsername,
  openAccountStore,
  type PasskeyRecord,
} from './account-store.ts';
import { hashPassword } from './password-hash.ts';

const FAST = { N: 1024, r: 8, p: 1, keyLength: 32 } as const;
const dirs: string[] = [];

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-account-store-'));
  dirs.push(dir);
  return dir;
}

function freshStore(): { store: AccountStore; path: string; dir: string } {
  const dir = freshDir();
  const path = accountStorePath(dir);
  return { store: openAccountStore(path), path, dir };
}

async function seed(store: AccountStore, username = 'libera3920') {
  return store.create({
    username,
    password: await hashPassword('correct horse battery', FAST),
    webauthnUserId: 'dXNlci1oYW5kbGU',
  });
}

const passkey = (overrides: Partial<PasskeyRecord> = {}): PasskeyRecord => ({
  id: 'cred-1',
  publicKey: 'cHVibGljLWtleQ',
  counter: 0,
  label: 'MacBook',
  deviceType: 'multiDevice',
  backedUp: true,
  createdAt: new Date().toISOString(),
  ...overrides,
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the single account', () => {
  test('an empty store has no account', () => {
    const { store } = freshStore();
    expect(store.get()).toBeUndefined();
  });

  test('creating one stores it', async () => {
    const { store } = freshStore();
    const account = await seed(store);
    expect(account.username).toBe('libera3920');
    expect(account.passkeys).toEqual([]);
    expect(store.get()?.id).toBe(account.id);
  });

  test('a second account is refused', async () => {
    // One origin, one workspace, one operator. Half-supporting a second
    // account would mean roles and per-account scoping that do not exist.
    const { store } = freshStore();
    await seed(store);
    await expect(seed(store, 'someone-else')).rejects.toThrow('already exists');
  });

  test('an empty username is refused', async () => {
    const { store } = freshStore();
    await expect(seed(store, '   ')).rejects.toThrow('must not be empty');
  });

  test('lookup is case-insensitive', async () => {
    const { store } = freshStore();
    await seed(store);
    expect(store.findByUsername('LIBERA3920')?.username).toBe('libera3920');
    expect(store.findByUsername(' libera3920 ')).toBeDefined();
    expect(store.findByUsername('someone-else')).toBeUndefined();
  });

  test('the file is owner-only and holds no plaintext password', async () => {
    const { store, path } = freshStore();
    await seed(store);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, 'utf-8')).not.toContain('correct horse battery');
  });

  test('changing the password replaces the record', async () => {
    const { store } = freshStore();
    const account = await seed(store);
    const next = await hashPassword('a different password', FAST);
    expect(store.setPassword(account.id, next)).toBe(true);
    expect(store.get()?.password.hash).toBe(next.hash);
  });

  test('changing the password of an unknown id reports no change', async () => {
    const { store } = freshStore();
    const next = await hashPassword('a different password', FAST);
    expect(store.setPassword('not-an-id', next)).toBe(false);
  });
});

describe('passkeys', () => {
  test('added and listed', async () => {
    const { store } = freshStore();
    const account = await seed(store);
    expect(store.addPasskey(account.id, passkey())).toBe(true);
    expect(store.listPasskeys(account.id)).toHaveLength(1);
    expect(store.listPasskeys(account.id)[0]?.label).toBe('MacBook');
  });

  test('re-registering the same authenticator replaces it', async () => {
    // Two records for one authenticator would leave the stale one holding a
    // dead counter, and the counter check would then reject the live device.
    const { store } = freshStore();
    const account = await seed(store);
    store.addPasskey(account.id, passkey({ counter: 5 }));
    store.addPasskey(account.id, passkey({ counter: 0, label: 'MacBook (re-registered)' }));
    const list = store.listPasskeys(account.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('MacBook (re-registered)');
  });

  test('touch bumps the counter and records the time', async () => {
    const { store } = freshStore();
    const account = await seed(store);
    store.addPasskey(account.id, passkey({ counter: 3 }));
    expect(store.touchPasskey(account.id, 'cred-1', 4)).toBe(true);
    const stored = store.listPasskeys(account.id)[0];
    expect(stored?.counter).toBe(4);
    expect(stored?.lastUsedAt).toBeString();
  });

  test('removal', async () => {
    const { store } = freshStore();
    const account = await seed(store);
    store.addPasskey(account.id, passkey());
    expect(store.removePasskey(account.id, 'cred-1')).toBe(true);
    expect(store.listPasskeys(account.id)).toEqual([]);
    expect(store.removePasskey(account.id, 'cred-1')).toBe(false);
  });

  test('removing the last passkey is allowed', async () => {
    // The password remains, so this cannot lock the operator out.
    const { store } = freshStore();
    const account = await seed(store);
    store.addPasskey(account.id, passkey());
    expect(store.removePasskey(account.id, 'cred-1')).toBe(true);
    expect(store.get()?.password).toBeDefined();
  });

  test('operations on an unknown account report no change', async () => {
    const { store } = freshStore();
    await seed(store);
    expect(store.addPasskey('nope', passkey())).toBe(false);
    expect(store.touchPasskey('nope', 'cred-1', 1)).toBe(false);
    expect(store.removePasskey('nope', 'cred-1')).toBe(false);
    expect(store.listPasskeys('nope')).toEqual([]);
  });
});

describe('cross-process behavior', () => {
  test('an account created elsewhere is seen without reopening', async () => {
    // The CLI creates the account in its own process while the server runs.
    const dir = freshDir();
    const path = accountStorePath(dir);
    const server = openAccountStore(path);
    expect(server.get()).toBeUndefined();
    await Bun.sleep(10);
    await seed(openAccountStore(path));
    expect(server.get()?.username).toBe('libera3920');
  });

  test('a password changed elsewhere is seen without reopening', async () => {
    const dir = freshDir();
    const path = accountStorePath(dir);
    const server = openAccountStore(path);
    const account = await seed(openAccountStore(path));
    const before = server.get()?.password.hash;
    await Bun.sleep(10);
    const next = await hashPassword('a different password', FAST);
    openAccountStore(path).setPassword(account.id, next);
    expect(server.get()?.password.hash).not.toBe(before);
  });

  test('records survive a reopen', async () => {
    const dir = freshDir();
    const path = accountStorePath(dir);
    const account = await seed(openAccountStore(path));
    openAccountStore(path).addPasskey(account.id, passkey());
    expect(openAccountStore(path).listPasskeys(account.id)).toHaveLength(1);
  });
});

describe('store file handling', () => {
  test('corrupt JSON fails loudly rather than reading as no account', () => {
    // Reading as empty would turn a read failure into "anyone may claim the
    // first account".
    const dir = freshDir();
    const path = join(dir, ACCOUNT_STORE_FILENAME);
    writeFileSync(path, '{ not json');
    expect(() => openAccountStore(path)).toThrow('is not valid JSON');
  });

  test('an unsupported version fails loudly', () => {
    const dir = freshDir();
    const path = join(dir, ACCOUNT_STORE_FILENAME);
    writeFileSync(path, JSON.stringify({ version: 4, accounts: [] }));
    expect(() => openAccountStore(path)).toThrow('unsupported version 4');
  });
});

describe('normalizeUsername', () => {
  test('trims and lowercases', () => {
    expect(normalizeUsername('  Libera3920 ')).toBe('libera3920');
  });
});
