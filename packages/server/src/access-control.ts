/**
 * The single place that answers "may this request touch the workspace?".
 *
 * ## What this replaces
 *
 * Eleven call sites across `api-extension.ts`, `mcp-mount.ts`,
 * `server-factory.ts`, and the CLI's `ok ui` proxy each asked the same pair of
 * questions inline: is the TCP peer on loopback, and does the `Host` header
 * name a loopback host? That pair encodes one assumption — *the only reachable
 * client is a process on this machine, so reachability is authorization*.
 *
 * That assumption is exactly what a remote deployment removes. Rather than
 * loosen eleven gates independently and hope they stay in agreement, every gate
 * now asks this module, and this module answers according to one policy value
 * resolved once at boot.
 *
 * ## Two modes, one of which changes nothing
 *
 * - `local` reproduces today's behavior exactly, including the two different
 *   missing-peer conventions the existing call sites use (see
 *   `allowMissingPeer`) and the exact problem-type URNs already on the wire.
 *   Desktop and CLI users are on this path and see no difference.
 * - `remote` replaces reachability with a credential. The `Host` allowlist
 *   comes from the operator's configured public hostnames instead of the
 *   hardcoded loopback shapes, and a verified token or session cookie is what
 *   makes a request authorized.
 *
 * ## Where the client address does and does not matter
 *
 * In `remote` mode the effective client address is resolved (through
 * `trusted-proxy.ts`) for the principal record and the log line, and it does
 * **not** gate the request. Authorization in remote mode comes from the
 * credential alone. Two reasons: a valid token presented by a caller who
 * reached the process directly is still a valid token, and making a
 * misconfigured forwarded header fail closed would take down health checks and
 * container probes that never traverse the proxy. Operator intent is enforced
 * once, at boot, where remote mode requires an explicit trusted-proxy
 * declaration — not re-litigated per request.
 */

import type { ProblemType } from '@nedian0brien/synapsenote-core';
import { isAllowedApiOrigin } from './api-origin.ts';
import { isAllowedWorkspaceHostHeader, isLoopbackAddress } from './loopback.ts';
import { resolveClientAddress, type TrustedProxyPolicy } from './trusted-proxy.ts';

/** Name of the cookie the browser session exchange mints. */
export const SESSION_COOKIE_NAME = 'synapsenote_session';

/** Who the request turned out to be. Carried into logs and future rate limits. */
export interface AccessPrincipal {
  /** How the caller proved itself. */
  readonly kind: 'loopback' | 'bearer' | 'session';
  /**
   * Stable identifier. `'local'` under loopback admission; otherwise the token
   * record's id, so a revoked credential can be traced through past log lines.
   */
  readonly id: string;
  /** Human-readable label for logs (token name, or `'loopback'`). */
  readonly label: string;
  /** Best-effort client address. `undefined` when it could not be resolved. */
  readonly clientAddress: string | undefined;
}

/** A credential lifted off the request, before verification. */
export interface PresentedCredential {
  readonly scheme: 'bearer' | 'session';
  readonly value: string;
}

/**
 * Verifies a presented credential.
 *
 * Injected rather than imported so this module stays free of storage and
 * crypto, and so tests can drive every branch with a plain function. The
 * token store supplies the real implementation.
 *
 * Returns `null` for anything it does not accept — unknown, expired, revoked,
 * or malformed. The distinction never reaches the client, which always sees
 * one `unauthorized` response.
 */
export type CredentialVerifier = (
  credential: PresentedCredential,
) => Omit<AccessPrincipal, 'clientAddress'> | null;

export interface LocalAccessPolicy {
  readonly mode: 'local';
}

export interface RemoteAccessPolicy {
  readonly mode: 'remote';
  /**
   * Exact origin strings the browser app is served from, e.g.
   * `https://notes.example.com`. Compared verbatim — no wildcards, no suffix
   * matching, because a suffix rule that accepts `evil-notes.example.com` is
   * the standard way this list goes wrong.
   */
  readonly allowedOrigins: readonly string[];
  /** Allowed `Host` header values (`host` or `host:port`), lowercased. */
  readonly allowedHosts: readonly string[];
  readonly trustedProxy: TrustedProxyPolicy;
  readonly verify: CredentialVerifier;
}

