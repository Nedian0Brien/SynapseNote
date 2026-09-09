import { describe, expect, test } from 'bun:test';
import {
  createCimdResolver,
  isClientIdMetadataUrl,
  isPubliclyRoutableAddress,
  parseClientIdUrl,
} from './cimd.ts';

const CLIENT_ID = 'https://app.example.com/oauth/client.json';

const VALID_DOC = {
  client_id: CLIENT_ID,
  client_name: 'Example MCP Client',
  redirect_uris: ['https://app.example.com/cb', 'http://127.0.0.1:3000/callback'],
};

function jsonResponse(body: unknown, init: { status?: number; cacheControl?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (init.cacheControl !== undefined) headers.set('cache-control', init.cacheControl);
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

/** A resolver whose network and DNS are both controlled by the test. */
function resolver(
  respond: () => Response | Promise<Response>,
  opts: { hostIsPublic?: boolean; now?: () => number } = {},
) {
  let fetches = 0;
  const r = createCimdResolver({
    fetchImpl: (async () => {
      fetches += 1;
      return respond();
    }) as unknown as typeof fetch,
    hostIsPublicImpl: async () => opts.hostIsPublic ?? true,
    now: opts.now,
  });
  return { r, fetchCount: () => fetches };
}

describe('client id shape', () => {
  test('accepts an https URL with a path', () => {
    expect(isClientIdMetadataUrl(CLIENT_ID)).toBe(true);
  });

  test('rejects http', () => {
    expect(parseClientIdUrl('http://app.example.com/c.json')).toEqual({
      ok: false,
      reason: 'scheme-not-https',
    });
  });

  test('rejects an origin with no path', () => {
    // The draft requires a path component, which is what separates a client
    // id from a bare origin someone else might also claim.
    expect(parseClientIdUrl('https://app.example.com')).toEqual({
      ok: false,
      reason: 'missing-path',
    });
    expect(parseClientIdUrl('https://app.example.com/')).toEqual({
      ok: false,
      reason: 'missing-path',
    });
  });

  test('rejects a non-URL, so an opaque registered id is not treated as CIMD', () => {
    expect(isClientIdMetadataUrl('dcr-abc123')).toBe(false);
  });
});

describe('isPubliclyRoutableAddress', () => {
  test('accepts ordinary public addresses', () => {
    expect(isPubliclyRoutableAddress('203.0.113.9', 4)).toBe(true);
    expect(isPubliclyRoutableAddress('2001:db8::1', 6)).toBe(true);
  });

  test('rejects loopback', () => {
    expect(isPubliclyRoutableAddress('127.0.0.1', 4)).toBe(false);
    expect(isPubliclyRoutableAddress('::1', 6)).toBe(false);
  });

  test('rejects the private v4 ranges', () => {
    for (const a of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      expect(isPubliclyRoutableAddress(a, 4)).toBe(false);
    }
    // 172.15 and 172.32 are outside the private block and stay routable.
    expect(isPubliclyRoutableAddress('172.15.0.1', 4)).toBe(true);
    expect(isPubliclyRoutableAddress('172.32.0.1', 4)).toBe(true);
  });

  test('rejects the cloud metadata address', () => {
    // The single most valuable SSRF target on a cloud host.
    expect(isPubliclyRoutableAddress('169.254.169.254', 4)).toBe(false);
  });

  test('rejects carrier-grade NAT and multicast', () => {
    expect(isPubliclyRoutableAddress('100.64.0.1', 4)).toBe(false);
    expect(isPubliclyRoutableAddress('224.0.0.1', 4)).toBe(false);
  });

  test('rejects v6 unique-local and link-local', () => {
    expect(isPubliclyRoutableAddress('fd00::1', 6)).toBe(false);
    expect(isPubliclyRoutableAddress('fe80::1', 6)).toBe(false);
  });

  test('sees through IPv4-mapped v6', () => {
    // A dual-stack resolver reports a v4 answer this way; a v4-only check
    // would walk straight past it.
    expect(isPubliclyRoutableAddress('::ffff:127.0.0.1', 6)).toBe(false);
    expect(isPubliclyRoutableAddress('::ffff:10.0.0.1', 6)).toBe(false);
    expect(isPubliclyRoutableAddress('::ffff:203.0.113.9', 6)).toBe(true);
  });

  test('rejects malformed input', () => {
    expect(isPubliclyRoutableAddress('not-an-address', 4)).toBe(false);
    expect(isPubliclyRoutableAddress('999.1.1.1', 4)).toBe(false);
  });
});

describe('resolve', () => {
  test('returns a valid document', async () => {
    const { r } = resolver(() => jsonResponse(VALID_DOC));
    const result = await r.resolve(CLIENT_ID);
    expect(result).toEqual({
      ok: true,
      document: {
        client_id: CLIENT_ID,
        client_name: 'Example MCP Client',
        redirect_uris: VALID_DOC.redirect_uris,
      },
    });
  });

  test('refuses a document whose client_id does not match its URL', async () => {
    // Without this, anyone could host a document claiming another client's
    // identity and be believed.
    const { r } = resolver(() => jsonResponse({ ...VALID_DOC, client_id: 'https://evil/x.json' }));
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'client-id-mismatch' });
  });

  test('refuses a document missing required fields', async () => {
    const { r } = resolver(() => jsonResponse({ client_id: CLIENT_ID }));
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'missing-fields' });
  });

  test('refuses an empty redirect_uris list', async () => {
    const { r } = resolver(() => jsonResponse({ ...VALID_DOC, redirect_uris: [] }));
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'missing-fields' });
  });

  test('refuses a non-JSON body', async () => {
    const { r } = resolver(() => jsonResponse('<html>nope</html>'));
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'not-json' });
  });

  test('refuses an oversized document', async () => {
    const { r } = resolver(() => jsonResponse({ ...VALID_DOC, pad: 'x'.repeat(70_000) }));
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'document-too-large' });
  });

  test('refuses a non-2xx response', async () => {
    const { r } = resolver(() => jsonResponse({}, { status: 404 }));
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'fetch-failed' });
  });

  test('refuses a network failure', async () => {
    const { r } = resolver(() => {
      throw new Error('offline');
    });
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'fetch-failed' });
  });

  test('never fetches a host that resolves to a private address', async () => {
    // The SSRF guard. This process runs on a host with a dozen internal
    // services; the fetch must not happen at all.
    const { r, fetchCount } = resolver(() => jsonResponse(VALID_DOC), { hostIsPublic: false });
    expect(await r.resolve(CLIENT_ID)).toEqual({ ok: false, reason: 'host-not-public' });
    expect(fetchCount()).toBe(0);
  });

  test('never fetches a client id that is not an https URL with a path', async () => {
    const { r, fetchCount } = resolver(() => jsonResponse(VALID_DOC));
    expect(await r.resolve('http://app.example.com/c.json')).toEqual({
      ok: false,
      reason: 'scheme-not-https',
    });
    expect(fetchCount()).toBe(0);
  });
});

