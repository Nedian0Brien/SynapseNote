import {
  DatabasePlaceValueSchema,
  DatabasePropertySchema,
  DatabaseRecordActorSchema,
  DatabaseRecordPageLayoutOverrideSchema,
  DatabaseVerificationLifecycleInputSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import { DatabaseButtonPlanInputSchema } from './database-button.ts';
import { DatabaseButtonExecutionInputSchema } from './database-button-executor.ts';
import { DatabaseCommitInputSchema } from './database-commit.ts';
import { DatabasePlaceSearchInputSchema } from './database-place-search.ts';
import { DatabaseDesiredStateDraftSchema } from './database-plan.ts';

export const DatabasePlanRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_draft'),
      desiredState: DatabaseDesiredStateDraftSchema,
      ttlSeconds: z.number().int().min(60).max(86_400).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_database_deletion_draft'),
      databaseId: z.string().startsWith('db_'),
      expectedSnapshotRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
      ttlSeconds: z.number().int().min(60).max(86_400).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_verification_draft'),
      lifecycle: DatabaseVerificationLifecycleInputSchema,
      actor: z
        .object({
          principalId: z.string().trim().min(1).max(500),
          kind: z.enum(['human', 'agent', 'sync']),
        })
        .strict(),
      ttlSeconds: z.number().int().min(60).max(86_400).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('get_draft'),
      draftId: z.string().startsWith('draft_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('discard_draft'),
      draftId: z.string().startsWith('draft_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_plan'),
      draftId: z.string().startsWith('draft_'),
      ttlSeconds: z.number().int().min(60).max(3_600).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('get_plan'),
      planId: z.string().startsWith('plan_'),
    })
    .strict(),
]);
export const DatabaseCommitRequestSchema = DatabaseCommitInputSchema;

