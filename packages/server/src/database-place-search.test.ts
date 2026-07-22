import { describe, expect, test } from 'bun:test';
import {
  createDatabasePlaceSearchService,
  createDatabasePlaceSearchServiceFromEnv,
  createNominatimPlaceSearchProvider,
  type DatabasePlaceSearchError,
} from './database-place-search.ts';

describe('Database Place search', () => {
  test('stays unavailable and offline-safe when no provider is configured', async () => {
    const service = createDatabasePlaceSearchService({});
    await expect(service.search({ query: 'Seoul', consent: true })).resolves.toEqual({
      status: 'unavailable',
      providerId: null,
      candidates: [],
      attribution: null,
      offlineFallback: true,
    });
    await expect(
      createDatabasePlaceSearchServiceFromEnv({
        OK_DATABASE_PLACE_GEOCODER_URL: 'https://geo.example.test/search',
      }).search({ query: 'Seoul', consent: true }),
    ).resolves.toMatchObject({ status: 'unavailable', offlineFallback: true });
  });

  test('requires per-request consent before invoking a provider', async () => {
    let calls = 0;
    const service = createDatabasePlaceSearchService({
      provider: {
        id: 'test',
        attribution: 'Test data',
        async search() {
          calls += 1;
          return [];
        },
      },
    });
    await expect(
      service.search({ query: 'private address', consent: false } as never),
    ).rejects.toMatchObject({
      code: 'consent_required',
    } satisfies Partial<DatabasePlaceSearchError>);
    expect(calls).toBe(0);
  });

  test('adds provider provenance, canonicalizes candidates, and caches exact requests', async () => {
    let calls = 0;
    const service = createDatabasePlaceSearchService({
      provider: {
        id: 'configured-geocoder',
        attribution: 'Configured geocoder',
        async search() {
          calls += 1;
          return [
            {
              displayName: 'Seoul City Hall',
              value: {
                label: 'City Hall',
                address: '110 Sejong-daero, Seoul',
                lat: 37.5666805,
                lon: 126.9784147,
                precision: 'exact',
                source: 'search',
                provider: { id: 'raw', placeId: '123' },
              },
            },
          ];
        },
      },
    });
    const input = { query: 'Seoul city hall', consent: true as const };
    const first = await service.search(input);
    const second = await service.search(input);
    expect(calls).toBe(1);
    expect(second).toBe(first);
    expect(first.candidates[0]?.value).toMatchObject({
      lat: 37.566681,
      lon: 126.978415,
      source: 'search',
      provider: {
        id: 'configured-geocoder',
        placeId: '123',
        attribution: 'Configured geocoder',
      },
    });
  });

  test('Nominatim adapter requires explicit safe configuration and emits one submitted query', async () => {
    expect(() =>
      createNominatimPlaceSearchProvider({
        baseUrl: 'https://nominatim.openstreetmap.org/search',
        attribution: 'OpenStreetMap contributors',
        userAgent: 'SynapseNote-Test/1.0',
      }),
    ).toThrow('community Nominatim endpoint cannot be configured directly');
    let requested = '';
    const provider = createNominatimPlaceSearchProvider({
      baseUrl: 'https://geo.example.test/search',
      attribution: 'Example map data',
      userAgent: 'SynapseNote-Test/1.0',
      fetch: (async (input) => {
        requested = String(input);
        return new Response(
          JSON.stringify([
            {
              place_id: 7,
              display_name: 'Seoul, Republic of Korea',
              name: 'Seoul',
              lat: '37.5665',
              lon: '126.9780',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch,
    });
    const candidates = await provider.search({
      query: 'Seoul',
      countryCodes: ['kr'],
      limit: 5,
    });
    expect(requested).toContain('q=Seoul');
    expect(requested).toContain('countrycodes=kr');
    expect(candidates[0]?.value.provider?.placeId).toBe('7');
  });
});
