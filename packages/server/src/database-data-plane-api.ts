import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DatabaseValueSchema as CoreDatabaseValueSchema,
  DATABASE_AUTONOMY_MODES,
  DATABASE_MUTATION_ACTIONS,
  DATABASE_PERMISSION_ACTIONS,
  DATABASE_PERMISSION_ROLES,
  type DatabaseAccessPrincipal,
  DatabaseAgentRunSchema,
  DatabaseDefinitionSchema,
  DatabaseFormValueSchema,
  DatabaseGroupMembershipsSchema,
  DatabaseLinkedViewSettingsSchema,
  DatabaseMarkdownRecordRevisionSetSchema,
  DatabasePlaceValueSchema,
  DatabasePropertySchema,
  type DatabasePublicSharePolicy,
  DatabasePublicShareTargetSchema,
  DatabaseQueryError,
  DatabaseQuerySchema,
  DatabaseRecordActorSchema,
  DatabaseRecordPageLayoutOverrideSchema,
  DatabaseSourceSchema,
  DatabaseVerificationLifecycleInputSchema,
  DatabaseVerificationProjectionSchema,
  databasePermissionRoleActions,
  FormulaComputedResultSchema,
  FrontmatterValueSchema,
  ProjectedDatabasePersonSchema,
  ProjectedDatabaseRecordSchema,
  ProjectedDatabaseRelationRecordSchema,
  resolveDatabaseAutonomyMode,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import {
  DatabaseAgentPromptRetentionError,
  type DatabaseAgentPromptRetentionStore,
} from './database-agent-prompt-retention.ts';
import {
  type DatabaseAgentRunStore,
  DatabaseAgentRunStoreError,
} from './database-agent-run-store.ts';
import {
  DatabaseAutomationEventSchema,
  DatabaseAutomationRunSchema,
  type DatabaseAutomationService,
} from './database-automation.ts';
import {
  DatabaseAutomationNotificationSchema,
  type DatabaseAutomationNotificationStore,
} from './database-automation-notification-store.ts';
import {
  type DatabaseAutonomyStore,
  DatabaseAutonomyStoreError,
} from './database-autonomy-store.ts';
import { DatabaseButtonPlanError, DatabaseButtonPlanInputSchema } from './database-button.ts';
import {
  DatabaseButtonExecutionError,
  DatabaseButtonExecutionInputSchema,
  DatabaseButtonRunSchema,
} from './database-button-executor.ts';
import { DatabaseCommitError, DatabaseCommitInputSchema } from './database-commit.ts';
import { DatabaseContextPackError } from './database-context-pack.ts';
import {
  type DatabaseDataPlane,
  DatabaseDataPlaneError,
  type DatabaseMarkdownTableMutationRequest,
} from './database-data-plane.ts';
import { DatabaseAgentEntryPointLimiter } from './database-entry-point-limits.ts';
import {
  type DatabasePermissionStore,
  DatabasePermissionStoreError,
} from './database-permission-store.ts';
import {
  DatabasePlaceSearchError,
  DatabasePlaceSearchInputSchema,
  type DatabasePlaceSearchService,
} from './database-place-search.ts';
import {
  DatabaseDesiredStateDraftSchema,
  type DatabasePlanArtifact,
  DatabasePlanError,
} from './database-plan.ts';
import {
  DATABASE_REQUEST_ERROR_EXTENSIONS,
  databaseProblemExtensions,
} from './database-problem.ts';
import { DatabaseRepairError } from './database-repair.ts';
import { DatabaseTaskSchema } from './database-task-contract.ts';
import { type DatabaseTaskService, DatabaseTaskServiceError } from './database-task-service.ts';
import type { DatabaseTaskStore, DatabaseTaskStoreErrorCode } from './database-task-store.ts';
import { getDatabaseTelemetry } from './database-telemetry.ts';
import {
  DatabaseTemplateRunSchema,
  type DatabaseTemplateScheduler,
} from './database-template-scheduler.ts';
import { errorResponse, type HttpErrorStatus } from './http/error-response.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export const DATABASE_API_SCHEMA_VERSION = 1 as const;
export const DATABASE_API_SCHEMA_VERSION_HEADER = 'X-SynapseNote-Database-Schema-Version';

export const DatabaseTemplateRunsRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_').optional(),
    templateId: z.string().startsWith('tpl_').optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export const DatabaseTemplateRunsResponseSchema = z
  .object({ runs: z.array(DatabaseTemplateRunSchema).max(500) })
  .strict();

const DatabaseAutomationTestEventSchema = z
  .object({
    deduplicationKey: z.string().min(1).max(256),
    databaseId: z.string().startsWith('db_'),
    kind: z.enum([
      'record_added',
      'property_changed',
      'schedule',
      'form_submitted',
      'button_invoked',
    ]),
    occurredAt: z.string().datetime().optional(),
    sourceId: z.string().startsWith('ds_').nullable().optional(),
    recordId: z.string().startsWith('rec_').nullable().optional(),
    recordRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    propertyId: z.string().startsWith('prop_').nullable().optional(),
    viewId: z.string().startsWith('view_').nullable().optional(),
    buttonId: z.string().startsWith('dbbtn_').nullable().optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();

export const DatabaseAutomationRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      databaseId: z.string().startsWith('db_').optional(),
      automationId: z.string().startsWith('auto_').optional(),
      limit: z.number().int().min(1).max(500).default(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('dry_run'),
      databaseId: z.string().startsWith('db_'),
      automationId: z.string().startsWith('auto_'),
      event: DatabaseAutomationTestEventSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('test_event'),
      databaseId: z.string().startsWith('db_'),
      automationId: z.string().startsWith('auto_'),
      event: DatabaseAutomationTestEventSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('notifications'),
      recipientId: z.string().startsWith('person_').optional(),
      unreadOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('mark_notification_read'),
      notificationId: z.string().startsWith('autonote_'),
    })
    .strict(),
]);

