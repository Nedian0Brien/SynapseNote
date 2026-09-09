/**
 * The OAuth surface driven over its own handler with real request and
 * response objects.
 *
 * The pure modules prove the decisions; only these observe the wire — status
 * codes, redirect targets, `Set-Cookie`, and which paths answer without a
 * credential at all.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { AccessPolicy } from '../access-control.ts';
import { SESSION_COOKIE_NAME } from '../access-control.ts';
import type { CimdResolver } from './cimd.ts';
import { createOAuthHttpHandler, safeReturnTo } from './http.ts';
import { deriveCodeChallenge } from './pkce.ts';
import { oauthStorePath, openOAuthStore } from './store.ts';

const ORIGIN = 'https://notes.example.com';
const CIMD_ID = 'https://app.example.com/oauth/client.json';
const REDIRECT = 'https://app.example.com/cb';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = deriveCodeChallenge(VERIFIER);
const OPERATOR_TOKEN = 'snote_operator';
const USERNAME = 'libera3920';
const PASSWORD = 'correct horse battery staple';
/** A username the stub reports as locked out, standing in for the throttle. */
const LOCKED_USERNAME = 'locked-out';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const policy: AccessPolicy = {
  mode: 'remote',
  allowedOrigins: [ORIGIN],
  allowedHosts: ['notes.example.com'],
  trustedProxy: { hops: 1 },
  verify: (credential) =>
    credential.value === OPERATOR_TOKEN
      ? { kind: credential.scheme === 'bearer' ? 'bearer' : 'session', id: 'tok-1', label: 'owner' }
      : null,
};

const cimd: CimdResolver = {
  clearCache: () => {},
  resolve: async (clientId) =>
    clientId === CIMD_ID
      ? {
          ok: true,
          document: { client_id: CIMD_ID, client_name: 'Example', redirect_uris: [REDIRECT] },
        }
      : { ok: false, reason: 'fetch-failed' },
};

function makeHandler(opts: { withSessions?: boolean; secure?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ok-oauth-http-'));
  dirs.push(dir);
  const store = openOAuthStore(oauthStorePath(dir));
  const handler = createOAuthHttpHandler({
    store,
    cimd,
    publicOrigin: ORIGIN,
    accessPolicy: policy,
    isSecureRequest: () => opts.secure ?? true,
    accountLogin:
      opts.withSessions === false
        ? undefined
        : {
            signIn: async (username, password) => {
              if (username === LOCKED_USERNAME) return { ok: false, retryAfterSeconds: 120 };
              return username === USERNAME && password === PASSWORD
                ? {
                    ok: true,
                    secret: 'snote_session_value',
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                  }
                : { ok: false };
            },
          },
  });
  return { handler, store };
}

interface Captured {
  status: number;
  headers: Record<string, string>;
  body: string;
  handled: boolean;
}

async function call(
  handler: ReturnType<typeof makeHandler>['handler'],
  method: string,
  url: string,
  opts: { body?: string; headers?: Record<string, string> } = {},
): Promise<Captured> {
  const req = Readable.from(Buffer.from(opts.body ?? '')) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'notes.example.com', ...opts.headers };
  const captured: Captured = { status: 0, headers: {}, body: '', handled: false };
  const res = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) captured.headers[k.toLowerCase()] = v;
      }
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  captured.handled = await handler.handle(req, res);
  return captured;
}

const authorizeQuery = (overrides: Record<string, string | undefined> = {}) => {
  const params: Record<string, string | undefined> = {
    client_id: CIMD_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    scope: 'synapsenote:workspace',
    state: 'st-1',
    resource: `${ORIGIN}/mcp`,
    ...overrides,
  };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  return `/oauth/authorize?${q}`;
};

describe('discovery documents', () => {
  test('the protected resource metadata is served without a credential', async () => {
    // A client that cannot read this cannot discover where to authorize, so
    // gating it would make the whole flow undiscoverable.
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', '/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resource).toBe(`${ORIGIN}/mcp`);
    expect(body.authorization_servers).toEqual([ORIGIN]);
  });

  test('the authorization server metadata is served without a credential', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', '/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.issuer).toBe(ORIGIN);
    expect(body.client_id_metadata_document_supported).toBe(true);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
  });

  test('discovery documents are cacheable, everything else is not', async () => {
    const { handler } = makeHandler();
    const meta = await call(handler, 'GET', '/.well-known/oauth-protected-resource');
    expect(meta.headers['cache-control']).toContain('max-age');
    const token = await call(handler, 'POST', '/oauth/token', { body: 'grant_type=bogus' });
    expect(token.headers['cache-control']).toBe('no-store');
  });

  test('paths outside the OAuth surface are declined so routing continues', async () => {
    const { handler } = makeHandler();
    expect((await call(handler, 'GET', '/api/config')).handled).toBe(false);
    expect((await call(handler, 'GET', '/')).handled).toBe(false);
  });
});

