import { type DatabasePlaceValue, DatabasePlaceValueSchema } from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

const ResponseSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    providerId: z.string().min(1).nullable(),
    candidates: z.array(
      z
        .object({
          value: DatabasePlaceValueSchema,
          displayName: z.string().min(1),
        })
        .strict(),
    ),
    attribution: z.string().min(1).nullable(),
    offlineFallback: z.literal(true),
  })
  .strict();

export interface DatabasePlaceSearchResponse {
  status: 'ok' | 'unavailable';
  providerId: string | null;
  candidates: Array<{ value: DatabasePlaceValue; displayName: string }>;
  attribution: string | null;
  offlineFallback: true;
}

export async function searchDatabasePlaces(
  input: { query: string; consent: true; locale?: string; limit?: number },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<DatabasePlaceSearchResponse> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/place/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : `Place search failed with HTTP ${response.status}`;
    throw new Error(detail);
  }
  return ResponseSchema.parse(body);
}
