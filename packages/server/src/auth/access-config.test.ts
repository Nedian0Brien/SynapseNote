import { describe, expect, test } from 'bun:test';
import {
  ACCESS_MODE_ENV,
  ALLOW_INSECURE_ORIGIN_ENV,
  formatAccessPolicyProblems,
  PUBLIC_ORIGIN_ENV,
  resolveAccessPolicy,
  TRUSTED_PROXY_HOPS_ENV,
} from './access-config.ts';
import type { AccessStore } from './access-store.ts';

function fakeStore(tokenCount: number): AccessStore {
  return {
    createToken: () => {
      throw new Error('unused');
    },
    listTokens: () => [],
    revokeToken: () => false,
    tokenCount: () => tokenCount,
    createSession: () => {
      throw new Error('unused');
    },
    exchangeToken: () => null,
    revokeSession: () => false,
    revokeSessionBySecret: () => false,
    pruneSessions: () => 0,
    verify: () => null,
  };
}

const withToken = { store: fakeStore(1) };

/** A complete, valid remote configuration. Individual cases break one field. */
function remoteEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    [ACCESS_MODE_ENV]: 'remote',
    [PUBLIC_ORIGIN_ENV]: 'https://notes.example.com',
    [TRUSTED_PROXY_HOPS_ENV]: '1',
    ...overrides,
  };
}

function problemsOf(resolution: ReturnType<typeof resolveAccessPolicy>): readonly string[] {
  return resolution.ok ? [] : resolution.problems;
}

describe('local mode', () => {
  test('an empty environment resolves to local', () => {
    const resolution = resolveAccessPolicy({}, { store: fakeStore(0) });
    expect(resolution).toEqual({ ok: true, policy: { mode: 'local' } });
  });

  test('an explicit "local" resolves to local', () => {
    const resolution = resolveAccessPolicy({ [ACCESS_MODE_ENV]: 'local' }, { store: fakeStore(0) });
    expect(resolution.ok).toBe(true);
  });

  test('local mode needs no tokens, origin, or hop count', () => {
    // Desktop and CLI users never set any of these; the module must be inert
    // for them.
    const resolution = resolveAccessPolicy(
      { [ACCESS_MODE_ENV]: '  LOCAL ' },
      { store: fakeStore(0) },
    );
    expect(resolution.ok).toBe(true);
  });

  test('an unrecognized mode is refused rather than treated as local', () => {
    const resolution = resolveAccessPolicy({ [ACCESS_MODE_ENV]: 'public' }, withToken);
    expect(resolution.ok).toBe(false);
    expect(problemsOf(resolution)[0]).toContain('must be "local" or "remote"');
  });
});

describe('remote mode — a complete configuration', () => {
  test('builds the policy from the public origin', () => {
    const resolution = resolveAccessPolicy(remoteEnv(), withToken);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.policy).toMatchObject({
      mode: 'remote',
      allowedOrigins: ['https://notes.example.com'],
      allowedHosts: ['notes.example.com'],
      trustedProxy: { hops: 1 },
    });
  });

  test('keeps an explicit port in both the origin and the host', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [PUBLIC_ORIGIN_ENV]: 'https://notes.example.com:8443' }),
      withToken,
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.policy).toMatchObject({
      allowedOrigins: ['https://notes.example.com:8443'],
      allowedHosts: ['notes.example.com:8443'],
    });
  });

  test('accepts a trailing slash on the origin', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [PUBLIC_ORIGIN_ENV]: 'https://notes.example.com/' }),
      withToken,
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.policy).toMatchObject({ allowedOrigins: ['https://notes.example.com'] });
  });

  test('accepts zero hops for a directly exposed process', () => {
    const resolution = resolveAccessPolicy(remoteEnv({ [TRUSTED_PROXY_HOPS_ENV]: '0' }), withToken);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.policy).toMatchObject({ trustedProxy: { hops: 0 } });
  });

  test('uses the store as the credential verifier', () => {
    const store = fakeStore(1);
    const resolution = resolveAccessPolicy(remoteEnv(), { store });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok || resolution.policy.mode !== 'remote') return;
    expect(resolution.policy.verify).toBe(store.verify);
  });
});

describe('remote mode — refusals', () => {
  test('a missing public origin is refused', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [PUBLIC_ORIGIN_ENV]: undefined }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain(`${PUBLIC_ORIGIN_ENV} is required`);
  });

  test('a plain-http origin is refused by default', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [PUBLIC_ORIGIN_ENV]: 'http://notes.example.com' }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain('must use https');
  });

  test('a plain-http origin is allowed only behind the explicit escape hatch', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({
        [PUBLIC_ORIGIN_ENV]: 'http://notes.example.com',
        [ALLOW_INSECURE_ORIGIN_ENV]: '1',
      }),
      withToken,
    );
    expect(resolution.ok).toBe(true);
  });

  test('an origin carrying a path is refused', () => {
    // A pasted page URL builds an allowlist entry no browser Origin matches.
    const resolution = resolveAccessPolicy(
      remoteEnv({ [PUBLIC_ORIGIN_ENV]: 'https://notes.example.com/app' }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain('no path, query, or fragment');
  });

  test('a bare hostname is refused', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [PUBLIC_ORIGIN_ENV]: 'notes.example.com' }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain('must be an http(s) origin');
  });

  test('a missing hop count is refused even though zero is a legal value', () => {
    // The point is to make the operator answer, not to pick for them.
    const resolution = resolveAccessPolicy(
      remoteEnv({ [TRUSTED_PROXY_HOPS_ENV]: undefined }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain(`${TRUSTED_PROXY_HOPS_ENV} is required`);
  });

  test('a non-numeric hop count is refused', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [TRUSTED_PROXY_HOPS_ENV]: 'yes' }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain('non-negative integer');
  });

  test('a negative hop count is refused', () => {
    const resolution = resolveAccessPolicy(
      remoteEnv({ [TRUSTED_PROXY_HOPS_ENV]: '-1' }),
      withToken,
    );
    expect(problemsOf(resolution).join('\n')).toContain('non-negative integer');
  });

  test('a store with no tokens is refused', () => {
    const resolution = resolveAccessPolicy(remoteEnv(), { store: fakeStore(0) });
    expect(problemsOf(resolution).join('\n')).toContain('at least one access token');
  });

  test('every problem is reported from a single boot attempt', () => {
    // Three missing pieces should cost one deploy cycle, not three.
    const resolution = resolveAccessPolicy(
      { [ACCESS_MODE_ENV]: 'remote' },
      { store: fakeStore(0) },
    );
    const problems = problemsOf(resolution);
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain(PUBLIC_ORIGIN_ENV);
    expect(problems.join('\n')).toContain(TRUSTED_PROXY_HOPS_ENV);
    expect(problems.join('\n')).toContain('access token');
  });
});

describe('formatAccessPolicyProblems', () => {
  test('renders one problem per line under a heading', () => {
    expect(formatAccessPolicyProblems(['first', 'second'])).toBe(
      [
        'Refusing to start: remote access is configured but incomplete.',
        '  - first',
        '  - second',
      ].join('\n'),
    );
  });
});
