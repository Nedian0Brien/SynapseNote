import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CimdResolver } from './cimd.ts';
import {
  type AuthorizeRequest,
  approveAuthorization,
  buildRedirect,
  evaluateAuthorizeRequest,
  handleRegistrationRequest,
  handleTokenRequest,
  resourceMatches,
  type TokenRequest,
} from './endpoints.ts';
import { deriveCodeChallenge } from './pkce.ts';
import { oauthStorePath, openOAuthStore } from './store.ts';

const RESOURCE = 'https://notes.example.com/mcp';
const ISSUER = 'https://notes.example.com';
const CIMD_ID = 'https://app.example.com/oauth/client.json';
const REDIRECT = 'https://app.example.com/cb';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = deriveCodeChallenge(VERIFIER);

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'ok-oauth-endpoints-'));
  dirs.push(dir);
  return openOAuthStore(oauthStorePath(dir));
}

/** A resolver that answers from a fixed table, so no network is involved. */
function fakeCimd(
  table: Record<string, { client_name: string; redirect_uris: string[] } | 'fail'>,
): CimdResolver {
  return {
    clearCache: () => {},
    resolve: async (clientId: string) => {
      const entry = table[clientId];
      if (entry === undefined || entry === 'fail') {
        return { ok: false, reason: 'fetch-failed' } as const;
      }
      return {
        ok: true,
        document: {
          client_id: clientId,
          client_name: entry.client_name,
          redirect_uris: entry.redirect_uris,
        },
      } as const;
    },
  };
}

function deps(overrides: { cimd?: CimdResolver } = {}) {
  return {
    store: freshStore(),
    cimd:
      overrides.cimd ??
      fakeCimd({ [CIMD_ID]: { client_name: 'Example', redirect_uris: [REDIRECT] } }),
    resourceIdentifier: RESOURCE,
  };
}

function authorizeRequest(overrides: Partial<AuthorizeRequest> = {}): AuthorizeRequest {
  return {
    clientId: CIMD_ID,
    redirectUri: REDIRECT,
    responseType: 'code',
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    scope: 'synapsenote:workspace',
    state: 'st-1',
    resource: RESOURCE,
    ...overrides,
  };
}

describe('evaluateAuthorizeRequest — the happy path', () => {
  test('resolves a CIMD client and asks for consent', async () => {
    const decision = await evaluateAuthorizeRequest(authorizeRequest(), deps());
    expect(decision).toMatchObject({
      kind: 'consent',
      clientId: CIMD_ID,
      clientName: 'Example',
      redirectUri: REDIRECT,
      scope: 'synapsenote:workspace',
      resource: RESOURCE,
      state: 'st-1',
    });
  });

  test('records the resolved client so the token exchange can find it', async () => {
    const d = deps();
    await evaluateAuthorizeRequest(authorizeRequest(), d);
    expect(d.store.getClient(CIMD_ID)?.source).toBe('cimd');
  });

  test('defaults the scope when the client omits it', async () => {
    const decision = await evaluateAuthorizeRequest(authorizeRequest({ scope: undefined }), deps());
    expect(decision).toMatchObject({ kind: 'consent', scope: 'synapsenote:workspace' });
  });

  test('accepts an omitted redirect_uri when the client registered exactly one', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ redirectUri: undefined }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'consent', redirectUri: REDIRECT });
  });

  test('accepts the origin as the resource, not only the full endpoint', async () => {
    const decision = await evaluateAuthorizeRequest(authorizeRequest({ resource: ISSUER }), deps());
    expect(decision).toMatchObject({ kind: 'consent' });
  });
});

describe('evaluateAuthorizeRequest — refusals that must not redirect', () => {
  test('a missing client_id is shown to the user', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ clientId: undefined }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'refuse', error: 'invalid_request' });
  });

  test('an unresolvable CIMD document is shown to the user', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest(),
      deps({ cimd: fakeCimd({ [CIMD_ID]: 'fail' }) }),
    );
    expect(decision).toMatchObject({ kind: 'refuse', error: 'invalid_client' });
  });

  test('an unknown opaque client_id is shown to the user', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ clientId: 'never-registered' }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'refuse', error: 'invalid_client' });
  });

  test('an unregistered redirect_uri is shown to the user, never redirected to', async () => {
    // Redirecting the error here would make this endpoint an open redirector
    // that reports to whoever asked.
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ redirectUri: 'https://evil.example/steal' }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'refuse', error: 'invalid_request' });
  });

  test('a redirect_uri that only shares a prefix is refused', async () => {
    // Exact match only. Prefix matching is how allowlists become redirectors.
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ redirectUri: `${REDIRECT}.evil.example` }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'refuse' });
  });

  test('an omitted redirect_uri with several registered is refused', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ redirectUri: undefined }),
      deps({
        cimd: fakeCimd({
          [CIMD_ID]: {
            client_name: 'Example',
            redirect_uris: [REDIRECT, 'https://app.example.com/cb2'],
          },
        }),
      }),
    );
    expect(decision).toMatchObject({ kind: 'refuse', error: 'invalid_request' });
  });
});

