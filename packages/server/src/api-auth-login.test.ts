/**
 * The five login routes, exercised through the api-extension's own
 * `onRequest` hook.
 *
 * `password-hash.test.ts`, `login-throttle.test.ts` and `ceremony.test.ts`
 * prove their own logic. What is only observable here is the wiring: which
 * routes are reachable without a credential, that a wrong username and a wrong
 * password are indistinguishable on the wire, and that the throttle sits in
 * front of the password check rather than behind it.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { AccessPolicy } from './access-control.ts';
import { SESSION_COOKIE_NAME } from './access-control.ts';
import type { AccountAuthDeps } from './api-extension.ts';
import {
  AUTH_PASSKEY_AUTH_OPTIONS_ROUTE,
  AUTH_PASSKEY_AUTH_VERIFY_ROUTE,
  AUTH_PASSKEY_REGISTER_OPTIONS_ROUTE,
  AUTH_PASSKEY_REGISTER_VERIFY_ROUTE,
  AUTH_PASSKEYS_ROUTE,
  AUTH_PASSWORD_ROUTE,
  AUTH_SESSION_ROUTE,
  createApiExtension,
  UNAUTHENTICATED_API_ROUTES,
} from './api-extension.ts';
import { accountStorePath, openAccountStore } from './auth/account-store.ts';
import { createLoginThrottle } from './auth/login-throttle.ts';
import { hashPassword } from './auth/password-hash.ts';
import { createChallengeStore, relyingPartyFromOrigin } from './webauthn/ceremony.ts';

const HOST = 'notes.example.com';
const ORIGIN = `https://${HOST}`;
const USERNAME = 'libera3920';
const PASSWORD = 'correct horse battery staple';
/** Deliberately weak scrypt: these tests hash dozens of times. */
const FAST = { N: 1024, r: 8, p: 1, keyLength: 32 } as const;
const SESSION_TOKEN = 'snote_session_value';
/** Three, not ten, so a locked-out case fits in a handful of requests. */
const MAX_FAILURES = 3;

