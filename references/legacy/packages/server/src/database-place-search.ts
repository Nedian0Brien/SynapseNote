import { createHash } from 'node:crypto';
import {
  canonicalizeDatabasePlaceValue,
  type DatabasePlaceValue,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

export const DatabasePlaceSearchInputSchema = z
  .object({
    query: z.string().trim().min(2).max(500),
    locale: z.string().trim().min(2).max(35).optional(),
    countryCodes: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z]{2}$/),
      )
      .max(10)
      .default([]),
    limit: z.number().int().min(1).max(10).default(5),
    consent: z.literal(true),
  })
  .strict();

export type DatabasePlaceSearchInput = z.input<typeof DatabasePlaceSearchInputSchema>;

export interface DatabasePlaceSearchCandidate {
  value: DatabasePlaceValue;
  displayName: string;
}

export interface DatabasePlaceSearchResult {
  status: 'ok' | 'unavailable';
  providerId: string | null;
  candidates: readonly DatabasePlaceSearchCandidate[];
  attribution: string | null;
  offlineFallback: true;
}

export interface DatabasePlaceSearchProvider {
  readonly id: string;
  readonly attribution: string;
  search(input: {
    query: string;
    locale?: string;
    countryCodes: readonly string[];
    limit: number;
    signal?: AbortSignal;
  }): Promise<readonly DatabasePlaceSearchCandidate[]>;
}

export class DatabasePlaceSearchError extends Error {
  constructor(
    readonly code: 'consent_required' | 'invalid_request' | 'provider_failed',
    message: string,
  ) {
    super(message);
    this.name = 'DatabasePlaceSearchError';
  }
}

/**
 * Explicit-submit geocoding boundary. The service has no built-in public
 * provider: a standalone clone stays offline until its operator deliberately
 * configures one and accepts that provider's policy.
 */
export function createDatabasePlaceSearchService(options: {
  provider?: DatabasePlaceSearchProvider | null;
  cacheTtlMs?: number;
  now?: () => number;
}) {
  const provider = options.provider ?? null;
  const cacheTtlMs = options.cacheTtlMs ?? 7 * 24 * 60 * 60 * 1_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expiresAt: number; result: DatabasePlaceSearchResult }>();

  return {
    async search(raw: DatabasePlaceSearchInput): Promise<DatabasePlaceSearchResult> {
      const parsed = DatabasePlaceSearchInputSchema.safeParse(raw);
      if (!parsed.success) {
        const consentMissing =
          raw && typeof raw === 'object' && 'consent' in raw && raw.consent !== true;
        throw new DatabasePlaceSearchError(
          consentMissing ? 'consent_required' : 'invalid_request',
          consentMissing
            ? 'Place search requires explicit consent for this provider request'
            : 'Place search request is invalid',
        );
      }
      if (!provider) {
        return {
          status: 'unavailable',
          providerId: null,
          candidates: [],
          attribution: null,
          offlineFallback: true,
        };
      }
      const cacheKey = createHash('sha256')
        .update(
          JSON.stringify([
            provider.id,
            parsed.data.query.toLocaleLowerCase('en-US'),
            parsed.data.locale ?? '',
            parsed.data.countryCodes,
            parsed.data.limit,
          ]),
        )
        .digest('hex');
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now()) return cached.result;
      try {
        const candidates = (await provider.search(parsed.data))
          .slice(0, parsed.data.limit)
          .map((candidate) => ({
            displayName: candidate.displayName,
            value: canonicalizeDatabasePlaceValue({
              ...candidate.value,
              source: 'search',
              provider: {
                id: provider.id,
                ...(candidate.value.provider?.placeId
                  ? { placeId: candidate.value.provider.placeId }
                  : {}),
                attribution: provider.attribution,
              },
            }),
          }));
        const result: DatabasePlaceSearchResult = {
          status: 'ok',
          providerId: provider.id,
          candidates,
          attribution: provider.attribution,
          offlineFallback: true,
        };
        cache.set(cacheKey, { expiresAt: now() + cacheTtlMs, result });
        return result;
      } catch {
        // Never echo the query or a provider response; either may contain private data.
        throw new DatabasePlaceSearchError(
          'provider_failed',
          'The configured place provider failed; stored places remain available offline',
        );
      }
    },
  };
}

export type DatabasePlaceSearchService = ReturnType<typeof createDatabasePlaceSearchService>;

const NominatimCandidateSchema = z
  .object({
    place_id: z.union([z.string(), z.number()]),
    display_name: z.string().trim().min(1).max(2_000),
    name: z.string().trim().max(300).optional(),
    lat: z.string(),
    lon: z.string(),
  })
  .passthrough();

/**
 * Nominatim-compatible adapter for a deliberately configured endpoint. It is
 * never pointed at the community public service by default and performs one
 * submitted query per call (no client-side autocomplete).
 */
export function createNominatimPlaceSearchProvider(options: {
  baseUrl: string;
  id?: string;
  attribution: string;
  userAgent: string;
  fetch?: typeof globalThis.fetch;
}): DatabasePlaceSearchProvider {
  const endpoint = new URL(options.baseUrl);
  if (
    endpoint.protocol !== 'https:' &&
    endpoint.hostname !== '127.0.0.1' &&
    endpoint.hostname !== 'localhost'
  ) {
    throw new Error('Place provider must use HTTPS or a loopback URL');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('Place provider credentials must not be embedded in its URL');
  }
  if (endpoint.hostname === 'nominatim.openstreetmap.org') {
    throw new Error(
      'The community Nominatim endpoint cannot be configured directly; use a self-hosted or contracted provider',
    );
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return {
    id: options.id ?? endpoint.hostname,
    attribution: options.attribution,
    async search(input) {
      const url = new URL(endpoint);
      url.searchParams.set('q', input.query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', String(input.limit));
      if (input.locale) url.searchParams.set('accept-language', input.locale);
      if (input.countryCodes.length > 0) {
        url.searchParams.set('countrycodes', input.countryCodes.join(','));
      }
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': options.userAgent },
        signal: input.signal,
      });
      if (!response.ok) throw new Error('provider request failed');
      const rows = z
        .array(NominatimCandidateSchema)
        .max(50)
        .parse(await response.json());
      return rows.map((row) => ({
        displayName: row.display_name,
        value: {
          label: row.name ?? row.display_name.split(',')[0]?.trim() ?? row.display_name,
          address: row.display_name,
          lat: Number(row.lat),
          lon: Number(row.lon),
          precision: 'exact' as const,
          source: 'search' as const,
          provider: { id: options.id ?? endpoint.hostname, placeId: String(row.place_id) },
        },
      }));
    },
  };
}

export function createDatabasePlaceSearchServiceFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DatabasePlaceSearchService {
  const baseUrl = env.OK_DATABASE_PLACE_GEOCODER_URL?.trim();
  const attribution = env.OK_DATABASE_PLACE_GEOCODER_ATTRIBUTION?.trim();
  const userAgent = env.OK_DATABASE_PLACE_GEOCODER_USER_AGENT?.trim();
  if (!baseUrl || !attribution || !userAgent) {
    return createDatabasePlaceSearchService({});
  }
  return createDatabasePlaceSearchService({
    provider: createNominatimPlaceSearchProvider({ baseUrl, attribution, userAgent }),
  });
}
