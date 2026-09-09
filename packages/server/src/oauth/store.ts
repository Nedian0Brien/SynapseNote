/**
 * Durable state for the OAuth authorization server: registered clients,
 * in-flight authorization codes, and issued tokens.
 *
 * Lives beside the personal-token store at `<projectDir>/.ok/local/oauth.json`
 * — same per-machine, git-ignored directory, same 0600 temp-and-rename write.
 *
 * ## Opaque tokens, not JWTs
 *
 * Tokens are random strings looked up in this file rather than signed
 * documents. For one workspace with a handful of clients that is the better
 * trade: revocation takes effect on the next request instead of at the end of
 * a token's lifetime, there is no signing key to rotate or leak, and the
 * audience a token was issued for is a stored field rather than a claim that
 * has to be re-validated everywhere. A JWT earns its complexity when
 * validation must happen without reaching the issuer, which is not the shape
 * here — the issuer and the resource server are the same process.
 *
 * ## What is deliberately short-lived
 *
 * Authorization codes last a minute and survive exactly one redemption. OAuth
 * 2.1 requires single use; the store enforces it by deleting the record on
 * redemption, so a replayed code finds nothing rather than finding a record
 * marked used.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashesEqual, looksLikeOurSecret, mintSecret, sha256Hex } from '../auth/secret-hash.ts';

export const OAUTH_STORE_FILENAME = 'oauth.json';

/**
 * Authorization codes expire in 60 seconds. OAuth 2.1 caps them at 10 minutes;
 * a code is redeemed by the client immediately after the redirect, so a minute
 * is generous and keeps the replay window small.
 */
export const AUTHORIZATION_CODE_TTL_MS = 60_000;

/** Access tokens last an hour. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Refresh tokens last 30 days and rotate on every use. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface OAuthClientRecord {
  /** For CIMD this is the metadata document URL; for DCR a minted opaque id. */
  readonly clientId: string;
  readonly redirectUris: readonly string[];
  readonly clientName?: string;
  readonly registeredAt: string;
  readonly source: 'cimd' | 'dcr';
}

export interface AuthorizationCodeRecord {
  readonly hash: string;
  readonly clientId: string;
  readonly redirectUri: string;
  /** PKCE S256 challenge. OAuth 2.1 makes PKCE mandatory, so this is never absent. */
  readonly codeChallenge: string;
  readonly scope: string;
  /** RFC 8707 audience this code may be exchanged for. */
  readonly resource: string;
  /** Which access token the operator was holding when they approved. */
  readonly principalId: string;
  readonly principalLabel: string;
  readonly expiresAt: string;
}

export interface OAuthTokenRecord {
  readonly id: string;
  readonly kind: 'access' | 'refresh';
  readonly hash: string;
  readonly clientId: string;
  readonly scope: string;
  readonly resource: string;
  readonly principalId: string;
  readonly principalLabel: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Groups an access/refresh pair so refreshing can retire its predecessor. */
  readonly grantId: string;
}

interface OAuthStoreFile {
  readonly version: 1;
  readonly clients: OAuthClientRecord[];
  readonly codes: AuthorizationCodeRecord[];
  readonly tokens: OAuthTokenRecord[];
}

/** What a verified OAuth access token resolves to. */
export interface OAuthTokenPrincipal {
  readonly clientId: string;
  readonly scope: string;
  readonly resource: string;
  readonly principalId: string;
  readonly principalLabel: string;
}

export interface IssuedGrant {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly scope: string;
}

export interface OAuthStore {
  upsertClient(record: Omit<OAuthClientRecord, 'registeredAt'>): OAuthClientRecord;
  getClient(clientId: string): OAuthClientRecord | undefined;

  /** Mint an authorization code. Returns the plaintext code, stored hashed. */
  createAuthorizationCode(input: Omit<AuthorizationCodeRecord, 'hash' | 'expiresAt'>): {
    readonly code: string;
    readonly expiresAt: string;
  };
  /**
   * Redeem a code. Returns the record and removes it, so a replay finds
   * nothing. Returns null for unknown, expired, or already-redeemed codes —
   * the caller cannot tell which, and does not need to.
   */
  redeemAuthorizationCode(code: string): AuthorizationCodeRecord | null;

  /** Issue an access/refresh pair for a grant. */
  issueGrant(input: {
    readonly clientId: string;
    readonly scope: string;
    readonly resource: string;
    readonly principalId: string;
    readonly principalLabel: string;
    readonly grantId?: string;
  }): IssuedGrant;

  /** Verify an access token. Null when unknown, expired, or not an access token. */
  verifyAccessToken(token: string): OAuthTokenPrincipal | null;
  /** Consume a refresh token, retiring the whole grant it belongs to. */
  redeemRefreshToken(token: string): OAuthTokenRecord | null;

  /** Drop every token issued to a client. Used when a client is removed. */
  revokeClientTokens(clientId: string): number;
  /** Drop expired codes and tokens. */
  prune(): number;

  listTokens(): readonly OAuthTokenRecord[];
  listClients(): readonly OAuthClientRecord[];
}

