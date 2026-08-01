import {
  DatabaseFormValueSchema,
  DatabaseLinkedViewSettingsSchema,
  DatabasePropertySchema,
  DatabaseQuerySchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import { databaseProblemExtensions } from './database-problem.ts';

export const DatabaseEmptyRequestSchema = z.object({}).strict();
export const DatabaseCatalogRequestSchema = z
  .object({
    q: z.string().trim().max(2_000).optional(),
    ifCatalogRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const DatabaseContextInspectionRequestSchema = z
  .object({
    packId: z.string().startsWith('pack_').optional(),
    databaseId: z.string().startsWith('db_').optional(),
    sourceId: z.string().startsWith('ds_').optional(),
    viewId: z.string().startsWith('view_').optional(),
    recordId: z.string().startsWith('rec_').optional(),
    recordIds: z
      .string()
      .refine(
        (value) =>
          value.trim().length > 0 &&
          value.split(',').every((recordId) => /^rec_[a-zA-Z0-9_-]+$/.test(recordId.trim())),
        'recordIds must be a comma-separated list of record IDs',
      )
      .optional(),
    propertyIds: z
      .string()
      .refine(
        (value) =>
          value.trim().length > 0 &&
          value.split(',').every((propertyId) => /^prop_[a-zA-Z0-9_-]+$/.test(propertyId.trim())),
        'propertyIds must be a comma-separated list of property IDs',
      )
      .optional(),
  })
  .strict();
export const DATABASE_INTERNAL_ERROR_EXTENSIONS = databaseProblemExtensions('internal_error');
export const DatabaseDescribeRequestSchema = z
  .object({
    databaseId: z.string().min(1).optional(),
    databaseKey: z.string().min(1).optional(),
    sourceId: z.string().min(1).optional(),
    ifSchemaRevision: z.string().startsWith('sha256:').optional(),
  })
  .strict()
  .refine((value) => value.databaseId !== undefined || value.databaseKey !== undefined, {
    message: 'databaseId or databaseKey is required',
  });
export const DatabaseRecordRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    recordId: z.string().startsWith('rec_'),
  })
  .strict();
export const DatabaseMarkdownTableExportRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    mode: z.enum(['canonical_markdown', 'computed_snapshot']),
    query: DatabaseQuerySchema.optional(),
  })
  .strict();
const DatabaseComputedPropertySchema = DatabasePropertySchema.refine(
  (property) => property.type === 'formula' || property.type === 'rollup',
  { message: 'property must be a Formula or Rollup property' },
);
export const DatabaseComputedPropertyPreviewRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    recordId: z.string().startsWith('rec_'),
    property: DatabaseComputedPropertySchema,
  })
  .strict();
export const DatabaseQueryRequestSchema = z
  .object({
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    viewId: z.string().startsWith('view_').optional(),
    agentViewId: z.string().startsWith('view_').optional(),
    viewOverrides: DatabaseLinkedViewSettingsSchema.optional(),
    query: DatabaseQuerySchema.optional(),
    deltaSince: z
      .object({
        queryId: z.string().startsWith('qry_'),
        recordRevisions: z.record(z.string(), z.string().nullable()),
        isComplete: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => value.viewOverrides === undefined || value.viewId !== undefined, {
    message: 'viewOverrides requires a saved viewId',
    path: ['viewOverrides'],
  });
export const DatabaseFormSubmitRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    viewId: z.string().startsWith('view_'),
    submissionId: z.string().regex(/^sub_[A-Za-z0-9][A-Za-z0-9_-]{6,127}$/),
    startedAt: z.string().datetime({ offset: true }),
    answers: z.record(z.string().startsWith('prop_'), DatabaseFormValueSchema),
    honeypot: z.string().max(500).optional(),
  })
  .strict();
export const DatabaseFindRequestSchema = z
  .object({
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    text: z.string().trim().min(1).max(2_000),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();
export const DatabaseRetrieveRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    text: z.string().trim().min(1).max(2_000),
    mode: z.enum(['lexical', 'semantic', 'hybrid']),
    propertyIds: z.array(z.string().startsWith('prop_')).max(200).optional(),
    includeBody: z.boolean().optional(),
    lexicalWeight: z.number().finite().min(0).max(100).optional(),
    semanticWeight: z.number().finite().min(0).max(100).optional(),
    requireSemantic: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.mode === 'hybrid' && (input.lexicalWeight ?? 1) + (input.semanticWeight ?? 1) <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['lexicalWeight'],
        message: 'Hybrid lexical and semantic weights cannot both be zero',
      });
    }
  });