describe('GET /oauth/authorize', () => {
  test('asks an unauthenticated operator to sign in', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', authorizeQuery());
    expect(res.status).toBe(200);
    expect(res.body).toContain('Sign in to approve');
    expect(res.body).toContain('synapsenote access account create');
  });

  test('shows the consent page to a signed-in operator', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', authorizeQuery(), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain('Approve access');
    expect(res.body).toContain('Example');
    expect(res.body).toContain('Signed in as owner');
  });

  test('refuses an unverifiable client without redirecting anywhere', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', authorizeQuery({ client_id: 'https://evil/x.json' }), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.status).toBe(400);
    expect(res.headers.location).toBeUndefined();
    expect(res.body).toContain('Authorization request refused');
  });

  test('reports a well-formed but rejected request on the redirect, with iss', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', authorizeQuery({ response_type: 'token' }), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location ?? '');
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('error')).toBe('unsupported_response_type');
    expect(location.searchParams.get('iss')).toBe(ORIGIN);
    expect(location.searchParams.get('state')).toBe('st-1');
  });

  test('the consent page refuses to be framed', async () => {
    // A consent screen in someone else's frame is a clickjacked approval.
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', authorizeQuery(), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  test('escapes a hostile client name rather than rendering it', async () => {
    const hostile: CimdResolver = {
      clearCache: () => {},
      resolve: async () => ({
        ok: true,
        document: {
          client_id: CIMD_ID,
          client_name: '<script>alert(1)</script>',
          redirect_uris: [REDIRECT],
        },
      }),
    };
    const dir = mkdtempSync(join(tmpdir(), 'ok-oauth-http-xss-'));
    dirs.push(dir);
    const handler = createOAuthHttpHandler({
      store: openOAuthStore(oauthStorePath(dir)),
      cimd: hostile,
      publicOrigin: ORIGIN,
      accessPolicy: policy,
      isSecureRequest: () => true,
    });
    const res = await call(handler, 'GET', authorizeQuery(), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.body).not.toContain('<script>alert(1)</script>');
    expect(res.body).toContain('&lt;script&gt;');
  });
});

describe('the consent sign-in leg', () => {
  function signin(fields: Record<string, string>): string {
    return new URLSearchParams({ action: 'signin', ...fields }).toString();
  }

  test('the right password sets a session cookie and returns to the request', async () => {
    const { handler } = makeHandler();
    const returnTo = authorizeQuery();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: USERNAME, password: PASSWORD, return_to: returnTo }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(returnTo);
    expect(res.headers['set-cookie']).toContain(`${SESSION_COOKIE_NAME}=snote_session_value`);
    expect(res.headers['set-cookie']).toContain('HttpOnly');
    expect(res.headers['set-cookie']).toContain('Secure');
  });

  test('a wrong password re-renders the form with a refusal', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: USERNAME, password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    expect(res.body).toContain('username and password were not accepted');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('the refusal keeps the username so only the password is retyped', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: USERNAME, password: 'wrong' }),
    });
    expect(res.body).toContain(`value="${USERNAME}"`);
  });

  test('the echoed username cannot inject markup', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: '"><script>alert(1)</script>', password: 'wrong' }),
    });
    expect(res.body).not.toContain('<script>alert(1)</script>');
    expect(res.body).toContain('&lt;script&gt;');
  });

  test('a locked account is told how long to wait', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: LOCKED_USERNAME, password: PASSWORD }),
    });
    expect(res.status).toBe(429);
    expect(res.body).toContain('120 seconds');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('an empty field is refused without reaching the account', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: USERNAME, password: '' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('the form carries no token field', async () => {
    // Pasting a token into a browser is the thing this replaced. Tokens still
    // work as `Authorization: Bearer` for MCP and the CLI.
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', authorizeQuery());
    expect(res.body).toContain('name="password"');
    expect(res.body).not.toContain('name="token"');
    expect(res.body).not.toContain('snote_');
  });

  test('omits Secure over a plaintext client leg', async () => {
    const { handler } = makeHandler({ secure: false });
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: signin({ username: USERNAME, password: PASSWORD }),
    });
    expect(res.headers['set-cookie']).not.toContain('Secure');
  });
});