function readStoreFile(path: string): OAuthStoreFile {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return { version: 1, clients: [], codes: [], tokens: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Same reasoning as the access store: a corrupt credential file must not
    // silently read as an empty one, which would turn "cannot read" into
    // "nothing is authorized" and quietly invalidate every live grant.
    throw new Error(`oauth store at ${path} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`oauth store at ${path} is not an object`);
  }
  const file = parsed as Partial<OAuthStoreFile>;
  if (file.version !== 1) {
    throw new Error(`oauth store at ${path} has unsupported version ${String(file.version)}`);
  }
  return {
    version: 1,
    clients: Array.isArray(file.clients) ? [...file.clients] : [],
    codes: Array.isArray(file.codes) ? [...file.codes] : [],
    tokens: Array.isArray(file.tokens) ? [...file.tokens] : [],
  };
}

function writeStoreFile(path: string, file: OAuthStoreFile): void {
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

export function oauthStorePath(localDir: string): string {
  return join(localDir, OAUTH_STORE_FILENAME);
}

export function openOAuthStore(path: string): OAuthStore {
  const file = readStoreFile(path);
  let clients = file.clients;
  let codes = file.codes;
  let tokens = file.tokens;
  let loadedMtimeMs = storeMtimeMs(path);

  function flush(): void {
    writeStoreFile(path, { version: 1, clients, codes, tokens });
    loadedMtimeMs = storeMtimeMs(path);
  }

  /** Pick up writes from another process, exactly as the access store does. */
  function reloadIfChanged(): void {
    const current = storeMtimeMs(path);
    if (current === loadedMtimeMs) return;
    const fresh = readStoreFile(path);
    clients = fresh.clients;
    codes = fresh.codes;
    tokens = fresh.tokens;
    loadedMtimeMs = current;
  }

  function prune(): number {
    const now = Date.now();
    const liveCodes = codes.filter((c) => Date.parse(c.expiresAt) > now);
    const liveTokens = tokens.filter((t) => Date.parse(t.expiresAt) > now);
    const dropped = codes.length - liveCodes.length + (tokens.length - liveTokens.length);
    if (dropped > 0) {
      codes = liveCodes;
      tokens = liveTokens;
      flush();
    }
    return dropped;
  }

  prune();

  return {
    upsertClient(record) {
      reloadIfChanged();
      const existing = clients.find((c) => c.clientId === record.clientId);
      const next: OAuthClientRecord = {
        ...record,
        registeredAt: existing?.registeredAt ?? new Date().toISOString(),
      };
      clients = [...clients.filter((c) => c.clientId !== record.clientId), next];
      flush();
      return next;
    },

    getClient(clientId) {
      reloadIfChanged();
      return clients.find((c) => c.clientId === clientId);
    },

    createAuthorizationCode(input) {
      reloadIfChanged();
      prune();
      const code = mintSecret();
      const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS).toISOString();
      codes = [...codes, { ...input, hash: sha256Hex(code), expiresAt }];
      flush();
      return { code, expiresAt };
    },

    redeemAuthorizationCode(code) {
      reloadIfChanged();
      if (!looksLikeOurSecret(code)) return null;
      const hash = sha256Hex(code);
      const found = codes.find((c) => hashesEqual(c.hash, hash));
      if (found === undefined) return null;
      // Remove before checking expiry: a code presented after it expired is
      // still spent, and leaving it behind would let a racing replay find it.
      codes = codes.filter((c) => c !== found);
      flush();
      if (Date.parse(found.expiresAt) <= Date.now()) return null;
      return found;
    },

    issueGrant(input) {
      reloadIfChanged();
      const grantId = input.grantId ?? randomUUID();
      const now = Date.now();
      const accessToken = mintSecret();
      const refreshToken = mintSecret();
      const base = {
        clientId: input.clientId,
        scope: input.scope,
        resource: input.resource,
        principalId: input.principalId,
        principalLabel: input.principalLabel,
        issuedAt: new Date(now).toISOString(),
        grantId,
      };
      tokens = [
        ...tokens,
        {
          ...base,
          id: randomUUID(),
          kind: 'access',
          hash: sha256Hex(accessToken),
          expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
        },
        {
          ...base,
          id: randomUUID(),
          kind: 'refresh',
          hash: sha256Hex(refreshToken),
          expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
        },
      ];
      flush();
      return {
        accessToken,
        refreshToken,
        expiresInSeconds: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        scope: input.scope,
      };
    },

    verifyAccessToken(token) {
      reloadIfChanged();
      if (!looksLikeOurSecret(token)) return null;
      const hash = sha256Hex(token);
      const found = tokens.find((t) => t.kind === 'access' && hashesEqual(t.hash, hash));
      if (found === undefined) return null;
      if (Date.parse(found.expiresAt) <= Date.now()) return null;
      return {
        clientId: found.clientId,
        scope: found.scope,
        resource: found.resource,
        principalId: found.principalId,
        principalLabel: found.principalLabel,
      };
    },

    redeemRefreshToken(token) {
      reloadIfChanged();
      if (!looksLikeOurSecret(token)) return null;
      const hash = sha256Hex(token);
      const found = tokens.find((t) => t.kind === 'refresh' && hashesEqual(t.hash, hash));
      if (found === undefined) return null;
      // Rotation: the whole grant goes, including the access token issued
      // alongside. A refresh token that has already been used therefore finds
      // nothing, which is how replay is detected rather than tolerated.
      tokens = tokens.filter((t) => t.grantId !== found.grantId);
      flush();
      if (Date.parse(found.expiresAt) <= Date.now()) return null;
      return found;
    },

    revokeClientTokens(clientId) {
      reloadIfChanged();
      const next = tokens.filter((t) => t.clientId !== clientId);
      const dropped = tokens.length - next.length;
      if (dropped > 0) {
        tokens = next;
        flush();
      }
      return dropped;
    },

    prune,
    listTokens: () => {
      reloadIfChanged();
      return tokens;
    },
    listClients: () => {
      reloadIfChanged();
      return clients;
    },
  };
}
