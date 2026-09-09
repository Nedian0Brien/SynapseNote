import { describe, expect, test } from 'bun:test';
import {
  type AccessRequest,
  accessRequestFromNode,
  authorizeOrigin,
  authorizeRequest,
  type CredentialVerifier,
  extractCredential,
  type LocalAccessPolicy,
  type RemoteAccessPolicy,
  readCookie,
  SESSION_COOKIE_NAME,
} from './access-control.ts';

const LOCAL: LocalAccessPolicy = { mode: 'local' };

const acceptAll: CredentialVerifier = (credential) => ({
  kind: credential.scheme === 'bearer' ? 'bearer' : 'session',
  id: `id-${credential.value}`,
  label: `label-${credential.value}`,
});

function remotePolicy(overrides: Partial<RemoteAccessPolicy> = {}): RemoteAccessPolicy {
  return {
    mode: 'remote',
    allowedOrigins: ['https://notes.example.com'],
    allowedHosts: ['notes.example.com'],
    trustedProxy: { hops: 1 },
    verify: acceptAll,
    ...overrides,
  };
}

function request(overrides: Partial<AccessRequest> = {}): AccessRequest {
  return {
    socketAddress: '127.0.0.1',
    host: 'localhost:5173',
    origin: undefined,
    authorization: undefined,
    cookie: undefined,
    forwardedFor: undefined,
    ...overrides,
  };
}

describe('authorizeRequest — local mode preserves today’s gate', () => {
  test('admits a loopback peer with a loopback Host', () => {
    const decision = authorizeRequest(LOCAL, request());
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.principal).toEqual({
      kind: 'loopback',
      id: 'local',
      label: 'loopback',
      clientAddress: '127.0.0.1',
    });
  });

  test('admits every loopback shape the existing predicate accepts', () => {
    for (const peer of ['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1']) {
      expect(authorizeRequest(LOCAL, request({ socketAddress: peer })).ok).toBe(true);
    }
  });

  test('refuses a LAN peer with loopback-required', () => {
    const decision = authorizeRequest(LOCAL, request({ socketAddress: '192.168.1.5' }));
    expect(decision).toMatchObject({
      ok: false,
      status: 403,
      type: 'urn:ok:error:loopback-required',
      reason: 'peer-not-loopback',
    });
  });

  test('refuses a rebound Host header even from a loopback peer', () => {
    const decision = authorizeRequest(LOCAL, request({ host: 'attacker.example.com' }));
    expect(decision).toMatchObject({
      ok: false,
      status: 403,
      type: 'urn:ok:error:host-not-allowed',
      reason: 'host-not-allowed',
    });
  });

  test('rejects a missing peer by default', () => {
    // The five host-shape handlers and `/mcp` reject a socket with no
    // remoteAddress today; that stays the default.
    const decision = authorizeRequest(LOCAL, request({ socketAddress: undefined }));
    expect(decision).toMatchObject({ ok: false, reason: 'peer-not-loopback' });
  });

  test('tolerates a missing peer when the call site opts in', () => {
    // The mutating-route gate and the config-doc admission guard treat a
    // socket-less request as test context and fall through to the Host check.
    const decision = authorizeRequest(LOCAL, request({ socketAddress: undefined }), {
      allowMissingPeer: true,
    });
    expect(decision.ok).toBe(true);
  });

  test('still applies the Host check when a missing peer is tolerated', () => {
    const decision = authorizeRequest(
      LOCAL,
      request({ socketAddress: undefined, host: 'attacker.example.com' }),
      { allowMissingPeer: true },
    );
    expect(decision).toMatchObject({ ok: false, reason: 'host-not-allowed' });
  });

  test('ignores a credential — loopback admission needs none', () => {
    const decision = authorizeRequest(LOCAL, request({ authorization: 'Bearer whatever' }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.principal.kind).toBe('loopback');
  });
});