const DatabaseAutomationPlanSummarySchema = z
  .object({
    automationId: z.string().startsWith('auto_'),
    automationVersion: z.number().int().positive(),
    internalPlan: z
      .object({
        id: z.string().startsWith('plan_'),
        hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        committable: z.boolean(),
        migrationRequired: z.boolean(),
        risk: z.object({
          level: z.enum(['low', 'medium', 'high']),
          reasons: z.array(z.string()),
        }),
        records: z
          .object({
            creates: z.number().int().nonnegative(),
            updates: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    notifications: z.array(
      z
        .object({
          actionId: z.string(),
          recipientIds: z.array(z.string()),
          title: z.string(),
        })
        .strict(),
    ),
    external: z.array(
      z
        .object({
          actionId: z.string(),
          kind: z.enum(['external_webhook', 'external_email']),
          connectionId: z.string().startsWith('conn_'),
          egressBytes: z.number().int().nonnegative(),
          policyId: z.string(),
          policyRevision: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const DatabaseAutomationResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      runs: z.array(DatabaseAutomationRunSchema).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('dry_run'),
      plan: DatabaseAutomationPlanSummarySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('test_event'),
      event: DatabaseAutomationEventSchema,
      runs: z.array(DatabaseAutomationRunSchema).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('notifications'),
      notifications: z.array(DatabaseAutomationNotificationSchema).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('mark_notification_read'),
      notificationId: z.string().startsWith('autonote_'),
    })
    .strict(),
]);

const DatabaseEmptyRequestSchema = z.object({}).strict();
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
const DATABASE_INTERNAL_ERROR_EXTENSIONS = databaseProblemExtensions('internal_error');
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
export const DatabaseAgentRunsRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('get'), runId: z.string().startsWith('run_') }).strict(),
  z
    .object({
      action: z.enum(['retry', 'resume']),
      runId: z.string().startsWith('run_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      idempotencyKey: z.string().min(8).max(256),
      approvalToken: z.string().startsWith('approve:sha256:').optional(),
      autonomySessionToken: z.string().startsWith('dbsession_').max(256).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('retain_prompt'),
      runId: z.string().startsWith('run_'),
      prompt: z
        .string()
        .min(1)
        .max(256 * 1024),
      consent: z.literal(true),
      ttlSeconds: z
        .number()
        .int()
        .min(60)
        .max(7 * 24 * 60 * 60),
    })
    .strict(),
  z.object({ action: z.literal('get_prompt'), runId: z.string().startsWith('run_') }).strict(),
  z.object({ action: z.literal('delete_prompt'), runId: z.string().startsWith('run_') }).strict(),
]);
const DatabaseAutonomyScopeSchema = z
  .object({
    databaseIds: z.array(z.string().startsWith('db_')).min(1).max(10_000),
    actions: z.array(z.enum(DATABASE_MUTATION_ACTIONS)).min(1),
    propertyIds: z.array(z.string().startsWith('prop_')).max(10_000),
    allowBody: z.boolean(),
    maxRecordsPerAction: z.number().int().positive().max(100_000),
    maxRecordsTotal: z.number().int().positive().max(10_000_000),
    maxActionsTotal: z.number().int().positive().max(1_000_000),
    maxEgressBytesTotal: z.number().int().nonnegative().max(1_000_000_000),
    notBefore: z.string().datetime().optional(),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .superRefine((scope, context) => {
    for (const [path, values] of [
      ['databaseIds', scope.databaseIds],
      ['actions', scope.actions],
      ['propertyIds', scope.propertyIds],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: `${path} must be unique`,
        });
      }
    }
    if (scope.notBefore && Date.parse(scope.notBefore) >= Date.parse(scope.expiresAt)) {
      context.addIssue({
        code: 'custom',
        path: ['notBefore'],
        message: 'notBefore must precede expiresAt',
      });
    }
  });
export const DatabaseAutonomyRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('get'),
      databaseId: z.string().startsWith('db_'),
      sessionId: z.string().min(1).max(256).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('set_database'),
      databaseId: z.string().startsWith('db_'),
      mode: z.enum(DATABASE_AUTONOMY_MODES),
      expectedRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal('clear_database'),
      databaseId: z.string().startsWith('db_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('set_session'),
      sessionId: z.string().min(1).max(256),
      mode: z.enum(DATABASE_AUTONOMY_MODES),
      delegation: DatabaseAutonomyScopeSchema.optional(),
      expectedRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
    })
    .strict()
    .superRefine((value, context) => {
      if ((value.mode === 'autonomous') !== (value.delegation !== undefined)) {
        context.addIssue({
          code: 'custom',
          path: ['delegation'],
          message: 'Only Autonomous sessions require and may carry delegation scope',
        });
      }
    }),
  z
    .object({
      action: z.literal('clear_session'),
      sessionId: z.string().min(1).max(256),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
]);
const DatabasePermissionRevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const DatabasePermissionGrantSchema = z
  .object({
    id: z.string().regex(/^dbgrant_[a-f0-9-]{36}$/),
    databaseId: z.string().startsWith('db_').nullable(),
    principalId: z.string().trim().min(1).max(256),
    role: z.enum(DATABASE_PERMISSION_ROLES),
    actions: z.array(z.enum(DATABASE_PERMISSION_ACTIONS)).min(1),
    createdBy: z.string().trim().min(1).max(256),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const DatabasePermissionUpsertRequestSchema = z
  .object({
    action: z.literal('upsert'),
    grantId: z
      .string()
      .regex(/^dbgrant_[a-f0-9-]{36}$/)
      .optional(),
    databaseId: z.string().startsWith('db_').nullable(),
    principalId: z.string().trim().min(1).max(256),
    role: z.enum(DATABASE_PERMISSION_ROLES).default('custom'),
    actions: z.array(z.enum(DATABASE_PERMISSION_ACTIONS)).min(1),
    expectedRevision: DatabasePermissionRevisionSchema,
  })
  .strict()
  .superRefine((grant, context) => {
    if (grant.role === 'custom') return;
    const expected = [...databasePermissionRoleActions(grant.role)].sort();
    const actual = [...grant.actions].sort();
    if (
      expected.length !== actual.length ||
      expected.some((action, index) => action !== actual[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: `Actions must exactly match the ${grant.role} role`,
      });
    }
  });
export const DatabasePermissionsRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      databaseId: z.string().startsWith('db_').optional(),
    })
    .strict(),
  DatabasePermissionUpsertRequestSchema,
  z
    .object({
      action: z.literal('remove'),
      grantId: z.string().regex(/^dbgrant_[a-f0-9-]{36}$/),
      expectedRevision: DatabasePermissionRevisionSchema,
    })
    .strict(),
]);
const DatabasePublicShareIdSchema = z.string().regex(/^dbshare_[a-f0-9-]{36}$/);
const DatabasePublicShareViewSchema = z
  .object({
    version: z.literal(1),
    id: DatabasePublicShareIdSchema,
    target: DatabasePublicShareTargetSchema,
    access: z.enum(['public', 'link']),
    propertyIds: z.array(z.string().startsWith('prop_')).max(10_000),
    allowBody: z.boolean(),
    allowFormSubmission: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const DatabasePublicShareCredentialSchema = z
  .object({
    shareId: DatabasePublicShareIdSchema,
    token: z.string().startsWith('dbsharetoken_').max(256).optional(),
  })
  .strict();
export const DatabasePublicSharesRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), databaseId: z.string().startsWith('db_') }).strict(),
  z
    .object({
      action: z.literal('upsert'),
      shareId: DatabasePublicShareIdSchema.optional(),
      target: DatabasePublicShareTargetSchema,
      access: z.enum(['public', 'link']),
      propertyIds: z.array(z.string().startsWith('prop_')).min(1).max(10_000),
      allowBody: z.boolean().default(false),
      allowFormSubmission: z.boolean().default(false),
      expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
      rotateToken: z.boolean().default(false),
      expectedRevision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('revoke'),
      shareId: DatabasePublicShareIdSchema,
      expectedRevision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  DatabasePublicShareCredentialSchema.extend({ action: z.literal('resolve') }).strict(),
  DatabasePublicShareCredentialSchema.extend({
    action: z.literal('describe'),
  }).strict(),
  DatabasePublicShareCredentialSchema.extend({
    action: z.literal('query'),
    query: DatabaseQuerySchema.optional(),
  }).strict(),
  DatabasePublicShareCredentialSchema.extend({ action: z.literal('record') }).strict(),
  DatabasePublicShareCredentialSchema.extend({
    action: z.literal('submit_form'),
    submissionId: z.string().min(8).max(256),
    startedAt: z.string().datetime({ offset: true }),
    answers: z.record(z.string().startsWith('prop_'), DatabaseFormValueSchema),
    honeypot: z.string().max(1_000).optional(),
  }).strict(),
]);
export const DatabaseUndoRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      undoToken: z.string().startsWith('undo_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      undoToken: z.string().startsWith('undo_'),
      idempotencyKey: z.string().min(8).max(256),
      actor: z
        .object({
          principalId: z.string().min(1).max(256),
          kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
          sessionId: z.string().min(1).max(256).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('redo_preview'),
      undoToken: z.string().startsWith('undo_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('redo_apply'),
      undoToken: z.string().startsWith('undo_'),
      idempotencyKey: z.string().min(8).max(256),
      actor: z
        .object({
          principalId: z.string().min(1).max(256),
          kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
          sessionId: z.string().min(1).max(256).optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const DatabaseRepairRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      ttlSeconds: z.number().int().min(30).max(3_600).optional(),
      documentIds: z
        .record(z.string().min(1).max(2_000), z.string().startsWith('doc_').max(256))
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      planId: z.string().startsWith('repair_plan_'),
      planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      approvalToken: z.string().startsWith('approve:sha256:'),
      idempotencyKey: z.string().min(8).max(256),
      principalId: z.string().trim().min(1).max(256),
    })
    .strict(),
  z
    .object({
      action: z.literal('undo'),
      repairId: z.string().startsWith('repair_'),
      planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      undoToken: z.string().startsWith('repair_undo_'),
      idempotencyKey: z.string().min(8).max(256),
      principalId: z.string().trim().min(1).max(256),
    })
    .strict(),
]);

const DatabaseCatalogFullResponseSchema = z
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
const DatabaseCatalogNotModifiedResponseSchema = z
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

const DatabaseIndexStatusSchema = z
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

const DatabaseStorageCapabilitySchema = z
  .object({
    appProtocolVersion: z.literal(1),
    manifestVersion: z.number().int(),
    tableFormatVersion: z.number().int().nullable(),
    read: z.enum(['full', 'read_only', 'unsupported']),
    write: z.enum(['v1_record_files', 'v2_markdown_table', 'migration_required', 'unsupported']),
    reason: z.string().min(1),
  })
  .strict();

const DatabaseDescribeFullResponseSchema = z
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
const DatabaseDescribeNotModifiedResponseSchema = z
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

const DatabaseValueSchema = CoreDatabaseValueSchema;
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
const DatabaseMarkdownTableExportCanonicalSchema = z
  .object({
    path: z.string().min(1),
    content: z.string(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
const DatabaseMarkdownTableExportSnapshotSchema = z
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

const DatabaseCalculationResultSchema = z
  .object({
    id: z.string().min(1),
    function: DatabaseQuerySchema.shape.aggregate.unwrap().shape.calculations.unwrap().element.shape
      .function,
    propertyId: z.string().nullable(),
    value: z.union([z.number(), z.string()]).nullable(),
    unit: z.enum(['count', 'number', 'percentage', 'date', 'milliseconds']),
  })
  .strict();
const DatabaseAggregationResultSchema = z
  .object({
    matched: z.number().int().nonnegative(),
    groupBy: DatabaseQuerySchema.shape.aggregate.unwrap().shape.groupBy,
    calculations: z.array(DatabaseCalculationResultSchema),
    totalGroups: z.number().int().nonnegative(),
    returnedGroups: z.number().int().nonnegative(),
    groupsComplete: z.boolean(),
    truncatedBy: z.literal('group_limit').nullable(),
    groups: z.array(
      z
        .object({
          level: z.union([z.literal(1), z.literal(2)]),
          key: z.array(
            z
              .object({
                propertyId: z.string().min(1),
                value: DatabaseValueSchema.nullable(),
              })
              .strict(),
          ),
          matched: z.number().int().nonnegative(),
          calculations: z.array(DatabaseCalculationResultSchema),
        })
        .strict(),
    ),
  })
  .strict();
const DatabaseEvidenceSchema = z
  .object({
    id: z.string().startsWith('ev_'),
    recordId: z.string().min(1),
    path: z.string().min(1),
    field: z.enum(['property', 'body']),
    propertyId: z.string().min(1).optional(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    offsetEncoding: z.literal('utf16_code_units'),
    snippet: z.string(),
    snippetStart: z.number().int().nonnegative(),
    snippetEnd: z.number().int().nonnegative(),
    matchedTerms: z.array(z.string()),
  })
  .strict();
const DatabaseLexicalTraceSchema = z
  .object({
    strategy: z.literal('lexical_and'),
    scope: z
      .object({
        databaseId: z.string().min(1),
        sourceId: z.string().min(1),
        propertyIds: z.array(z.string()),
        includeBody: z.boolean(),
        includeArchived: z.boolean(),
      })
      .strict(),
    termStats: z.array(
      z
        .object({
          term: z.string(),
          indexedRecords: z.number().int().nonnegative(),
          scopedRecords: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    ranking: z
      .object({
        titleWeight: z.literal(40),
        propertyWeight: z.literal(20),
        bodyWeight: z.literal(10),
        verificationWeight: z.literal(1).optional(),
        tieBreakers: z.tuple([z.literal('path'), z.literal('record_id')]),
      })
      .strict(),
    noMatchReason: z
      .enum(['no_terms', 'term_absent_in_scope', 'no_record_matches_all_terms'])
      .nullable(),
  })
  .strict();
const AppliedDatabaseSavedQuerySchema = z
  .object({
    id: z.string().startsWith('view_'),
    key: z.string().min(1),
    name: z.string().min(1),
    sourceId: z.string().startsWith('ds_'),
    layout: z.enum([
      'table',
      'board',
      'timeline',
      'calendar',
      'list',
      'gallery',
      'chart',
      'map',
      'feed',
      'form',
      'dashboard',
      'agent',
    ]),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
const AppliedDatabaseAgentViewSchema = z
  .object({
    id: z.string().startsWith('view_'),
    key: z.string().min(1),
    name: z.string().min(1),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    semanticContract: z
      .object({
        purpose: z.string().min(1),
        instructions: z.string().min(1).optional(),
        evidence: z.enum(['required', 'preferred', 'none']),
        freshness: z.enum(['require_current', 'allow_stale_with_warning']),
      })
      .strict(),
    scope: z
      .object({
        maxRecords: z.number().int().min(1).max(500),
        relationDepth: z.number().int().min(0).max(3),
        relationMaxRecords: z.number().int().min(1).max(500),
        relationFanOut: z.number().int().min(1).max(50),
      })
      .strict(),
    readPolicy: z
      .object({
        maxSensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']),
      })
      .strict(),
    writePolicy: z
      .object({
        mode: z.enum(['read_only', 'review', 'bounded']),
        allowedActions: z.array(
          z.enum(['create_record', 'update_record', 'delete_record', 'alter_schema']),
        ),
        allowedPropertyIds: z.array(z.string().min(1)),
        maxRecordsPerCommit: z.number().int().min(0).max(500),
      })
      .strict(),
  })
  .strict();
export const DatabaseQueryResponseSchema = z
  .object({
    databaseId: z.string().min(1),
    queryId: z.string().startsWith('qry_'),
    sourceId: z.string().min(1),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    indexState: z.enum(['idle', 'rebuilding', 'error']),
    snapshotRevision: z.string().min(1),
    storageRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    derivedRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    matched: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    isComplete: z.boolean(),
    nextCursor: z.string().nullable(),
    truncatedBy: z.literal('page_limit').nullable(),
    indexFreshness: z.literal('snapshot'),
    aggregation: DatabaseAggregationResultSchema.nullable(),
    groupMemberships: DatabaseGroupMembershipsSchema.optional(),
    people: z.array(ProjectedDatabasePersonSchema).optional(),
    fileStates: z.record(z.string(), z.enum(['available', 'missing'])).optional(),
    relationRecords: z.array(ProjectedDatabaseRelationRecordSchema).optional(),
    permissionExclusions: z
      .object({
        evaluated: z.literal(true),
        policyId: z.string().min(1),
        policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        records: z.number().int().nonnegative(),
        properties: z.number().int().nonnegative(),
        body: z.boolean().optional(),
      })
      .strict(),
    savedQuery: AppliedDatabaseSavedQuerySchema.nullable(),
    agentView: AppliedDatabaseAgentViewSchema.nullable(),
    resultState: z
      .object({
        empty: z.boolean(),
        emptyReason: z
          .enum([
            'no_match',
            'permission_filtered',
            'partial_index',
            'permission_filtered_and_partial_index',
          ])
          .nullable(),
        permissionFiltered: z.boolean(),
        partialIndex: z.boolean(),
        truncated: z.boolean(),
      })
      .strict(),
    trace: z
      .object({
        source: z
          .object({
            databaseId: z.string().min(1),
            sourceId: z.string().min(1),
          })
          .strict(),
        savedQuery: AppliedDatabaseSavedQuerySchema.nullable(),
        agentView: AppliedDatabaseAgentViewSchema.nullable(),
        filter: z
          .object({
            expression: DatabaseQuerySchema.shape.where.unwrap().nullable(),
            propertyIds: z.array(z.string().min(1)),
          })
          .strict(),
        ranking: z
          .object({
            strategy: z.literal('typed_sort_then_record_id'),
            sort: DatabaseQuerySchema.shape.sort,
            semantics: z
              .object({
                version: z.literal(1),
                locale: z.literal('und'),
                normalization: z.literal('NFKD'),
                collation: z.literal('unicode_code_point'),
                case: z.literal('insensitive_primary_uppercase_first_tertiary'),
                diacritic: z.literal('insensitive_primary_sensitive_secondary'),
                naturalNumbers: z.literal('ascii_decimal_runs'),
                emptyValues: z.literal('last_regardless_of_direction'),
                arrays: z.literal('sorted_elements_then_lexicographic'),
                tieBreaker: z.literal('record_id'),
              })
              .strict(),
            tieBreakers: z.tuple([z.literal('record_id')]),
          })
          .strict(),
        projection: z
          .object({
            requestedPropertyIds: z.array(z.string().min(1)),
            returnedPropertyIds: z.array(z.string().min(1)),
            excludedPropertyIds: z.array(z.string().min(1)),
          })
          .strict(),
        aggregation: z
          .object({
            requested: DatabaseQuerySchema.shape.aggregate.unwrap().nullable(),
            appliedAfterPermissionScope: z.literal(true),
            matched: z.number().int().nonnegative(),
            totalGroups: z.number().int().nonnegative(),
            returnedGroups: z.number().int().nonnegative(),
            truncatedBy: z.literal('group_limit').nullable(),
          })
          .strict(),
        permission: z
          .object({
            evaluated: z.literal(true),
            policyId: z.string().min(1),
            policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            records: z.number().int().nonnegative(),
            properties: z.number().int().nonnegative(),
            body: z.boolean().optional(),
          })
          .strict(),
        index: z
          .object({
            revision: z.string().min(1),
            state: z.enum(['idle', 'rebuilding', 'error']),
            freshness: z.literal('snapshot'),
            issueCount: z.number().int().nonnegative(),
          })
          .strict(),
        derivedIndex: z
          .object({
            propertyIds: z.array(z.string().min(1)),
            cache: z.enum(['hit', 'miss', 'not_applicable']),
            permissionRevision: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/)
              .nullable(),
            revision: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/)
              .nullable(),
          })
          .strict(),
        truncation: z
          .object({
            cause: z.literal('page_limit').nullable(),
            limit: z.number().int().min(1).max(500),
            cursorProvided: z.boolean(),
            nextCursor: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    recordRevisions: z.record(z.string(), z.string().nullable()),
    delta: z
      .object({
        sinceQueryId: z.string().startsWith('qry_'),
        scope: z.literal('returned_page'),
        addedOrChangedRecordIds: z.array(z.string()),
        unchangedRecordIds: z.array(z.string()),
        removedRecordIds: z.array(z.string()),
        absentFromPageRecordIds: z.array(z.string()),
        isComplete: z.boolean(),
      })
      .strict()
      .nullable(),
    records: z.array(ProjectedDatabaseRecordSchema),
  })
  .strict();
export const DatabaseFormSubmitResponseSchema = z
  .object({
    status: z.literal('created'),
    recordId: z.string().startsWith('rec_'),
    submittedAt: z.string().datetime({ offset: true }),
    idempotentReplay: z.boolean(),
    confirmation: z
      .object({
        title: z.string().min(1).max(200),
        message: z.string().max(2_000),
        allowAnotherResponse: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const DatabaseFindResponseSchema = z
  .object({
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    plan: z.record(z.string(), z.unknown()),
    retrieval: z
      .object({
        query: z.string(),
        terms: z.array(z.string()),
        offsetEncoding: z.literal('utf16_code_units'),
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        isComplete: z.boolean(),
        hits: z.array(
          z
            .object({
              recordId: z.string().min(1),
              path: z.string().min(1),
              revision: z.string().nullable(),
              score: z.number().nonnegative(),
              scoreBreakdown: z
                .object({
                  title: z.number().nonnegative(),
                  property: z.number().nonnegative(),
                  body: z.number().nonnegative(),
                  verification: z.number().nonnegative().optional(),
                })
                .strict(),
              verification: z
                .array(
                  DatabaseVerificationProjectionSchema.extend({
                    propertyId: z.string().startsWith('prop_'),
                  }),
                )
                .optional(),
              matchedBy: z.array(z.enum(['title', 'property', 'body'])),
              evidence: z.array(DatabaseEvidenceSchema),
            })
            .strict(),
        ),
        trace: DatabaseLexicalTraceSchema,
        permissionExclusions: z
          .object({
            evaluated: z.literal(true),
            policyId: z.string().min(1),
            policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            records: z.number().int().nonnegative(),
            properties: z.number().int().nonnegative(),
          })
          .strict(),
        resultState: z
          .object({
            empty: z.boolean(),
            emptyReason: z.enum(['no_match', 'permission_filtered']).nullable(),
            permissionFiltered: z.boolean(),
            truncated: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    result: DatabaseQueryResponseSchema.nullable(),
  })
  .strict();

const DatabaseSemanticIndexStatusSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    schemaRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    state: z.enum(['disabled', 'building', 'ready', 'stale', 'error']),
    providerId: z.string().nullable(),
    model: z.string().nullable(),
    dimensions: z.number().int().positive().nullable(),
    privacy: z.enum(['local_only', 'remote_allowed', 'blocked']),
    propertyIds: z.array(z.string().startsWith('prop_')),
    includeBody: z.boolean(),
    indexedRecords: z.number().int().nonnegative(),
    staleRecords: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }).nullable(),
    reason: z
      .enum([
        'not_configured',
        'privacy_blocked',
        'provider_mismatch',
        'snapshot_changed',
        'build_failed',
      ])
      .nullable(),
  })
  .strict();

export const DatabaseRetrieveResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    query: z.string(),
    requestedMode: z.enum(['lexical', 'semantic', 'hybrid']),
    appliedMode: z.enum(['lexical', 'semantic', 'hybrid']),
    degradedReason: z.enum(['semantic_not_ready', 'semantic_projection_denied']).nullable(),
    candidateLimit: z.number().int().min(1).max(500),
    lexical: DatabaseFindResponseSchema.shape.retrieval,
    semantic: z
      .object({
        query: z.string(),
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        isComplete: z.boolean(),
        hits: z.array(
          z
            .object({
              recordId: z.string().startsWith('rec_'),
              path: z.string().min(1),
              revision: z.string().nullable(),
              score: z.number().finite().min(-1).max(1),
              inputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            })
            .strict(),
        ),
        trace: z
          .object({
            strategy: z.literal('semantic_cosine'),
            providerId: z.string().min(1),
            model: z.string().min(1),
            dimensions: z.number().int().positive(),
            privacy: z.enum(['local_only', 'remote_allowed', 'blocked']),
            propertyIds: z.array(z.string().startsWith('prop_')),
            includeBody: z.boolean(),
            schemaRevision: z.string().min(1),
            indexRevision: z.string().min(1),
            tieBreakers: z.tuple([z.literal('path'), z.literal('record_id')]),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    ranking: z
      .object({
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        isComplete: z.boolean(),
        hits: z.array(
          z
            .object({
              recordId: z.string().startsWith('rec_'),
              path: z.string().min(1),
              revision: z.string().nullable(),
              score: z.number().finite().nonnegative(),
              ranking: z
                .object({
                  lexicalRank: z.number().int().positive().nullable(),
                  semanticRank: z.number().int().positive().nullable(),
                  lexicalContribution: z.number().finite().nonnegative(),
                  semanticContribution: z.number().finite().nonnegative(),
                })
                .strict(),
            })
            .strict(),
        ),
        trace: z
          .object({
            strategy: z.literal('reciprocal_rank_fusion'),
            constant: z.literal(60),
            lexicalWeight: z.number().finite().nonnegative(),
            semanticWeight: z.number().finite().nonnegative(),
            tieBreakers: z.tuple([z.literal('path'), z.literal('record_id')]),
          })
          .strict(),
      })
      .strict(),
    semanticIndex: DatabaseSemanticIndexStatusSchema,
    permissionExclusions: z
      .object({
        evaluated: z.literal(true),
        policyId: z.string().min(1),
        policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        records: z.number().int().nonnegative(),
        properties: z.number().int().nonnegative(),
        body: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

const DatabaseContextRetrievalSchema = z
  .object({
    query: z
      .object({
        filter: z.unknown().nullable(),
        sort: z.array(z.record(z.string(), z.unknown())),
        includeArchived: z.boolean(),
      })
      .strict(),
    filters: z.object({ propertyIds: z.array(z.string().min(1)) }).strict(),
    ranking: z
      .object({
        strategy: z.literal('typed_sort_then_record_id'),
        sort: z.array(z.record(z.string(), z.unknown())),
        tieBreakers: z.tuple([z.literal('record_id')]),
      })
      .strict(),
    projection: z
      .object({
        requestedPropertyIds: z.array(z.string().min(1)),
        returnedPropertyIds: z.array(z.string().min(1)),
        omittedPropertyIds: z.array(z.string().min(1)),
      })
      .strict(),
    result: z
      .object({
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        omittedRecords: z.number().int().nonnegative(),
        complete: z.boolean(),
        continuationAvailable: z.boolean(),
      })
      .strict(),
    permission: z
      .object({
        evaluated: z.literal(true),
        policyId: z.string().min(1),
        policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        records: z.number().int().nonnegative(),
        properties: z.number().int().nonnegative(),
        body: z.boolean().optional(),
      })
      .strict()
      .nullable(),
    evidence: z
      .object({
        mode: z.enum(['records', 'evidence', 'full_body']),
        searchText: z.string().nullable(),
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const DatabaseContextPackResponseSchema = z
  .object({
    id: z.string().startsWith('pack_'),
    goal: z.string().min(1),
    database: z.record(z.string(), z.unknown()),
    agentView: AppliedDatabaseAgentViewSchema.nullable(),
    retrieval: DatabaseContextRetrievalSchema.optional(),
    schema: z.record(z.string(), z.unknown()),
    snapshot: z.record(z.string(), z.unknown()),
    fileStates: z.record(z.string(), z.enum(['available', 'missing'])),
    relationRecords: z.array(ProjectedDatabaseRelationRecordSchema),
    encoding: z.enum(['object_rows', 'columnar_dictionary']),
    records: z.union([
      z.array(z.record(z.string(), z.unknown())),
      z.record(z.string(), z.unknown()),
    ]),
    disclosure: z.discriminatedUnion('level', [
      z.object({ level: z.literal('records') }).strict(),
      z
        .object({
          level: z.literal('evidence'),
          searchText: z.string(),
          matched: z.number().int().nonnegative(),
          isComplete: z.boolean(),
          evidence: z.array(DatabaseEvidenceSchema),
        })
        .strict(),
      z
        .object({
          level: z.literal('full_body'),
          fullBodies: z.array(
            z
              .object({
                recordId: z.string().min(1),
                path: z.string().min(1),
                revision: z.string().nullable(),
                body: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ]),
    relationExpansion: z
      .object({
        requested: z
          .object({
            maxDepth: z.number().int().min(1).max(3),
            maxRecords: z.number().int().min(1).max(500),
            maxRecordsPerRelation: z.number().int().min(1).max(50),
            projections: z.array(
              z
                .object({
                  sourceId: z.string().min(1),
                  propertyIds: z.array(z.string().min(1)),
                })
                .strict(),
            ),
          })
          .strict(),
        schemas: z.array(
          z
            .object({
              sourceId: z.string().min(1),
              sourceKey: z.string().min(1),
              recordMeaning: z.string().min(1),
              properties: z.array(z.record(z.string(), z.unknown())),
            })
            .strict(),
        ),
        records: z.array(
          z
            .object({
              sourceId: z.string().min(1),
              id: z.string().min(1),
              path: z.string().min(1),
              revision: z.string().optional(),
              values: z.record(z.string(), DatabaseValueSchema),
            })
            .strict(),
        ),
        edges: z.array(
          z
            .object({
              fromSourceId: z.string().min(1),
              fromRecordId: z.string().min(1),
              propertyId: z.string().min(1),
              toSourceId: z.string().min(1),
              toRecordId: z.string().min(1),
              depth: z.number().int().min(1).max(3),
            })
            .strict(),
        ),
        complete: z.boolean(),
        omitted: z
          .object({
            depthLimit: z.number().int().nonnegative(),
            recordLimit: z.number().int().nonnegative(),
            fanOutLimit: z.number().int().nonnegative(),
            missingRecords: z.array(
              z.object({ sourceId: z.string(), recordId: z.string().min(1) }).strict(),
            ),
            permissionRecords: z.number().int().nonnegative(),
            permissionProperties: z.number().int().nonnegative(),
            sensitivityProperties: z.number().int().nonnegative(),
            sensitivityEdges: z.number().int().nonnegative(),
            cycles: z.number().int().nonnegative(),
            deduplicatedRecords: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    returned: z.number().int().nonnegative(),
    isComplete: z.boolean(),
    nextCursor: z.string().nullable(),
    omitted: z.record(z.string(), z.unknown()),
    budget: z.record(z.string(), z.unknown()),
  })
  .strict();
const DatabaseContextInspectionSummarySchema = z
  .object({
    packId: z.string().startsWith('pack_'),
    capturedAt: z.string().datetime(),
    goal: z.string().min(1),
    database: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
    sourceId: z.string().min(1),
    agentView: z
      .object({
        id: z.string().startsWith('view_'),
        revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict()
      .nullable(),
    disclosure: z.enum(['records', 'evidence', 'full_body']),
    returned: z.number().int().nonnegative(),
    tokenCount: z
      .object({
        tokenizer: z.enum(['utf8_bytes_div3', 'utf8_bytes_div2']),
        estimated: z.number().int().nonnegative(),
        available: z.number().int().nonnegative(),
        max: z.number().int().positive(),
        reserve: z.number().int().nonnegative(),
      })
      .strict(),
    retrieval: DatabaseContextRetrievalSchema.optional(),
    redactions: z
      .object({
        evaluated: z.boolean(),
        rootRecords: z.number().int().nonnegative(),
        rootProperties: z.number().int().nonnegative(),
        relationRecords: z.number().int().nonnegative(),
        relationProperties: z.number().int().nonnegative(),
        sensitivityProperties: z.number().int().nonnegative(),
        sensitivityBodies: z.number().int().nonnegative(),
        sensitivityRelationEdges: z.number().int().nonnegative(),
      })
      .strict(),
    freshness: z
      .object({
        manifestRevision: z.string().min(1),
        schemaRevision: z.string().min(1),
        indexRevision: z.string().min(1),
        indexState: z.enum(['idle', 'rebuilding', 'error']).nullable(),
        indexFreshness: z.literal('snapshot'),
        expectation: z
          .object({
            expectation: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'manual']),
            maxAgeSeconds: z.number().int().positive().optional(),
          })
          .strict(),
      })
      .strict(),
    omissions: z
      .object({
        records: z.number().int().nonnegative(),
        propertyIds: z.array(z.string().min(1)),
        evidence: z.number().int().nonnegative(),
        fullBodies: z.number().int().nonnegative(),
        permissionBodies: z.number().int().nonnegative(),
        sensitivityProperties: z.number().int().nonnegative(),
        sensitivityBodies: z.number().int().nonnegative(),
        relation: z
          .object({
            depthLimit: z.number().int().nonnegative(),
            recordLimit: z.number().int().nonnegative(),
            fanOutLimit: z.number().int().nonnegative(),
            missingRecords: z.number().int().nonnegative(),
            permissionRecords: z.number().int().nonnegative(),
            permissionProperties: z.number().int().nonnegative(),
            sensitivityProperties: z.number().int().nonnegative(),
            sensitivityEdges: z.number().int().nonnegative(),
            cycles: z.number().int().nonnegative(),
            deduplicatedRecords: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    truncation: z
      .object({
        truncated: z.boolean(),
        cause: z.enum(['token_budget', 'query_page']).nullable(),
        continuationAvailable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const DatabaseContextInspectionResponseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('list'),
      inspections: z.array(DatabaseContextInspectionSummarySchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal('detail'),
      inspection: DatabaseContextInspectionSummarySchema.extend({
        exactPack: DatabaseContextPackResponseSchema,
      }).strict(),
    })
    .strict(),
]);
const DatabaseDiagnosticsIssueCodeSchema = z.enum([
  'unreadable_record',
  'record_symlink',
  'external_conflict',
  'duplicate_record_id',
  'duplicate_unique_value',
  'invalid_record',
]);
const DatabaseDiagnosticsTaskSummarySchema = z
  .object({
    id: z.string().startsWith('task_'),
    operation: z.enum(['import', 'migration', 'bulk']),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    createdAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
  })
  .strict();
const DatabaseDiagnosticsTelemetrySchema = z
  .object({
    commitCount: z.number().int().nonnegative(),
    commitSuccessCount: z.number().int().nonnegative(),
    commitConflictCount: z.number().int().nonnegative(),
    commitRollbackCount: z.number().int().nonnegative(),
    commitFailureCount: z.number().int().nonnegative(),
    commitLatencyMsSum: z.number().nonnegative(),
    commitLatencyMsCount: z.number().int().nonnegative(),
    commitLatencyMsMax: z.number().nonnegative(),
    indexRebuildCount: z.number().int().nonnegative(),
    indexRebuildFailureCount: z.number().int().nonnegative(),
    indexRebuildDurationMsSum: z.number().nonnegative(),
    indexRebuildDurationMsCount: z.number().int().nonnegative(),
    indexRebuildDurationMsMax: z.number().nonnegative(),
    contextPackCaptureCount: z.number().int().nonnegative(),
    contextPackTokensEstimatedSum: z.number().nonnegative(),
    contextPackTruncatedCount: z.number().int().nonnegative(),
    automationRunFailureCount: z.number().int().nonnegative(),
    taskRollbackAppliedCount: z.number().int().nonnegative(),
  })
  .strict();
export const DatabaseDiagnosticsResponseSchema = z
  .object({
    index: DatabaseIndexStatusSchema,
    issues: z
      .object({
        total: z.number().int().nonnegative(),
        byCode: z.partialRecord(DatabaseDiagnosticsIssueCodeSchema, z.number().int().nonnegative()),
        sample: z.array(
          z
            .object({
              code: DatabaseDiagnosticsIssueCodeSchema,
              path: z.string().min(1),
              databaseId: z.string().min(1).optional(),
              sourceId: z.string().min(1).optional(),
              recordId: z.string().min(1).optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    schemas: z.array(
      z
        .object({
          databaseId: z.string().min(1),
          key: z.string().min(1),
          name: z.string().min(1),
          schemaRevision: z.string().startsWith('sha256:'),
        })
        .strict(),
    ),
    tasks: z.array(DatabaseDiagnosticsTaskSummarySchema),
    telemetry: DatabaseDiagnosticsTelemetrySchema,
  })
  .strict();
export type DatabaseDiagnosticsResult = z.infer<typeof DatabaseDiagnosticsResponseSchema>;
export const DatabasePlanResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_draft'),
      draft: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_database_deletion_draft'),
      draft: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_verification_draft'),
      draft: z.record(z.string(), z.unknown()),
      review: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      action: z.literal('get_draft'),
      draft: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      action: z.literal('discard_draft'),
      discarded: z.boolean(),
      draftId: z.string().startsWith('draft_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_plan'),
      plan: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      action: z.literal('get_plan'),
      plan: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);
export const DatabaseCommitResponseSchema = z
  .object({
    mutationId: z.string().startsWith('mut_'),
    planId: z.string().startsWith('plan_'),
    planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    idempotentReplay: z.boolean(),
    actualDiff: z.array(z.record(z.string(), z.unknown())),
    verification: z.record(z.string(), z.unknown()),
    revisions: z
      .object({
        gitHead: z.string().regex(/^(?:sha1:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/),
        snapshotRevision: z.union([
          z.string().regex(/^sha256:[a-f0-9]{64}$/),
          z.literal('sha256:empty'),
        ]),
      })
      .strict(),
    auditReceipt: z.record(z.string(), z.unknown()),
    undoToken: z.string().startsWith('undo_'),
  })
  .strict();
export const DatabaseButtonResponseSchema = z.union([
  z.object({ plan: z.record(z.string(), z.unknown()) }).strict(),
  z
    .object({
      action: z.literal('execute'),
      run: DatabaseButtonRunSchema,
      undoToken: z.string().startsWith('undo_').nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('list_runs'),
      runs: z.array(DatabaseButtonRunSchema).max(500),
    })
    .strict(),
]);
const DatabaseAgentRunSummarySchema = DatabaseAgentRunSchema.transform((run) => ({
  id: run.id,
  state: run.state,
  revision: run.revision,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  intent: run.intent,
  scope: {
    databaseIds: run.scope.databaseIds,
    sourceCount: run.scope.sourceIds.length,
    propertyCount: run.scope.propertyIds.length,
    viewCount: run.scope.viewIds.length,
    recordCount: run.scope.recordIds.length,
  },
  plan: {
    id: run.plan.id,
    riskLevel: run.plan.risk.level,
  },
  execution: {
    mutationId: run.execution.mutationId,
    actualDiffCount: run.execution.actualDiff.length,
  },
  verification: {
    status: run.verification.status,
    checkCount: run.verification.checks.length,
    failedCheckCount: run.verification.checks.filter((check) => check.status === 'failed').length,
  },
  failureCode: run.failure?.code ?? null,
  undo: { available: run.undo.available },
  recovery: run.recovery
    ? {
        attempt: run.recovery.attempt,
        action: run.recovery.action,
        sourceRunId: run.recovery.sourceRunId,
      }
    : null,
}));
const DatabaseAgentRunStoreRevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const DatabaseAgentPromptRetentionMetadataSchema = z
  .object({
    runId: z.string().startsWith('run_'),
    storage: z.literal('process_memory'),
    retainedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    bytes: z
      .number()
      .int()
      .positive()
      .max(256 * 1024),
  })
  .strict();
export const DatabaseAgentRunsResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      runs: z.array(DatabaseAgentRunSummarySchema),
      revision: DatabaseAgentRunStoreRevisionSchema,
    })
    .strict(),
  z.object({ action: z.literal('get'), run: DatabaseAgentRunSchema }).strict(),
  z
    .object({
      action: z.enum(['retry', 'resume']),
      sourceRunId: z.string().startsWith('run_'),
      run: DatabaseAgentRunSchema,
      receipt: DatabaseCommitResponseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('retain_prompt'),
      retention: DatabaseAgentPromptRetentionMetadataSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('get_prompt'),
      retention: DatabaseAgentPromptRetentionMetadataSchema.extend({ prompt: z.string().min(1) }),
    })
    .strict(),
  z
    .object({
      action: z.literal('delete_prompt'),
      runId: z.string().startsWith('run_'),
      deleted: z.boolean(),
    })
    .strict(),
]);
const DatabaseAutonomyRevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const DatabaseAutonomyUsageSchema = z
  .object({
    records: z.number().int().nonnegative(),
    actions: z.number().int().nonnegative(),
    egressBytes: z.number().int().nonnegative(),
  })
  .strict();
export const DatabaseAutonomyResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('get'),
      databaseId: z.string().startsWith('db_'),
      sessionId: z.string().nullable(),
      databaseMode: z.enum(DATABASE_AUTONOMY_MODES).nullable(),
      sessionMode: z.enum(DATABASE_AUTONOMY_MODES).nullable(),
      effectiveMode: z.enum(DATABASE_AUTONOMY_MODES),
      delegation: DatabaseAutonomyScopeSchema.nullable(),
      usage: DatabaseAutonomyUsageSchema,
      revision: DatabaseAutonomyRevisionSchema,
      usageRevision: DatabaseAutonomyRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['set_database', 'clear_database']),
      databaseId: z.string().startsWith('db_'),
      mode: z.enum(DATABASE_AUTONOMY_MODES).nullable(),
      revision: DatabaseAutonomyRevisionSchema,
      usageRevision: DatabaseAutonomyRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('set_session'),
      sessionId: z.string().min(1).max(256),
      mode: z.enum(DATABASE_AUTONOMY_MODES).nullable(),
      delegation: DatabaseAutonomyScopeSchema.nullable(),
      sessionToken: z.string().startsWith('dbsession_').max(256).nullable(),
      usage: DatabaseAutonomyUsageSchema,
      revision: DatabaseAutonomyRevisionSchema,
      usageRevision: DatabaseAutonomyRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('clear_session'),
      sessionId: z.string().min(1).max(256),
      mode: z.null(),
      delegation: z.null(),
      usage: DatabaseAutonomyUsageSchema,
      revision: DatabaseAutonomyRevisionSchema,
      usageRevision: DatabaseAutonomyRevisionSchema,
    })
    .strict(),
]);
export const DatabasePermissionsResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      grants: z.array(DatabasePermissionGrantSchema),
      revision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('upsert'),
      grant: DatabasePermissionGrantSchema,
      revision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('remove'),
      grantId: z.string().regex(/^dbgrant_[a-f0-9-]{36}$/),
      revision: DatabasePermissionRevisionSchema,
    })
    .strict(),
]);
export const DatabasePublicSharesResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      shares: z.array(DatabasePublicShareViewSchema),
      revision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('upsert'),
      share: DatabasePublicShareViewSchema,
      token: z.string().startsWith('dbsharetoken_').max(256).nullable(),
      revision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('revoke'),
      shareId: DatabasePublicShareIdSchema,
      revision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z.object({ action: z.literal('resolve'), share: DatabasePublicShareViewSchema }).strict(),
  z
    .object({
      action: z.literal('describe'),
      share: DatabasePublicShareViewSchema,
      result: DatabaseDescribeResponseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('query'),
      share: DatabasePublicShareViewSchema,
      result: DatabaseQueryResponseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('record'),
      share: DatabasePublicShareViewSchema,
      result: DatabaseRecordResponseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('submit_form'),
      share: DatabasePublicShareViewSchema,
      result: DatabaseFormSubmitResponseSchema,
    })
    .strict(),
]);
export const DatabaseUndoResponseSchema = z
  .object({
    action: z.enum(['preview', 'apply', 'redo_preview', 'redo_apply']),
    undoId: z.string().startsWith('undo_'),
    mutationId: z.string().startsWith('mut_'),
    canApply: z.boolean(),
    idempotentReplay: z.boolean(),
    expectedSnapshotRevision: z.union([
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
      z.literal('sha256:empty'),
    ]),
    observedSnapshotRevision: z.union([
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
      z.literal('sha256:empty'),
    ]),
    conflicts: z.array(z.record(z.string(), z.unknown())),
    receipt: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
const DatabaseRecordRepairChangeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('set_identity'),
      before: z.unknown(),
      after: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('set_default'),
      propertyId: z.string().min(1),
      propertyKey: z.string().min(1),
      before: z.unknown(),
      after: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('deduplicate'),
      propertyId: z.string().min(1),
      propertyKey: z.string().min(1),
      before: z.unknown(),
      after: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unset_invalid_optional'),
      propertyId: z.string().min(1),
      propertyKey: z.string().min(1),
      before: z.unknown(),
      after: z.null(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('allocate_unique_id'),
      propertyId: z.string().min(1),
      propertyKey: z.string().min(1),
      before: z.unknown(),
      after: z.number().int().positive(),
    })
    .strict(),
]);
const DatabaseRepairActionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('rewrite_record'),
      path: z.string().min(1),
      categories: z.array(z.enum(['stale_identity', 'invalid_value', 'unique_id_allocation'])),
      beforeSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      afterSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      changes: z.array(DatabaseRecordRepairChangeSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal('advance_unique_id_watermark'),
      databaseId: z.string().min(1),
      propertyNextNumbers: z.record(z.string().min(1), z.number().int().positive()),
    })
    .strict(),
  z
    .object({
      kind: z.literal('rewrite_markdown'),
      path: z.string().min(1),
      databaseId: z.string().startsWith('db_'),
      sourceId: z.string().startsWith('ds_'),
      operation: z.enum(['assign_document_id', 'rewrite_title_alias']),
      documentId: z.string().startsWith('doc_').optional(),
      rowIndex: z.number().int().nonnegative().optional(),
      beforeSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      afterSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('rebuild_index'),
      missingRecordIds: z.array(z.string().min(1)),
      orphanedRecordIds: z.array(z.string().min(1)),
      changedRecordIds: z.array(z.string().min(1)),
      diagnosticsDiffer: z.boolean(),
    })
    .strict(),
]);
const DatabaseRepairPlanSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('repair_plan_'),
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    snapshot: z
      .object({
        manifestRevision: z.string().min(1),
        indexRevision: z.string().min(1),
      })
      .strict(),
    committable: z.boolean(),
    actions: z.array(DatabaseRepairActionSchema),
    blockers: z.array(
      z
        .object({
          path: z.string().min(1),
          code: z.enum([
            'ambiguous_source',
            'unreadable_record',
            'record_symlink',
            'external_conflict',
            'required_value_needs_input',
            'unrepairable_record',
            'malformed_owner',
            'duplicate_owner',
            'missing_document_id',
            'invalid_document_id',
            'duplicate_document_id',
            'duplicate_row_identity',
            'broken_document_link',
          ]),
          message: z.string().min(1),
          propertyId: z.string().min(1).optional(),
          propertyKey: z.string().min(1).optional(),
          rowIndex: z.number().int().nonnegative().optional(),
          relatedPath: z.string().min(1).optional(),
        })
        .strict(),
    ),
    summary: z
      .object({
        staleIdentities: z.number().int().nonnegative(),
        invalidValues: z.number().int().nonnegative(),
        missingRecords: z.number().int().nonnegative(),
        orphanedIndexEntries: z.number().int().nonnegative(),
        recordRewrites: z.number().int().nonnegative(),
        markdownRewrites: z.number().int().nonnegative(),
        identityIssues: z.number().int().nonnegative(),
        uniqueIdAllocations: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
const DatabaseRepairResultSchema = z
  .object({
    idempotentReplay: z.boolean(),
    receipt: z
      .object({
        version: z.literal(1),
        repairId: z.string().startsWith('repair_'),
        planId: z.string().startsWith('repair_plan_'),
        planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        principalId: z.string().min(1),
        appliedAt: z.string().datetime(),
        before: z
          .object({
            manifestRevision: z.string().min(1),
            indexRevision: z.string().min(1),
          })
          .strict(),
        after: z
          .object({
            manifestRevision: z.string().min(1),
            indexRevision: z.string().min(1),
          })
          .strict(),
        rewrittenPaths: z.array(z.string().min(1)),
        rebuiltIndex: z.boolean(),
        rewrittenDatabaseIds: z.array(z.string().min(1)),
        undoToken: z.string().startsWith('repair_undo_'),
      })
      .strict(),
  })
  .strict();
export const DatabaseRepairResponseSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), plan: DatabaseRepairPlanSchema }).strict(),
  z.object({ action: z.literal('apply'), result: DatabaseRepairResultSchema }).strict(),
  z
    .object({
      action: z.literal('undo'),
      result: z
        .object({
          idempotentReplay: z.boolean(),
          receipt: z
            .object({
              version: z.literal(1),
              undoId: z.string().startsWith('repair_undo_result_'),
              repairId: z.string().startsWith('repair_'),
              planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
              principalId: z.string().min(1),
              undoneAt: z.string().datetime(),
              restoredPaths: z.array(z.string().min(1)),
              restoredDatabaseIds: z.array(z.string().min(1)),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
]);

export const DatabaseOnboardingPreviewSchema = z
  .object({
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceFolder: z.string(),
    items: z.array(
      z
        .object({
          path: z.string().min(1),
          action: z.enum(['include', 'exclude', 'modify', 'reject']),
          reasons: z.array(
            z
              .object({
                code: z.enum([
                  'ready',
                  'record_identity_required',
                  'required_property_missing',
                  'unsupported_extension',
                  'subfolder_excluded',
                  'symlink_rejected',
                  'non_regular_file',
                  'unreadable_file',
                  'malformed_frontmatter',
                  'record_identity_conflict',
                  'invalid_record',
                ]),
                message: z.string().min(1),
                propertyId: z.string().min(1).optional(),
                propertyKey: z.string().min(1).optional(),
              })
              .strict(),
          ),
          plannedChanges: z.array(
            z.discriminatedUnion('type', [
              z.object({ type: z.literal('assign_record_id') }).strict(),
              z
                .object({
                  type: z.literal('provide_required_property'),
                  propertyId: z.string().min(1),
                  propertyKey: z.string().min(1),
                })
                .strict(),
            ]),
          ),
        })
        .strict(),
    ),
    summary: z
      .object({
        include: z.number().int().nonnegative(),
        exclude: z.number().int().nonnegative(),
        modify: z.number().int().nonnegative(),
        reject: z.number().int().nonnegative(),
      })
      .strict(),
    complete: z.boolean(),
    entryLimit: z.number().int().positive(),
  })
  .strict();

export const DatabaseManifestMigrationPreviewSchema = z
  .object({
    expectedManifestRevision: z.union([
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
      z.literal('sha256:empty'),
    ]),
    targetVersion: z.number().int().positive(),
    items: z.array(
      z
        .object({
          databaseId: z.string().min(1),
          databaseKey: z.string().min(1),
          manifestPath: z.string().startsWith('.ok/databases/'),
          expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          sourceVersion: z.number().int().positive().nullable(),
          targetVersion: z.number().int().positive(),
          action: z.enum(['not_needed', 'ready', 'blocked']),
          migrationIds: z.array(z.string().min(1)),
          lossless: z.boolean(),
          changed: z.boolean(),
          planHash: z
            .string()
            .regex(/^sha256:[a-f0-9]{64}$/)
            .optional(),
          migrationCommittedAt: z.string().datetime({ offset: true }).optional(),
          ownerPaths: z.array(z.string().min(1)).optional(),
          linkedDocumentPaths: z.array(z.string().min(1)).optional(),
          blockers: z
            .array(
              z
                .object({
                  code: z.string().min(1),
                  sourceId: z.string().min(1).optional(),
                  recordId: z.string().startsWith('rec_').optional(),
                  path: z.string().min(1).optional(),
                  propertyId: z.string().min(1).optional(),
                  message: z.string().min(1),
                })
                .strict(),
            )
            .optional(),
          blockerCount: z.number().int().nonnegative().optional(),
          code: z.string().min(1).optional(),
          message: z.string().min(1).optional(),
        })
        .strict(),
    ),
    summary: z
      .object({
        notNeeded: z.number().int().nonnegative(),
        ready: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
      })
      .strict(),
    complete: z.literal(true),
    committable: z.boolean(),
  })
  .strict();

const DatabaseMigrationOwnerChoicesSchema = z.record(
  z.string().startsWith('ds_'),
  z
    .object({
      path: z.string().min(1),
      blockId: z.string().startsWith('dbb_'),
    })
    .strict(),
);

const DatabaseMigrationTitleChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep_document_title') }).strict(),
  z.object({ kind: z.literal('use_record_title') }).strict(),
  z.object({ kind: z.literal('custom_title'), title: z.string().min(1).max(200) }).strict(),
]);

const DatabaseMigrationTitleChoicesSchema = z.record(
  z.string().startsWith('rec_'),
  DatabaseMigrationTitleChoiceSchema,
);

const DatabaseMigrationDerivedBaselineSchema = z
  .object({
    evaluatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/),
    timeZone: z.string().min(1),
    locale: z.string().min(1),
    permissionRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

const DatabaseMigrationDerivedBaselinesSchema = z.record(
  z.string().startsWith('db_'),
  DatabaseMigrationDerivedBaselineSchema,
);

export const DatabaseMigrationCleanupPlanSchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().startsWith('task_'),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    journalState: z.enum(['prepared', 'staged', 'activated', 'rolled_back', 'recovery_required']),
    updatedAt: z.string().datetime(),
    fileCount: z.number().int().nonnegative(),
    taskMaterialPresent: z.boolean(),
    undoExpiresAt: z.string().datetime().nullable(),
    retentionExpired: z.boolean(),
    committable: z.boolean(),
    blockers: z.array(z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()),
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const DatabaseTaskRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('get'),
      taskId: z.string().startsWith('task_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('cancel'),
      taskId: z.string().startsWith('task_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('preview_import'),
      databaseId: z.string().min(1),
      sourceId: z.string().min(1),
      expectedManifestRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal('preview_migration'),
      databaseIds: z.array(z.string().min(1)).max(10_000).optional(),
      expectedManifestRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
      targetVersion: z.number().int().positive(),
      migrationCommittedAt: z
        .record(z.string().min(1), z.string().datetime({ offset: true }))
        .optional(),
      ownerChoices: z
        .record(z.string().startsWith('db_'), DatabaseMigrationOwnerChoicesSchema)
        .optional(),
      titleChoices: z
        .record(z.string().startsWith('db_'), DatabaseMigrationTitleChoicesSchema)
        .optional(),
      derivedBaselines: DatabaseMigrationDerivedBaselinesSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('start'),
      task: z.discriminatedUnion('operation', [
        z
          .object({
            operation: z.literal('bulk'),
            commit: DatabaseCommitRequestSchema,
          })
          .strict(),
        z
          .object({
            operation: z.literal('import'),
            databaseId: z.string().min(1),
            sourceId: z.string().min(1),
            expectedManifestRevision: z.union([
              z.string().regex(/^sha256:[a-f0-9]{64}$/),
              z.literal('sha256:empty'),
            ]),
          })
          .strict(),
        z
          .object({
            operation: z.literal('migration'),
            databaseIds: z.array(z.string().min(1)).max(10_000).optional(),
            expectedManifestRevision: z.union([
              z.string().regex(/^sha256:[a-f0-9]{64}$/),
              z.literal('sha256:empty'),
            ]),
            targetVersion: z.number().int().positive(),
            planHashes: z
              .record(z.string().min(1), z.string().regex(/^sha256:[a-f0-9]{64}$/))
              .optional(),
            migrationCommittedAt: z
              .record(z.string().min(1), z.string().datetime({ offset: true }))
              .optional(),
            ownerChoices: z
              .record(z.string().startsWith('db_'), DatabaseMigrationOwnerChoicesSchema)
              .optional(),
            titleChoices: z
              .record(z.string().startsWith('db_'), DatabaseMigrationTitleChoicesSchema)
              .optional(),
            derivedBaselines: DatabaseMigrationDerivedBaselinesSchema.optional(),
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      action: z.enum(['retry', 'resume']),
      taskId: z.string().startsWith('task_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('rollback'),
      taskId: z.string().startsWith('task_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('inspect_migration'),
      taskId: z.string().startsWith('task_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('preview_cleanup_migration'),
      taskId: z.string().startsWith('task_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('cleanup_migration'),
      taskId: z.string().startsWith('task_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      approvalToken: z.string().min(1),
    })
    .strict(),
]);

export const DatabaseTaskResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      tasks: z.array(DatabaseTaskSchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z.object({ action: z.literal('get'), task: DatabaseTaskSchema }).strict(),
  z
    .object({
      action: z.literal('preview_import'),
      preview: DatabaseOnboardingPreviewSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('preview_migration'),
      preview: DatabaseManifestMigrationPreviewSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['cancel', 'start', 'retry', 'resume']),
      task: DatabaseTaskSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('rollback'),
      rollback: z
        .object({
          taskId: z.string().startsWith('task_'),
          status: z.enum(['applied', 'already_applied']),
          restored: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('inspect_migration'),
      inspection: z
        .object({
          taskId: z.string().startsWith('task_'),
          state: z.enum(['prepared', 'staged', 'activated', 'rolled_back', 'recovery_required']),
          updatedAt: z.string().datetime(),
          files: z.array(
            z
              .object({
                path: z.string().min(1),
                beforeSha256: z
                  .string()
                  .regex(/^sha256:[a-f0-9]{64}$/)
                  .nullable(),
                afterSha256: z
                  .string()
                  .regex(/^sha256:[a-f0-9]{64}$/)
                  .nullable(),
              })
              .strict(),
          ),
          taskMaterialPresent: z.boolean(),
          undoAvailable: z.boolean(),
          undoExpiresAt: z.string().datetime().nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('preview_cleanup_migration'),
      cleanupPlan: DatabaseMigrationCleanupPlanSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('cleanup_migration'),
      cleanup: z.object({ taskId: z.string().startsWith('task_'), removed: z.boolean() }).strict(),
    })
    .strict(),
]);

/** Runtime registry used by transports, contract tests, and future SDK generation. */
export const DATABASE_API_SCHEMAS: Readonly<{
  version: typeof DATABASE_API_SCHEMA_VERSION;
  operations: Readonly<Record<string, Readonly<{ request: z.ZodType; response: z.ZodType }>>>;
}> = Object.freeze({
  version: DATABASE_API_SCHEMA_VERSION,
  operations: Object.freeze({
    catalog: Object.freeze({
      request: DatabaseCatalogRequestSchema,
      response: DatabaseCatalogResponseSchema,
    }),
    describe: Object.freeze({
      request: DatabaseDescribeRequestSchema,
      response: DatabaseDescribeResponseSchema,
    }),
    record: Object.freeze({
      request: DatabaseRecordRequestSchema,
      response: DatabaseRecordResponseSchema,
    }),
    computedPropertyPreview: Object.freeze({
      request: DatabaseComputedPropertyPreviewRequestSchema,
      response: DatabaseComputedPropertyPreviewResponseSchema,
    }),
    propertyConversion: Object.freeze({
      request: DatabasePropertyConversionRequestSchema,
      response: DatabasePropertyConversionResponseSchema,
    }),
    find: Object.freeze({
      request: DatabaseFindRequestSchema,
      response: DatabaseFindResponseSchema,
    }),
    retrieve: Object.freeze({
      request: DatabaseRetrieveRequestSchema,
      response: DatabaseRetrieveResponseSchema,
    }),
    query: Object.freeze({
      request: DatabaseQueryRequestSchema,
      response: DatabaseQueryResponseSchema,
    }),
    formSubmit: Object.freeze({
      request: DatabaseFormSubmitRequestSchema,
      response: DatabaseFormSubmitResponseSchema,
    }),
    contextPack: Object.freeze({
      request: DatabaseContextPackRequestSchema,
      response: DatabaseContextPackResponseSchema,
    }),
    contextInspection: Object.freeze({
      request: DatabaseContextInspectionRequestSchema,
      response: DatabaseContextInspectionResponseSchema,
    }),
    plan: Object.freeze({
      request: DatabasePlanRequestSchema,
      response: DatabasePlanResponseSchema,
    }),
    button: Object.freeze({
      request: DatabaseButtonRequestSchema,
      response: DatabaseButtonResponseSchema,
    }),
    placeSearch: Object.freeze({
      request: DatabasePlaceSearchRequestSchema,
      response: DatabasePlaceSearchResponseSchema,
    }),
    commit: Object.freeze({
      request: DatabaseCommitRequestSchema,
      response: DatabaseCommitResponseSchema,
    }),
    markdownTableMutation: Object.freeze({
      request: DatabaseMarkdownTableMutationRequestSchema,
      response: DatabaseMarkdownTableMutationResponseSchema,
    }),
    agentRuns: Object.freeze({
      request: DatabaseAgentRunsRequestSchema,
      response: DatabaseAgentRunsResponseSchema,
    }),
    templateRuns: Object.freeze({
      request: DatabaseTemplateRunsRequestSchema,
      response: DatabaseTemplateRunsResponseSchema,
    }),
    automations: Object.freeze({
      request: DatabaseAutomationRequestSchema,
      response: DatabaseAutomationResponseSchema,
    }),
    autonomy: Object.freeze({
      request: DatabaseAutonomyRequestSchema,
      response: DatabaseAutonomyResponseSchema,
    }),
    permissions: Object.freeze({
      request: DatabasePermissionsRequestSchema,
      response: DatabasePermissionsResponseSchema,
    }),
    publicShares: Object.freeze({
      request: DatabasePublicSharesRequestSchema,
      response: DatabasePublicSharesResponseSchema,
    }),
    undo: Object.freeze({
      request: DatabaseUndoRequestSchema,
      response: DatabaseUndoResponseSchema,
    }),
    repair: Object.freeze({
      request: DatabaseRepairRequestSchema,
      response: DatabaseRepairResponseSchema,
    }),
    task: Object.freeze({
      request: DatabaseTaskRequestSchema,
      response: DatabaseTaskResponseSchema,
    }),
  }),
});

export type { DatabaseTask } from './database-task-contract.ts';
export { DatabaseTaskSchema } from './database-task-contract.ts';
export type DatabaseTaskRequest = z.infer<typeof DatabaseTaskRequestSchema>;
export type DatabaseTaskResponse = z.infer<typeof DatabaseTaskResponseSchema>;

export interface DatabaseDataPlaneApiHandlers {
  catalog: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  describe: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  record: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  markdownTableExport: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  computedPropertyPreview: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  propertyConversion: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  find: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  retrieve: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  query: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  formSubmit: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  pack: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  inspect: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  plan: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  button: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  placeSearch: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  commit: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  markdownTableMutation: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  runs: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  templateRuns: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  automations: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  autonomy: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  permissions: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  publicShares: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  undo: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  repair: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  task: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  diagnostics: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

function parseRevisionTag(value: string | string[] | undefined): string | undefined {
  const tag = Array.isArray(value) ? value[0] : value;
  if (!tag) return undefined;
  const normalized = tag.trim().replace(/^W\//, '');
  return normalized.startsWith('"') && normalized.endsWith('"')
    ? normalized.slice(1, -1)
    : normalized;
}

function revisionHeaders(revision: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    [DATABASE_API_SCHEMA_VERSION_HEADER]: String(DATABASE_API_SCHEMA_VERSION),
    ETag: `"${revision}"`,
  };
}

function noStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    [DATABASE_API_SCHEMA_VERSION_HEADER]: String(DATABASE_API_SCHEMA_VERSION),
  };
}

function requestCancellationCheckpoint(
  request: IncomingMessage,
  response: ServerResponse,
): () => void {
  return () => {
    if (!request.aborted && !response.destroyed) return;
    const error = new Error('Database request was cancelled by the client');
    error.name = 'AbortError';
    throw error;
  };
}

function cancelledConnection(
  error: unknown,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  return (
    error instanceof Error && error.name === 'AbortError' && (request.aborted || response.destroyed)
  );
}

function publicShareView(policy: DatabasePublicSharePolicy) {
  const { tokenHash: _tokenHash, createdBy: _createdBy, ...view } = policy;
  return view;
}

function respondUnavailable(response: ServerResponse, handler: string): void {
  errorResponse(
    response,
    503,
    'urn:ok:error:internal-server-error',
    'Database data plane is unavailable.',
    {
      handler,
      extensions: databaseProblemExtensions('data_plane_unavailable'),
    },
  );
}

function isTaskStoreError(error: unknown): error is Error & {
  code: DatabaseTaskStoreErrorCode;
  details: Record<string, unknown>;
} {
  return (
    error instanceof Error &&
    error.name === 'DatabaseTaskStoreError' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'details' in error &&
    error.details !== null &&
    typeof error.details === 'object'
  );
}

function respondTaskStoreError(response: ServerResponse, error: unknown): void {
  if (error instanceof DatabaseTaskServiceError) {
    const status: HttpErrorStatus =
      error.code === 'task_database_not_found'
        ? 404
        : error.code === 'task_target_limit_exceeded'
          ? 413
          : error.code === 'task_invalid_request'
            ? 400
            : 409;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 413
          ? 'urn:ok:error:payload-too-large'
          : status === 400
            ? 'urn:ok:error:invalid-request'
            : 'urn:ok:error:stale-target',
      error.message,
      {
        handler: 'database-task',
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (!isTaskStoreError(error)) {
    respondDataPlaneError(response, 'database-task', error);
    return;
  }
  const status: HttpErrorStatus =
    error.code === 'task_not_found'
      ? 404
      : error.code === 'task_revision_changed' ||
          error.code === 'task_not_cancellable' ||
          error.code === 'invalid_task_transition'
        ? 409
        : error.code === 'invalid_task' || error.code === 'invalid_task_cursor'
          ? 400
          : 500;
  errorResponse(
    response,
    status,
    status === 404
      ? 'urn:ok:error:not-found'
      : status === 409
        ? 'urn:ok:error:stale-target'
        : status === 400
          ? 'urn:ok:error:invalid-request'
          : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-task',
      extensions: databaseProblemExtensions(error.code, error.details),
    },
  );
}

function respondAutonomyStoreError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabaseAutonomyStoreError)) {
    respondDataPlaneError(response, 'database-autonomy', error);
    return;
  }
  const status: HttpErrorStatus = error.code === 'autonomy_revision_changed' ? 409 : 503;
  errorResponse(
    response,
    status,
    status === 409 ? 'urn:ok:error:stale-target' : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-autonomy',
      extensions: databaseProblemExtensions(error.code, error.details),
    },
  );
}

function respondPermissionStoreError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabasePermissionStoreError)) {
    respondDataPlaneError(response, 'database-permissions', error);
    return;
  }
  const status: HttpErrorStatus = error.code === 'permission_revision_changed' ? 409 : 503;
  errorResponse(
    response,
    status,
    status === 409 ? 'urn:ok:error:stale-target' : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-permissions',
      extensions: databaseProblemExtensions(
        error.code === 'permission_revision_changed' ? 'permission_changed' : 'internal_error',
        error.details,
      ),
    },
  );
}

function respondAgentRunStoreError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabaseAgentRunStoreError)) {
    respondDataPlaneError(response, 'database-agent-runs', error);
    return;
  }
  const status: HttpErrorStatus =
    error.code === 'agent_run_not_found'
      ? 404
      : error.code === 'agent_run_plan_unavailable' ||
          error.code === 'agent_run_not_retryable' ||
          error.code === 'agent_run_revision_changed'
        ? 409
        : 503;
  errorResponse(
    response,
    status,
    status === 404
      ? 'urn:ok:error:not-found'
      : status === 409
        ? 'urn:ok:error:stale-target'
        : 'urn:ok:error:internal-server-error',
    error.message,
    {
      handler: 'database-agent-runs',
      extensions: databaseProblemExtensions(error.code),
    },
  );
}

function respondAgentPromptRetentionError(response: ServerResponse, error: unknown): void {
  if (!(error instanceof DatabaseAgentPromptRetentionError)) {
    respondDataPlaneError(response, 'database-agent-runs', error);
    return;
  }
  errorResponse(
    response,
    error.code === 'prompt_retention_not_found' ? 404 : 400,
    error.code === 'prompt_retention_not_found'
      ? 'urn:ok:error:not-found'
      : 'urn:ok:error:invalid-request',
    error.message,
    {
      handler: 'database-agent-runs',
      extensions: databaseProblemExtensions(error.code),
    },
  );
}

function respondDataPlaneError(response: ServerResponse, handler: string, error: unknown): void {
  if (error instanceof DatabaseButtonExecutionError) {
    const status: HttpErrorStatus =
      error.code === 'button_permission_denied'
        ? 403
        : error.code === 'button_approval_required'
          ? 409
          : 400;
    errorResponse(
      response,
      status,
      status === 403
        ? 'urn:ok:error:permission-denied'
        : status === 409
          ? 'urn:ok:error:stale-target'
          : 'urn:ok:error:invalid-request',
      error.message,
      { handler, extensions: databaseProblemExtensions(error.code) },
    );
    return;
  }
  if (error instanceof DatabaseButtonPlanError) {
    const status: HttpErrorStatus =
      error.code === 'database_not_found' ||
      error.code === 'record_not_found' ||
      error.code === 'button_not_found'
        ? 404
        : error.code === 'permission_denied'
          ? 403
          : error.code === 'record_revision_changed' || error.code === 'record_scope_mismatch'
            ? 409
            : 400;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 403
          ? 'urn:ok:error:permission-denied'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : 'urn:ok:error:invalid-request',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabaseDataPlaneError) {
    const status: HttpErrorStatus =
      error.code === 'database_not_found' ||
      error.code === 'source_not_found' ||
      error.code === 'property_not_found' ||
      error.code === 'record_not_found' ||
      error.code === 'view_not_found' ||
      error.code === 'form_not_found' ||
      error.code === 'agent_view_not_found' ||
      error.code === 'context_inspection_not_found'
        ? 404
        : error.code === 'permission_denied' || error.code === 'form_access_denied'
          ? 403
          : error.code === 'transaction_in_progress' ||
              error.code === 'storage_read_only' ||
              error.code === 'button_plan_expired' ||
              error.code === 'form_closed' ||
              error.code === 'form_duplicate_submission'
            ? 409
            : error.code === 'invalid_computed_property' ||
                error.code === 'delta_query_mismatch' ||
                error.code === 'view_source_mismatch' ||
                error.code === 'agent_view_source_mismatch' ||
                error.code === 'agent_view_scope_violation' ||
                error.code === 'agent_view_budget_exceeded' ||
                error.code === 'form_invalid_submission'
              ? 400
              : error.code === 'resource_limit'
                ? 413
                : error.code === 'form_rate_limited'
                  ? 429
                  : 503;
    const type =
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 403
          ? 'urn:ok:error:permission-denied'
          : status === 400
            ? 'urn:ok:error:invalid-request'
            : status === 413
              ? 'urn:ok:error:payload-too-large'
              : status === 429
                ? 'urn:ok:error:invalid-request'
                : error.code === 'stale_index' ||
                    error.code === 'transaction_in_progress' ||
                    error.code === 'mutation_failed' ||
                    error.code === 'button_plan_expired'
                  ? 'urn:ok:error:stale-target'
                  : 'urn:ok:error:internal-server-error';
    errorResponse(response, status, type, error.message, {
      handler,
      extensions: databaseProblemExtensions(error.code, error.details),
    });
    return;
  }
  if (error instanceof DatabaseQueryError) {
    errorResponse(response, 400, 'urn:ok:error:invalid-request', error.message, {
      handler,
      extensions: databaseProblemExtensions(error.code, error.details),
    });
    return;
  }
  if (error instanceof DatabaseContextPackError) {
    const status: HttpErrorStatus = error.code === 'stale_pack_cursor' ? 409 : 400;
    errorResponse(
      response,
      status,
      status === 409 ? 'urn:ok:error:stale-target' : 'urn:ok:error:invalid-request',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabasePlanError) {
    const status: HttpErrorStatus =
      error.code === 'draft_not_found' || error.code === 'plan_not_found'
        ? 404
        : error.code === 'draft_expired' ||
            error.code === 'plan_expired' ||
            error.code === 'snapshot_changed'
          ? 409
          : 400;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 409
          ? 'urn:ok:error:stale-target'
          : 'urn:ok:error:invalid-request',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabaseCommitError) {
    const status: HttpErrorStatus =
      error.code === 'undo_not_found'
        ? 404
        : error.code === 'approval_required'
          ? 403
          : error.code === 'snapshot_changed' ||
              error.code === 'plan_hash_mismatch' ||
              error.code === 'plan_not_committable' ||
              error.code === 'assertion_failed' ||
              error.code === 'target_changed' ||
              error.code === 'idempotency_conflict'
            ? 409
            : error.code === 'commit_unavailable' || error.code === 'agent_run_unavailable'
              ? 503
              : error.code === 'invalid_commit_request' || error.code === 'undo_invalid_request'
                ? 400
                : 500;
    errorResponse(
      response,
      status,
      status === 403
        ? 'urn:ok:error:invalid-request'
        : status === 404
          ? 'urn:ok:error:not-found'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : status === 400
              ? 'urn:ok:error:invalid-request'
              : 'urn:ok:error:internal-server-error',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  if (error instanceof DatabaseRepairError) {
    const status: HttpErrorStatus =
      error.code === 'repair_plan_not_found'
        ? 404
        : error.code === 'repair_approval_required'
          ? 403
          : error.code === 'repair_plan_expired' ||
              error.code === 'repair_plan_hash_mismatch' ||
              error.code === 'repair_snapshot_changed' ||
              error.code === 'repair_idempotency_conflict' ||
              error.code === 'repair_file_changed' ||
              error.code === 'repair_undo_intervening_edit' ||
              error.code === 'repair_undo_idempotency_conflict' ||
              error.code === 'repair_blocked'
            ? 409
            : error.code === 'repair_nothing_to_repair' ||
                error.code === 'repair_undo_not_found' ||
                error.code === 'repair_undo_token_mismatch'
              ? 400
              : 500;
    errorResponse(
      response,
      status,
      status === 404
        ? 'urn:ok:error:not-found'
        : status === 403 || status === 400
          ? 'urn:ok:error:invalid-request'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : 'urn:ok:error:internal-server-error',
      error.message,
      {
        handler,
        extensions: databaseProblemExtensions(error.code, error.details),
      },
    );
    return;
  }
  errorResponse(response, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
    handler,
    cause: error,
    extensions: databaseProblemExtensions('internal_error'),
  });
}

export function createDatabaseDataPlaneApiHandlers(
  dataPlane?: DatabaseDataPlane,
  taskStore?: DatabaseTaskStore,
  taskService?: DatabaseTaskService,
  autonomyStore?: DatabaseAutonomyStore,
  agentRunStore?: DatabaseAgentRunStore,
  placeSearchService?: DatabasePlaceSearchService,
  templateScheduler?: DatabaseTemplateScheduler,
  automationService?: DatabaseAutomationService,
  automationNotificationStore?: DatabaseAutomationNotificationStore,
  resolveAccessPrincipal?: (request: IncomingMessage) => DatabaseAccessPrincipal,
  permissionStore?: DatabasePermissionStore,
  promptRetentionStore?: DatabaseAgentPromptRetentionStore,
): DatabaseDataPlaneApiHandlers {
  const agentEntryPointLimiter = new DatabaseAgentEntryPointLimiter();
  const catalog = withValidation(
    DatabaseEmptyRequestSchema,
    async (request, response) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-catalog');
        return;
      }
      try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const parsedQuery = DatabaseCatalogRequestSchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsedQuery.success) {
          throw new DatabaseQueryError('invalid_query', 'Catalog query parameters are invalid', {
            issues: parsedQuery.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        const query = parsedQuery.data.q;
        const result = dataPlane.catalogIfChanged(
          query,
          parsedQuery.data.ifCatalogRevision ?? parseRevisionTag(request.headers['if-none-match']),
        );
        successResponse(response, 200, DatabaseCatalogResponseSchema, result, {
          handler: 'database-catalog',
          extraHeaders: revisionHeaders(result.catalogRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-catalog', error);
      }
    },
    {
      handler: 'database-catalog',
      method: 'GET',
      skipBodyParse: true,
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const describe = withValidation(
    DatabaseDescribeRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-describe');
        return;
      }
      try {
        const result = dataPlane.describeIfChanged({
          ...body,
          ifSchemaRevision:
            body.ifSchemaRevision ?? parseRevisionTag(request.headers['if-none-match']),
        });
        successResponse(response, 200, DatabaseDescribeResponseSchema, result, {
          handler: 'database-describe',
          extraHeaders: revisionHeaders(result.schemaRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-describe', error);
      }
    },
    {
      handler: 'database-describe',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const query = withValidation(
    DatabaseQueryRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-query');
        return;
      }
      try {
        const result = dataPlane.query({
          ...body,
          throwIfCancelled: requestCancellationCheckpoint(request, response),
        });
        successResponse(response, 200, DatabaseQueryResponseSchema, result, {
          handler: 'database-query',
          extraHeaders: revisionHeaders(result.snapshotRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (cancelledConnection(error, request, response)) return;
        respondDataPlaneError(response, 'database-query', error);
      }
    },
    {
      handler: 'database-query',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const formSubmit = withValidation(
    DatabaseFormSubmitRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-form-submit');
        return;
      }
      try {
        const result = await dataPlane.submitForm({
          ...body,
          remoteAddress: request.socket.remoteAddress ?? '',
        });
        successResponse(response, 201, DatabaseFormSubmitResponseSchema, result, {
          handler: 'database-form-submit',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-form-submit', error);
      }
    },
    {
      handler: 'database-form-submit',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const record = withValidation(
    DatabaseRecordRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-record');
        return;
      }
      try {
        const result = dataPlane.record(body);
        successResponse(response, 200, DatabaseRecordResponseSchema, result, {
          handler: 'database-record',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-record', error);
      }
    },
    {
      handler: 'database-record',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const markdownTableExport = withValidation(
    DatabaseMarkdownTableExportRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-markdown-table-export');
        return;
      }
      try {
        const result = dataPlane.exportMarkdownTable(body);
        successResponse(response, 200, DatabaseMarkdownTableExportResponseSchema, result, {
          handler: 'database-markdown-table-export',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-markdown-table-export', error);
      }
    },
    {
      handler: 'database-markdown-table-export',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const computedPropertyPreview = withValidation(
    DatabaseComputedPropertyPreviewRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-computed-property-preview');
        return;
      }
      try {
        if (body.property.type !== 'formula' && body.property.type !== 'rollup') {
          throw new Error('Computed property request validation did not narrow the property type');
        }
        const result = dataPlane.previewComputedProperty({
          ...body,
          property: body.property,
        });
        successResponse(response, 200, DatabaseComputedPropertyPreviewResponseSchema, result, {
          handler: 'database-computed-property-preview',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-computed-property-preview', error);
      }
    },
    {
      handler: 'database-computed-property-preview',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const find = withValidation(
    DatabaseFindRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-find');
        return;
      }
      try {
        const result = dataPlane.find(body);
        successResponse(response, 200, DatabaseFindResponseSchema, result, {
          handler: 'database-find',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-find', error);
      }
    },
    {
      handler: 'database-find',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const retrieve = withValidation(
    DatabaseRetrieveRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-retrieve');
        return;
      }
      try {
        const result = await dataPlane.retrieve(body);
        successResponse(response, 200, DatabaseRetrieveResponseSchema, result, {
          handler: 'database-retrieve',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-retrieve', error);
      }
    },
    {
      handler: 'database-retrieve',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const pack = withValidation(
    DatabaseContextPackRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-pack');
        return;
      }
      try {
        const result = dataPlane.pack({
          ...body,
          throwIfCancelled: requestCancellationCheckpoint(request, response),
        });
        successResponse(response, 200, DatabaseContextPackResponseSchema, result, {
          handler: 'database-pack',
          extraHeaders: revisionHeaders(result.snapshot.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (cancelledConnection(error, request, response)) return;
        respondDataPlaneError(response, 'database-pack', error);
      }
    },
    {
      handler: 'database-pack',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const inspect = withValidation(
    DatabaseEmptyRequestSchema,
    async (request, response) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-context-inspector');
        return;
      }
      try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const parsedQuery = DatabaseContextInspectionRequestSchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsedQuery.success) {
          throw new DatabaseQueryError('invalid_query', 'Inspector query parameters are invalid', {
            issues: parsedQuery.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        const {
          packId,
          databaseId,
          sourceId,
          viewId,
          recordId,
          recordIds: recordIdsParam,
          propertyIds: propertyIdsParam,
        } = parsedQuery.data;
        const recordIds = recordIdsParam
          ?.split(',')
          .map((recordId) => recordId.trim())
          .filter(Boolean);
        const propertyIds = propertyIdsParam
          ?.split(',')
          .map((propertyId) => propertyId.trim())
          .filter(Boolean);
        const scope =
          databaseId || sourceId || viewId || recordId || recordIds?.length || propertyIds?.length
            ? {
                ...(databaseId ? { databaseId } : {}),
                ...(sourceId ? { sourceId } : {}),
                ...(viewId ? { viewId } : {}),
                ...(recordId ? { recordId } : {}),
                ...(recordIds?.length ? { recordIds } : {}),
                ...(propertyIds?.length ? { propertyIds } : {}),
              }
            : undefined;
        const result = packId
          ? {
              kind: 'detail' as const,
              inspection: dataPlane.getContextInspection(packId, scope),
            }
          : {
              kind: 'list' as const,
              inspections: dataPlane.listContextInspections(scope),
            };
        successResponse(response, 200, DatabaseContextInspectionResponseSchema, result, {
          handler: 'database-context-inspector',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-context-inspector', error);
      }
    },
    {
      handler: 'database-context-inspector',
      method: 'GET',
      skipBodyParse: true,
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const propertyConversion = withValidation(
    DatabasePropertyConversionRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-property-conversion');
        return;
      }
      try {
        const result = dataPlane.previewPropertyConversion(body);
        successResponse(response, 200, DatabasePropertyConversionResponseSchema, result, {
          handler: 'database-property-conversion',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-property-conversion', error);
      }
    },
    {
      handler: 'database-property-conversion',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const plan = withValidation(
    DatabasePlanRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-plan');
        return;
      }
      try {
        const result = (() => {
          switch (body.action) {
            case 'create_draft':
              return {
                action: body.action,
                draft: dataPlane.createDraft(body.desiredState, body.ttlSeconds),
              };
            case 'create_database_deletion_draft':
              return {
                action: body.action,
                draft: dataPlane.createDatabaseDeletionDraft(
                  body.databaseId,
                  body.expectedSnapshotRevision,
                  body.ttlSeconds,
                ),
              };
            case 'create_verification_draft': {
              const result = dataPlane.createVerificationDraft(
                body.lifecycle,
                { kind: body.actor.kind, principal_id: body.actor.principalId },
                body.ttlSeconds,
              );
              return { action: body.action, ...result };
            }
            case 'get_draft':
              return {
                action: body.action,
                draft: dataPlane.getDraft(body.draftId),
              };
            case 'discard_draft':
              return {
                action: body.action,
                ...dataPlane.discardDraft(body.draftId),
              };
            case 'create_plan':
              return {
                action: body.action,
                plan: dataPlane.createPlan(body.draftId, body.ttlSeconds),
              };
            case 'get_plan':
              return {
                action: body.action,
                plan: dataPlane.getPlan(body.planId),
              };
          }
        })();
        successResponse(response, 200, DatabasePlanResponseSchema, result, {
          handler: 'database-plan',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-plan', error);
      }
    },
    {
      handler: 'database-plan',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const button = withValidation(
    DatabaseButtonRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-button');
        return;
      }
      try {
        if ('action' in body && body.action === 'execute') {
          const { action: _action, ...input } = body;
          const result = await dataPlane.executeButton(input);
          successResponse(
            response,
            200,
            DatabaseButtonResponseSchema,
            { action: 'execute', ...result },
            {
              handler: 'database-button',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        if ('action' in body && body.action === 'list_runs') {
          successResponse(
            response,
            200,
            DatabaseButtonResponseSchema,
            {
              action: 'list_runs',
              runs: await dataPlane.listButtonRuns(body.limit),
            },
            {
              handler: 'database-button',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        successResponse(
          response,
          200,
          DatabaseButtonResponseSchema,
          { plan: dataPlane.createButtonPlan(body) },
          {
            handler: 'database-button',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-button', error);
      }
    },
    {
      handler: 'database-button',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const placeSearch = withValidation(
    DatabasePlaceSearchRequestSchema,
    async (_request, response, body) => {
      try {
        dataPlane?.authorizeOperation({ action: 'external_egress' });
      } catch (error) {
        respondDataPlaneError(response, 'database-place-search', error);
        return;
      }
      if (!placeSearchService) {
        successResponse(
          response,
          200,
          DatabasePlaceSearchResponseSchema,
          {
            status: 'unavailable',
            providerId: null,
            candidates: [],
            attribution: null,
            offlineFallback: true,
          },
          {
            handler: 'database-place-search',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      try {
        const result = await placeSearchService.search(body);
        successResponse(response, 200, DatabasePlaceSearchResponseSchema, result, {
          handler: 'database-place-search',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (error instanceof DatabasePlaceSearchError) {
          errorResponse(
            response,
            error.code === 'provider_failed' ? 503 : 400,
            'urn:ok:error:invalid-request',
            error.message,
            { handler: 'database-place-search' },
          );
          return;
        }
        errorResponse(response, 500, 'urn:ok:error:internal-server-error', 'Place search failed.', {
          handler: 'database-place-search',
        });
      }
    },
    {
      handler: 'database-place-search',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const commit = withValidation(
    DatabaseCommitRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-commit');
        return;
      }
      try {
        successResponse(response, 200, DatabaseCommitResponseSchema, await dataPlane.commit(body), {
          handler: 'database-commit',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-commit', error);
      }
    },
    {
      handler: 'database-commit',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  /**
   * Drop the receipt bytes no HTTP caller reads.
   *
   * A v2 receipt carries the owner table's full before AND after content plus
   * any created document, so every one-row insert shipped the whole table twice
   * to a browser that never opens either field — and the cost grows with the
   * table. `beforeOwnerContent` stays: the client round-trips the receipt into
   * the `undo` operation, and `#beforeOwnerBytes` needs it there. The two dropped
   * fields are read only by `database-commit.ts`, which composes v2 receipts
   * in-process and never sees this response.
   */
  function slimMarkdownTableReceipt(result: { receipt?: unknown }): { receipt?: unknown } {
    const receipt = result.receipt;
    if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) return {};
    const {
      afterOwnerContent: _afterOwnerContent,
      createdDocumentContent: _createdDocumentContent,
      ...rest
    } = receipt as Record<string, unknown>;
    return { receipt: rest };
  }

  const markdownTableMutation = withValidation(
    DatabaseMarkdownTableMutationRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-markdown-table-mutation');
        return;
      }
      try {
        const result = await dataPlane.mutateMarkdownTable(
          body as unknown as DatabaseMarkdownTableMutationRequest,
        );
        successResponse(
          response,
          200,
          DatabaseMarkdownTableMutationResponseSchema,
          {
            operation: body.operation,
            ...(result as Record<string, unknown>),
            ...slimMarkdownTableReceipt(result as { receipt?: unknown }),
          },
          {
            handler: 'database-markdown-table-mutation',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-markdown-table-mutation', error);
      }
    },
    {
      handler: 'database-markdown-table-mutation',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const autonomy = withValidation(
    DatabaseAutonomyRequestSchema,
    async (_request, response, body) => {
      if (!autonomyStore) {
        respondUnavailable(response, 'database-autonomy');
        return;
      }
      try {
        dataPlane?.authorizeOperation({
          action: body.action === 'get' ? 'read_audit' : 'manage_permissions',
          ...('databaseId' in body && body.databaseId ? { databaseId: body.databaseId } : {}),
        });
        if (body.action === 'get') {
          const state = await autonomyStore.snapshot();
          const databaseMode = state.databases[body.databaseId]?.mode;
          const session = body.sessionId ? state.sessions[body.sessionId] : undefined;
          successResponse(
            response,
            200,
            DatabaseAutonomyResponseSchema,
            {
              action: body.action,
              databaseId: body.databaseId,
              sessionId: body.sessionId ?? null,
              databaseMode: databaseMode ?? null,
              sessionMode: session?.mode ?? null,
              effectiveMode: resolveDatabaseAutonomyMode(databaseMode, session?.mode),
              delegation: session?.delegation ?? null,
              usage: session?.usage ?? {
                records: 0,
                actions: 0,
                egressBytes: 0,
              },
              revision: state.revision,
              usageRevision: state.usageRevision,
            },
            {
              handler: 'database-autonomy',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const result = await (async () => {
          if (body.action === 'set_database' || body.action === 'clear_database') {
            const state =
              body.action === 'set_database'
                ? await autonomyStore.setDatabaseMode(body)
                : await autonomyStore.clearDatabaseMode(body);
            return {
              action: body.action,
              databaseId: body.databaseId,
              mode: state.databases[body.databaseId]?.mode ?? null,
              revision: state.revision,
              usageRevision: state.usageRevision,
            };
          }
          if (body.action === 'set_session') {
            const { state, sessionToken } = await autonomyStore.setSessionPolicy(body);
            return {
              action: body.action,
              sessionId: body.sessionId,
              mode: state.sessions[body.sessionId]?.mode ?? null,
              delegation: state.sessions[body.sessionId]?.delegation ?? null,
              sessionToken,
              usage: state.sessions[body.sessionId]?.usage ?? {
                records: 0,
                actions: 0,
                egressBytes: 0,
              },
              revision: state.revision,
              usageRevision: state.usageRevision,
            };
          }
          const state = await autonomyStore.clearSessionPolicy(body);
          return {
            action: body.action,
            sessionId: body.sessionId,
            mode: null,
            delegation: null,
            usage: { records: 0, actions: 0, egressBytes: 0 },
            revision: state.revision,
            usageRevision: state.usageRevision,
          };
        })();
        successResponse(response, 200, DatabaseAutonomyResponseSchema, result, {
          handler: 'database-autonomy',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-autonomy', error);
          return;
        }
        respondAutonomyStoreError(response, error);
      }
    },
    {
      handler: 'database-autonomy',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const permissions = withValidation(
    DatabasePermissionsRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane || !permissionStore) {
        respondUnavailable(response, 'database-permissions');
        return;
      }
      try {
        if (body.action === 'list') {
          dataPlane.authorizeOperation({
            action: 'manage_permissions',
            ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          });
          const state = await permissionStore.snapshot();
          const grants = Object.values(state.grants)
            .filter(
              (grant) =>
                !body.databaseId ||
                grant.databaseId === null ||
                grant.databaseId === body.databaseId,
            )
            .sort(
              (left, right) =>
                left.principalId.localeCompare(right.principalId) ||
                left.id.localeCompare(right.id),
            );
          successResponse(
            response,
            200,
            DatabasePermissionsResponseSchema,
            { action: body.action, grants, revision: state.revision },
            {
              handler: 'database-permissions',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const actorId = dataPlane.currentRecordActor().principal_id;
        if (body.action === 'upsert') {
          dataPlane.authorizeOperation({
            action: 'manage_permissions',
            ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          });
          if (body.grantId) {
            const previous = (await permissionStore.snapshot()).grants[body.grantId];
            if (previous) {
              dataPlane.authorizeOperation({
                action: 'manage_permissions',
                ...(previous.databaseId ? { databaseId: previous.databaseId } : {}),
              });
            }
          }
          const result = await permissionStore.upsert({
            ...(body.grantId ? { id: body.grantId } : {}),
            databaseId: body.databaseId,
            principalId: body.principalId,
            role: body.role,
            actions: body.actions,
            actorId,
            expectedRevision: body.expectedRevision,
          });
          successResponse(
            response,
            200,
            DatabasePermissionsResponseSchema,
            {
              action: body.action,
              grant: result.grant,
              revision: result.state.revision,
            },
            {
              handler: 'database-permissions',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const current = await permissionStore.snapshot();
        const grant = current.grants[body.grantId];
        dataPlane.authorizeOperation({
          action: 'manage_permissions',
          ...(grant?.databaseId ? { databaseId: grant.databaseId } : {}),
        });
        const state = await permissionStore.remove({
          id: body.grantId,
          actorId,
          expectedRevision: body.expectedRevision,
        });
        successResponse(
          response,
          200,
          DatabasePermissionsResponseSchema,
          {
            action: body.action,
            grantId: body.grantId,
            revision: state.revision,
          },
          {
            handler: 'database-permissions',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-permissions', error);
          return;
        }
        respondPermissionStoreError(response, error);
      }
    },
    {
      handler: 'database-permissions',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const publicShares = withValidation(
    DatabasePublicSharesRequestSchema,
    async (request, response, body) => {
      if (!dataPlane || !permissionStore) {
        respondUnavailable(response, 'database-public-shares');
        return;
      }
      try {
        if (body.action === 'list') {
          dataPlane.authorizeOperation({ action: 'publish', databaseId: body.databaseId });
          const state = await permissionStore.snapshot();
          const shares = Object.values(state.publicShares)
            .filter((policy) => policy.target.databaseId === body.databaseId)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(publicShareView);
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            { action: body.action, shares, revision: state.revision },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const actorId = dataPlane.currentRecordActor().principal_id;
        if (body.action === 'upsert') {
          if (body.shareId) {
            const previous = (await permissionStore.snapshot()).publicShares[body.shareId];
            if (previous) {
              dataPlane.authorizeOperation({
                action: 'publish',
                databaseId: previous.target.databaseId,
              });
            }
          }
          dataPlane.validatePublicShareTarget({
            target: body.target,
            propertyIds: body.propertyIds,
            allowFormSubmission: body.allowFormSubmission,
          });
          const saved = await permissionStore.upsertPublicShare({
            ...(body.shareId ? { id: body.shareId } : {}),
            target: body.target,
            access: body.access,
            propertyIds: body.propertyIds,
            allowBody: body.allowBody,
            allowFormSubmission: body.allowFormSubmission,
            expiresAt: body.expiresAt,
            rotateToken: body.rotateToken,
            actorId,
            expectedRevision: body.expectedRevision,
          });
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            {
              action: body.action,
              share: publicShareView(saved.policy),
              token: saved.token,
              revision: saved.state.revision,
            },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        if (body.action === 'revoke') {
          const current = await permissionStore.snapshot();
          const policy = current.publicShares[body.shareId];
          if (policy) {
            dataPlane.authorizeOperation({
              action: 'publish',
              databaseId: policy.target.databaseId,
            });
          } else {
            dataPlane.authorizeOperation({ action: 'publish' });
          }
          const state = await permissionStore.revokePublicShare({
            id: body.shareId,
            actorId,
            expectedRevision: body.expectedRevision,
          });
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            { action: body.action, shareId: body.shareId, revision: state.revision },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }

        const policy = await permissionStore.resolvePublicShare(body.shareId, body.token);
        if (!policy) {
          errorResponse(
            response,
            404,
            'urn:ok:error:not-found',
            'Public database share was not found.',
            {
              handler: 'database-public-shares',
              extensions: databaseProblemExtensions('database_not_found'),
            },
          );
          return;
        }
        const share = publicShareView(policy);
        if (body.action === 'resolve') {
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            { action: body.action, share },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const described = dataPlane.withPublicShare(policy, () =>
          dataPlane.describe({ databaseId: policy.target.databaseId }),
        );
        const source = described.database.sources[0];
        if (!source) {
          throw new DatabaseDataPlaneError(
            'permission_denied',
            'Public share source is unavailable',
          );
        }
        const result = await (async () => {
          if (body.action === 'describe') return described;
          if (body.action === 'record') {
            if (policy.target.kind !== 'record') {
              throw new DatabaseDataPlaneError(
                'permission_denied',
                'This public share is not a record share',
              );
            }
            const recordId = policy.target.recordId;
            return dataPlane.withPublicShare(policy, () =>
              dataPlane.record({
                databaseId: policy.target.databaseId,
                sourceId: source.id,
                recordId,
              }),
            );
          }
          if (body.action === 'submit_form') {
            if (policy.target.kind !== 'form' || !policy.allowFormSubmission) {
              throw new DatabaseDataPlaneError(
                'form_access_denied',
                'This public share does not accept form submissions',
              );
            }
            const viewId = policy.target.viewId;
            return dataPlane.withPublicShare(policy, () =>
              dataPlane.submitForm({
                databaseId: policy.target.databaseId,
                sourceId: source.id,
                viewId,
                submissionId: body.submissionId,
                startedAt: body.startedAt,
                answers: body.answers,
                ...(body.honeypot === undefined ? {} : { honeypot: body.honeypot }),
                remoteAddress: request.socket.remoteAddress ?? '',
              }),
            );
          }
          if (policy.target.kind === 'record' || policy.target.kind === 'form') {
            throw new DatabaseDataPlaneError(
              'permission_denied',
              'This public share does not expose a query endpoint',
            );
          }
          const viewId = policy.target.kind === 'database' ? undefined : policy.target.viewId;
          return dataPlane.withPublicShare(policy, () =>
            dataPlane.query({
              databaseId: policy.target.databaseId,
              sourceId: source.id,
              ...(viewId ? { viewId } : {}),
              query: body.query,
              throwIfCancelled: requestCancellationCheckpoint(request, response),
            }),
          );
        })();
        successResponse(
          response,
          200,
          DatabasePublicSharesResponseSchema,
          { action: body.action, share, result },
          {
            handler: 'database-public-shares',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        if (cancelledConnection(error, request, response)) return;
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-public-shares', error);
          return;
        }
        respondPermissionStoreError(response, error);
      }
    },
    {
      handler: 'database-public-shares',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const runs = withValidation(
    DatabaseAgentRunsRequestSchema,
    async (_request, response, body) => {
      if (!agentRunStore) {
        respondUnavailable(response, 'database-agent-runs');
        return;
      }
      try {
        dataPlane?.authorizeOperation({ action: 'read_audit' });
        let result: z.input<typeof DatabaseAgentRunsResponseSchema>;
        if (body.action === 'list') {
          result = { action: body.action, ...(await agentRunStore.list()) };
        } else if (body.action === 'get') {
          result = { action: body.action, run: await agentRunStore.get(body.runId) };
        } else if (body.action === 'retry' || body.action === 'resume') {
          if (!dataPlane) {
            respondUnavailable(response, 'database-data-plane');
            return;
          }
          const sourceRun = await agentRunStore.prepareRecovery(body.runId, body.expectedRevision);
          let plan: DatabasePlanArtifact;
          try {
            plan = dataPlane.getPlan(sourceRun.plan.id);
          } catch (error) {
            if (!(error instanceof DatabasePlanError) || error.code !== 'plan_not_found') {
              throw error;
            }
            plan = dataPlane.restorePlanBundle(
              await agentRunStore.getPlanBundle(sourceRun.plan.id),
            );
          }
          if (plan.hash !== sourceRun.plan.hash) {
            throw new DatabaseCommitError(
              'plan_hash_mismatch',
              'The Agent Run plan hash no longer matches its immutable plan',
              { expectedPlanHash: sourceRun.plan.hash, observedPlanHash: plan.hash },
            );
          }
          const recoveryActor = {
            principalId: sourceRun.actor.principalId,
            kind: sourceRun.actor.kind,
            ...(sourceRun.actor.sessionId ? { sessionId: sourceRun.actor.sessionId } : {}),
          };
          const recoveryRun = await agentRunStore.propose(plan, recoveryActor, {
            action: body.action,
            sourceRunId: sourceRun.id,
            idempotencyKey: body.idempotencyKey,
          });
          const receipt = await dataPlane.commit({
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: sourceRun.plan.snapshotRevision,
            idempotencyKey: body.idempotencyKey,
            ...(body.approvalToken ? { approvalToken: body.approvalToken } : {}),
            ...(body.autonomySessionToken
              ? { autonomySessionToken: body.autonomySessionToken }
              : {}),
            actor: recoveryActor,
          });
          result = {
            action: body.action,
            sourceRunId: sourceRun.id,
            run: await agentRunStore.get(recoveryRun.id),
            receipt,
          };
        } else {
          if (!promptRetentionStore) {
            respondUnavailable(response, 'database-agent-prompt-retention');
            return;
          }
          if (body.action === 'retain_prompt') {
            await agentRunStore.get(body.runId);
            result = {
              action: body.action,
              retention: promptRetentionStore.retain(body),
            };
          } else if (body.action === 'get_prompt') {
            result = {
              action: body.action,
              retention: promptRetentionStore.get(body.runId),
            };
          } else {
            result = {
              action: body.action,
              runId: body.runId,
              deleted: promptRetentionStore.delete(body.runId),
            };
          }
        }
        successResponse(response, 200, DatabaseAgentRunsResponseSchema, result, {
          handler: 'database-agent-runs',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-agent-runs', error);
          return;
        }
        if (error instanceof DatabasePlanError) {
          respondDataPlaneError(response, 'database-agent-runs', error);
          return;
        }
        if (error instanceof DatabaseAgentPromptRetentionError) {
          respondAgentPromptRetentionError(response, error);
          return;
        }
        respondAgentRunStoreError(response, error);
      }
    },
    {
      handler: 'database-agent-runs',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const templateRuns = withValidation(
    DatabaseTemplateRunsRequestSchema,
    async (_request, response, body) => {
      if (!templateScheduler) {
        respondUnavailable(response, 'database-template-runs');
        return;
      }
      try {
        dataPlane?.authorizeOperation({
          action: 'read_audit',
          ...(body.databaseId ? { databaseId: body.databaseId } : {}),
        });
        const runs = await templateScheduler.list(body.limit, {
          ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          ...(body.templateId ? { templateId: body.templateId } : {}),
        });
        successResponse(
          response,
          200,
          DatabaseTemplateRunsResponseSchema,
          { runs },
          {
            handler: 'database-template-runs',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-template-runs', error);
      }
    },
    {
      handler: 'database-template-runs',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const automations = withValidation(
    DatabaseAutomationRequestSchema,
    async (_request, response, body) => {
      if (!automationService) {
        respondUnavailable(response, 'database-automations');
        return;
      }
      try {
        dataPlane?.authorizeOperation({
          action:
            body.action === 'dry_run' || body.action === 'test_event'
              ? 'run_automation'
              : 'read_audit',
          ...('databaseId' in body && body.databaseId ? { databaseId: body.databaseId } : {}),
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-automations', error);
        return;
      }
      if (body.action === 'notifications') {
        if (!automationNotificationStore) {
          respondUnavailable(response, 'database-automation-notifications');
          return;
        }
        const notifications = await automationNotificationStore.list({
          ...(body.recipientId ? { recipientId: body.recipientId } : {}),
          unreadOnly: body.unreadOnly,
          limit: body.limit,
        });
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          { action: body.action, notifications },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      if (body.action === 'mark_notification_read') {
        if (!automationNotificationStore) {
          respondUnavailable(response, 'database-automation-notifications');
          return;
        }
        await automationNotificationStore.markRead(body.notificationId);
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          { action: body.action, notificationId: body.notificationId },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      if (body.action === 'list') {
        const runs = await automationService.listRuns({
          ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          ...(body.automationId ? { automationId: body.automationId } : {}),
          limit: body.limit,
        });
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          { action: 'list', runs },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      if (body.event.databaseId !== body.databaseId) {
        throw new DatabasePlanError(
          'invalid_desired_state',
          'Automation test event database does not match the request scope',
        );
      }
      if (body.action === 'dry_run') {
        const planned = await automationService.dryRun({
          databaseId: body.databaseId,
          automationId: body.automationId,
          event: body.event,
        });
        const records = planned.internalPlan?.diff.records ?? [];
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          {
            action: 'dry_run',
            plan: {
              automationId: planned.automationId,
              automationVersion: planned.automationVersion,
              internalPlan: planned.internalPlan
                ? {
                    id: planned.internalPlan.id,
                    hash: planned.internalPlan.hash,
                    committable: planned.internalPlan.committable && !planned.migrationRequired,
                    migrationRequired:
                      planned.migrationRequired ||
                      planned.internalPlan.conflicts.some(
                        (conflict) => conflict.code === 'source_record_migration_required',
                      ),
                    risk: planned.internalPlan.risk,
                    records: {
                      creates: records.filter((record) => record.action === 'create').length,
                      updates: records.filter((record) => record.action !== 'create').length,
                    },
                  }
                : null,
              notifications: planned.notifications.map(({ actionId, recipientIds, title }) => ({
                actionId,
                recipientIds,
                title,
              })),
              external: planned.external.map(
                ({ actionId, kind, connectionId, egressBytes, policyId, policyRevision }) => ({
                  actionId,
                  kind,
                  connectionId,
                  egressBytes,
                  policyId,
                  policyRevision,
                }),
              ),
            },
          },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      const event = await automationService.enqueue({
        ...body.event,
        targetAutomationId: body.automationId,
      });
      const changed = await automationService.tick();
      successResponse(
        response,
        200,
        DatabaseAutomationResponseSchema,
        {
          action: 'test_event',
          event,
          runs: changed.filter((run) => run.eventId === event.id),
        },
        {
          handler: 'database-automations',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        },
      );
    },
    {
      handler: 'database-automations',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const undo = withValidation(
    DatabaseUndoRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-undo');
        return;
      }
      try {
        successResponse(response, 200, DatabaseUndoResponseSchema, await dataPlane.undo(body), {
          handler: 'database-undo',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-undo', error);
      }
    },
    {
      handler: 'database-undo',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const repair = withValidation(
    DatabaseRepairRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-repair');
        return;
      }
      try {
        const result =
          body.action === 'preview'
            ? {
                action: body.action,
                plan: await dataPlane.previewRepair(body.ttlSeconds, {
                  ...(body.documentIds
                    ? { documentIds: body.documentIds as Record<string, `doc_${string}`> }
                    : {}),
                }),
              }
            : body.action === 'apply'
              ? {
                  action: body.action,
                  result: await dataPlane.applyRepair(body),
                }
              : {
                  action: body.action,
                  result: await dataPlane.undoRepair(body),
                };
        successResponse(response, 200, DatabaseRepairResponseSchema, result, {
          handler: 'database-repair',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-repair', error);
      }
    },
    {
      handler: 'database-repair',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const task = withValidation(
    DatabaseTaskRequestSchema,
    async (_request, response, body) => {
      if (!taskStore) {
        respondUnavailable(response, 'database-task');
        return;
      }
      try {
        if (
          body.action === 'list' ||
          body.action === 'get' ||
          body.action === 'cancel' ||
          body.action === 'inspect_migration' ||
          body.action === 'preview_cleanup_migration'
        ) {
          dataPlane?.authorizeOperation({ action: 'read_audit' });
        } else if (body.action === 'preview_import') {
          dataPlane?.authorizeOperation({
            action: 'describe',
            databaseId: body.databaseId,
            sourceId: body.sourceId,
          });
        } else if (body.action === 'preview_migration') {
          for (const databaseId of body.databaseIds ?? []) {
            dataPlane?.authorizeOperation({
              action: 'alter_schema',
              databaseId,
            });
          }
          if (!body.databaseIds || body.databaseIds.length === 0) {
            dataPlane?.authorizeOperation({ action: 'alter_schema' });
          }
        } else if (body.action === 'start') {
          if (body.task.operation === 'bulk') {
            dataPlane?.authorizePlanMutation(body.task.commit.planId);
          } else if (body.task.operation === 'import') {
            dataPlane?.authorizeOperation({
              action: 'alter_schema',
              databaseId: body.task.databaseId,
              sourceId: body.task.sourceId,
            });
          } else {
            for (const databaseId of body.task.databaseIds ?? []) {
              dataPlane?.authorizeOperation({
                action: 'alter_schema',
                databaseId,
              });
            }
            if (!body.task.databaseIds || body.task.databaseIds.length === 0) {
              dataPlane?.authorizeOperation({ action: 'alter_schema' });
            }
          }
        } else {
          dataPlane?.authorizeOperation({ action: 'alter_schema' });
        }
        const result = (() => {
          switch (body.action) {
            case 'list':
              return taskStore.list({
                state: body.state,
                limit: body.limit,
                cursor: body.cursor,
              });
            case 'get':
              return taskStore.get(body.taskId);
            case 'cancel':
              return taskService
                ? taskService.cancel(body.taskId, body.expectedRevision)
                : taskStore.cancel(body.taskId, body.expectedRevision);
            case 'preview_import':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database source onboarding preview is unavailable for this server.',
                );
              }
              return taskService.previewImport({
                operation: 'import',
                databaseId: body.databaseId,
                sourceId: body.sourceId,
                expectedManifestRevision: body.expectedManifestRevision,
              });
            case 'preview_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database manifest migration preview is unavailable for this server.',
                );
              }
              return taskService.previewMigration({
                operation: 'migration',
                ...(body.databaseIds ? { databaseIds: body.databaseIds } : {}),
                expectedManifestRevision: body.expectedManifestRevision,
                targetVersion: body.targetVersion,
                ...(body.migrationCommittedAt
                  ? { migrationCommittedAt: body.migrationCommittedAt }
                  : {}),
                ...(body.ownerChoices ? { ownerChoices: body.ownerChoices } : {}),
                ...(body.titleChoices ? { titleChoices: body.titleChoices } : {}),
                ...(body.derivedBaselines ? { derivedBaselines: body.derivedBaselines } : {}),
              });
            case 'start':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database task execution is unavailable for this server.',
                );
              }
              return taskService.start(body.task);
            case 'retry':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database task execution is unavailable for this server.',
                );
              }
              return taskService.retry(body.taskId, body.expectedRevision);
            case 'resume':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database task execution is unavailable for this server.',
                );
              }
              return taskService.resume(body.taskId, body.expectedRevision);
            case 'rollback':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_rollback_unavailable',
                  'Database task rollback is unavailable for this server.',
                );
              }
              return taskService.rollback(body.taskId, body.expectedRevision);
            case 'inspect_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database migration recovery inspection is unavailable for this server.',
                );
              }
              return taskService.inspectMigration(body.taskId);
            case 'preview_cleanup_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_rollback_unavailable',
                  'Database migration cleanup preview is unavailable for this server.',
                );
              }
              return taskService.previewMigrationCleanup(body.taskId);
            case 'cleanup_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_rollback_unavailable',
                  'Database migration cleanup is unavailable for this server.',
                );
              }
              return taskService.cleanupMigration(
                body.taskId,
                body.expectedRevision,
                body.planHash,
                body.approvalToken,
              );
          }
        })();
        const resolved = await result;
        const payload =
          body.action === 'list'
            ? { action: body.action, ...resolved }
            : body.action === 'preview_import' || body.action === 'preview_migration'
              ? { action: body.action, preview: resolved }
              : body.action === 'rollback'
                ? { action: body.action, rollback: resolved }
                : body.action === 'inspect_migration'
                  ? { action: body.action, inspection: resolved }
                  : body.action === 'preview_cleanup_migration'
                    ? { action: body.action, cleanupPlan: resolved }
                    : body.action === 'cleanup_migration'
                      ? { action: body.action, cleanup: resolved }
                      : { action: body.action, task: resolved };
        successResponse(response, 200, DatabaseTaskResponseSchema, payload, {
          handler: 'database-task',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondTaskStoreError(response, error);
      }
    },
    {
      handler: 'database-task',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const diagnostics = withValidation(
    DatabaseEmptyRequestSchema,
    async (_request, response) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-diagnostics');
        return;
      }
      try {
        const index = dataPlane.getRecordIndexStatus();
        const issues = dataPlane.getRecordIndexIssuesSummary();
        const schemas = dataPlane.getSchemaRevisions();
        const tasks = taskStore
          ? (await taskStore.list({ limit: 20 })).tasks.map((task) => ({
              id: task.id,
              operation: task.operation,
              state: task.state,
              createdAt: task.createdAt,
              finishedAt: task.finishedAt,
            }))
          : [];
        successResponse(
          response,
          200,
          DatabaseDiagnosticsResponseSchema,
          { index, issues, schemas, tasks, telemetry: getDatabaseTelemetry() },
          {
            handler: 'database-diagnostics',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-diagnostics', error);
      }
    },
    {
      handler: 'database-diagnostics',
      method: 'GET',
      skipBodyParse: true,
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const handlers: DatabaseDataPlaneApiHandlers = {
    catalog,
    describe,
    record,
    markdownTableExport,
    computedPropertyPreview,
    propertyConversion,
    find,
    retrieve,
    query,
    formSubmit,
    pack,
    inspect,
    plan,
    button,
    placeSearch,
    commit,
    markdownTableMutation,
    runs,
    templateRuns,
    automations,
    autonomy,
    permissions,
    publicShares,
    undo,
    repair,
    task,
    diagnostics,
  };
  if (!dataPlane || !resolveAccessPrincipal) return handlers;
  const contextualize =
    (
      handlerName: keyof DatabaseDataPlaneApiHandlers,
      handler: DatabaseDataPlaneApiHandlers[keyof DatabaseDataPlaneApiHandlers],
    ) =>
    async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      const principal = resolveAccessPrincipal(request);
      const limitKey =
        principal.kind === 'agent'
          ? `${principal.id}\0${principal.invokingUserId}\0${principal.sessionId}`
          : null;
      if (limitKey !== null) {
        const decision = agentEntryPointLimiter.acquire(limitKey);
        if (!decision.ok) {
          errorResponse(
            response,
            429,
            'urn:ok:error:too-many-requests',
            decision.reason === 'concurrency_limit'
              ? 'Too many concurrent database requests for this agent session.'
              : 'Database request rate limit exceeded for this agent session.',
            {
              handler: `database-${handlerName}`,
              extraHeaders: { 'Retry-After': String(decision.retryAfterSeconds) },
            },
          );
          return;
        }
      }
      try {
        await dataPlane.withAccessPrincipal(principal, () => handler(request, response));
      } finally {
        if (limitKey !== null) agentEntryPointLimiter.release(limitKey);
      }
    };
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      contextualize(name as keyof DatabaseDataPlaneApiHandlers, handler),
    ]),
  ) as unknown as DatabaseDataPlaneApiHandlers;
}