describe('evaluateAuthorizeRequest — errors reported on the redirect', () => {
  test('an unsupported response_type', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ responseType: 'token' }),
      deps(),
    );
    expect(decision).toMatchObject({
      kind: 'redirect-error',
      error: 'unsupported_response_type',
      redirectUri: REDIRECT,
      state: 'st-1',
    });
  });

  test('a missing code_challenge', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ codeChallenge: undefined }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'redirect-error', error: 'invalid_request' });
  });

  test('the plain challenge method', async () => {
    // OAuth 2.1 allows only S256 here; `plain` is PKCE in name only.
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ codeChallengeMethod: 'plain' }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'redirect-error', error: 'invalid_request' });
  });

  test('a resource naming a different server', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ resource: 'https://someone-else.example/mcp' }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'redirect-error', error: 'invalid_target' });
  });

  test('an unsupported scope', async () => {
    const decision = await evaluateAuthorizeRequest(
      authorizeRequest({ scope: 'admin:everything' }),
      deps(),
    );
    expect(decision).toMatchObject({ kind: 'redirect-error', error: 'invalid_scope' });
  });
});

describe('resourceMatches', () => {
  test('ignores a trailing slash and case in the scheme and host', () => {
    expect(resourceMatches('https://notes.example.com/mcp/', RESOURCE)).toBe(true);
    expect(resourceMatches('HTTPS://NOTES.EXAMPLE.COM/mcp', RESOURCE)).toBe(true);
  });

  test('accepts the bare origin', () => {
    expect(resourceMatches(ISSUER, RESOURCE)).toBe(true);
  });

  test('rejects another server and another path', () => {
    expect(resourceMatches('https://elsewhere.example/mcp', RESOURCE)).toBe(false);
    expect(resourceMatches('https://notes.example.com/admin', RESOURCE)).toBe(false);
  });
});

describe('buildRedirect', () => {
  test('carries the code, the state, and the issuer', () => {
    const url = new URL(buildRedirect(REDIRECT, { code: 'c1', state: 's1' }, ISSUER));
    expect(url.searchParams.get('code')).toBe('c1');
    expect(url.searchParams.get('state')).toBe('s1');
    expect(url.searchParams.get('iss')).toBe(ISSUER);
  });

  test('omits absent parameters rather than sending empty ones', () => {
    const url = new URL(buildRedirect(REDIRECT, { code: 'c1', state: undefined }));
    expect(url.searchParams.has('state')).toBe(false);
  });

  test('preserves query already on the registered redirect', () => {
    const url = new URL(buildRedirect('https://app.example.com/cb?tenant=a', { code: 'c1' }));
    expect(url.searchParams.get('tenant')).toBe('a');
    expect(url.searchParams.get('code')).toBe('c1');
  });
});

