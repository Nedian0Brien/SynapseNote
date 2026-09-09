/**
 * The sync endpoints under a remote policy, driven through the api-extension's
 * own `onRequest` hook.
 *
 * `local-op-security.remote.test.ts` proves the gate's decision in isolation.
 * What is only observable here is that these five routes are wired to it with
 * the rule they were meant to get — and, just as importantly, that the other
 * twenty-three were not.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { AccessPolicy, AccessPrincipal } from './access-control.ts';
import { SESSION_COOKIE_NAME } from './access-control.ts';
import { createApiExtension } from './api-extension.ts';

const HOST = 'notes.example.com';
const ORIGIN = `https://${HOST}`;

/** Cookie values the stub policy recognises, one per principal kind. */
const ACCOUNT_COOKIE = 'snote_account_session';
const TOKEN_COOKIE = 'snote_token_session';
const BEARER = 'snote_bearer_token';

const remotePolicy: AccessPolicy = {
  mode: 'remote',
  allowedOrigins: [ORIGIN],
  allowedHosts: [HOST],
  trustedProxy: { hops: 1 },
  verify: (credential): Omit<AccessPrincipal, 'clientAddress'> | null => {
    if (credential.scheme === 'bearer' && credential.value === BEARER) {
      return { kind: 'bearer', id: 'tok-1', label: 'chatgpt' };
    }
    if (credential.scheme === 'session' && credential.value === ACCOUNT_COOKIE) {
      return { kind: 'account-session', id: 'acct-1', label: 'libera3920' };
    }
    if (credential.scheme === 'session' && credential.value === TOKEN_COOKIE) {
      return { kind: 'session', id: 'tok-1', label: 'chatgpt' };
    }
    return null;
  },
};

interface Captured {
  status: number;
  type: string | undefined;
}

function makeReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  const readable = Readable.from(Buffer.from('{}')) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = url;
  readable.headers = { host: HOST, 'content-type': 'application/json', ...headers };
  return readable;
}

/**
 * `headersSent` and `writableEnded` have to flip, not just exist.
 *
 * `withValidation` treats a gate that returned false without writing as a
 * programming error and emits a 500. A mock that never reports the write turns
 * every refusal in this file into that 500, which looks exactly like a product
 * bug and is not one.
 */
function makeRes(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, type: undefined };
  const res = {
    statusCode: 0,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    setHeader() {},
    // The GitHub-read handlers spawn a CLI subprocess and register a
    // `close` listener so they can kill it if the client disappears. A mock
    // without `on` crashes them after the gate has already said yes, which
    // reads as a gate failure and is not one.
    on() {
      return this;
    },
    once() {
      return this;
    },
    removeListener() {
      return this;
    },
    writeHead(status: number) {
      captured.status = status;
      (this as { headersSent: boolean }).headersSent = true;
    },
    end(body?: string) {
      if (captured.status === 0) captured.status = (this as { statusCode: number }).statusCode;
      (this as { headersSent: boolean; writableEnded: boolean }).headersSent = true;
      (this as { writableEnded: boolean }).writableEnded = true;
      if (typeof body === 'string' && body.startsWith('{')) {
        try {
          captured.type = (JSON.parse(body) as { type?: string }).type;
        } catch {
          // Not problem+json; the status alone is what these tests read.
        }
      }
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

type Credential = 'account' | 'token-session' | 'bearer' | 'none';

function headersFor(who: Credential): Record<string, string> {
  switch (who) {
    case 'account':
      return { cookie: `${SESSION_COOKIE_NAME}=${ACCOUNT_COOKIE}` };
    case 'token-session':
      return { cookie: `${SESSION_COOKIE_NAME}=${TOKEN_COOKIE}` };
    case 'bearer':
      return { authorization: `Bearer ${BEARER}` };
    case 'none':
      return {};
  }
}

const dirs: string[] = [];

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'ok-sync-remote-'));
  dirs.push(dir);
  const ext = createApiExtension({
    hocuspocus: {} as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {} as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir: dir,
    projectDir: dir,
    serverInstanceId: 'test-server',
    getFileIndex: () => new Map(),
    accessPolicy: remotePolicy,
  });
  return async (method: string, url: string, who: Credential): Promise<Captured> => {
    const { res, captured } = makeRes();
    await (
      ext as {
        onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
      }
    ).onRequest({ request: makeReq(method, url, headersFor(who)), response: res });
    return captured;
  };
}

