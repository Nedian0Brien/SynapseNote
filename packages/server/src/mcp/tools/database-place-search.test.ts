import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-place-search.ts';
import type { ServerInstance } from './shared.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function capture() {
  let handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>> =
    async () => ({});
  let config: Record<string, unknown> = {};
  const server = {
    registerTool(_name: string, nextConfig: Record<string, unknown>, nextHandler: typeof handler) {
      config = nextConfig;
      handler = nextHandler;
    },
  } as unknown as ServerInstance;
  register(server, {
    resolveCwd: async () => '/project',
    config: {} as Config,
    serverUrl: 'http://localhost:7777',
  });
  return { handler, config };
}

describe('data_place_search MCP tool', () => {
  test('refuses egress locally until consent is explicit', async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      return Response.json({});
    }) as unknown as typeof fetch;
    const { config, handler } = capture();
    expect(config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    const result = await handler({ query: 'private address', consent: false });
    expect(result.isError).toBe(true);
    expect(calls).toBe(0);
  });

  test('forwards one approved submitted query and returns canonical candidates', async () => {
    const requests: unknown[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        status: 'ok',
        providerId: 'configured',
        candidates: [
          {
            displayName: 'Seoul',
            value: {
              label: 'Seoul',
              address: 'Seoul, Republic of Korea',
              lat: 37.5665,
              lon: 126.978,
              precision: 'exact',
              source: 'search',
              provider: { id: 'configured', attribution: 'Map data' },
            },
          },
        ],
        attribution: 'Map data',
        offlineFallback: true,
      });
    }) as unknown as typeof fetch;
    const result = await capture().handler({
      query: 'Seoul',
      consent: true,
      countryCodes: ['KR'],
      limit: 3,
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('1 canonical Place candidate') }),
    ]);
    expect(requests).toEqual([{ query: 'Seoul', consent: true, countryCodes: ['KR'], limit: 3 }]);
  });

  test('rejects malformed remote candidates before exposing them to an agent', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        status: 'ok',
        providerId: 'configured',
        candidates: [{ displayName: 'Bad', value: { lat: 999 } }],
        attribution: null,
        offlineFallback: true,
      }),
    ) as unknown as typeof fetch;
    const result = await capture().handler({ query: 'Seoul', consent: true });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({ text: 'Error: Place provider returned an invalid response.' }),
    ]);
  });
});
