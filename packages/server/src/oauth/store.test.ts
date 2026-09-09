import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { oauthStorePath, openOAuthStore } from './store.ts';

const dirs: string[] = [];

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-oauth-store-'));
  dirs.push(dir);
  return dir;
}

function freshStore() {
  const dir = freshDir();
  return { store: openOAuthStore(oauthStorePath(dir)), path: oauthStorePath(dir), dir };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CODE_INPUT = {
  clientId: 'https://client.example/meta.json',
  redirectUri: 'https://client.example/cb',
  codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  scope: 'synapsenote:workspace',
  resource: 'https://notes.example.com/mcp',
  principalId: 'tok-1',
  principalLabel: 'owner',
};

describe('clients', () => {
  test('registers and reads back a client', () => {
    const { store } = freshStore();
    const record = store.upsertClient({
      clientId: 'https://client.example/meta.json',
      clientName: 'Example',
      redirectUris: ['https://client.example/cb'],
      source: 'cimd',
    });
    expect(record.registeredAt).toBeString();
    expect(store.getClient('https://client.example/meta.json')?.clientName).toBe('Example');
  });

  test('re-registering keeps the original registration time', () => {
    const { store } = freshStore();
    const first = store.upsertClient({
      clientId: 'c',
      clientName: 'One',
      redirectUris: ['https://a/cb'],
      source: 'cimd',
    });
    const second = store.upsertClient({
      clientId: 'c',
      clientName: 'Two',
      redirectUris: ['https://b/cb'],
      source: 'cimd',
    });
    expect(second.registeredAt).toBe(first.registeredAt);
    expect(second.clientName).toBe('Two');
    expect(store.listClients()).toHaveLength(1);
  });
});

describe('authorization codes', () => {
  test('a minted code redeems once and carries its record', () => {
    const { store } = freshStore();
    const { code } = store.createAuthorizationCode(CODE_INPUT);
    const record = store.redeemAuthorizationCode(code);
    expect(record).toMatchObject({ clientId: CODE_INPUT.clientId, scope: CODE_INPUT.scope });
  });

  test('a replayed code finds nothing', () => {
    // OAuth 2.1 requires single use. The record is deleted on redemption, so
    // a replay cannot even observe that the code once existed.
    const { store } = freshStore();
    const { code } = store.createAuthorizationCode(CODE_INPUT);
    expect(store.redeemAuthorizationCode(code)).not.toBeNull();
    expect(store.redeemAuthorizationCode(code)).toBeNull();
  });

  test('the plaintext code is never written to disk', () => {
    const { store, path } = freshStore();
    const { code } = store.createAuthorizationCode(CODE_INPUT);
    expect(readFileSync(path, 'utf-8')).not.toContain(code);
  });

  test('an unknown or foreign-shaped code is refused', () => {
    const { store } = freshStore();
    store.createAuthorizationCode(CODE_INPUT);
    expect(store.redeemAuthorizationCode('snote_nope')).toBeNull();
    expect(store.redeemAuthorizationCode('not-ours')).toBeNull();
  });

  test('the store file is owner-only', () => {
    const { store, path } = freshStore();
    store.createAuthorizationCode(CODE_INPUT);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

describe('tokens', () => {
  test('an issued access token verifies with its audience and principal', () => {
    const { store } = freshStore();
    const grant = store.issueGrant({
      clientId: 'c',
      scope: 'synapsenote:workspace',
      resource: 'https://notes.example.com/mcp',
      principalId: 'tok-1',
      principalLabel: 'owner',
    });
    expect(store.verifyAccessToken(grant.accessToken)).toEqual({
      clientId: 'c',
      scope: 'synapsenote:workspace',
      resource: 'https://notes.example.com/mcp',
      principalId: 'tok-1',
      principalLabel: 'owner',
    });
  });

  test('a refresh token is not accepted as an access token', () => {
    const { store } = freshStore();
    const grant = store.issueGrant({
      clientId: 'c',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    expect(store.verifyAccessToken(grant.refreshToken)).toBeNull();
  });

  test('refreshing retires the whole previous grant', () => {
    // Rotation: the old access token stops working the moment its refresh
    // token is spent, so a stolen pair cannot outlive the legitimate client.
    const { store } = freshStore();
    const first = store.issueGrant({
      clientId: 'c',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    const record = store.redeemRefreshToken(first.refreshToken);
    expect(record).not.toBeNull();
    expect(store.verifyAccessToken(first.accessToken)).toBeNull();
    expect(store.redeemRefreshToken(first.refreshToken)).toBeNull();
  });

  test('a rotated grant issues a working pair', () => {
    const { store } = freshStore();
    const first = store.issueGrant({
      clientId: 'c',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    const record = store.redeemRefreshToken(first.refreshToken);
    expect(record).not.toBeNull();
    if (record === null) return;
    const second = store.issueGrant({
      clientId: record.clientId,
      scope: record.scope,
      resource: record.resource,
      principalId: record.principalId,
      principalLabel: record.principalLabel,
    });
    expect(store.verifyAccessToken(second.accessToken)).not.toBeNull();
  });

  test('revoking a client drops its tokens', () => {
    const { store } = freshStore();
    const mine = store.issueGrant({
      clientId: 'mine',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    const other = store.issueGrant({
      clientId: 'other',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    expect(store.revokeClientTokens('mine')).toBe(2);
    expect(store.verifyAccessToken(mine.accessToken)).toBeNull();
    expect(store.verifyAccessToken(other.accessToken)).not.toBeNull();
  });

  test('tokens survive a reopen', () => {
    const dir = freshDir();
    const path = oauthStorePath(dir);
    const grant = openOAuthStore(path).issueGrant({
      clientId: 'c',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    expect(openOAuthStore(path).verifyAccessToken(grant.accessToken)).not.toBeNull();
  });

  test('a grant issued elsewhere is honored without reopening', async () => {
    // The CLI and a second server process write the same file; a long-running
    // verifier must not answer from a snapshot taken at boot.
    const dir = freshDir();
    const path = oauthStorePath(dir);
    const verifier = openOAuthStore(path);
    verifier.issueGrant({
      clientId: 'c',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    await Bun.sleep(10);
    const elsewhere = openOAuthStore(path).issueGrant({
      clientId: 'c2',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    expect(verifier.verifyAccessToken(elsewhere.accessToken)).not.toBeNull();
  });
});

describe('store file handling', () => {
  test('an absent file opens empty', () => {
    const { store } = freshStore();
    expect(store.listClients()).toEqual([]);
    expect(store.listTokens()).toEqual([]);
  });

  test('corrupt JSON fails loudly rather than reading as empty', () => {
    const dir = freshDir();
    const path = oauthStorePath(dir);
    writeFileSync(path, '{ not json');
    expect(() => openOAuthStore(path)).toThrow('is not valid JSON');
  });

  test('an unsupported version fails loudly', () => {
    const dir = freshDir();
    const path = oauthStorePath(dir);
    writeFileSync(path, JSON.stringify({ version: 7, clients: [], codes: [], tokens: [] }));
    expect(() => openOAuthStore(path)).toThrow('unsupported version 7');
  });
});
