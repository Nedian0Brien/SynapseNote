/**
 * Resolve the boot-time access policy from operator configuration.
 *
 * This is where "the operator meant to expose this server" gets decided, once,
 * with every requirement checked up front. A misconfiguration surfaces as a
 * refusal to boot with a list of what to fix, never as a server that starts
 * and quietly admits the internet.
 *
 * ## Why environment variables and not `.ok/config.yml`
 *
 * `config.yml` is project content: it lives in the repository, syncs between
 * machines, and describes the workspace. Deployment topology is the opposite —
 * host-specific, and wrong the moment the same project opens on a laptop. A
 * laptop that pulled a `remote` block out of a synced config would start
 * demanding tokens for a local edit session.
 *
 * ## The four requirements for remote mode
 *
 * Each one exists because its absence produces a server that looks configured
 * and is not:
 *
 * 1. **A public origin.** Without it there is no Host allowlist, and the
 *    DNS-rebinding defense the local gate provided has no replacement.
 * 2. **HTTPS on that origin.** Tokens and session cookies would otherwise
 *    cross the network in the clear, and `Secure` cookies would never be sent
 *    back at all.
 * 3. **An explicit proxy hop count.** See `trusted-proxy.ts` — a proxy in
 *    front makes every peer look like loopback. Requiring the number even when
 *    it is zero forces the operator to answer the question rather than inherit
 *    a default that is wrong half the time.
 * 4. **At least one access token.** A remote server with no credentials can
 *    refuse every request and nothing else. Booting into that state wastes a
 *    deploy cycle to discover it.
 */

import type { AccessPolicy } from '../access-control.ts';
import { LOCAL_ACCESS_POLICY } from '../access-control.ts';
import type { TrustedProxyPolicy } from '../trusted-proxy.ts';
import type { AccessStore } from './access-store.ts';

export const ACCESS_MODE_ENV = 'OK_ACCESS_MODE';
export const PUBLIC_ORIGIN_ENV = 'OK_PUBLIC_ORIGIN';
export const TRUSTED_PROXY_HOPS_ENV = 'OK_TRUSTED_PROXY_HOPS';
export const ALLOW_INSECURE_ORIGIN_ENV = 'OK_ALLOW_INSECURE_ORIGIN';

/** The subset of the environment this module reads. */
export interface AccessEnv {
  readonly [ACCESS_MODE_ENV]?: string;
  readonly [PUBLIC_ORIGIN_ENV]?: string;
  readonly [TRUSTED_PROXY_HOPS_ENV]?: string;
  readonly [ALLOW_INSECURE_ORIGIN_ENV]?: string;
}

export type AccessPolicyResolution =
  | { readonly ok: true; readonly policy: AccessPolicy }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Parsed form of the public origin: the exact origin string to allow, and the
 * `Host` header value that names it.
 */
interface ParsedOrigin {
  readonly origin: string;
  readonly host: string;
  readonly secure: boolean;
}

function parsePublicOrigin(raw: string): ParsedOrigin | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // A path, query, or fragment means the operator pasted a page URL rather
  // than an origin. Accepting it would build an allowlist entry that no
  // browser `Origin` header ever matches.
  if ((url.pathname !== '' && url.pathname !== '/') || url.search !== '' || url.hash !== '') {
    return null;
  }
  return { origin: url.origin, host: url.host.toLowerCase(), secure: url.protocol === 'https:' };
}

function parseHops(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isSafeInteger(value) ? value : null;
}

function isTruthyFlag(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Build the policy this process should run under.
 *
 * @param env - Environment to read. Pass `process.env` in production.
 * @param deps.store - Opened access store, consulted for the token-count
 *   requirement and used as the credential verifier.
 */
export function resolveAccessPolicy(
  env: AccessEnv,
  deps: { readonly store: AccessStore },
): AccessPolicyResolution {
  const rawMode = env[ACCESS_MODE_ENV]?.trim().toLowerCase();

  // Unset means local. Every existing deployment — desktop, CLI, dev server —
  // lands here and is unaffected by this module's existence.
  if (rawMode === undefined || rawMode === '' || rawMode === 'local') {
    return { ok: true, policy: LOCAL_ACCESS_POLICY };
  }
  if (rawMode !== 'remote') {
    return {
      ok: false,
      problems: [`${ACCESS_MODE_ENV} must be "local" or "remote" (got "${rawMode}")`],
    };
  }

  const problems: string[] = [];

  const rawOrigin = env[PUBLIC_ORIGIN_ENV]?.trim();
  let parsedOrigin: ParsedOrigin | null = null;
  if (rawOrigin === undefined || rawOrigin === '') {
    problems.push(
      `${PUBLIC_ORIGIN_ENV} is required in remote mode — set it to the origin the app is served from, e.g. https://notes.example.com`,
    );
  } else {
    parsedOrigin = parsePublicOrigin(rawOrigin);
    if (parsedOrigin === null) {
      problems.push(
        `${PUBLIC_ORIGIN_ENV} must be an http(s) origin with no path, query, or fragment (got "${rawOrigin}")`,
      );
    } else if (!parsedOrigin.secure && !isTruthyFlag(env[ALLOW_INSECURE_ORIGIN_ENV])) {
      problems.push(
        `${PUBLIC_ORIGIN_ENV} must use https — tokens and session cookies would otherwise cross the network in the clear. Set ${ALLOW_INSECURE_ORIGIN_ENV}=1 only for a throwaway bring-up on a trusted network.`,
      );
    }
  }

  const rawHops = env[TRUSTED_PROXY_HOPS_ENV]?.trim();
  let trustedProxy: TrustedProxyPolicy | null = null;
  if (rawHops === undefined || rawHops === '') {
    problems.push(
      `${TRUSTED_PROXY_HOPS_ENV} is required in remote mode — set 0 when this process owns the public socket, or the number of reverse proxies in front of it (1 for a single Caddy/nginx/Cloudflare Tunnel hop)`,
    );
  } else {
    const hops = parseHops(rawHops);
    if (hops === null) {
      problems.push(`${TRUSTED_PROXY_HOPS_ENV} must be a non-negative integer (got "${rawHops}")`);
    } else {
      trustedProxy = { hops };
    }
  }

  if (deps.store.tokenCount() === 0) {
    problems.push(
      'remote mode needs at least one access token — mint one with `synapsenote access token create <name>` before starting the server',
    );
  }

  if (problems.length > 0) return { ok: false, problems };
  // Both are non-null here: every path that leaves them null pushed a problem.
  if (parsedOrigin === null || trustedProxy === null) {
    return {
      ok: false,
      problems: ['internal: access policy resolution reached an unreachable state'],
    };
  }

  return {
    ok: true,
    policy: {
      mode: 'remote',
      allowedOrigins: [parsedOrigin.origin],
      allowedHosts: [parsedOrigin.host],
      trustedProxy,
      verify: deps.store.verify,
    },
  };
}

/**
 * Render a failed resolution as an operator-facing error message.
 *
 * One problem per line under a single heading, because a deploy that is
 * missing three variables should learn all three from one boot attempt.
 */
export function formatAccessPolicyProblems(problems: readonly string[]): string {
  return [
    'Refusing to start: remote access is configured but incomplete.',
    ...problems.map((p) => `  - ${p}`),
  ].join('\n');
}
