/**
 * `/api/auth/session` and the remote-mode admission gate, exercised through
 * the api-extension's own `onRequest` hook.
 *
 * `access-control.test.ts` proves the decision and `access-store.test.ts`
 * proves the credential lifecycle. What is only observable here is the wiring:
 * that a read route stops being reachable without a credential, that the
 * sign-in route stays reachable without one, and that the cookie the exchange
 * mints carries the attributes it has to carry.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { AccessPolicy } from './access-control.ts';
import { SESSION_COOKIE_NAME } from './access-control.ts';
import type { AccessSessionIssuer } from './api-extension.ts';
import { createApiExtension } from './api-extension.ts';

const REMOTE_HOST = 'notes.example.com';
const GOOD_TOKEN = 'snote_good';

const remotePolicy: AccessPolicy = {
  mode: 'remote',
  allowedOrigins: [`https://${REMOTE_HOST}`],
  allowedHosts: [REMOTE_HOST],
  trustedProxy: { hops: 1 },
  verify: (credential) =>
    credential.value === GOOD_TOKEN
      ? { kind: credential.scheme === 'bearer' ? 'bearer' : 'session', id: 'u1', label: 'owner' }
      : null,
};

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function makeReq(
  method: string,
  url: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): IncomingMessage {
  const raw = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const readable = Readable.from(Buffer.from(raw)) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = url;
  readable.headers = { host: REMOTE_HOST, ...opts.headers };
  return readable;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
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
      if (captured.status === 0) captured.status = (this as { statusCode: number }).statusCode;
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

/** Records what the endpoint asked the issuer to do. */
function recordingIssuer(): AccessSessionIssuer & {
  exchanged: string[];
  revoked: string[];
} {
  const exchanged: string[] = [];
  const revoked: string[] = [];
  return {
    exchanged,
    revoked,
    exchangeToken(tokenSecret: string) {
      exchanged.push(tokenSecret);
      if (tokenSecret !== GOOD_TOKEN) return null;
      return {
        secret: 'snote_session_value',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        label: 'owner',
      };
    },
    revokeSessionBySecret(secret: string) {
      revoked.push(secret);
      return secret === 'snote_session_value';
    },
  };
}

function buildExtension(opts: {
  accessPolicy?: AccessPolicy;
  accessSessions?: AccessSessionIssuer;
  projectDir: string;
}) {
  return createApiExtension({
    hocuspocus: {} as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {} as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir: opts.projectDir,
    projectDir: opts.projectDir,
    serverInstanceId: 'test-server',
    getFileIndex: () => new Map(),
    accessPolicy: opts.accessPolicy,
    accessSessions: opts.accessSessions,
  });
}

async function call(
  ext: ReturnType<typeof buildExtension>,
  req: IncomingMessage,
): Promise<CapturedResponse> {
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'ok-auth-session-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseCookie(header: string | undefined): {
  value: string;
  attrs: Set<string>;
  maxAge: string | undefined;
} {
  const parts = (header ?? '').split(';').map((p) => p.trim());
  const first = parts[0] ?? '';
  const eq = first.indexOf('=');
  // Keep each attribute verbatim (`SameSite=Lax`, not `SameSite`) so a test
  // can assert the value and not merely the presence of the flag.
  const attrs = new Set(parts.slice(1));
  const maxAgePart = parts.slice(1).find((p) => p.startsWith('Max-Age='));
  return {
    value: eq >= 0 ? first.slice(eq + 1) : '',
    attrs,
    maxAge: maxAgePart?.slice('Max-Age='.length),
  };
}