describe('caching', () => {
  test('a second resolve within the cache window does not refetch', async () => {
    const now = 1_000_000;
    const { r, fetchCount } = resolver(() => jsonResponse(VALID_DOC), { now: () => now });
    await r.resolve(CLIENT_ID);
    await r.resolve(CLIENT_ID);
    expect(fetchCount()).toBe(1);
  });

  test('honors a longer max-age from the response', async () => {
    let now = 1_000_000;
    const { r, fetchCount } = resolver(
      () => jsonResponse(VALID_DOC, { cacheControl: 'max-age=3600' }),
      {
        now: () => now,
      },
    );
    await r.resolve(CLIENT_ID);
    now += 10 * 60_000; // ten minutes: past the floor, inside the header
    await r.resolve(CLIENT_ID);
    expect(fetchCount()).toBe(1);
  });

  test('clamps an absurd max-age to a day', async () => {
    let now = 1_000_000;
    const { r, fetchCount } = resolver(
      () => jsonResponse(VALID_DOC, { cacheControl: 'max-age=999999999' }),
      { now: () => now },
    );
    await r.resolve(CLIENT_ID);
    now += 25 * 60 * 60 * 1000;
    await r.resolve(CLIENT_ID);
    expect(fetchCount()).toBe(2);
  });

  test('caches a failure only briefly, so a fixed document is not locked out', async () => {
    let now = 1_000_000;
    let body: unknown = { client_id: CLIENT_ID };
    const { r, fetchCount } = resolver(() => jsonResponse(body), { now: () => now });
    expect(await r.resolve(CLIENT_ID)).toMatchObject({ ok: false });
    body = VALID_DOC;
    now += 61_000;
    expect(await r.resolve(CLIENT_ID)).toMatchObject({ ok: true });
    expect(fetchCount()).toBe(2);
  });

  test('clearCache forces a refetch', async () => {
    const { r, fetchCount } = resolver(() => jsonResponse(VALID_DOC));
    await r.resolve(CLIENT_ID);
    r.clearCache();
    await r.resolve(CLIENT_ID);
    expect(fetchCount()).toBe(2);
  });
});
