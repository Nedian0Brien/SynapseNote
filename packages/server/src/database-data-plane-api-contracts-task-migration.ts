import { z } from 'zod';
import { DatabaseCommitRequestSchema } from './database-data-plane-api-contracts-mutation.ts';
import { DatabaseTaskSchema } from './database-task-contract.ts';

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