function cleanup() {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Sync — opened by P2, with the method the app actually uses. */
const OPENED: ReadonlyArray<readonly [string, string]> = [
  ['GET', '/api/sync/status'],
  ['GET', '/api/sync/conflicts'],
  ['POST', '/api/sync/trigger'],
  ['POST', '/api/sync/resolve-conflict'],
  ['POST', '/api/sync/conflict-content'],
];

/**
 * GitHub reads — opened by P4.
 *
 * On the deployed container these answer "not connected", because the CLI's
 * credential lives on a tmpfs `$HOME` and the only route that writes it stays
 * desktop-only. That honest answer is the point: it is what lets the settings
 * panel say why, instead of rendering a failed check.
 */
const OPENED_P4: ReadonlyArray<readonly [string, string]> = [
  ['POST', '/api/local-op/auth/status'],
  ['POST', '/api/local-op/auth/repos'],
];

/** Project setup — opened by P3. Everything here stays inside the workspace. */
const OPENED_P3: ReadonlyArray<readonly [string, string]> = [
  ['GET', '/api/seed/packs'],
  ['GET', '/api/seed/plan'],
  ['POST', '/api/seed/apply'],
  // `/api/install-skill`, not `/api/skill/install` — the latter is a different
  // handler that was never behind this gate.
  ['POST', '/api/install-skill'],
  ['GET', '/api/skill/install-state'],
  ['GET', '/api/installed-agents'],
  ['POST', '/api/client-logs'],
];

/**
 * What is still closed, and why each one is here rather than opened.
 *
 * The `share/*` entries are the ones worth watching: they were slated for P3
 * and taken back out. The deployed container's `$HOME` is tmpfs, so the CLI's
 * GitHub credential never survives a restart, and the only route that writes
 * it is desktop-only. Publishing would fail at the push.
 */
const STILL_CLOSED: ReadonlyArray<readonly [string, string]> = [
  ['POST', '/api/handoff'],
  ['POST', '/api/spawn-cursor'],
  ['POST', '/api/local-op/auth/login'],
  ['POST', '/api/local-op/auth/signout'],
  ['POST', '/api/local-op/auth/set-identity'],
  ['POST', '/api/local-op/clone'],
  ['POST', '/api/local-op/ok-init'],
  ['POST', '/api/local-op/embeddings/set-key'],
  ['POST', '/api/local-op/embeddings/clear-key'],
  ['POST', '/api/share/publish'],
  ['POST', '/api/share/construct-url'],
  ['POST', '/api/share/target-status'],
];

describe('what an account session may do', () => {
  test('reaches every sync route', async () => {
    // The gate's answer is what is under test, and the harness has no sync
    // engine, so these routes answer 503 `sync-not-active` or 400 for the
    // empty body. Both mean the request got past the gate, which is the whole
    // claim. Asserting a 200 here would be asserting the sync engine's
    // behaviour, which has its own tests.
    const call = build();
    for (const [method, url] of OPENED) {
      const result = await call(method, url, 'account');
      expect({ url, refused: result.type === 'urn:ok:error:desktop-only' }).toEqual({
        url,
        refused: false,
      });
      expect({ url, status: result.status }).not.toEqual({ url, status: 403 });
    }
    cleanup();
  });
});

describe('what a token may not do', () => {
  test('a bearer token is refused on every sync route', async () => {
    // A token is handed to an MCP client. `/api/sync/trigger` runs git push
    // with the operator's GitHub credential; that is not a connected client's
    // to spend.
    const call = build();
    for (const [method, url] of OPENED) {
      const result = await call(method, url, 'bearer');
      expect({ url, status: result.status, type: result.type }).toEqual({
        url,
        status: 403,
        type: 'urn:ok:error:desktop-only',
      });
    }
    cleanup();
  });

  test('a session traded for a token is refused too', async () => {
    // `/api/auth/session` turns a token into a cookie. If that cookie passed,
    // the whole distinction would be one HTTP call away from meaningless.
    const call = build();
    for (const [method, url] of OPENED) {
      const result = await call(method, url, 'token-session');
      expect({ url, status: result.status }).toEqual({ url, status: 403 });
    }
    cleanup();
  });

  test('no credential is refused before the gate is reached', async () => {
    // The admission gate answers first, and it says 401 rather than 403 —
    // "you did not identify yourself", not "you may not".
    const call = build();
    for (const [method, url] of OPENED) {
      const result = await call(method, url, 'none');
      expect({ url, status: result.status }).toEqual({ url, status: 401 });
    }
    cleanup();
  });
});

describe('what an account session may do — project setup', () => {
  test('reaches every route P3 opens', async () => {
    // Same reading as the sync case: anything but the gate's own 403 means the
    // request got past it. These run inside the workspace and need no GitHub
    // credential, which is why they could be opened when `share/*` could not.
    const call = build();
    for (const [method, url] of OPENED_P3) {
      const result = await call(method, url, 'account');
      expect({ url, refused: result.type === 'urn:ok:error:desktop-only' }).toEqual({
        url,
        refused: false,
      });
    }
    cleanup();
  });

  test('a bearer token reaches none of them', async () => {
    const call = build();
    for (const [method, url] of OPENED_P3) {
      const result = await call(method, url, 'bearer');
      expect({ url, status: result.status, type: result.type }).toEqual({
        url,
        status: 403,
        type: 'urn:ok:error:desktop-only',
      });
    }
    cleanup();
  });
});

describe('what an account session may do — GitHub reads', () => {
  test('reaches status and repos', async () => {
    const call = build();
    for (const [method, url] of OPENED_P4) {
      const result = await call(method, url, 'account');
      expect({ url, refused: result.type === 'urn:ok:error:desktop-only' }).toEqual({
        url,
        refused: false,
      });
    }
    cleanup();
  });

  test('but cannot change the connection', async () => {
    // Reading which GitHub account this server uses is one thing; replacing
    // its credential from the internet is another. Signing in remotely must
    // not be a way to repoint the server's git identity.
    const call = build();
    for (const url of [
      '/api/local-op/auth/login',
      '/api/local-op/auth/signout',
      '/api/local-op/auth/set-identity',
    ]) {
      const result = await call('POST', url, 'account');
      expect({ url, type: result.type }).toEqual({ url, type: 'urn:ok:error:desktop-only' });
    }
    cleanup();
  });
});

describe('what is still closed', () => {
  test('an account session still cannot reach them', async () => {
    // These act on the machine the server runs on, or need a GitHub credential
    // the deployed container does not have. Signing in does not change either
    // fact.
    const call = build();
    for (const [method, url] of STILL_CLOSED) {
      const result = await call(method, url, 'account');
      expect({ url, status: result.status, type: result.type }).toEqual({
        url,
        status: 403,
        type: 'urn:ok:error:desktop-only',
      });
    }
    cleanup();
  });
});