describe('authorizeRequest — remote mode', () => {
  test('admits a bearer token on an allowed host', () => {
    const decision = authorizeRequest(
      remotePolicy(),
      request({
        socketAddress: '127.0.0.1',
        host: 'notes.example.com',
        authorization: 'Bearer tok-1',
        forwardedFor: '203.0.113.9',
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.principal).toEqual({
      kind: 'bearer',
      id: 'id-tok-1',
      label: 'label-tok-1',
      clientAddress: '203.0.113.9',
    });
  });

  test('admits a session cookie', () => {
    const decision = authorizeRequest(
      remotePolicy(),
      request({
        host: 'notes.example.com',
        cookie: `${SESSION_COOKIE_NAME}=sess-1`,
        forwardedFor: '203.0.113.9',
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.principal.kind).toBe('session');
    expect(decision.principal.id).toBe('id-sess-1');
  });

  test('refuses a request with no credential', () => {
    const decision = authorizeRequest(remotePolicy(), request({ host: 'notes.example.com' }));
    expect(decision).toMatchObject({
      ok: false,
      status: 401,
      type: 'urn:ok:error:unauthorized',
      reason: 'credential-absent',
    });
  });

  test('refuses a credential the verifier rejects', () => {
    const decision = authorizeRequest(
      remotePolicy({ verify: () => null }),
      request({ host: 'notes.example.com', authorization: 'Bearer nope' }),
    );
    expect(decision).toMatchObject({
      ok: false,
      status: 401,
      type: 'urn:ok:error:unauthorized',
      reason: 'credential-rejected',
    });
  });

  test('a loopback peer earns nothing without a credential', () => {
    // The whole point of the mode: reachability stops being authorization.
    const decision = authorizeRequest(
      remotePolicy(),
      request({ socketAddress: '127.0.0.1', host: 'notes.example.com' }),
    );
    expect(decision).toMatchObject({ ok: false, status: 401 });
  });

  test('refuses an unlisted Host before verifying the credential', () => {
    let verifyCalls = 0;
    const decision = authorizeRequest(
      remotePolicy({
        verify: (c) => {
          verifyCalls += 1;
          return acceptAll(c);
        },
      }),
      request({ host: 'evil.example.com', authorization: 'Bearer tok-1' }),
    );
    expect(decision).toMatchObject({ ok: false, status: 403, reason: 'host-not-allowed' });
    expect(verifyCalls).toBe(0);
  });

  test('matches the Host allowlist case-insensitively', () => {
    const decision = authorizeRequest(
      remotePolicy(),
      request({ host: 'Notes.Example.COM', authorization: 'Bearer tok-1' }),
    );
    expect(decision.ok).toBe(true);
  });

  test('refuses an absent Host header', () => {
    const decision = authorizeRequest(
      remotePolicy(),
      request({ host: undefined, authorization: 'Bearer tok-1' }),
    );
    expect(decision).toMatchObject({ ok: false, reason: 'host-not-allowed' });
  });

  test('admits despite an unresolvable client address, recording it as unknown', () => {
    // A direct caller that bypassed the proxy still holds a valid token. The
    // address is a log field, not a gate.
    const decision = authorizeRequest(
      remotePolicy(),
      request({
        host: 'notes.example.com',
        authorization: 'Bearer tok-1',
        forwardedFor: undefined,
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.principal.clientAddress).toBeUndefined();
  });

  test('does not let a forged forwarded prefix pick the recorded address', () => {
    const decision = authorizeRequest(
      remotePolicy(),
      request({
        host: 'notes.example.com',
        authorization: 'Bearer tok-1',
        forwardedFor: '10.0.0.1, 203.0.113.9',
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.principal.clientAddress).toBe('203.0.113.9');
  });
});

describe('authorizeOrigin', () => {
  test('absent Origin passes in both modes', () => {
    expect(authorizeOrigin(LOCAL, undefined)).toBe(true);
    expect(authorizeOrigin(remotePolicy(), undefined)).toBe(true);
  });

  test('local mode keeps the loopback allowlist', () => {
    expect(authorizeOrigin(LOCAL, 'http://localhost:5173')).toBe(true);
    expect(authorizeOrigin(LOCAL, 'http://127.0.0.1:9999')).toBe(true);
    expect(authorizeOrigin(LOCAL, 'null')).toBe(true);
    expect(authorizeOrigin(LOCAL, 'https://evil.example.com')).toBe(false);
  });

  test('remote mode matches configured origins exactly', () => {
    const policy = remotePolicy();
    expect(authorizeOrigin(policy, 'https://notes.example.com')).toBe(true);
    expect(authorizeOrigin(policy, 'http://notes.example.com')).toBe(false);
    expect(authorizeOrigin(policy, 'https://notes.example.com:8443')).toBe(false);
  });

  test('remote mode refuses a suffix impostor', () => {
    expect(authorizeOrigin(remotePolicy(), 'https://evil-notes.example.com')).toBe(false);
    expect(authorizeOrigin(remotePolicy(), 'https://notes.example.com.evil.test')).toBe(false);
  });

  test('remote mode refuses the opaque null origin', () => {
    expect(authorizeOrigin(remotePolicy(), 'null')).toBe(false);
  });

  test('remote mode refuses loopback origins that local mode allows', () => {
    expect(authorizeOrigin(remotePolicy(), 'http://localhost:5173')).toBe(false);
  });
});

describe('readCookie', () => {
  test('reads a named value among several', () => {
    expect(readCookie('a=1; synapsenote_session=abc; b=2', SESSION_COOKIE_NAME)).toBe('abc');
  });

  test('tolerates surrounding whitespace', () => {
    expect(readCookie('  synapsenote_session = abc  ', SESSION_COOKIE_NAME)).toBe('abc');
  });

  test('returns undefined for an absent or empty value', () => {
    expect(readCookie(undefined, SESSION_COOKIE_NAME)).toBeUndefined();
    expect(readCookie('other=1', SESSION_COOKIE_NAME)).toBeUndefined();
    expect(readCookie('synapsenote_session=', SESSION_COOKIE_NAME)).toBeUndefined();
  });

  test('does not match a name that merely ends with the target', () => {
    expect(readCookie('evil_synapsenote_session=abc', SESSION_COOKIE_NAME)).toBeUndefined();
  });

  test('keeps the value opaque rather than percent-decoding it', () => {
    expect(readCookie('synapsenote_session=a%3Db', SESSION_COOKIE_NAME)).toBe('a%3Db');
  });
});

describe('extractCredential', () => {
  test('reads a bearer token case-insensitively', () => {
    expect(extractCredential(request({ authorization: 'bearer tok' }))).toEqual({
      scheme: 'bearer',
      value: 'tok',
    });
    expect(extractCredential(request({ authorization: 'BEARER tok' }))).toEqual({
      scheme: 'bearer',
      value: 'tok',
    });
  });

  test('ignores a non-bearer scheme', () => {
    expect(extractCredential(request({ authorization: 'Basic abc' }))).toBeUndefined();
  });

  test('ignores an empty bearer value', () => {
    expect(extractCredential(request({ authorization: 'Bearer   ' }))).toBeUndefined();
  });

  test('falls back to the session cookie', () => {
    expect(extractCredential(request({ cookie: `${SESSION_COOKIE_NAME}=sess` }))).toEqual({
      scheme: 'session',
      value: 'sess',
    });
  });

  test('prefers an explicit bearer token over the cookie', () => {
    expect(
      extractCredential(
        request({ authorization: 'Bearer tok', cookie: `${SESSION_COOKIE_NAME}=sess` }),
      ),
    ).toEqual({ scheme: 'bearer', value: 'tok' });
  });
});

describe('accessRequestFromNode', () => {
  test('lifts the headers this module reads', () => {
    expect(
      accessRequestFromNode({
        socket: { remoteAddress: '127.0.0.1' },
        headers: {
          host: 'localhost:5173',
          origin: 'http://localhost:5173',
          authorization: 'Bearer tok',
          cookie: 'a=1',
          'x-forwarded-for': '203.0.113.9',
        },
      }),
    ).toEqual({
      socketAddress: '127.0.0.1',
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
      authorization: 'Bearer tok',
      cookie: 'a=1',
      forwardedFor: '203.0.113.9',
    });
  });

  test('survives a request with no socket', () => {
    expect(accessRequestFromNode({ headers: {} }).socketAddress).toBeUndefined();
  });
});