describe('the full code-for-token exchange', () => {
  async function approvedCode(d = deps()) {
    const decision = await evaluateAuthorizeRequest(authorizeRequest(), d);
    if (decision.kind !== 'consent') throw new Error('expected consent');
    const { redirectTo } = approveAuthorization(decision, { id: 'tok-1', label: 'owner' }, d);
    const code = new URL(redirectTo).searchParams.get('code');
    if (code === null) throw new Error('no code');
    return { d, code, redirectTo };
  }

  function tokenRequest(overrides: Partial<TokenRequest> = {}): TokenRequest {
    return {
      grantType: 'authorization_code',
      code: undefined,
      redirectUri: REDIRECT,
      clientId: CIMD_ID,
      codeVerifier: VERIFIER,
      refreshToken: undefined,
      resource: RESOURCE,
      ...overrides,
    };
  }

  test('exchanges a fresh code for a usable access token', async () => {
    const { d, code } = await approvedCode();
    const result = handleTokenRequest(tokenRequest({ code }), d);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.token_type).toBe('Bearer');
    expect(result.body.expires_in).toBeGreaterThan(0);
    expect(d.store.verifyAccessToken(result.body.access_token)).toMatchObject({
      clientId: CIMD_ID,
      resource: RESOURCE,
      principalId: 'tok-1',
    });
  });

  test('the redirect carries the state the client sent', async () => {
    const { redirectTo } = await approvedCode();
    expect(new URL(redirectTo).searchParams.get('state')).toBe('st-1');
  });

  test('a replayed code is refused', async () => {
    const { d, code } = await approvedCode();
    expect(handleTokenRequest(tokenRequest({ code }), d).ok).toBe(true);
    expect(handleTokenRequest(tokenRequest({ code }), d)).toMatchObject({
      ok: false,
      error: 'invalid_grant',
    });
  });

  test('a wrong code_verifier is refused', async () => {
    const { d, code } = await approvedCode();
    expect(
      handleTokenRequest(tokenRequest({ code, codeVerifier: 'b'.repeat(43) }), d),
    ).toMatchObject({
      ok: false,
      error: 'invalid_grant',
    });
  });

  test('a wrong verifier still spends the code', async () => {
    // A code that has been presented once must not be presentable again,
    // whatever went wrong afterwards.
    const { d, code } = await approvedCode();
    handleTokenRequest(tokenRequest({ code, codeVerifier: 'b'.repeat(43) }), d);
    expect(handleTokenRequest(tokenRequest({ code }), d)).toMatchObject({ ok: false });
  });

  test('a missing code_verifier is refused', async () => {
    const { d, code } = await approvedCode();
    expect(handleTokenRequest(tokenRequest({ code, codeVerifier: undefined }), d)).toMatchObject({
      ok: false,
      error: 'invalid_grant',
    });
  });

  test('a mismatched client_id is refused', async () => {
    const { d, code } = await approvedCode();
    expect(handleTokenRequest(tokenRequest({ code, clientId: 'someone-else' }), d)).toMatchObject({
      ok: false,
      error: 'invalid_grant',
    });
  });

  test('a mismatched redirect_uri is refused', async () => {
    const { d, code } = await approvedCode();
    expect(
      handleTokenRequest(tokenRequest({ code, redirectUri: 'https://evil.example/cb' }), d),
    ).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  test('a mismatched resource is refused', async () => {
    const { d, code } = await approvedCode();
    expect(
      handleTokenRequest(tokenRequest({ code, resource: 'https://elsewhere.example/mcp' }), d),
    ).toMatchObject({ ok: false, error: 'invalid_target' });
  });

  test('an unknown grant_type is refused', async () => {
    const d = deps();
    expect(handleTokenRequest(tokenRequest({ grantType: 'password' }), d)).toMatchObject({
      ok: false,
      error: 'unsupported_grant_type',
    });
  });
});

describe('refresh', () => {
  test('rotates the grant and invalidates the previous access token', async () => {
    const d = deps();
    const grant = d.store.issueGrant({
      clientId: CIMD_ID,
      scope: 'synapsenote:workspace',
      resource: RESOURCE,
      principalId: 'tok-1',
      principalLabel: 'owner',
    });
    const result = handleTokenRequest(
      {
        grantType: 'refresh_token',
        code: undefined,
        redirectUri: undefined,
        clientId: CIMD_ID,
        codeVerifier: undefined,
        refreshToken: grant.refreshToken,
        resource: undefined,
      },
      d,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(d.store.verifyAccessToken(grant.accessToken)).toBeNull();
    expect(d.store.verifyAccessToken(result.body.access_token)).not.toBeNull();
  });

  test('a replayed refresh token is refused', async () => {
    const d = deps();
    const grant = d.store.issueGrant({
      clientId: CIMD_ID,
      scope: 's',
      resource: RESOURCE,
      principalId: 'p',
      principalLabel: 'l',
    });
    const req = {
      grantType: 'refresh_token' as const,
      code: undefined,
      redirectUri: undefined,
      clientId: CIMD_ID,
      codeVerifier: undefined,
      refreshToken: grant.refreshToken,
      resource: undefined,
    };
    expect(handleTokenRequest(req, d).ok).toBe(true);
    expect(handleTokenRequest(req, d)).toMatchObject({ ok: false, error: 'invalid_grant' });
  });
});

describe('dynamic client registration', () => {
  test('registers a client and returns a usable id', () => {
    const d = deps();
    const result = handleRegistrationRequest(
      { redirectUris: ['https://client.example/cb'], clientName: 'Legacy client' },
      d,
      () => 'dcr-1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.client_id).toBe('dcr-1');
    expect(result.body.token_endpoint_auth_method).toBe('none');
    expect(d.store.getClient('dcr-1')?.source).toBe('dcr');
  });

  test('accepts http on loopback, the native-app pattern', () => {
    const result = handleRegistrationRequest(
      { redirectUris: ['http://127.0.0.1:3000/cb'], clientName: 'CLI' },
      deps(),
      () => 'dcr-2',
    );
    expect(result.ok).toBe(true);
  });

  test('refuses plain http on a remote host', () => {
    const result = handleRegistrationRequest(
      { redirectUris: ['http://evil.example/cb'], clientName: 'x' },
      deps(),
      () => 'dcr-3',
    );
    expect(result).toMatchObject({ ok: false, error: 'invalid_redirect_uri' });
  });

  test('refuses a missing or empty redirect_uris', () => {
    for (const uris of [undefined, [], 'https://a/cb', [1]]) {
      expect(
        handleRegistrationRequest({ redirectUris: uris, clientName: 'x' }, deps(), () => 'dcr'),
      ).toMatchObject({ ok: false });
    }
  });

  test('names an unnamed client rather than storing an empty label', () => {
    const result = handleRegistrationRequest(
      { redirectUris: ['https://client.example/cb'], clientName: undefined },
      deps(),
      () => 'dcr-4',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.client_name).toBe('Unnamed client');
  });
});
