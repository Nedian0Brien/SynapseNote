import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { OkWebPreviewMetadata } from '../shared/bridge-contract.ts';

const HTML_LIMIT = 512 * 1024;
const IMAGE_LIMIT = 2 * 1024 * 1024;
const ICON_LIMIT = 256 * 1024;
const REDIRECT_LIMIT = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface LookupAddress {
  readonly address: string;
}

export interface WebPreviewDeps {
  readonly fetch: typeof fetch;
  readonly lookup: (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<readonly LookupAddress[]>;
}

interface FetchedResource {
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly finalUrl: URL;
}

interface ParsedOpenGraph {
  readonly title?: string;
  readonly description?: string;
  readonly siteName?: string;
  readonly imageUrl?: string;
  readonly faviconUrl?: string;
}

const defaultDeps: WebPreviewDeps = {
  fetch,
  lookup: (hostname, options) => dnsLookup(hostname, options),
};

const cache = new Map<
  string,
  { readonly expiresAt: number; readonly value: Promise<OkWebPreviewMetadata | null> }
>();

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return false;
  if (normalized === '::' || normalized === '::1') return false;
  if (/^(?:fc|fd|fe[89ab]|ff)/.test(normalized)) return false;
  if (normalized.startsWith('2001:db8:')) return false;
  return /^[23]/.test(normalized);
}

function parsePublicUrl(value: string | URL): URL | null {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !hostname.includes('.') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa')
  ) {
    return null;
  }
  if (isIP(hostname) !== 0 && !isPublicAddress(hostname)) return null;
  return url;
}

async function resolvesPublicly(url: URL, deps: WebPreviewDeps): Promise<boolean> {
  if (isIP(url.hostname) !== 0) return isPublicAddress(url.hostname);
  try {
    const addresses = await deps.lookup(url.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address));
  } catch {
    return false;
  }
}

async function readLimited(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(chunk.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function fetchPublicResource(
  rawUrl: string | URL,
  accept: string,
  byteLimit: number,
  deps: WebPreviewDeps,
): Promise<FetchedResource | null> {
  let current = parsePublicUrl(rawUrl);
  if (!current) return null;
  for (let redirect = 0; redirect <= REDIRECT_LIMIT; redirect += 1) {
    if (!(await resolvesPublicly(current, deps))) return null;
    let response: Response;
    try {
      response = await deps.fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(6_000),
        headers: {
          accept,
          'user-agent': 'Mozilla/5.0 (compatible; SynapseNote/1.0; +https://synapsenote.app)',
        },
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === REDIRECT_LIMIT) return null;
      current = parsePublicUrl(new URL(location, current));
      if (!current) return null;
      continue;
    }
    if (!response.ok) return null;
    const bytes = await readLimited(response, byteLimit);
    if (!bytes) return null;
    return {
      bytes,
      contentType: response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '',
      finalUrl: current,
    };
  }
  return null;
}

function decodeHtml(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (match, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      if (lower === 'nbsp') return ' ';
      const radix = lower.startsWith('#x') ? 16 : 10;
      const numeric = Number.parseInt(lower.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
    },
  );
}

function normalizedText(value: string | undefined, limit: number): string | undefined {
  const text =
    value === undefined
      ? ''
      : decodeHtml(value)
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
  return text ? text.slice(0, limit) : undefined;
}

function tagsNamed(html: string, tagName: string): string[] {
  const starts = new RegExp(`<${tagName}\\b`, 'gi');
  const tags: string[] = [];
  for (const match of html.matchAll(starts)) {
    const start = match.index ?? 0;
    let quote = '';
    for (let cursor = start; cursor < html.length; cursor += 1) {
      const char = html[cursor] ?? '';
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        tags.push(html.slice(start, cursor + 1));
        break;
      }
    }
  }
  return tags;
}

function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name && value !== undefined) attributes.set(name, decodeHtml(value));
  }
  return attributes;
}

export function parseOpenGraphHtml(html: string, baseUrl: URL): ParsedOpenGraph {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? html.slice(0, HTML_LIMIT);
  const metadata = new Map<string, string>();
  for (const tag of tagsNamed(head, 'meta')) {
    const attributes = attributesOf(tag);
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase();
    const content = attributes.get('content');
    if (key && content && !metadata.has(key)) metadata.set(key, content);
  }
  let faviconUrl: string | undefined;
  for (const tag of tagsNamed(head, 'link')) {
    const attributes = attributesOf(tag);
    const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? [];
    const href = attributes.get('href');
    if (href && rel.some((value) => value === 'icon' || value === 'shortcut')) {
      try {
        faviconUrl = new URL(href, baseUrl).toString();
      } catch {
        faviconUrl = undefined;
      }
      if (faviconUrl) break;
    }
  }
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const image =
    metadata.get('og:image:secure_url') ??
    metadata.get('og:image') ??
    metadata.get('twitter:image') ??
    metadata.get('twitter:image:src');
  let imageUrl: string | undefined;
  if (image) {
    try {
      imageUrl = new URL(image, baseUrl).toString();
    } catch {
      imageUrl = undefined;
    }
  }
  return {
    title: normalizedText(
      metadata.get('og:title') ?? metadata.get('twitter:title') ?? titleTag,
      240,
    ),
    description: normalizedText(
      metadata.get('og:description') ??
        metadata.get('twitter:description') ??
        metadata.get('description'),
      500,
    ),
    siteName: normalizedText(metadata.get('og:site_name'), 100),
    ...(imageUrl ? { imageUrl } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
  };
}

async function imageDataUrl(
  rawUrl: string | undefined,
  limit: number,
  deps: WebPreviewDeps,
): Promise<string | undefined> {
  if (!rawUrl) return undefined;
  const resource = await fetchPublicResource(
    rawUrl,
    'image/avif,image/webp,image/png,image/jpeg,image/gif',
    limit,
    deps,
  );
  if (
    !resource ||
    !/^image\/(?:avif|webp|png|jpeg|gif|x-icon|vnd\.microsoft\.icon)$/.test(resource.contentType)
  ) {
    return undefined;
  }
  return `data:${resource.contentType};base64,${resource.bytes.toString('base64')}`;
}

async function loadWebPreview(
  rawUrl: string,
  deps: WebPreviewDeps,
): Promise<OkWebPreviewMetadata | null> {
  const page = await fetchPublicResource(
    rawUrl,
    'text/html,application/xhtml+xml',
    HTML_LIMIT,
    deps,
  );
  if (!page || !/^(?:text\/html|application\/xhtml\+xml)$/.test(page.contentType)) return null;
  const parsed = parseOpenGraphHtml(page.bytes.toString('utf8'), page.finalUrl);
  const [image, favicon] = await Promise.all([
    imageDataUrl(parsed.imageUrl, IMAGE_LIMIT, deps),
    imageDataUrl(
      parsed.faviconUrl ?? new URL('/favicon.ico', page.finalUrl).toString(),
      ICON_LIMIT,
      deps,
    ),
  ]);
  return {
    url: page.finalUrl.toString(),
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.siteName ? { siteName: parsed.siteName } : {}),
    ...(image ? { imageDataUrl: image } : {}),
    ...(favicon ? { faviconDataUrl: favicon } : {}),
  };
}

export function fetchWebPreviewMetadata(
  rawUrl: string,
  deps: WebPreviewDeps = defaultDeps,
): Promise<OkWebPreviewMetadata | null> {
  const normalized = parsePublicUrl(rawUrl)?.toString();
  if (!normalized) return Promise.resolve(null);
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = loadWebPreview(normalized, deps).catch(() => null);
  cache.set(normalized, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