describe('safeReturnTo', () => {
  test('keeps an authorization request', () => {
    expect(safeReturnTo('/oauth/authorize?client_id=x')).toBe('/oauth/authorize?client_id=x');
  });

  test('refuses anywhere else', () => {
    // The field is attacker-supplied, and this leg sets a session cookie
    // immediately before redirecting.
    expect(safeReturnTo('https://evil.example/steal')).toBe('/oauth/authorize');
    expect(safeReturnTo('//evil.example/steal')).toBe('/oauth/authorize');
    expect(safeReturnTo('/oauth/authorize?a=1//evil.example')).toBe('/oauth/authorize');
    expect(safeReturnTo('/api/config')).toBe('/oauth/authorize');
    expect(safeReturnTo(null)).toBe('/oauth/authorize');
  });
});

describe('POST /oauth/authorize — approval', () => {
  const approvalBody = (decision: string) =>
    new URLSearchParams({
      action: 'approve',
      decision,
      client_id: CIMD_ID,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      scope: 'synapsenote:workspace',
      resource: `${ORIGIN}/mcp`,
      state: 'st-1',
    }).toString();

  test('allow redirects with a code, the state, and iss', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: approvalBody('allow'),
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location ?? '');
    expect(location.searchParams.get('code')).toMatch(/^snote_/);
    expect(location.searchParams.get('state')).toBe('st-1');
    expect(location.searchParams.get('iss')).toBe(ORIGIN);
  });

  test('deny redirects with access_denied and no code', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: approvalBody('deny'),
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    const location = new URL(res.headers.location ?? '');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.has('code')).toBe(false);
  });

  test('an unauthenticated approval mints nothing', async () => {
    // The posted fields are just a form; without an operator behind them
    // there is no approval to record.
    const { handler, store } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/authorize', { body: approvalBody('allow') });
    expect(res.status).toBe(401);
    expect(res.headers.location).toBeUndefined();
    expect(store.listTokens()).toHaveLength(0);
  });

  test('a tampered redirect_uri is refused even with a valid session', async () => {
    // Every check from the GET runs again on the POST; the form is not a
    // token that says "already approved".
    const { handler } = makeHandler();
    const body = new URLSearchParams(approvalBody('allow'));
    body.set('redirect_uri', 'https://evil.example/steal');
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: body.toString(),
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    expect(res.status).toBe(400);
    expect(res.headers.location).toBeUndefined();
  });
});

describe('POST /oauth/token', () => {
  async function codeFor(handler: ReturnType<typeof makeHandler>['handler']) {
    const res = await call(handler, 'POST', '/oauth/authorize', {
      body: new URLSearchParams({
        action: 'approve',
        decision: 'allow',
        client_id: CIMD_ID,
        redirect_uri: REDIRECT,
        response_type: 'code',
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
        scope: 'synapsenote:workspace',
        resource: `${ORIGIN}/mcp`,
      }).toString(),
      headers: { cookie: `${SESSION_COOKIE_NAME}=${OPERATOR_TOKEN}` },
    });
    return new URL(res.headers.location ?? '').searchParams.get('code') ?? '';
  }

  test('exchanges a code for a bearer token without any credential of its own', async () => {
    // PKCE is what protects this endpoint; requiring a credential would make
    // it unreachable for the public clients the metadata advertises.
    const { handler, store } = makeHandler();
    const code = await codeFor(handler);
    const res = await call(handler, 'POST', '/oauth/token', {
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id: CIMD_ID,
        code_verifier: VERIFIER,
        resource: `${ORIGIN}/mcp`,
      }).toString(),
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token_type).toBe('Bearer');
    expect(store.verifyAccessToken(body.access_token)).toMatchObject({ principalId: 'tok-1' });
  });

  test('a wrong verifier is an invalid_grant', async () => {
    const { handler } = makeHandler();
    const code = await codeFor(handler);
    const res = await call(handler, 'POST', '/oauth/token', {
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: 'b'.repeat(43),
      }).toString(),
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_grant');
  });

  test('GET is refused', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'GET', '/oauth/token');
    expect(res.status).toBe(405);
  });
});

describe('POST /oauth/register', () => {
  test('registers a client and returns its id', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/register', {
      body: JSON.stringify({ redirect_uris: ['https://c.example/cb'], client_name: 'Legacy' }),
    });
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.client_id).toMatch(/^dcr_/);
    expect(body.token_endpoint_auth_method).toBe('none');
  });

  test('refuses a body that is not JSON', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/register', { body: 'redirect_uris=x' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_client_metadata');
  });

  test('refuses a plain-http redirect on a remote host', async () => {
    const { handler } = makeHandler();
    const res = await call(handler, 'POST', '/oauth/register', {
      body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }),
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_redirect_uri');
  });
});