const remotePolicy: AccessPolicy = {
  mode: 'remote',
  allowedOrigins: [ORIGIN],
  allowedHosts: [HOST],
  trustedProxy: { hops: 1 },
  verify: (credential) =>
    credential.value === SESSION_TOKEN ? { kind: 'session', id: 'acct-1', label: USERNAME } : null,
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
  readable.headers = { host: HOST, ...opts.headers };
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

interface Harness {
  call(req: IncomingMessage): Promise<CapturedResponse>;
  /** Account ids handed to `createSession`, one per successful login. */
  readonly minted: string[];
}

/**
 * @param opts.account - false for a remote server that has tokens but no
 *   account, which R29 requires to keep working.
 * @param opts.logins - false for a server with no login wiring at all, which
 *   is how `bootServer` leaves a local policy.
 */
async function withHarness(
  opts: { account?: boolean; logins?: boolean; policy?: AccessPolicy },
  fn: (h: Harness) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'ok-auth-login-'));
  try {
    const store = openAccountStore(accountStorePath(dir));
    if (opts.account !== false) {
      store.create({
        username: USERNAME,
        password: await hashPassword(PASSWORD, FAST),
        webauthnUserId: 'dXNlci1oYW5kbGU',
      });
    }
    const minted: string[] = [];
    const accountAuth: AccountAuthDeps = {
      store,
      challenges: createChallengeStore(),
      throttle: createLoginThrottle({
        maxFailures: MAX_FAILURES,
        windowMs: 60_000,
        lockMs: 120_000,
      }),
      relyingParty: relyingPartyFromOrigin(ORIGIN),
      createSession: (accountId) => {
        minted.push(accountId);
        return {
          secret: 'snote_minted',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      },
    };
    const ext = createApiExtension({
      hocuspocus: {} as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
      sessionManager: {} as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
      contentDir: dir,
      projectDir: dir,
      serverInstanceId: 'test-server',
      getFileIndex: () => new Map(),
      accessPolicy: opts.policy ?? remotePolicy,
      accountAuth: opts.logins === false ? undefined : accountAuth,
    });
    await fn({
      minted,
      async call(req) {
        const { res, captured } = makeRes();
        await (
          ext as {
            onRequest: (ctx: {
              request: IncomingMessage;
              response: ServerResponse;
            }) => Promise<void>;
          }
        ).onRequest({ request: req, response: res });
        return captured;
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function passwordRequest(password: string, username = USERNAME): IncomingMessage {
  return makeReq('POST', AUTH_PASSWORD_ROUTE, { body: { username, password } });
}

/** The problem body minus its per-response correlation id. */
function comparableProblem(body: string): unknown {
  return { ...(JSON.parse(body) as Record<string, unknown>), instance: '<correlation-id>' };
}

describe('the unauthenticated exemption list', () => {
  test('holds only the routes that hand out a credential', () => {
    // Passkey *registration* adds a new way into the account, so it must never
    // be a way of getting in. Same for the passkey list, which names the
    // account's authenticators.
    expect([...UNAUTHENTICATED_API_ROUTES].sort()).toEqual(
      [
        AUTH_SESSION_ROUTE,
        AUTH_PASSWORD_ROUTE,
        AUTH_PASSKEY_AUTH_OPTIONS_ROUTE,
        AUTH_PASSKEY_AUTH_VERIFY_ROUTE,
      ].sort(),
    );
    expect(UNAUTHENTICATED_API_ROUTES.has(AUTH_PASSKEY_REGISTER_OPTIONS_ROUTE)).toBe(false);
    expect(UNAUTHENTICATED_API_ROUTES.has(AUTH_PASSKEY_REGISTER_VERIFY_ROUTE)).toBe(false);
    expect(UNAUTHENTICATED_API_ROUTES.has(AUTH_PASSKEYS_ROUTE)).toBe(false);
  });

  test('password login is reachable without a credential', async () => {
    await withHarness({}, async (h) => {
      expect((await h.call(passwordRequest(PASSWORD))).status).toBe(200);
    });
  });

  test('passkey authentication options are reachable without one', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(makeReq('POST', AUTH_PASSKEY_AUTH_OPTIONS_ROUTE));
      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as { challengeHandle: string };
      expect(body.challengeHandle).toBeString();
    });
  });

  test('every route outside the list is refused without one', async () => {
    await withHarness({}, async (h) => {
      for (const [method, route] of [
        ['POST', AUTH_PASSKEY_REGISTER_OPTIONS_ROUTE],
        ['POST', AUTH_PASSKEY_REGISTER_VERIFY_ROUTE],
        ['GET', AUTH_PASSKEYS_ROUTE],
        ['DELETE', AUTH_PASSKEYS_ROUTE],
      ] as const) {
        const result = await h.call(makeReq(method, route));
        expect({ route, method, status: result.status }).toEqual({ route, method, status: 401 });
      }
    });
  });

  test('registration becomes reachable once signed in', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(
        makeReq('POST', AUTH_PASSKEY_REGISTER_OPTIONS_ROUTE, {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}` },
        }),
      );
      expect(result.status).toBe(200);
    });
  });

  test('the rebinding defense still covers the exempt routes', async () => {
    // Without the Host check, a rebound page could POST here and collect a
    // cookie scoped to this origin.
    await withHarness({}, async (h) => {
      const result = await h.call(
        makeReq('POST', AUTH_PASSWORD_ROUTE, {
          body: { username: USERNAME, password: PASSWORD },
          headers: { host: 'evil.example.com' },
        }),
      );
      expect(result.status).toBe(403);
    });
  });
});

describe('POST /api/auth/password', () => {
  test('the right password mints a session cookie', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(passwordRequest(PASSWORD));
      expect(result.status).toBe(200);
      expect(result.headers['set-cookie']).toContain(`${SESSION_COOKIE_NAME}=snote_minted`);
      expect(result.headers['set-cookie']).toContain('HttpOnly');
      const body = JSON.parse(result.body) as { label: string; expiresAt: string };
      expect(body.label).toBe(USERNAME);
      expect(body.expiresAt).toBeString();
      expect(h.minted).toHaveLength(1);
    });
  });

  test('the username is matched case-insensitively', async () => {
    await withHarness({}, async (h) => {
      expect((await h.call(passwordRequest(PASSWORD, 'LIBERA3920'))).status).toBe(200);
    });
  });

  test('a wrong password and an unknown username are indistinguishable', async () => {
    // Same status, same body. Anything else is an account-enumeration oracle.
    await withHarness({}, async (h) => {
      const wrongPassword = await h.call(passwordRequest('not the password'));
      const unknownUser = await h.call(passwordRequest(PASSWORD, 'someone-else'));
      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(comparableProblem(unknownUser.body)).toEqual(comparableProblem(wrongPassword.body));
    });
  });

  test('a refusal mints nothing and sets no cookie', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(passwordRequest('not the password'));
      expect(result.headers['set-cookie']).toBeUndefined();
      expect(h.minted).toEqual([]);
    });
  });

  test('a malformed body is a validation failure, not a refusal', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(makeReq('POST', AUTH_PASSWORD_ROUTE, { body: { user: 'x' } }));
      expect(result.status).toBe(400);
    });
  });

  test('GET is not allowed', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(makeReq('GET', AUTH_PASSWORD_ROUTE));
      expect(result.status).toBe(405);
      expect(result.headers.allow).toBe('POST');
    });
  });
});

describe('the throttle sits in front of the password check', () => {
  async function exhaust(h: Harness, username = USERNAME): Promise<void> {
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      const result = await h.call(passwordRequest('not the password', username));
      // Every attempt up to and including the one that trips the lock is a
      // plain refusal — the lock only shows on the next request.
      expect(result.status).toBe(401);
    }
  }

  test('the right password is refused inside the lock window', async () => {
    await withHarness({}, async (h) => {
      await exhaust(h);
      const result = await h.call(passwordRequest(PASSWORD));
      expect(result.status).toBe(429);
      expect(result.headers['retry-after']).toBe('120');
      expect(h.minted).toEqual([]);
    });
  });

  test('unknown usernames are throttled too', async () => {
    // Otherwise the endpoint is enumerable through its own rate limit: a name
    // that can be locked exists, one that cannot does not.
    await withHarness({}, async (h) => {
      await exhaust(h, 'someone-else');
      expect((await h.call(passwordRequest(PASSWORD, 'someone-else'))).status).toBe(429);
    });
  });

  test('a successful login clears the count', async () => {
    await withHarness({}, async (h) => {
      await h.call(passwordRequest('not the password'));
      await h.call(passwordRequest('not the password'));
      expect((await h.call(passwordRequest(PASSWORD))).status).toBe(200);
      // Without the clear, these two would be the third and fourth failures in
      // the window and the second would already be locked out.
      expect((await h.call(passwordRequest('not the password'))).status).toBe(401);
      expect((await h.call(passwordRequest('not the password'))).status).toBe(401);
    });
  });

  test('one locked name does not lock the other', async () => {
    await withHarness({}, async (h) => {
      await exhaust(h, 'someone-else');
      expect((await h.call(passwordRequest(PASSWORD))).status).toBe(200);
    });
  });
});

describe('POST /api/auth/passkey/authenticate/verify', () => {
  test('a garbage response is refused the way a wrong password is', async () => {
    await withHarness({}, async (h) => {
      const options = await h.call(makeReq('POST', AUTH_PASSKEY_AUTH_OPTIONS_ROUTE));
      const { challengeHandle } = JSON.parse(options.body) as { challengeHandle: string };
      const result = await h.call(
        makeReq('POST', AUTH_PASSKEY_AUTH_VERIFY_ROUTE, {
          body: {
            challengeHandle,
            response: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key' },
          },
        }),
      );
      expect(result.status).toBe(401);
      expect(h.minted).toEqual([]);
    });
  });

  test('a missing challenge handle is a validation failure', async () => {
    await withHarness({}, async (h) => {
      const result = await h.call(
        makeReq('POST', AUTH_PASSKEY_AUTH_VERIFY_ROUTE, { body: { response: {} } }),
      );
      expect(result.status).toBe(400);
    });
  });
});

describe('when the server does not do logins', () => {
  test('a local policy answers 404 on every login route', async () => {
    // Loopback admission needs no credential, so a login route would turn a
    // local foothold into a remote one.
    await withHarness({ policy: { mode: 'local' }, logins: false }, async (h) => {
      for (const route of [
        AUTH_PASSWORD_ROUTE,
        AUTH_PASSKEY_AUTH_OPTIONS_ROUTE,
        AUTH_PASSKEY_AUTH_VERIFY_ROUTE,
        AUTH_PASSKEY_REGISTER_OPTIONS_ROUTE,
        AUTH_PASSKEY_REGISTER_VERIFY_ROUTE,
        AUTH_PASSKEYS_ROUTE,
      ]) {
        const result = await h.call(
          makeReq('POST', route, {
            body: { username: USERNAME, password: PASSWORD },
            headers: { host: 'localhost' },
          }),
        );
        expect({ route, status: result.status }).toEqual({ route, status: 404 });
      }
    });
  });

  test('a remote server with no account still answers, and refuses', async () => {
    // R29: a deployment that has tokens but never created an account must keep
    // booting and serving. The login route says no rather than crashing.
    await withHarness({ account: false }, async (h) => {
      expect((await h.call(passwordRequest(PASSWORD))).status).toBe(401);
    });
  });
});
