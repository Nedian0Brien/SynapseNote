/**
 * The operator account: a username, a password hash, and the passkeys
 * registered to it.
 *
 * One account, by design. This is a personal workspace served from one
 * origin, and a second account would need roles, invitations, and per-account
 * document scoping — none of which exists. The store refuses to create a
 * second rather than half-supporting one.
 *
 * Same file discipline as the access-token and OAuth stores: lives under
 * `<projectDir>/.ok/local/`, written 0600 through a temp-and-rename, versioned,
 * loud on corruption, and re-read when another process writes it.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PasswordHashRecord } from './password-hash.ts';

export const ACCOUNT_STORE_FILENAME = 'accounts.json';

/**
 * A registered passkey.
 *
 * `publicKey` is base64url here because `@simplewebauthn` hands back a
 * `Uint8Array` and this file is JSON. The ceremony module owns the conversion
 * in both directions so the encoding never leaks into callers.
 */
export interface PasskeyRecord {
  /** The credential ID, base64url — the same string WebAuthn uses. */
  readonly id: string;
  /** COSE public key, base64url. */
  readonly publicKey: string;
  /** Signature counter. Monotonic for authenticators that implement it. */
  readonly counter: number;
  readonly transports?: readonly string[];
  /** Operator-facing name, e.g. "MacBook". Defaults to the device type. */
  readonly label: string;
  readonly deviceType: string;
  readonly backedUp: boolean;
  readonly createdAt: string;
  readonly lastUsedAt?: string;
}

export interface AccountRecord {
  readonly id: string;
  readonly username: string;
  readonly password: PasswordHashRecord;
  /** Stable per-account handle WebAuthn binds credentials to, base64url. */
  readonly webauthnUserId: string;
  readonly createdAt: string;
  readonly passkeys: readonly PasskeyRecord[];
}

interface AccountStoreFile {
  readonly version: 1;
  readonly accounts: AccountRecord[];
}

export interface AccountStore {
  /** The single account, or undefined before one is created. */
  get(): AccountRecord | undefined;
  findByUsername(username: string): AccountRecord | undefined;
  findById(id: string): AccountRecord | undefined;
  /** Throws when an account already exists. */
  create(input: {
    username: string;
    password: PasswordHashRecord;
    webauthnUserId: string;
  }): AccountRecord;
  setPassword(id: string, password: PasswordHashRecord): boolean;

  addPasskey(accountId: string, passkey: PasskeyRecord): boolean;
  /** Record a successful assertion: bumps the counter and the last-used time. */
  touchPasskey(accountId: string, passkeyId: string, counter: number): boolean;
  removePasskey(accountId: string, passkeyId: string): boolean;
  listPasskeys(accountId: string): readonly PasskeyRecord[];
}

function readStoreFile(path: string): AccountStoreFile {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return { version: 1, accounts: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt account file must not read as "no account". That would turn a
    // read failure into "anyone may create the first account".
    throw new Error(`account store at ${path} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`account store at ${path} is not an object`);
  }
  const file = parsed as Partial<AccountStoreFile>;
  if (file.version !== 1) {
    throw new Error(`account store at ${path} has unsupported version ${String(file.version)}`);
  }
  return { version: 1, accounts: Array.isArray(file.accounts) ? [...file.accounts] : [] };
}

function writeStoreFile(path: string, file: AccountStoreFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}

function storeMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

export function accountStorePath(localDir: string): string {
  return join(localDir, ACCOUNT_STORE_FILENAME);
}

/** Usernames are compared case-insensitively so `Libera` and `libera` are one account. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function openAccountStore(path: string): AccountStore {
  let accounts = readStoreFile(path).accounts;
  let loadedMtimeMs = storeMtimeMs(path);

  function flush(): void {
    writeStoreFile(path, { version: 1, accounts });
    loadedMtimeMs = storeMtimeMs(path);
  }

  /** Pick up an account created by the CLI while the server was running. */
  function reloadIfChanged(): void {
    const current = storeMtimeMs(path);
    if (current === loadedMtimeMs) return;
    accounts = readStoreFile(path).accounts;
    loadedMtimeMs = current;
  }

  function replace(id: string, next: (account: AccountRecord) => AccountRecord): boolean {
    reloadIfChanged();
    const existing = accounts.find((a) => a.id === id);
    if (existing === undefined) return false;
    accounts = accounts.map((a) => (a.id === id ? next(a) : a));
    flush();
    return true;
  }

  return {
    get() {
      reloadIfChanged();
      return accounts[0];
    },

    findByUsername(username) {
      reloadIfChanged();
      const wanted = normalizeUsername(username);
      return accounts.find((a) => normalizeUsername(a.username) === wanted);
    },

    findById(id) {
      reloadIfChanged();
      return accounts.find((a) => a.id === id);
    },

    create(input) {
      reloadIfChanged();
      if (accounts.length > 0) {
        throw new Error('an account already exists; this server holds exactly one');
      }
      const username = input.username.trim();
      if (username.length === 0) throw new Error('username must not be empty');
      const record: AccountRecord = {
        id: randomUUID(),
        username,
        password: input.password,
        webauthnUserId: input.webauthnUserId,
        createdAt: new Date().toISOString(),
        passkeys: [],
      };
      accounts = [record];
      flush();
      return record;
    },

    setPassword(id, password) {
      return replace(id, (account) => ({ ...account, password }));
    },

    addPasskey(accountId, passkey) {
      return replace(accountId, (account) => ({
        // Replacing by id rather than appending: re-registering the same
        // authenticator should update it, not leave two records where only
        // one has the live counter.
        ...account,
        passkeys: [...account.passkeys.filter((p) => p.id !== passkey.id), passkey],
      }));
    },

    touchPasskey(accountId, passkeyId, counter) {
      const at = new Date().toISOString();
      return replace(accountId, (account) => ({
        ...account,
        passkeys: account.passkeys.map((p) =>
          p.id === passkeyId ? { ...p, counter, lastUsedAt: at } : p,
        ),
      }));
    },

    removePasskey(accountId, passkeyId) {
      reloadIfChanged();
      const account = accounts.find((a) => a.id === accountId);
      if (account === undefined) return false;
      if (!account.passkeys.some((p) => p.id === passkeyId)) return false;
      accounts = accounts.map((a) =>
        a.id === accountId ? { ...a, passkeys: a.passkeys.filter((p) => p.id !== passkeyId) } : a,
      );
      flush();
      return true;
    },

    listPasskeys(accountId) {
      reloadIfChanged();
      return accounts.find((a) => a.id === accountId)?.passkeys ?? [];
    },
  };
}
