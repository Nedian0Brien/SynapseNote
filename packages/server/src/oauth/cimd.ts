/**
 * Client ID Metadata Documents — resolving a URL-shaped `client_id` into
 * client metadata.
 *
 * This is the registration mechanism the MCP specification prefers and the one
 * ChatGPT uses: the client's identity *is* an HTTPS URL, and the authorization
 * server fetches that URL to learn the client's name and redirect URIs. No
 * registration call, no stored client secret, and the identity is portable
 * across authorization servers.
 *
 * ## The part that needs care
 *
 * The URL is supplied by whoever is calling `/oauth/authorize`, and this server
 * then fetches it. That is a server-side request forgery primitive handed to an
 * unauthenticated caller, and this process runs on a host with a dozen internal
 * services on loopback and private addresses. So before fetching, the hostname
 * is resolved and every resolved address must be publicly routable.
 *
 * The guard is resolve-then-fetch, so a name that resolves differently between
 * the check and the connection can still slip through (classic DNS rebinding).
 * Two things bound the damage: the URL must be `https`, so the certificate has
 * to validate for the hostname the attacker chose, and the response is only
 * ever parsed as a client metadata document and never echoed back to the
 * caller. Closing the window completely needs a pinned-address HTTP agent,
 * which `fetch` does not expose — recorded here rather than left implied.
 */

import { lookup } from 'node:dns/promises';

/** Cap on the metadata document. Real ones are well under a kilobyte. */
const MAX_DOCUMENT_BYTES = 64 * 1024;

/** How long to wait for the whole fetch. */
const FETCH_TIMEOUT_MS = 5_000;

/** Floor and ceiling on how long a document is cached, whatever the headers say. */
const MIN_CACHE_MS = 60_000;
const MAX_CACHE_MS = 24 * 60 * 60 * 1000;

export interface ClientMetadataDocument {
  readonly client_id: string;
  readonly client_name: string;
  readonly redirect_uris: readonly string[];
  readonly client_uri?: string;
  readonly logo_uri?: string;
}

export type CimdFailure =
  | 'not-a-url'
  | 'scheme-not-https'
  | 'missing-path'
  | 'host-not-public'
  | 'fetch-failed'
  | 'document-too-large'
  | 'not-json'
  | 'missing-fields'
  | 'client-id-mismatch';

export type CimdResult =
  | { readonly ok: true; readonly document: ClientMetadataDocument }
  | { readonly ok: false; readonly reason: CimdFailure };

/**
 * Whether a `client_id` is shaped like a Client ID Metadata Document URL.
 *
 * The draft requires `https` and a path component, so `https://example.com`
 * is not a client id but `https://example.com/client.json` is. Used to decide
 * whether to resolve a client id as CIMD or look it up as a registered one.
 */
export function isClientIdMetadataUrl(clientId: string): boolean {
  return parseClientIdUrl(clientId).ok;
}

export function parseClientIdUrl(
  clientId: string,
): { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly reason: CimdFailure } {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'scheme-not-https' };
  if (url.pathname === '' || url.pathname === '/') return { ok: false, reason: 'missing-path' };
  return { ok: true, url };
}

/**
 * Reject addresses that are not publicly routable.
 *
 * Covers loopback, private v4 ranges, link-local (including the cloud metadata
 * address 169.254.169.254), carrier-grade NAT, v6 loopback, unique-local, and
 * v6 link-local — plus IPv4-mapped v6, which is how a dual-stack resolver
 * reports a v4 answer and would otherwise walk straight past a v4-only check.
 */
export function isPubliclyRoutableAddress(address: string, family: number): boolean {
  if (family === 6) {
    const v6 = address.toLowerCase();
    if (v6 === '::1' || v6 === '::') return false;
    // IPv4-mapped (`::ffff:10.0.0.1`) — re-check against the v4 rules.
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v6);
    if (mapped?.[1] !== undefined) return isPubliclyRoutableAddress(mapped[1], 4);
    // fc00::/7 unique-local, fe80::/10 link-local.
    if (/^f[cd]/.test(v6)) return false;
    if (/^fe[89ab]/.test(v6)) return false;
    return true;
  }
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 127) return false; // this-network, loopback
  if (a === 10) return false; // private
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a >= 224) return false; // multicast and reserved
  return true;
}

