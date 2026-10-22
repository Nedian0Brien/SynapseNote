import { after } from 'next/server';

/**
 * Server-side PostHog capture for the download/update redirect routes.
 *
 * Reuses the existing `NEXT_PUBLIC_POSTHOG_KEY` (the same project the
 * client-side `instrumentation-client.ts` writes to) — no new env, no
 * `posthog-node` dependency. Capturing from the server, not the browser,
 * means PostHog never sees the visitor's IP (it sees Vercel's egress IP);
 * the payload additionally suppresses geo so nothing location-shaped is
 * stored. Events are queued via `after()` so a slow or failing capture can
 * never delay or break the redirect the user is waiting on.
 */

const POSTHOG_CAPTURE_URL = 'https://us.i.posthog.com/capture/';
const CAPTURE_TIMEOUT_MS = 3_000;

export interface TrackOptions {
  event: string;
  distinctId: string;
  /** Omitted (undefined) values are stripped so they never serialize as "undefined". */
  properties?: Record<string, string | undefined>;
}

export interface CapturePayload {
  api_key: string;
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

/**
 * Pure payload builder (the unit-testable seam). Strips undefined props and
 * forces the two privacy guards: `$ip: null` discards the (Vercel egress) IP
 * server-side, and `$geoip_disable` stops PostHog deriving geo from it.
 */
export function buildCapturePayload(opts: TrackOptions, key: string): CapturePayload {
  const properties: Record<string, unknown> = {};
  if (opts.properties) {
    for (const [k, v] of Object.entries(opts.properties)) {
      if (v !== undefined) properties[k] = v;
    }
  }
  properties.$ip = null;
  properties.$geoip_disable = true;
  return {
    api_key: key,
    event: opts.event,
    distinct_id: opts.distinctId,
    timestamp: new Date().toISOString(),
    properties,
  };
}

/**
 * Fire-and-forget event capture. No-ops when the key is unset (mirrors
 * `instrumentation-client.ts`, so local/preview without the key stay silent).
 * Never throws and never blocks the response: the POST runs in `after()` and
 * any failure is swallowed.
 */
export function captureServerEvent(opts: TrackOptions): void {
  try {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const payload = buildCapturePayload(opts, key);
    after(async () => {
      try {
        const res = await fetch(POSTHOG_CAPTURE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
        });
        // fetch only rejects on network failure; a 4xx/5xx (bad key, rate limit)
        // resolves normally, so surface it rather than silently dropping events.
        if (!res.ok) {
          console.warn(`[track] capture HTTP ${res.status} for ${opts.event}`);
        }
      } catch (err) {
        console.warn(
          `[track] capture failed for ${opts.event}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  } catch (err) {
    // Telemetry must never break a redirect — guard the synchronous path too
    // (e.g. after() called outside a request scope, or any scheduling error).
    console.warn(
      `[track] capture skipped for ${opts.event}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Reuse the web visitor's PostHog id when present so a site click and its
 * download are one person, then fall back to a fresh random id for hits with
 * no browser session (README/HN links, the auto-updater). `posthog-js` stores
 * its persistence under `ph_<projectKey>_posthog` as JSON `{ distinct_id }`.
 */
export function resolveDistinctId(request: Request): string {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key) {
    const fromCookie = readPosthogDistinctId(request, key);
    if (fromCookie) return fromCookie;
  }
  return crypto.randomUUID();
}

function readPosthogDistinctId(request: Request, key: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const cookieName = `ph_${key}_posthog`;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== cookieName) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(part.slice(eq + 1).trim())) as {
        distinct_id?: unknown;
      };
      return typeof parsed.distinct_id === 'string' && parsed.distinct_id.length > 0
        ? parsed.distinct_id
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The standard UTM campaign parameters, captured under their canonical names
 * so PostHog's built-in UTM property definitions apply. Internal CTAs set only
 * `utm_content` (the standard field for differentiating links/CTAs);
 * `utm_source`/`utm_medium`/`utm_campaign` describe the acquisition channel
 * and are reserved for genuinely external campaign links (newsletter, social)
 * — fabricating them for internal clicks would corrupt campaign reporting.
 */
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/**
 * External campaign tools mint arbitrary UTM values, so no slug allowlist —
 * just drop control characters and bound the length.
 */
function sanitizeUtmValue(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = [...raw]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .trim()
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned : undefined;
}

const SEC_FETCH_SITE_VALUES = ['none', 'same-origin', 'same-site', 'cross-site'] as const;
type SecFetchSite = (typeof SEC_FETCH_SITE_VALUES)[number];

function isSecFetchSite(value: string): value is SecFetchSite {
  return (SEC_FETCH_SITE_VALUES as readonly string[]).includes(value);
}

export type UaClass = 'browser' | 'bot' | 'cli' | 'electron' | 'none' | 'other';

/**
 * Path detail is captured for our own referring pages only — external
 * referrers stay hostname-only.
 */
function isOwnSiteHostname(hostname: string): boolean {
  return hostname === 'synapse.lawdigest.kr' || hostname.endsWith('.synapse.lawdigest.kr');
}

export interface AttributionProperties {
  referrer?: string;
  referrer_path?: string;
  sec_fetch_site?: SecFetchSite;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  $useragent?: string;
  ua_class?: UaClass;
}

/**
 * Attribution properties for a download event:
 *
 * - `utm_*` — standard campaign parameters, passed through under their
 *   canonical names. Our own CTAs tag links with `?utm_content=<cta-slug>`
 *   (immune to referrer stripping); external campaign links can use the full
 *   set and attribute with no custom vocabulary.
 * - `referrer` / `referrer_path` — where the click came from. External sites
 *   report hostname only; the path is added for our own pages so an untagged
 *   link (e.g. pasted in docs prose) still attributes to the exact page.
 * - `sec_fetch_site` — browser-supplied fetch classification (`none` = address
 *   bar / non-web entry, `same-origin`/`same-site` = our site, `cross-site` =
 *   external link, absent = non-browser client such as curl or a bot). This is
 *   what separates "pasted the URL from the README" from "clicked a link".
 */
export function attribution(request: Request): AttributionProperties {
  const out: AttributionProperties = {};

  try {
    const params = new URL(request.url).searchParams;
    for (const name of UTM_PARAMS) {
      const value = sanitizeUtmValue(params.get(name));
      if (value) out[name] = value;
    }
  } catch {
    // no UTM capture on an unparseable request URL
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      // External referrers stay hostname-only; a referring path is only
      // captured for our own pages, and never its query string. `/d/<encoded>`
      // share routes are excluded outright — there the share payload (the
      // encoded GitHub URL) lives in the PATH itself.
      out.referrer = refUrl.hostname;
      if (isOwnSiteHostname(refUrl.hostname) && !refUrl.pathname.startsWith('/d/')) {
        out.referrer_path = refUrl.pathname.slice(0, 200);
      }
    } catch {
      // unparseable referer → no referrer properties
    }
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && isSecFetchSite(secFetchSite)) {
    out.sec_fetch_site = secFetchSite;
  }

  Object.assign(out, userAgentProperties(request));

  return out;
}

/**
 * Client identity for downloads and updates. `$useragent` is the property
 * PostHog's "User Agent Populator" transformation reads on server-captured
 * events — with that transformation enabled on the project, ingestion derives
 * `$browser`/`$browser_version` from it. `ua_class` is our own coarse,
 * bounded bucket for dashboard grouping (browsers vs bots/unfurlers vs
 * curl-style clients vs the Electron auto-updater) and needs no PostHog
 * configuration. The UA is deliberately the only request-shape property we
 * send — IP and geo stay suppressed (see buildCapturePayload).
 */
export function userAgentProperties(request: Request): {
  $useragent?: string;
  ua_class?: UaClass;
} {
  const ua = request.headers.get('user-agent');
  if (!ua) return { ua_class: 'none' };
  return { $useragent: ua.slice(0, 300), ua_class: classifyUserAgent(ua) };
}

/**
 * Order matters: Electron and bot UAs both embed `Mozilla/5.0`, so the
 * browser check must come last.
 */
function classifyUserAgent(ua: string): UaClass {
  if (/electron-updater|electron-builder|\belectron\//i.test(ua)) return 'electron';
  if (
    /bot|crawler|spider|slurp|bingpreview|externalhit|embedly|whatsapp|telegram|slack|discord|pinterest|linkedin|vkshare/i.test(
      ua,
    )
  ) {
    return 'bot';
  }
  if (
    /^curl|^wget|^httpie|python-requests|python-urllib|node-fetch|undici|axios|go-http-client|okhttp|java\/|libwww/i.test(
      ua,
    )
  ) {
    return 'cli';
  }
  if (ua.startsWith('Mozilla/')) return 'browser';
  return 'other';
}

/**
 * Browser and framework prefetches hit the download routes without a real
 * click (Chrome sends `Sec-Purpose: prefetch`, Safari `Purpose: prefetch`,
 * next/link `Next-Router-Prefetch: 1`). Counting them would inflate download
 * numbers with phantom events — callers skip capture but still redirect.
 */
export function isPrefetchRequest(request: Request): boolean {
  const purpose = request.headers.get('sec-purpose') ?? request.headers.get('purpose') ?? '';
  if (/prefetch|prerender/i.test(purpose)) return true;
  return request.headers.get('next-router-prefetch') !== null;
}