export const DatabaseContextPackRequestSchema = z
  .object({
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    agentViewId: z.string().startsWith('view_').optional(),
    goal: z.string().trim().min(1).max(2_000),
    query: DatabaseQuerySchema.omit({ page: true, aggregate: true }).optional(),
    propertyIds: z.array(z.string().min(1)).max(200).optional(),
    maxTokens: z.number().int().min(128).max(100_000).optional(),
    reserveTokens: z.number().int().min(0).max(50_000).optional(),
    tokenizer: z.enum(['utf8_bytes_div3', 'utf8_bytes_div2']).optional(),
    encoding: z.enum(['object_rows', 'columnar_dictionary']).optional(),
    disclosure: z
      .discriminatedUnion('level', [
        z.object({ level: z.literal('records') }).strict(),
        z
          .object({
            level: z.literal('evidence'),
            searchText: z.string().trim().min(1).max(2_000),
          })
          .strict(),
        z.object({ level: z.literal('full_body') }).strict(),
      ])
      .optional(),
    relationExpansion: z
      .object({
        maxDepth: z.number().int().min(1).max(3),
        maxRecords: z.number().int().min(1).max(500),
        maxRecordsPerRelation: z.number().int().min(1).max(50),
        projections: z
          .array(
            z
              .object({
                sourceId: z.string().min(1),
                propertyIds: z.array(z.string().min(1)).min(1).max(200),
              })
              .strict(),
          )
          .max(100)
          .optional(),
      })
      .strict()
      .optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.agentViewId === undefined &&
      (value.maxTokens === undefined ||
        value.tokenizer === undefined ||
        value.encoding === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxTokens'],
        message: 'maxTokens, tokenizer, and encoding are required when agentViewId is not provided',
      });
    }
    if (value.maxTokens !== undefined && (value.reserveTokens ?? 0) >= value.maxTokens) {
      ctx.addIssue({
        code: 'custom',
        path: ['reserveTokens'],
        message: 'reserveTokens must be smaller than maxTokens',
      });
    }
  });

export type DatabaseCatalogRequest = z.infer<typeof DatabaseCatalogRequestSchema>;
export type DatabaseContextInspectionRequest = z.infer<
  typeof DatabaseContextInspectionRequestSchema
>;
export type DatabaseDescribeRequest = z.infer<typeof DatabaseDescribeRequestSchema>;
export type DatabaseRecordRequest = z.infer<typeof DatabaseRecordRequestSchema>;
export type DatabaseMarkdownTableExportRequest = z.infer<
  typeof DatabaseMarkdownTableExportRequestSchema
>;
export type DatabaseComputedPropertyPreviewRequest = z.infer<
  typeof DatabaseComputedPropertyPreviewRequestSchema
>;
export type DatabaseQueryRequest = z.infer<typeof DatabaseQueryRequestSchema>;
export type DatabaseFormSubmitRequest = z.infer<typeof DatabaseFormSubmitRequestSchema>;
export type DatabaseFindRequest = z.infer<typeof DatabaseFindRequestSchema>;
export type DatabaseRetrieveRequest = z.infer<typeof DatabaseRetrieveRequestSchema>;
export type DatabaseContextPackRequest = z.infer<typeof DatabaseContextPackRequestSchema>;