export type AccessPolicy = LocalAccessPolicy | RemoteAccessPolicy;

/**
 * The policy every call site defaults to.
 *
 * Wiring sites take `accessPolicy?: AccessPolicy` and fall back to this, so a
 * caller that knows nothing about remote access — the test harness, the Vite
 * dev-server plugin, the Electron utility process — keeps today's behavior
 * without opting in. Only `bootServer` resolves a different value, and only
 * when the operator asked for one.
 */
export const LOCAL_ACCESS_POLICY: LocalAccessPolicy = { mode: 'local' };

/** The request facts this module reads. Structural, so tests need no sockets. */
export interface AccessRequest {
  readonly socketAddress: string | undefined;
  readonly host: string | undefined;
  readonly origin: string | undefined;
  readonly authorization: string | undefined;
  readonly cookie: string | undefined;
  readonly forwardedFor: string | string[] | undefined;
}

/**
 * Stable machine tokens for the denial cause. Logged and asserted in tests;
 * never sent to the client, which sees only the coarse problem type.
 */
export type AccessDenialReason =
  | 'peer-not-loopback'
  | 'host-not-allowed'
  | 'credential-absent'
  | 'credential-rejected';

export interface AccessDenial {
  readonly ok: false;
  readonly status: 401 | 403;
  readonly type: ProblemType;
  /** Short human-readable summary, passed straight to `errorResponse`. */
  readonly title: string;
  readonly reason: AccessDenialReason;
}

export type AccessDecision =
  | { readonly ok: true; readonly principal: AccessPrincipal }
  | AccessDenial;

export interface AuthorizeOptions {
  /**
   * Whether a request whose socket carries no `remoteAddress` passes the peer
   * check in `local` mode.
   *
   * The existing gates split on this and the split is deliberate, so it is
   * preserved rather than unified: the mutating-route gate and the config-doc
   * admission guard tolerate a missing peer because only a synthetic
   * `IncomingMessage` built by a test can reach them that way, while the five
   * host-shape handlers and `/mcp` reject it. Changing either would alter
   * behavior this milestone promises to leave alone.
   *
   * Ignored in `remote` mode, where the credential is the authority.
   */
  readonly allowMissingPeer?: boolean;
}

const LOOPBACK_PRINCIPAL_BASE = {
  kind: 'loopback',
  id: 'local',
  label: 'loopback',
} as const satisfies Omit<AccessPrincipal, 'clientAddress'>;

function deny(
  status: 401 | 403,
  type: ProblemType,
  title: string,
  reason: AccessDenialReason,
): AccessDenial {
  return { ok: false, status, type, title, reason };
}

/**
 * Read one cookie's value out of a `Cookie` header.
 *
 * Deliberately minimal: split on `;`, take the first `=`, compare the name
 * exactly. Cookie values here are opaque tokens the server itself minted, so
 * no percent-decoding is applied — decoding would let two distinct header
 * spellings resolve to the same credential.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    if (value.length > 0) return value;
  }
  return undefined;
}

/**
 * Lift a credential off the request. `Authorization: Bearer` wins over the
 * session cookie so a CLI or MCP client that sets both gets the credential it
 * chose explicitly.
 */
export function extractCredential(request: AccessRequest): PresentedCredential | undefined {
  const authorization = request.authorization;
  if (authorization !== undefined) {
    // RFC 7235 §2.1 — the scheme token is case-insensitive.
    const space = authorization.indexOf(' ');
    if (space > 0 && authorization.slice(0, space).toLowerCase() === 'bearer') {
      const value = authorization.slice(space + 1).trim();
      if (value.length > 0) return { scheme: 'bearer', value };
    }
  }
  const cookie = readCookie(request.cookie, SESSION_COOKIE_NAME);
  if (cookie !== undefined) return { scheme: 'session', value: cookie };
  return undefined;
}

