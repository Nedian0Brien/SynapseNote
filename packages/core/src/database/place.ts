import { z } from 'zod';

export const DATABASE_PLACE_PRECISIONS = ['exact', 'approximate'] as const;
export const DATABASE_PLACE_SOURCES = ['manual', 'device', 'search'] as const;

export const DatabasePlaceValueSchema = z
  .object({
    label: z.string().trim().max(300).default(''),
    address: z.string().trim().max(2_000).default(''),
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    precision: z.enum(DATABASE_PLACE_PRECISIONS).default('exact'),
    source: z.enum(DATABASE_PLACE_SOURCES).default('manual'),
    provider: z
      .object({
        id: z.string().trim().min(1).max(100),
        placeId: z.string().trim().min(1).max(500).optional(),
        attribution: z.string().trim().min(1).max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.label === '' && value.address === '') {
      context.addIssue({
        code: 'custom',
        path: ['label'],
        message: 'A place requires a label or address',
      });
    }
    if (value.source === 'search' && value.provider === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['provider'],
        message: 'A searched place requires provider provenance',
      });
    }
    if (value.source !== 'search' && value.provider !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['provider'],
        message: 'Provider provenance is only valid for searched places',
      });
    }
  });

export type DatabasePlaceValue = z.infer<typeof DatabasePlaceValueSchema>;

function roundedCoordinate(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Validate and normalize a place before it enters typed database state.
 * Approximate values are rounded in storage, not merely hidden in the UI, so
 * exact coordinates cannot leak through exports or agent context packs.
 */
export function canonicalizeDatabasePlaceValue(value: unknown): DatabasePlaceValue {
  const parsed = DatabasePlaceValueSchema.parse(value);
  const digits = parsed.precision === 'approximate' ? 2 : 6;
  return {
    ...parsed,
    lat: roundedCoordinate(parsed.lat, digits),
    lon: roundedCoordinate(parsed.lon, digits),
  };
}

export function databasePlaceDisplayName(value: DatabasePlaceValue): string {
  return value.label || value.address || `${value.lat}, ${value.lon}`;
}

export function databasePlaceSearchText(value: DatabasePlaceValue): string {
  return [value.label, value.address].filter(Boolean).join(' · ');
}

/** Compact, self-describing projection used by clipboard and agent surfaces. */
export function serializeDatabasePlaceValue(value: DatabasePlaceValue): string {
  return JSON.stringify(canonicalizeDatabasePlaceValue(value));
}
