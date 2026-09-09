/**
 * Durable store for the credentials that admit a remote caller.
 *
 * Holds two record kinds in one file:
 *
 * - **Access tokens** — long-lived secrets an operator mints from the CLI and
 *   pastes into an MCP client, a script, or the web app's sign-in field.
 * - **Sessions** — short-lived secrets the browser gets in exchange for a
 *   token, carried in an `HttpOnly` cookie so page JavaScript never holds the
 *   long-lived credential.
 *
 * ## Where the file lives
 *
 * `<projectDir>/.ok/local/access.json`. `.ok/local/` is the per-machine
 * runtime-state directory, already covered by the single `local/` rule in
 * `.ok/.gitignore`, so credentials cannot reach a git remote through the
 * project's own sync. Written `0600`, through a temp file and a rename, so a
 * crash mid-write leaves the previous file rather than a truncated one.
 *
 * Secret minting and comparison live in `secret-hash.ts`, shared with the
 * OAuth store; that module documents why a plain SHA-256 is the right digest
 * for secrets this process generated itself.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AccessPrincipal,
  CredentialVerifier,
  PresentedCredential,
} from '../access-control.ts';
import {
  hashesEqual,
  looksLikeOurSecret,
  mintSecret,
  SECRET_PREFIX,
  sha256Hex,
} from './secret-hash.ts';

/** File name under `.ok/local/`. */
export const ACCESS_STORE_FILENAME = 'access.json';

/** Re-exported so existing importers keep one name for the prefix. */
export const TOKEN_PREFIX = SECRET_PREFIX;

/** Default session lifetime: 30 days. */
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Minimum wall-clock between `lastUsedAt` flushes.
 *
 * Recording last use is worth a disk write occasionally and not once per
 * request, so the timestamp updates in memory immediately and reaches disk at
 * most this often. A `token list` run right after a burst of traffic can
 * therefore read a value up to a minute stale.
 */
const LAST_USED_FLUSH_INTERVAL_MS = 60_000;

export interface AccessTokenRecord {
  readonly id: string;
  /** Operator-supplied label, e.g. `"chatgpt"` or `"iphone"`. */
  readonly name: string;
  /** Hex SHA-256 of the secret. The secret itself is never stored. */
  readonly hash: string;
  readonly createdAt: string;
  readonly lastUsedAt?: string;
}

/**
 * Who a session belongs to.
 *
 * Sessions used to be minted only by exchanging an access token, so the record
 * carried a bare `tokenId`. Password and passkey login mint the same kind of
 * session for an account instead, which needs a second shape.
 *
 * An account subject carries its own label rather than looking one up: this
 * module knows nothing about the account store, and a display label is not
 * worth a cross-store dependency.
 */
export type SessionSubject =
  | { readonly kind: 'token'; readonly id: string }
  | { readonly kind: 'account'; readonly id: string; readonly label: string };