/**
 * Decide whether a request may proceed.
 *
 * @param policy - Boot-resolved access policy.
 * @param request - Request facts (see `accessRequestFromNode`).
 * @param options - Per-call-site behavior; see `AuthorizeOptions`.
 */
export function authorizeRequest(
  policy: AccessPolicy,
  request: AccessRequest,
  options: AuthorizeOptions = {},
): AccessDecision {
  if (policy.mode === 'local') {
    const peer = request.socketAddress;
    const peerMissing = peer === undefined;
    if (!(peerMissing && options.allowMissingPeer === true) && !isLoopbackAddress(peer)) {
      return deny(403, 'urn:ok:error:loopback-required', 'Loopback required.', 'peer-not-loopback');
    }
    if (!isAllowedWorkspaceHostHeader(request.host)) {
      return deny(
        403,
        'urn:ok:error:host-not-allowed',
        'Host header not allowed.',
        'host-not-allowed',
      );
    }
    return { ok: true, principal: { ...LOOPBACK_PRINCIPAL_BASE, clientAddress: peer } };
  }

  // Remote mode. Host first: it is the cheapest check and refusing an
  // unrecognized hostname before touching the credential keeps a token from
  // being verified — and therefore timing-probed — through an arbitrary vhost.
  const host = request.host?.toLowerCase();
  if (host === undefined || !policy.allowedHosts.includes(host)) {
    return deny(
      403,
      'urn:ok:error:host-not-allowed',
      'Host header not allowed.',
      'host-not-allowed',
    );
  }

  const credential = extractCredential(request);
  if (credential === undefined) {
    return deny(401, 'urn:ok:error:unauthorized', 'Authentication required.', 'credential-absent');
  }
  const verified = policy.verify(credential);
  if (verified === null) {
    return deny(
      401,
      'urn:ok:error:unauthorized',
      'Authentication required.',
      'credential-rejected',
    );
  }

  const resolved = resolveClientAddress(policy.trustedProxy, {
    socketAddress: request.socketAddress,
    forwardedFor: request.forwardedFor,
  });
  return {
    ok: true,
    principal: { ...verified, clientAddress: resolved.ok ? resolved.address : undefined },
  };
}

/**
 * Whether a browser `Origin` may talk to `/api/*` and `/mcp`.
 *
 * An absent `Origin` passes in both modes, matching the existing gate:
 * non-browser callers (curl, the CLI, MCP clients) send none, and a browser
 * that omits it cannot read a cross-origin response anyway. For cookie-borne
 * credentials the cross-site write path is closed by `SameSite=Lax` on the
 * session cookie rather than by this check.
 */
export function authorizeOrigin(policy: AccessPolicy, origin: string | undefined): boolean {
  if (origin === undefined) return true;
  if (policy.mode === 'local') return isAllowedApiOrigin(origin);
  // Exact match only. `'null'` (opaque origins — sandboxed iframes, `file://`)
  // is accepted in local mode for the packaged Electron renderer; on a public
  // origin it is any hostile page that sandboxed itself, so it is refused.
  return policy.allowedOrigins.includes(origin);
}

/** Node `IncomingMessage`-shaped input, kept minimal so tests can fake it. */
export interface NodeRequestLike {
  readonly socket?: { readonly remoteAddress?: string };
  readonly headers: {
    readonly host?: string;
    readonly origin?: string;
    readonly authorization?: string;
    readonly cookie?: string;
    readonly 'x-forwarded-for'?: string | string[];
  };
}

/** Adapt a Node request into the structural shape this module reads. */
export function accessRequestFromNode(req: NodeRequestLike): AccessRequest {
  return {
    socketAddress: req.socket?.remoteAddress,
    host: req.headers.host,
    origin: req.headers.origin,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
    forwardedFor: req.headers['x-forwarded-for'],
  };
}
