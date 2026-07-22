import { z } from 'zod';
import { DatabaseIdSchema, DatabaseRecordIdSchema, DataSourceIdSchema } from './schema.ts';

export const DatabaseSummaryIdSchema = z.string().regex(/^sum_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export type DatabaseSummaryId = z.infer<typeof DatabaseSummaryIdSchema>;

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const GeneratedDatabaseSummarySchema = z
  .object({
    version: z.literal(1),
    id: DatabaseSummaryIdSchema,
    databaseId: DatabaseIdSchema,
    sourceId: DataSourceIdSchema,
    recordId: DatabaseRecordIdSchema,
    summary: z.string().trim().min(1).max(50_000),
    sourceHash: Sha256Schema,
    schemaRevision: Sha256Schema,
    createdAt: z.iso.datetime({ offset: true }),
    modelProvenance: z
      .object({
        provider: z.string().trim().min(1).max(200),
        model: z.string().trim().min(1).max(300),
        modelRevision: z.string().trim().min(1).max(300).optional(),
        promptRevision: z.string().trim().min(1).max(300),
        generationId: z.string().trim().min(1).max(500).optional(),
      })
      .strict(),
    state: z
      .object({
        stale: z.boolean(),
        checkedAt: z.iso.datetime({ offset: true }),
        reason: z
          .enum(['source_changed', 'schema_changed', 'source_missing', 'manually_invalidated'])
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((summary, ctx) => {
    if (summary.state.stale !== Boolean(summary.state.reason)) {
      ctx.addIssue({
        code: 'custom',
        path: ['state', 'reason'],
        message: 'A stale summary requires a reason and a fresh summary cannot have one',
      });
    }
    if (Date.parse(summary.state.checkedAt) < Date.parse(summary.createdAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['state', 'checkedAt'],
        message: 'Summary freshness cannot be checked before the summary was created',
      });
    }
  });

export type GeneratedDatabaseSummary = z.infer<typeof GeneratedDatabaseSummarySchema>;

export interface DatabaseSummaryObservation {
  sourceHash: string | null;
  schemaRevision: string;
  checkedAt: string;
}

/** Re-evaluate freshness without mutating the input artifact. */
export function assessGeneratedDatabaseSummary(
  input: GeneratedDatabaseSummary,
  observation: DatabaseSummaryObservation,
): GeneratedDatabaseSummary {
  const current = GeneratedDatabaseSummarySchema.parse(input);
  const observed = z
    .object({
      sourceHash: Sha256Schema.nullable(),
      schemaRevision: Sha256Schema,
      checkedAt: z.iso.datetime({ offset: true }),
    })
    .strict()
    .parse(observation);
  const reason =
    observed.sourceHash === null
      ? ('source_missing' as const)
      : observed.sourceHash !== current.sourceHash
        ? ('source_changed' as const)
        : observed.schemaRevision !== current.schemaRevision
          ? ('schema_changed' as const)
          : null;
  return GeneratedDatabaseSummarySchema.parse({
    ...structuredClone(current),
    state: {
      stale: reason !== null,
      checkedAt: observed.checkedAt,
      ...(reason ? { reason } : {}),
    },
  });
}
