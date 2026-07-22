import { z } from 'zod';
import { DatabaseRecordIdSchema, DataSourceIdSchema } from './schema.ts';

/** Minimal readable relation target returned only after the target read scope is applied. */
export const ProjectedDatabaseRelationRecordSchema = z
  .object({
    id: DatabaseRecordIdSchema,
    sourceId: DataSourceIdSchema,
    title: z.string(),
    archivedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ProjectedDatabaseRelationRecord = z.infer<typeof ProjectedDatabaseRelationRecordSchema>;
