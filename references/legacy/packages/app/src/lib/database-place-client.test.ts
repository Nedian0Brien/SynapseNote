import { describe, expect, test } from 'bun:test';
import { searchDatabasePlaces } from './database-place-client.ts';

describe('database Place client', () => {
  test('sends one explicit-consent request and validates the canonical response', async () => {
    let request: Request | null = null;
    const result = await searchDatabasePlaces(
      { query: 'Seoul City Hall', consent: true, locale: 'ko-KR', limit: 3 },
      {
        fetch: (async (input, init) => {
          request = new Request(new URL(String(input), 'http://localhost'), init);
          return Response.json({
            status: 'ok',
            providerId: 'configured',
            candidates: [
              {
                displayName: 'Seoul City Hall',
                value: {
                  label: 'City Hall',
                  address: '110 Sejong-daero, Seoul',
                  lat: 37.566681,
                  lon: 126.978415,
                  precision: 'exact',
                  source: 'search',
                  provider: {
                    id: 'configured',
                    placeId: '7',
                    attribution: 'Configured provider',
                  },
                },
              },
            ],
            attribution: 'Configured provider',
            offlineFallback: true,
          });
        }) as typeof fetch,
      },
    );

    expect(request?.method).toBe('POST');
    expect(await request?.json()).toEqual({
      query: 'Seoul City Hall',
      consent: true,
      locale: 'ko-KR',
      limit: 3,
    });
    expect(result.candidates[0]?.value.source).toBe('search');
  });

  test('rejects malformed provider responses instead of trusting remote data', async () => {
    await expect(
      searchDatabasePlaces(
        { query: 'Seoul', consent: true },
        {
          fetch: (async () =>
            Response.json({
              status: 'ok',
              providerId: 'configured',
              candidates: [{ displayName: 'Bad', value: { lat: 999 } }],
              attribution: null,
              offlineFallback: true,
            })) as typeof fetch,
        },
      ),
    ).rejects.toThrow();
  });
});
