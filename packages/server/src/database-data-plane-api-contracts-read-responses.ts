import {
  DatabaseValueSchema as CoreDatabaseValueSchema,
  DatabaseDefinitionSchema,
  DatabaseMarkdownRecordRevisionSetSchema,
  DatabaseSourceSchema,
  FormulaComputedResultSchema,
  FrontmatterValueSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

export const DatabaseCatalogFullResponseSchema = z
  .object({
    query: z.string().nullable(),
    manifestRevision: z.string().min(1),
    catalogRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    complete: z.literal(true),
    candidates: z.array(
      z
        .object({
          id: z.string().min(1),
          key: z.string().min(1),
          name: z.string().min(1),
          purpose: z.string().min(1),
          sources: z.array(
            z.object({
              id: z.string().min(1),
              key: z.string().min(1),
              name: z.string().min(1),
              recordMeaning: z.string().min(1),
              propertyCount: z.number().int().nonnegative(),
            }),
          ),
          viewCount: z.number().int().nonnegative(),
          relationCount: z.number().int().nonnegative(),
          score: z.number().nonnegative(),
          matchedBy: z.array(z.string()),
        })
        .loose(),
    ),
  })
  .strict();
export const DatabaseCatalogNotModifiedResponseSchema = z
  .object({
    notModified: z.literal(true),
    query: z.string().nullable(),
    manifestRevision: z.string().min(1),
    catalogRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const DatabaseCatalogResponseSchema = z.union([
  DatabaseCatalogFullResponseSchema,
  DatabaseCatalogNotModifiedResponseSchema,
]);

export const DatabaseIndexStatusSchema = z
  .object({
    state: z.enum(['idle', 'rebuilding', 'error']),
    revision: z.string().min(1),
    manifestRevision: z.string().min(1),
    recordCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
    progress: z
      .object({
        discovered: z.number().int().nonnegative(),
        processed: z.number().int().nonnegative(),
      })
      .nullable(),
    lastRebuiltAt: z.string().nullable(),
    lastIncrementalAt: z.string().nullable(),
    lastError: z
      .object({ code: z.literal('rebuild_failed'), message: z.string().min(1) })
      .nullable(),
  })
  .strict();

export const DatabaseStorageCapabilitySchema = z
  .object({
    appProtocolVersion: z.literal(1),
    manifestVersion: z.number().int(),
    tableFormatVersion: z.number().int().nullable(),
    read: z.enum(['full', 'read_only', 'unsupported']),
    write: z.enum(['v1_record_files', 'v2_markdown_table', 'migration_required', 'unsupported']),
    reason: z.string().min(1),
  })
  .strict();

export const DatabaseDescribeFullResponseSchema = z
  .object({
    manifestRevision: z.string().min(1),
    schemaRevision: z.string().startsWith('sha256:'),
    database: DatabaseDefinitionSchema,
    source: DatabaseSourceSchema.nullable(),
    index: DatabaseIndexStatusSchema,
    storageCapabilities: z.array(DatabaseStorageCapabilitySchema),
    allowedOperations: z.tuple([
      z.literal('catalog'),
      z.literal('describe'),
      z.literal('find'),
      z.literal('query'),
      z.literal('pack'),
    ]),
  })
  .strict();
export const DatabaseDescribeNotModifiedResponseSchema = z
  .object({
    notModified: z.literal(true),
    manifestRevision: z.string().min(1),
    schemaRevision: z.string().startsWith('sha256:'),
    databaseId: z.string().min(1),
    sourceId: z.string().min(1).nullable(),
  })
  .strict();
export const DatabaseDescribeResponseSchema = z.union([
  DatabaseDescribeFullResponseSchema,
  DatabaseDescribeNotModifiedResponseSchema,
]);

export const DatabaseValueSchema = CoreDatabaseValueSchema;
export const DatabaseRecordResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    record: z
      .object({
        id: z.string().startsWith('rec_'),
        path: z.string().min(1),
        revision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .nullable(),
        semanticRevisions: DatabaseMarkdownRecordRevisionSetSchema.optional(),
        values: z.record(z.string(), DatabaseValueSchema),
        invalidValues: z.record(z.string(), FrontmatterValueSchema).optional(),
        issues: z
          .array(
            z
              .object({
                code: z.enum([
                  'missing_required_value',
                  'invalid_property_value',
                  'unknown_select_option',
                  'unknown_person',
                  'duplicate_array_value',
                ]),
                propertyId: z.string().startsWith('prop_'),
                propertyKey: z.string().min(1),
                message: z.string().min(1),
              })
              .strict(),
          )
          .optional(),
        archivedAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict(),
  })
  .strict();
export const DatabaseMarkdownTableExportCanonicalSchema = z
  .object({
    path: z.string().min(1),
    content: z.string(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const DatabaseMarkdownTableExportSnapshotSchema = z
  .object({
    recordId: z.string().startsWith('rec_'),
    path: z.string().min(1),
    values: z.record(z.string(), CoreDatabaseValueSchema),
    computed: z.record(z.string(), FormulaComputedResultSchema).optional(),
  })
  .strict();
export const DatabaseMarkdownTableExportResponseSchema = z
  .object({
    mode: z.enum(['canonical_markdown', 'computed_snapshot']),
    manifestRevision: z.string().min(1),
    derivedRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    evaluatedAt: z.string().datetime().nullable(),
    canonical: z.array(DatabaseMarkdownTableExportCanonicalSchema).max(100_000),
    snapshot: z.array(DatabaseMarkdownTableExportSnapshotSchema).max(100_000),
  })
  .strict();
export const DatabaseComputedPropertyPreviewResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    recordId: z.string().startsWith('rec_'),
    propertyId: z.string().startsWith('prop_'),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    evaluatedAt: z.string().datetime({ offset: true }),
    permissionRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    result: FormulaComputedResultSchema,
  })
  .strict();

export type DatabaseCatalogResponse = z.infer<typeof DatabaseCatalogResponseSchema>;
export type DatabaseComputedPropertyPreviewResponse = z.infer<
  typeof DatabaseComputedPropertyPreviewResponseSchema
>;
export type DatabaseDescribeResponse = z.infer<typeof DatabaseDescribeResponseSchema>;
export type DatabaseMarkdownTableExportResponse = z.infer<
  typeof DatabaseMarkdownTableExportResponseSchema
>;
export type DatabaseRecordResponse = z.infer<typeof DatabaseRecordResponseSchema>;
