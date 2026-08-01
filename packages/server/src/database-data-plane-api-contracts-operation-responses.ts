import { DATABASE_AUTONOMY_MODES, DatabaseAgentRunSchema } from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import { DatabaseButtonRunSchema } from './database-button-executor.ts';
import {
  DatabaseAutonomyScopeSchema,
  DatabasePermissionGrantSchema,
  DatabasePermissionRevisionSchema,
  DatabasePublicShareIdSchema,
  DatabasePublicShareViewSchema,
} from './database-data-plane-api-contracts-access.ts';
import {
  DatabaseFormSubmitResponseSchema,
  DatabaseQueryResponseSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';
import {
  DatabaseDescribeResponseSchema,
  DatabaseIndexStatusSchema,
  DatabaseRecordResponseSchema,
} from './database-data-plane-api-contracts-read-responses.ts';

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