export interface SessionRecord {
  readonly id: string;
  /**
   * Present on records written by this version. Absent on records written
   * before account login existed — see `sessionSubject`.
   */
  readonly subject?: SessionSubject;
  /**
   * Legacy field: the token this session was exchanged from. Still read, never
   * written. Sessions live 30 days, so records in this shape are in flight on
   * every deployed server at the moment this lands.
   */
  readonly tokenId?: string;
  readonly hash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/**
 * Read a record's subject, tolerating the pre-account shape.
 *
 * A record with neither field is corrupt; it resolves to `null` and the
 * session is refused rather than being attributed to whatever happens to be
 * first in the token list.
 */
export function sessionSubject(record: SessionRecord): SessionSubject | null {
  if (record.subject !== undefined) return record.subject;
  if (record.tokenId !== undefined) return { kind: 'token', id: record.tokenId };
  return null;
}

interface AccessStoreFile {
  readonly version: 1;
  readonly tokens: AccessTokenRecord[];
  readonly sessions: SessionRecord[];
}

export interface MintedCredential {
  readonly record: AccessTokenRecord;
  /** The only time the plaintext secret exists outside the caller's hands. */
  readonly secret: string;
}

export interface MintedSession {
  readonly record: SessionRecord;
  readonly secret: string;
}

export interface AccessStore {
  createToken(name: string): MintedCredential;
  listTokens(): readonly AccessTokenRecord[];
  /** Returns false when no live token carries that id. */
  revokeToken(id: string): boolean;
  /** Number of tokens that are currently usable. */
  tokenCount(): number;
  createSession(tokenId: string, ttlMs?: number): MintedSession;
  /** Mint a session for an account, which password and passkey login both do. */
  createAccountSession(accountId: string, label: string, ttlMs?: number): MintedSession;
  /** Drop every session belonging to an account. Used when its password changes. */
  revokeAccountSessions(accountId: string): number;
  /**
   * Verify a token secret and mint a session for it in one step — the
   * browser's sign-in path. Returns null when the secret names no live token,
   * so the caller cannot tell "unknown token" from "revoked token".
   */
  exchangeToken(tokenSecret: string, ttlMs?: number): MintedSession | null;
  revokeSession(id: string): boolean;
  /** Revoke by the secret the cookie carries. The sign-out path. */
  revokeSessionBySecret(secret: string): boolean;
  /** Drop expired sessions. Called on open and on every session mint. */
  pruneSessions(): number;
  /** The verifier handed to `access-control.ts`. */
  readonly verify: CredentialVerifier;
}

const EMPTY_FILE: AccessStoreFile = { version: 1, tokens: [], sessions: [] };

function readStoreFile(path: string): AccessStoreFile {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    // Absent file is the cold-start shape, not an error: a project that has
    // never minted a token has no credentials, and boot validation is what
    // decides whether that is acceptable for the configured mode.
    return { ...EMPTY_FILE, tokens: [], sessions: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt credential file must not silently become an empty one —
    // that would turn "cannot read your tokens" into "you have no tokens",
    // and under a remote policy boot validation would then refuse to start
    // for a reason that looks unrelated. Fail loudly instead.
    throw new Error(`access store at ${path} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`access store at ${path} is not an object`);
  }
  const file = parsed as Partial<AccessStoreFile>;
  if (file.version !== 1) {
    throw new Error(`access store at ${path} has unsupported version ${String(file.version)}`);
  }
  return {
    version: 1,
    tokens: Array.isArray(file.tokens) ? [...file.tokens] : [],
    sessions: Array.isArray(file.sessions) ? [...file.sessions] : [],
  };
}

function writeStoreFile(path: string, file: AccessStoreFile): void {
  mkdirSync(dirname(path), { recursive: true });
  // Same-directory temp + rename, so the swap is atomic on the target
  // filesystem and a crash leaves the previous file intact. `mode` on the
  // temp file is what matters — rename preserves it.
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * The store file's last-modified time, or 0 when it is absent.
 *
 * Used to notice writes made by another process — the CLI mints and revokes in
 * its own process against the same file, and a long-running server that only
 * read the file at boot would refuse a token the operator just created until
 * the next restart.
 */
function storeMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Absolute path to a project's access store. */
export function accessStorePath(localDir: string): string {
  return join(localDir, ACCESS_STORE_FILENAME);
}

/**
 * Open (or create) the store at `path`.
 *
 * The whole file is held in memory. A personal deployment has a handful of
 * tokens and sessions, so a linear scan on verify costs nothing and keeps the
 * comparison constant-time per record.
 */
export function openAccessStore(path: string): AccessStore {
  const file = readStoreFile(path);
  let tokens = file.tokens;
  let sessions = file.sessions;
  let lastUsedFlushedAt = 0;
  let loadedMtimeMs = storeMtimeMs(path);

  function flush(): void {
    writeStoreFile(path, { version: 1, tokens, sessions });
    // Record our own write so the next `reloadIfChanged` does not mistake it
    // for someone else's and re-read what we just wrote.
    loadedMtimeMs = storeMtimeMs(path);
  }

  /**
   * Pick up writes made by another process.
   *
   * A `stat` per credential check is cheap next to the request it belongs to,
   * and it removes the papercut where `access token create` appears to succeed
   * while the running server keeps answering 401 until it is restarted.
   */
  function reloadIfChanged(): void {
    const current = storeMtimeMs(path);
    if (current === loadedMtimeMs) return;
    const fresh = readStoreFile(path);
    tokens = fresh.tokens;
    sessions = fresh.sessions;
    loadedMtimeMs = current;
  }

  function pruneSessions(): number {
    const now = Date.now();
    const live = sessions.filter((s) => Date.parse(s.expiresAt) > now);
    const dropped = sessions.length - live.length;
    if (dropped > 0) {
      sessions = live;
      flush();
    }
    return dropped;
  }

  function touchToken(id: string): void {
    const at = new Date().toISOString();
    tokens = tokens.map((t) => (t.id === id ? { ...t, lastUsedAt: at } : t));
    const now = Date.now();
    if (now - lastUsedFlushedAt >= LAST_USED_FLUSH_INTERVAL_MS) {
      lastUsedFlushedAt = now;
      flush();
    }
  }

  const verify: CredentialVerifier = (
    credential: PresentedCredential,
  ): Omit<AccessPrincipal, 'clientAddress'> | null => {
    reloadIfChanged();
    const presented = credential.value;
    // Reject a foreign-shaped string before hashing. Cheap, and it keeps the
    // log free of digests for values that were never ours.
    if (!looksLikeOurSecret(presented)) return null;
    const hash = sha256Hex(presented);

    if (credential.scheme === 'bearer') {
      for (const token of tokens) {
        if (!hashesEqual(token.hash, hash)) continue;
        touchToken(token.id);
        return { kind: 'bearer', id: token.id, label: token.name };
      }
      return null;
    }

    const now = Date.now();
    for (const session of sessions) {
      if (!hashesEqual(session.hash, hash)) continue;
      // An expired session is refused without being swept here: the verify
      // path stays read-only apart from the throttled `lastUsedAt` write, and
      // `pruneSessions` on the next mint clears it.
      if (Date.parse(session.expiresAt) <= now) return null;
      const subject = sessionSubject(session);
      if (subject === null) return null;
      if (subject.kind === 'account') {
        // Distinct from a token-derived session: this cookie was minted for a
        // person who signed in. `local-op` endpoints admit only this kind.
        return { kind: 'account-session', id: subject.id, label: subject.label };
      }
      const owner = tokens.find((t) => t.id === subject.id);
      // A session whose token was revoked dies with it. Checking here rather
      // than sweeping on revoke means revocation takes effect immediately even
      // for sessions minted by another process against the same file.
      if (owner === undefined) return null;
      touchToken(owner.id);
      return { kind: 'session', id: owner.id, label: owner.name };
    }
    return null;
  };

  function createSession(tokenId: string, ttlMs: number = DEFAULT_SESSION_TTL_MS): MintedSession {
    if (!tokens.some((t) => t.id === tokenId)) {
      throw new Error(`no access token with id ${tokenId}`);
    }
    pruneSessions();
    const secret = mintSecret();
    const now = Date.now();
    const record: SessionRecord = {
      id: randomUUID(),
      subject: { kind: 'token', id: tokenId },
      hash: sha256Hex(secret),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    sessions = [...sessions, record];
    flush();
    return { record, secret };
  }

  function createAccountSession(
    accountId: string,
    label: string,
    ttlMs: number = DEFAULT_SESSION_TTL_MS,
  ): MintedSession {
    pruneSessions();
    const secret = mintSecret();
    const now = Date.now();
    const record: SessionRecord = {
      id: randomUUID(),
      subject: { kind: 'account', id: accountId, label },
      hash: sha256Hex(secret),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    sessions = [...sessions, record];
    flush();
    return { record, secret };
  }

  pruneSessions();

  return {
    createToken(name: string): MintedCredential {
      const trimmed = name.trim();
      if (trimmed.length === 0) throw new Error('token name must not be empty');
      const secret = mintSecret();
      const record: AccessTokenRecord = {
        id: randomUUID(),
        name: trimmed,
        hash: sha256Hex(secret),
        createdAt: new Date().toISOString(),
      };
      tokens = [...tokens, record];
      flush();
      return { record, secret };
    },

    listTokens: () => tokens,

    revokeToken(id: string): boolean {
      const next = tokens.filter((t) => t.id !== id);
      if (next.length === tokens.length) return false;
      tokens = next;
      // Sessions minted from this token go with it. `verify` would refuse them
      // anyway once their owner is gone; dropping them here keeps the file
      // from accumulating records that can never authenticate again.
      sessions = sessions.filter((s) => {
        const subject = sessionSubject(s);
        return !(subject?.kind === 'token' && subject.id === id);
      });
      flush();
      return true;
    },

    tokenCount: () => tokens.length,

    createSession,
    createAccountSession,

    revokeAccountSessions(accountId: string): number {
      reloadIfChanged();
      const next = sessions.filter((s) => {
        const subject = sessionSubject(s);
        return !(subject?.kind === 'account' && subject.id === accountId);
      });
      const dropped = sessions.length - next.length;
      if (dropped > 0) {
        sessions = next;
        flush();
      }
      return dropped;
    },

    exchangeToken(
      tokenSecret: string,
      ttlMs: number = DEFAULT_SESSION_TTL_MS,
    ): MintedSession | null {
      const principal = verify({ scheme: 'bearer', value: tokenSecret });
      if (principal === null) return null;
      return createSession(principal.id, ttlMs);
    },

    revokeSession(id: string): boolean {
      const next = sessions.filter((s) => s.id !== id);
      if (next.length === sessions.length) return false;
      sessions = next;
      flush();
      return true;
    },

    revokeSessionBySecret(secret: string): boolean {
      if (!looksLikeOurSecret(secret)) return false;
      const hash = sha256Hex(secret);
      const match = sessions.find((s) => hashesEqual(s.hash, hash));
      if (match === undefined) return false;
      sessions = sessions.filter((s) => s.id !== match.id);
      flush();
      return true;
    },

    pruneSessions,
    verify,
  };
}