const DatabaseMarkdownTableMutationBaseSchema = z.object({
  databaseId: z.string().startsWith('db_'),
  sourceId: z.string().startsWith('ds_'),
  actor: DatabaseRecordActorSchema.optional(),
});
const DatabaseMarkdownTableCellValueSchema = z.unknown();
export const DatabaseMarkdownTableMutationRequestSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('update_cell'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        propertyId: z.string().startsWith('prop_'),
        value: DatabaseMarkdownTableCellValueSchema,
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        expectedRowRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
        expectedCellRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('update_cells'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        cells: z
          .array(
            z
              .object({
                recordId: z.string().startsWith('rec_'),
                propertyId: z.string().startsWith('prop_'),
                value: DatabaseMarkdownTableCellValueSchema,
                expectedRowRevision: z
                  .string()
                  .regex(/^sha256:[a-f0-9]{64}$/)
                  .optional(),
                expectedCellRevision: z
                  .string()
                  .regex(/^sha256:[a-f0-9]{64}$/)
                  .optional(),
              })
              .strict(),
          )
          .min(1)
          .max(10_000),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('replace_row'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        values: z.record(z.string().startsWith('prop_'), DatabaseMarkdownTableCellValueSchema),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        expectedRowRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('delete_row'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        expectedRowRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('create_row'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        documentPath: z.string().min(1).max(2_000),
        documentMarkdown: z.string().max(4 * 1024 * 1024),
        documentId: z.string().min(1).max(256).optional(),
        values: z
          .record(z.string().startsWith('prop_'), DatabaseMarkdownTableCellValueSchema)
          .optional(),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('copy_row'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        mode: z.enum(['duplicate_document', 'linked_view']),
        documentPath: z.string().min(1).max(2_000),
        documentId: z.string().startsWith('doc_').max(256).optional(),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        expectedRowRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('update_title'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        title: z.string().trim().min(1).max(200),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        expectedDocumentRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('move_document'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        newDocumentPath: z.string().min(1).max(2_000),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        expectedDocumentRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('update_lifecycle'),
      input: DatabaseMarkdownTableMutationBaseSchema.extend({
        recordId: z.string().startsWith('rec_'),
        archived: z.boolean().optional(),
        pageLayoutOverride: DatabaseRecordPageLayoutOverrideSchema.nullable().optional(),
        actor: DatabaseRecordActorSchema.optional(),
        now: z.string().datetime({ offset: true }).optional(),
        expectedOwnerRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        // The precondition is the exact database manifest file hash; the
        // aggregate store snapshot revision is a separate read-model value.
        expectedManifestRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
      })
        .strict()
        .refine(
          (value) => value.archived !== undefined || value.pageLayoutOverride !== undefined,
          'archived or pageLayoutOverride is required',
        ),
    })
    .strict(),
  z
    .object({
      operation: z.literal('undo'),
      input: z
        .object({
          receipt: z.record(z.string(), z.unknown()),
          expectedAfterOwnerRevision: z
            .string()
            .regex(/^sha256:[a-f0-9]{64}$/)
            .optional(),
          actor: DatabaseRecordActorSchema.optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const DatabaseMarkdownTableMutationResponseSchema = z
  .object({
    operation: z.enum([
      'update_cell',
      'update_cells',
      'replace_row',
      'delete_row',
      'create_row',
      'copy_row',
      'update_title',
      'move_document',
      'update_lifecycle',
      'undo',
    ]),
    changed: z.boolean(),
    receipt: z.record(z.string(), z.unknown()),
  })
  .strict();
export const DatabaseButtonRequestSchema = z.union([
  DatabaseButtonPlanInputSchema,
  DatabaseButtonExecutionInputSchema.extend({ action: z.literal('execute') }),
  z
    .object({
      action: z.literal('list_runs'),
      limit: z.number().int().min(1).max(500).default(100),
    })
    .strict(),
]);
export const DatabasePlaceSearchRequestSchema = DatabasePlaceSearchInputSchema;
export const DatabasePlaceSearchResponseSchema = z
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
export const DatabasePropertyConversionRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    propertyId: z.string().startsWith('prop_'),
    targetProperty: DatabasePropertySchema,
    allowLossy: z.boolean().default(false),
    ttlSeconds: z.number().int().min(60).max(86_400).optional(),
  })
  .strict();
const DatabasePropertyConversionRuleSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(['identity', 'lossless', 'conditional', 'lossy', 'blocked']),
    reason: z.string().min(1),
  })
  .strict();
const DatabasePropertyConversionChangeSchema = z
  .object({
    recordId: z.string().startsWith('rec_'),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    outcome: z.enum(['empty', 'converted', 'lossy', 'blocked']),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
export const DatabasePropertyConversionResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    propertyId: z.string().startsWith('prop_'),
    manifestRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    indexRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    preview: z
      .object({
        rule: DatabasePropertyConversionRuleSchema,
        committable: z.boolean(),
        requiresLossyApproval: z.boolean(),
        summary: z
          .object({
            total: z.number().int().nonnegative(),
            empty: z.number().int().nonnegative(),
            converted: z.number().int().nonnegative(),
            lossy: z.number().int().nonnegative(),
            blocked: z.number().int().nonnegative(),
          })
          .strict(),
        changes: z.array(DatabasePropertyConversionChangeSchema).max(10_000),
        rollbackValues: z.record(z.string().startsWith('rec_'), z.unknown()),
      })
      .strict(),
    draft: z.record(z.string(), z.unknown()).nullable(),
    plan: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();

export type DatabaseButtonRequest = z.infer<typeof DatabaseButtonRequestSchema>;
export type DatabaseCommitRequest = z.infer<typeof DatabaseCommitRequestSchema>;
export type DatabaseMarkdownTableMutationRequest = z.infer<
  typeof DatabaseMarkdownTableMutationRequestSchema
>;
export type DatabaseMarkdownTableMutationResponse = z.infer<
  typeof DatabaseMarkdownTableMutationResponseSchema
>;
export type DatabasePlaceSearchRequest = z.infer<typeof DatabasePlaceSearchRequestSchema>;
export type DatabasePlaceSearchResponse = z.infer<typeof DatabasePlaceSearchResponseSchema>;
export type DatabasePlanRequest = z.infer<typeof DatabasePlanRequestSchema>;
export type DatabasePropertyConversionRequest = z.infer<
  typeof DatabasePropertyConversionRequestSchema
>;
export type DatabasePropertyConversionResponse = z.infer<
  typeof DatabasePropertyConversionResponseSchema
>;