/** Resolve a hostname and require every answer to be publicly routable. */
async function hostIsPublic(hostname: string): Promise<boolean> {
  try {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    if (answers.length === 0) return false;
    return answers.every((answer) => isPubliclyRoutableAddress(answer.address, answer.family));
  } catch {
    return false;
  }
}

function validateDocument(parsed: unknown, expectedClientId: string): CimdResult {
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'not-json' };
  const doc = parsed as Record<string, unknown>;
  const clientId = doc.client_id;
  const clientName = doc.client_name;
  const redirectUris = doc.redirect_uris;
  if (
    typeof clientId !== 'string' ||
    typeof clientName !== 'string' ||
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((uri) => typeof uri === 'string' && uri.length > 0)
  ) {
    return { ok: false, reason: 'missing-fields' };
  }
  // The draft requires an exact match. Without it, anyone could host a
  // document claiming someone else's identity and be believed.
  if (clientId !== expectedClientId) return { ok: false, reason: 'client-id-mismatch' };
  return {
    ok: true,
    document: {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris as string[],
      ...(typeof doc.client_uri === 'string' ? { client_uri: doc.client_uri } : {}),
      ...(typeof doc.logo_uri === 'string' ? { logo_uri: doc.logo_uri } : {}),
    },
  };
}

/** `Cache-Control: max-age=…`, clamped so a hostile or absent header cannot pin us. */
function cacheMsFromHeaders(headers: Headers): number {
  const control = headers.get('cache-control') ?? '';
  const match = /max-age\s*=\s*(\d+)/i.exec(control);
  if (match?.[1] === undefined) return MIN_CACHE_MS;
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds)) return MIN_CACHE_MS;
  return Math.min(MAX_CACHE_MS, Math.max(MIN_CACHE_MS, seconds * 1000));
}

interface CacheEntry {
  readonly result: CimdResult;
  readonly expiresAt: number;
}

export interface CimdResolverDeps {
  /** Injected for tests; production passes `globalThis.fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injected for tests; production resolves DNS. */
  readonly hostIsPublicImpl?: (hostname: string) => Promise<boolean>;
  readonly now?: () => number;
}

export interface CimdResolver {
  resolve(clientId: string): Promise<CimdResult>;
  /** Drop cached documents. Used by tests and by an operator-facing reset. */
  clearCache(): void;
}

export function createCimdResolver(deps: CimdResolverDeps = {}): CimdResolver {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const hostIsPublicImpl = deps.hostIsPublicImpl ?? hostIsPublic;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  return {
    clearCache: () => cache.clear(),

    async resolve(clientId: string): Promise<CimdResult> {
      const cached = cache.get(clientId);
      if (cached !== undefined && cached.expiresAt > now()) return cached.result;

      const parsed = parseClientIdUrl(clientId);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };

      if (!(await hostIsPublicImpl(parsed.url.hostname))) {
        return { ok: false, reason: 'host-not-public' };
      }

      let response: Response;
      try {
        response = await fetchImpl(parsed.url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, reason: 'fetch-failed' };
      }
      if (!response.ok) return { ok: false, reason: 'fetch-failed' };

      let body: string;
      try {
        body = await response.text();
      } catch {
        return { ok: false, reason: 'fetch-failed' };
      }
      // Checked after reading rather than via Content-Length, which a server
      // can omit or lie about.
      if (body.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'document-too-large' };

      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return { ok: false, reason: 'not-json' };
      }

      const result = validateDocument(json, clientId);
      // Successes are cached for the header's lifetime; failures for the floor
      // only, so a client that fixes its document is not locked out for a day.
      const ttl = result.ok ? cacheMsFromHeaders(response.headers) : MIN_CACHE_MS;
      cache.set(clientId, { result, expiresAt: now() + ttl });
      return result;
    },
  };
}
