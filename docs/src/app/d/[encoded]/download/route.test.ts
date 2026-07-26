import { describe, expect, mock, test } from 'bun:test';

const SPLASH_URL =
  'https://github.com/Nedian0Brien/SynapseNote/releases/latest/download/SynapseNote-arm64.dmg';

type CaptureOpts = {
  event: string;
  distinctId: string;
  properties?: Record<string, string | undefined>;
};
let _lastCapture: CaptureOpts | null = null;
let _isPrefetch = false;
mock.module('../../../../lib/track.ts', () => ({
  captureServerEvent: (opts: CaptureOpts) => {
    _lastCapture = opts;
  },
  resolveDistinctId: () => 'splash-1',
  attribution: () => ({ referrer: 'synapse.lawdigest.kr', utm_content: 'should-be-overridden' }),
  isPrefetchRequest: () => _isPrefetch,
}));

mock.module('../../../../lib/share-splash.ts', () => ({
  SPLASH_DOWNLOAD_URL: SPLASH_URL,
}));

const { GET } = await import('./route.ts');

function call(encoded: string): Promise<Response> {
  return GET(new Request(`https://synapse.lawdigest.kr/d/${encoded}/download`), {
    params: Promise.resolve({ encoded }),
  });
}

describe('GET /d/[encoded]/download', () => {
  test('valid share: 302 to the DMG without a pairing cookie', async () => {
    _lastCapture = null;
    const res = await call('valid-share');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SPLASH_URL);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(_lastCapture?.event).toBe('dmg_downloaded');
    expect(_lastCapture?.properties?.channel).toBe('stable');
    // Server-authoritative: overrides the attribution() value.
    expect(_lastCapture?.properties?.utm_content).toBe('share-splash');
    expect(_lastCapture?.distinctId).toBe('splash-1');
  });

  test('invalid share: 302 still counts the download', async () => {
    _lastCapture = null;
    const res = await call('bad-share');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SPLASH_URL);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(_lastCapture?.event).toBe('dmg_downloaded');
    expect(_lastCapture?.properties?.utm_content).toBe('share-splash');
  });

  test('unsupported-version share: still counts', async () => {
    _lastCapture = null;
    const res = await call('old-share');
    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(_lastCapture?.event).toBe('dmg_downloaded');
  });

  test('a prefetch still redirects but is NOT counted', async () => {
    _lastCapture = null;
    _isPrefetch = true;
    try {
      const res = await call('valid-share');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(SPLASH_URL);
      expect(_lastCapture).toBeNull();
    } finally {
      _isPrefetch = false;
    }
  });
});