describe('the remote-mode admission gate over /api/*', () => {
  test('a read route needs a credential', async () => {
    // The regression this closes: reachability used to be the proof, so read
    // routes carried no gate at all. Under a remote policy that is the whole
    // internet.
    await withTempDir(async (dir) => {
      const ext = buildExtension({ accessPolicy: remotePolicy, projectDir: dir });
      const result = await call(ext, makeReq('GET', '/api/config'));
      expect(result.status).toBe(401);
      expect(JSON.parse(result.body).type).toBe('urn:ok:error:unauthorized');
    });
  });

  test('the same read route serves with a bearer token', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({ accessPolicy: remotePolicy, projectDir: dir });
      const result = await call(
        ext,
        makeReq('GET', '/api/config', { headers: { authorization: `Bearer ${GOOD_TOKEN}` } }),
      );
      expect(result.status).toBe(200);
    });
  });

  test('the same read route serves with a session cookie', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({ accessPolicy: remotePolicy, projectDir: dir });
      const result = await call(
        ext,
        makeReq('GET', '/api/config', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${GOOD_TOKEN}` },
        }),
      );
      expect(result.status).toBe(200);
    });
  });

  test('a local policy leaves the read route open, as it always was', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({ projectDir: dir });
      const result = await call(
        ext,
        makeReq('GET', '/api/config', { headers: { host: 'localhost' } }),
      );
      expect(result.status).toBe(200);
    });
  });
});

describe('POST /api/auth/session', () => {
  test('trades a token for a session cookie', async () => {
    await withTempDir(async (dir) => {
      const issuer = recordingIssuer();
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: issuer,
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', { body: { token: GOOD_TOKEN } }),
      );
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as { label: string; expiresAt: string };
      expect(body.label).toBe('owner');
      expect(body.expiresAt).toBeString();
      expect(issuer.exchanged).toEqual([GOOD_TOKEN]);
    });
  });

  test('is reachable without a credential', async () => {
    // Presenting a credential is what this route is for, so the blanket gate
    // must exempt it — otherwise there is no way to ever sign in.
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', { body: { token: GOOD_TOKEN } }),
      );
      expect(result.status).toBe(200);
    });
  });

  test('the cookie is HttpOnly, SameSite=Lax, and path-scoped', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', { body: { token: GOOD_TOKEN } }),
      );
      const cookie = parseCookie(result.headers['set-cookie']);
      expect(cookie.value).toBe('snote_session_value');
      expect(cookie.attrs.has('HttpOnly')).toBe(true);
      expect(cookie.attrs.has('SameSite=Lax')).toBe(true);
      expect(cookie.attrs.has('Path=/')).toBe(true);
      expect(Number(cookie.maxAge)).toBeGreaterThan(0);
    });
  });

  test('the cookie is Secure when the client reached the proxy over TLS', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', {
          body: { token: GOOD_TOKEN },
          headers: { 'x-forwarded-proto': 'https' },
        }),
      );
      expect(parseCookie(result.headers['set-cookie']).attrs.has('Secure')).toBe(true);
    });
  });

  test('the cookie is not Secure over a plaintext client leg', async () => {
    // A wrong `Secure` mints a cookie the browser silently drops — a sign-in
    // that looks like it worked and never sticks.
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', {
          body: { token: GOOD_TOKEN },
          headers: { 'x-forwarded-proto': 'http' },
        }),
      );
      expect(parseCookie(result.headers['set-cookie']).attrs.has('Secure')).toBe(false);
    });
  });

  test('a rejected token answers 401 and sets no cookie', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', { body: { token: 'snote_wrong' } }),
      );
      expect(result.status).toBe(401);
      expect(JSON.parse(result.body).type).toBe('urn:ok:error:unauthorized');
      expect(result.headers['set-cookie']).toBeUndefined();
    });
  });

  test('a rebound Host is refused before the token is read', async () => {
    // Without this the route would hand a cookie for this origin to whoever
    // could replay a token through a rebound page.
    await withTempDir(async (dir) => {
      const issuer = recordingIssuer();
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: issuer,
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', {
          body: { token: GOOD_TOKEN },
          headers: { host: 'evil.example.com' },
        }),
      );
      expect(result.status).toBe(403);
      expect(JSON.parse(result.body).type).toBe('urn:ok:error:host-not-allowed');
      expect(issuer.exchanged).toEqual([]);
    });
  });

  test('a body missing the token field is a validation failure', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(ext, makeReq('POST', '/api/auth/session', { body: {} }));
      expect(result.status).toBe(400);
    });
  });

  test('GET is not allowed', async () => {
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(ext, makeReq('GET', '/api/auth/session'));
      expect(result.status).toBe(405);
      expect(result.headers.allow).toBe('POST, DELETE');
    });
  });

  test('the route is 404 under a local policy', async () => {
    // Loopback admission needs no credential, so an endpoint that mints one
    // would turn a local foothold into a remote credential.
    await withTempDir(async (dir) => {
      const ext = buildExtension({ projectDir: dir, accessSessions: recordingIssuer() });
      const result = await call(
        ext,
        makeReq('POST', '/api/auth/session', {
          body: { token: GOOD_TOKEN },
          headers: { host: 'localhost' },
        }),
      );
      expect(result.status).toBe(404);
    });
  });
});

describe('DELETE /api/auth/session', () => {
  test('revokes the session the cookie names and clears it', async () => {
    await withTempDir(async (dir) => {
      const issuer = recordingIssuer();
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: issuer,
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('DELETE', '/api/auth/session', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=snote_session_value` },
        }),
      );
      expect(result.status).toBe(204);
      expect(issuer.revoked).toEqual(['snote_session_value']);
      expect(parseCookie(result.headers['set-cookie']).maxAge).toBe('0');
    });
  });

  test('answers 204 and clears even when the cookie named nothing live', async () => {
    // Signing out is not a place to disclose whether the caller's cookie was
    // still valid.
    await withTempDir(async (dir) => {
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: recordingIssuer(),
        projectDir: dir,
      });
      const result = await call(
        ext,
        makeReq('DELETE', '/api/auth/session', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=snote_stale` },
        }),
      );
      expect(result.status).toBe(204);
      expect(parseCookie(result.headers['set-cookie']).maxAge).toBe('0');
    });
  });

  test('answers 204 with no cookie at all', async () => {
    await withTempDir(async (dir) => {
      const issuer = recordingIssuer();
      const ext = buildExtension({
        accessPolicy: remotePolicy,
        accessSessions: issuer,
        projectDir: dir,
      });
      const result = await call(ext, makeReq('DELETE', '/api/auth/session'));
      expect(result.status).toBe(204);
      expect(issuer.revoked).toEqual([]);
    });
  });
});
