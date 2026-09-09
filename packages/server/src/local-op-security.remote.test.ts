/**
 * `checkLocalOpSecurity` under both access policies.
 *
 * The primitives (`isLoopbackRequest`, `hasValidLocalOpOrigin`) have their own
 * tests in `local-op-security.test.ts`. What is only visible here is the
 * decision the gate makes out of them, and the fact that the remote branch
 * asks a different question entirely.
 */

import { describe, expect, test } from 'bun:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccessPolicy, AccessPrincipal } from './access-control.ts';
import { checkLocalOpSecurity, type LocalOpRemoteRule } from './local-op-security.ts';

const LOCAL: AccessPolicy = { mode: 'local' };
const REMOTE: AccessPolicy = {
  mode: 'remote',
  allowedOrigins: ['https://notes.example.com'],
  allowedHosts: ['notes.example.com'],
  trustedProxy: { hops: 1 },
  verify: () => null,
};

const principal = (kind: AccessPrincipal['kind']): AccessPrincipal => ({
  kind,
  id: 'p1',
  label: 'operator',
  clientAddress: undefined,
});

interface Captured {
  status: number;
  type: string | undefined;
}

function req(opts: { peer?: string; origin?: string } = {}): IncomingMessage {
  return {
    socket: { remoteAddress: opts.peer ?? '127.0.0.1' },
    headers: opts.origin === undefined ? {} : { origin: opts.origin },
  } as unknown as IncomingMessage;
}

function res(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, type: undefined };
  const response = {
    setHeader() {},
    writeHead(status: number) {
      captured.status = status;
    },
    end(body?: string) {
      if (typeof body === 'string' && body.length > 0) {
        try {
          captured.type = (JSON.parse(body) as { type?: string }).type;
        } catch {
          // Not a problem+json body; leave `type` undefined.
        }
      }
    },
  } as unknown as ServerResponse;
  return { res: response, captured };
}

function run(
  policy: AccessPolicy,
  remote: LocalOpRemoteRule,
  who: AccessPrincipal | undefined,
  request: IncomingMessage = req(),
): { allowed: boolean } & Captured {
  const { res: response, captured } = res();
  const allowed = checkLocalOpSecurity(request, response, {
    handler: 'test',
    policy,
    principal: who,
    remote,
  });
  return { allowed, ...captured };
}

describe('under a local policy', () => {
  // The desktop app and the CLI live here. Nothing about this branch changed,
  // and these cases exist to prove that.

  test('a loopback socket with no Origin passes', () => {
    expect(run(LOCAL, 'never', undefined).allowed).toBe(true);
  });

  test('a loopback socket with a loopback Origin passes', () => {
    expect(run(LOCAL, 'never', undefined, req({ origin: 'http://localhost:5173' })).allowed).toBe(
      true,
    );
  });

  test('a non-loopback socket is refused', () => {
    const result = run(LOCAL, 'never', undefined, req({ peer: '203.0.113.9' }));
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
    expect(result.type).toBe('urn:ok:error:loopback-required');
  });

  test('a non-loopback Origin on a loopback socket is refused', () => {
    const result = run(LOCAL, 'never', undefined, req({ origin: 'https://evil.example.com' }));
    expect(result.allowed).toBe(false);
    expect(result.type).toBe('urn:ok:error:invalid-origin');
  });

  test('the remote rule is ignored here', () => {
    // A local server has no remote callers to distinguish, so the rule that
    // governs them must not change what a loopback caller gets.
    expect(run(LOCAL, 'never', undefined).allowed).toBe(true);
    expect(run(LOCAL, 'account-session', undefined).allowed).toBe(true);
  });
});

describe('under a remote policy, rule "never"', () => {
  test('refuses an account session', () => {
    // This is the point of the rule: even the operator, signed in, cannot
    // drive an action whose effect is on the machine the server runs on.
    const result = run(REMOTE, 'never', principal('account-session'));
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
    expect(result.type).toBe('urn:ok:error:desktop-only');
  });

  test('refuses a bearer token', () => {
    expect(run(REMOTE, 'never', principal('bearer')).allowed).toBe(false);
  });

  test('refuses a caller with no principal at all', () => {
    expect(run(REMOTE, 'never', undefined).allowed).toBe(false);
  });
});

describe('under a remote policy, rule "account-session"', () => {
  test('admits an account session', () => {
    expect(run(REMOTE, 'account-session', principal('account-session')).allowed).toBe(true);
  });

  test('refuses a bearer token', () => {
    // An access token is handed to an MCP client or a script. Those are
    // authorized to read and write documents, not to drive the operator's git
    // and GitHub credentials.
    const result = run(REMOTE, 'account-session', principal('bearer'));
    expect(result.allowed).toBe(false);
    expect(result.type).toBe('urn:ok:error:desktop-only');
  });

  test('refuses a session traded for a token', () => {
    // `/api/auth/session` turns a token into a cookie. That cookie is still
    // the token's, not a person's, so it must not be a way around the rule.
    expect(run(REMOTE, 'account-session', principal('session')).allowed).toBe(false);
  });

  test('refuses a caller with no principal at all', () => {
    expect(run(REMOTE, 'account-session', undefined).allowed).toBe(false);
  });
});

describe('the hole this closed', () => {
  // Before: behind a proxy the socket check always passed (the peer is the
  // proxy, on loopback) and the origin check passed whenever the header was
  // absent. A browser sent its real Origin and was refused; a script sent none
  // and was admitted. These two cases pin that inversion shut.

  test('omitting Origin no longer admits a token holder', () => {
    const result = run(REMOTE, 'account-session', principal('bearer'), req({ origin: undefined }));
    expect(result.allowed).toBe(false);
  });

  test('a loopback socket does not admit a remote caller', () => {
    // Every request behind nginx arrives on a loopback socket. If the remote
    // branch still consulted it, every remote caller would pass.
    const result = run(REMOTE, 'never', principal('account-session'), req({ peer: '127.0.0.1' }));
    expect(result.allowed).toBe(false);
  });

  test('the browser at the public origin is judged on its credential', () => {
    // The same request that used to be refused for its Origin now turns on
    // whether a person signed in.
    const browser = req({ origin: 'https://notes.example.com' });
    expect(run(REMOTE, 'account-session', principal('account-session'), browser).allowed).toBe(
      true,
    );
    expect(run(REMOTE, 'account-session', principal('bearer'), browser).allowed).toBe(false);
  });
});
