/** Product handlers and launch surface for durable database background tasks. */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  createDatabaseRecordId,
  ensureDatabaseRecordIdentity,
  materializeDatabaseRecord,
  planDatabaseManifestMigration,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import {
  type DatabaseCommitEngine,
  DatabaseCommitError,
  type DatabaseCommitInput,
  DatabaseCommitInputSchema,
} from './database-commit.ts';
import type { DatabasePlanEngine } from './database-plan.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseOnboardingPreview, DatabaseStore } from './database-store.ts';
import type { DatabaseTask } from './database-task-contract.ts';
import {
  createDatabaseTaskRollbackJournal,
  DatabaseTaskRollbackError,
  type DatabaseTaskRollbackJournal,
  type DatabaseTaskRollbackResult,
} from './database-task-rollback.ts';
import {
  createDatabaseTaskRunner,
  type DatabaseTaskExecutionContext,
  DatabaseTaskExecutionError,
  type DatabaseTaskRunner,
} from './database-task-runner.ts';
import type { DatabaseTaskStore } from './database-task-store.ts';

const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const FileRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const BulkTaskInputSchema = z
  .object({
    kind: z.literal('approved_plan_commit'),
    commit: DatabaseCommitInputSchema,
  })
  .strict();

const ImportTaskInputSchema = z
  .object({
    kind: z.literal('source_onboarding'),
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    expectedManifestRevision: RevisionSchema,
    records: z.array(
      z
        .object({
          path: z.string().min(1),
          expectedRevision: FileRevisionSchema,
          recordId: z.string().startsWith('rec_'),
        })
        .strict(),
    ),
    excluded: z.number().int().nonnegative(),
  })
  .strict();

const MigrationTaskInputSchema = z
  .object({
    kind: z.literal('manifest_migration'),
    expectedManifestRevision: RevisionSchema,
    targetVersion: z.number().int().positive(),
    manifests: z.array(
      z
        .object({
          databaseId: z.string().min(1),
          key: z.string().min(1),
          expectedRevision: FileRevisionSchema,
        })
        .strict(),
    ),
  })
  .strict();

const ImportCheckpointSchema = z
  .object({
    cursor: z.number().int().nonnegative(),
    assigned: z.number().int().nonnegative(),
    alreadyReady: z.number().int().nonnegative(),
  })
  .strict();

const MigrationCheckpointSchema = z
  .object({
    cursor: z.number().int().nonnegative(),
    alreadyCurrent: z.number().int().nonnegative(),
  })
  .strict();

export interface StartDatabaseImportTaskInput {
  operation: 'import';
  databaseId: string;
  sourceId: string;
  expectedManifestRevision: string;
}

export interface StartDatabaseMigrationTaskInput {
  operation: 'migration';
  databaseIds?: readonly string[];
  expectedManifestRevision: string;
  targetVersion: number;
}

export interface DatabaseManifestMigrationPreviewItem {
  databaseId: string;
  databaseKey: string;
  manifestPath: string;
  expectedRevision: string;
  sourceVersion: number | null;
  targetVersion: number;
  action: 'not_needed' | 'blocked';
  migrationIds: readonly string[];
  lossless: boolean;
  changed: boolean;
  code?: string;
  message?: string;
}

export interface DatabaseManifestMigrationPreview {
  expectedManifestRevision: string;
  targetVersion: number;
  items: readonly DatabaseManifestMigrationPreviewItem[];
  summary: {
    notNeeded: number;
    blocked: number;
  };
  complete: true;
  committable: boolean;
}

export interface StartDatabaseBulkTaskInput {
  operation: 'bulk';
  commit: DatabaseCommitInput;
}

export type StartDatabaseTaskInput =
  | StartDatabaseImportTaskInput
  | StartDatabaseMigrationTaskInput
  | StartDatabaseBulkTaskInput;

export type DatabaseTaskServiceErrorCode =
  | 'task_snapshot_changed'
  | 'task_plan_hash_mismatch'
  | 'task_database_not_found'
  | 'task_target_limit_exceeded'
  | 'task_invalid_request'
  | 'task_rollback_unavailable'
  | 'task_rollback_conflict';

export class DatabaseTaskServiceError extends Error {
  readonly code: DatabaseTaskServiceErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseTaskServiceErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabaseTaskServiceError';
    this.code = code;
    this.details = details;
  }
}

export interface CreateDatabaseTaskServiceOptions {
  projectDir: string;
  contentDir: string;
  taskStore: DatabaseTaskStore;
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  databasePlanEngine: DatabasePlanEngine;
  databaseCommitEngine: DatabaseCommitEngine;
  refreshDatabaseIndex?: () => Promise<unknown>;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function executionProblem(
  code: string,
  title: string,
  detail: string,
  retryable: boolean,
  status = 409,
): DatabaseTaskExecutionError {
  return new DatabaseTaskExecutionError({
    type: `urn:ok:error:${code.replaceAll('_', '-')}`,
    title,
    status,
    detail,
    code,
    retryable,
  });
}

function launchError(
  code: DatabaseTaskServiceErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): DatabaseTaskServiceError {
  return new DatabaseTaskServiceError(code, message, details);
}

function safeContentPath(contentDir: string, path: string): string {
  const absolute = resolve(contentDir, path);
  const rel = relative(contentDir, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw executionProblem(
      'task_target_unsafe',
      'Database task target is unsafe',
      'A durable task target escaped the project content directory.',
      false,
    );
  }
  return absolute;
}

export class DatabaseTaskService {
  readonly #projectDir: string;
  readonly #contentDir: string;
  readonly #taskStore: DatabaseTaskStore;
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #databasePlanEngine: DatabasePlanEngine;
  readonly #databaseCommitEngine: DatabaseCommitEngine;
  readonly #refreshDatabaseIndex: () => Promise<unknown>;
  readonly #rollbackJournal: DatabaseTaskRollbackJournal;
  readonly #runner: DatabaseTaskRunner;
  readonly #active = new Map<string, Promise<DatabaseTask>>();
  #drainQueued = false;
  #queueConcurrency = 10;
  #queuePump: Promise<void> | null = null;

  constructor(options: CreateDatabaseTaskServiceOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#contentDir = resolve(options.contentDir);
    this.#taskStore = options.taskStore;
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#databasePlanEngine = options.databasePlanEngine;
    this.#databaseCommitEngine = options.databaseCommitEngine;
    this.#refreshDatabaseIndex =
      options.refreshDatabaseIndex ?? (() => this.#databaseRecordIndex.rebuild());
    this.#rollbackJournal = createDatabaseTaskRollbackJournal(this.#projectDir, this.#contentDir);
    this.#runner = createDatabaseTaskRunner({
      store: this.#taskStore,
      handlers: {
        bulk: (context) => this.#runBulk(context),
        import: (context) => this.#runImport(context),
        migration: (context) => this.#runMigration(context),
      },
    });
  }

  async start(input: StartDatabaseTaskInput): Promise<DatabaseTask> {
    switch (input.operation) {
      case 'bulk':
        return this.#startBulk(input);
      case 'import':
        return this.#startImport(input);
      case 'migration':
        return this.#startMigration(input);
    }
  }

  async previewImport(input: StartDatabaseImportTaskInput): Promise<DatabaseOnboardingPreview> {
    const expectedManifestRevision = RevisionSchema.parse(input.expectedManifestRevision);
    const preview = await this.#databaseStore.previewSourceOnboarding({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      maxEntries: 100_000,
    });
    const snapshot = this.#databaseStore.snapshot();
    if (snapshot.revision !== expectedManifestRevision) {
      throw launchError(
        'task_snapshot_changed',
        'The database manifest changed before the onboarding preview completed.',
        { expectedManifestRevision, observedManifestRevision: snapshot.revision },
      );
    }
    return preview;
  }

  async previewMigration(
    input: StartDatabaseMigrationTaskInput,
  ): Promise<DatabaseManifestMigrationPreview> {
    const expectedManifestRevision = RevisionSchema.parse(input.expectedManifestRevision);
    const targetVersion = z.number().int().positive().parse(input.targetVersion);
    const snapshot = await this.#databaseStore.reload();
    if (snapshot.revision !== expectedManifestRevision) {
      throw launchError(
        'task_snapshot_changed',
        'The database manifest set changed before migration preview.',
        { expectedManifestRevision, observedManifestRevision: snapshot.revision },
      );
    }
    if (input.databaseIds && new Set(input.databaseIds).size !== input.databaseIds.length) {
      throw launchError(
        'task_invalid_request',
        'Migration databaseIds must not contain duplicates.',
      );
    }
    const selected = input.databaseIds
      ? input.databaseIds.map((databaseId) => {
          const database = snapshot.databases.find((candidate) => candidate.id === databaseId);
          if (!database) {
            throw launchError(
              'task_database_not_found',
              `Database "${databaseId}" is not present in the frozen manifest snapshot.`,
              { databaseId },
            );
          }
          return database;
        })
      : [...snapshot.databases];
    const items = await Promise.all(
      selected.map(async (database): Promise<DatabaseManifestMigrationPreviewItem> => {
        const manifestPath = `.ok/databases/${database.key}.yml`;
        const yaml = await readFile(resolve(this.#projectDir, manifestPath), 'utf8');
        const plan = planDatabaseManifestMigration(yaml, targetVersion);
        return {
          databaseId: database.id,
          databaseKey: database.key,
          manifestPath,
          expectedRevision: sha256(yaml),
          sourceVersion: plan.sourceVersion,
          targetVersion: plan.targetVersion,
          action: plan.status === 'blocked' ? 'blocked' : 'not_needed',
          migrationIds: plan.migrationIds,
          lossless: plan.lossless,
          changed: plan.changed,
          ...(plan.status === 'blocked' ? { code: plan.code, message: plan.message } : {}),
        };
      }),
    );
    const observed = await this.#databaseStore.reload();
    if (observed.revision !== expectedManifestRevision) {
      throw launchError(
        'task_snapshot_changed',
        'The database manifest set changed while migration preview was being prepared.',
        { expectedManifestRevision, observedManifestRevision: observed.revision },
      );
    }
    const blocked = items.filter((item) => item.action === 'blocked').length;
    return {
      expectedManifestRevision,
      targetVersion,
      items,
      summary: { notNeeded: items.length - blocked, blocked },
      complete: true,
      committable: blocked === 0,
    };
  }

  async retry(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    const queued = await this.#runner.queueRetry(taskId, expectedRevision);
    if (queued.operation === 'import' || queued.operation === 'migration') {
      await this.#rollbackJournal.resetRolledBack(taskId);
    }
    this.#dispatch(queued.id);
    return queued;
  }

  async resume(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    if (await this.#rollbackJournal.isRolledBack(taskId)) {
      throw launchError(
        'task_invalid_request',
        'This task was rolled back and cannot resume from its old checkpoint. Retry it from the beginning instead.',
        { taskId },
      );
    }
    const queued = await this.#runner.queueResume(taskId, expectedRevision);
    this.#dispatch(queued.id);
    return queued;
  }

  async cancel(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    return this.#taskStore.cancel(taskId, expectedRevision);
  }

  async rollback(taskId: string, expectedRevision: string): Promise<DatabaseTaskRollbackResult> {
    const task = await this.#taskStore.get(taskId);
    if (task.revision !== expectedRevision) {
      throw launchError('task_snapshot_changed', 'The database task changed before rollback.', {
        taskId,
        expectedRevision,
        observedRevision: task.revision,
      });
    }
    if (
      task.state !== 'succeeded' ||
      (task.operation !== 'import' && task.operation !== 'migration')
    ) {
      throw launchError(
        'task_rollback_unavailable',
        'Only a succeeded import or migration task can be rolled back.',
        { taskId, operation: task.operation, state: task.state },
      );
    }
    try {
      const result = await this.#rollbackJournal.rollback(taskId);
      await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
      return result;
    } catch (error) {
      if (error instanceof DatabaseTaskRollbackError) {
        throw launchError(
          error.code === 'rollback_conflict'
            ? 'task_rollback_conflict'
            : 'task_rollback_unavailable',
          error.message,
          error.details,
        );
      }
      throw error;
    }
  }

  async wait(taskId: string): Promise<DatabaseTask> {
    for (;;) {
      const active = this.#active.get(taskId);
      if (active) return active;
      const task = await this.#taskStore.get(taskId);
      if (task.state !== 'queued') return task;
      if (!this.#drainQueued) this.#dispatch(taskId);
      else await this.#pumpQueued();
      const dispatched = this.#active.get(taskId);
      if (dispatched) return dispatched;
      const running = [...this.#active.values()];
      if (running.length === 0) return this.#taskStore.get(taskId);
      await Promise.race(running.map((completion) => completion.catch(() => undefined)));
    }
  }

  async runQueued(limit = 10): Promise<void> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw launchError(
        'task_invalid_request',
        'Queued task recovery concurrency must be an integer from 1 to 200.',
        { limit },
      );
    }
    this.#queueConcurrency = limit;
    this.#drainQueued = true;
    await this.#pumpQueued();
  }

  #dispatch(taskId: string): void {
    if (this.#active.has(taskId)) return;
    const completion = this.#runner.run(taskId);
    this.#active.set(taskId, completion);
    void completion
      .catch(() => undefined)
      .finally(() => {
        this.#active.delete(taskId);
        if (this.#drainQueued) {
          queueMicrotask(() => {
            void this.#pumpQueued().catch(() => undefined);
          });
        }
      });
  }

  async #pumpQueued(): Promise<void> {
    if (this.#queuePump) return this.#queuePump;
    const pump = (async () => {
      const available = Math.max(0, this.#queueConcurrency - this.#active.size);
      if (available === 0) return;
      const queued = await this.#taskStore.list({ state: 'queued', limit: available });
      if (queued.tasks.length === 0) {
        if (this.#active.size === 0) this.#drainQueued = false;
        return;
      }
      for (const task of [...queued.tasks].reverse()) this.#dispatch(task.id);
    })();
    this.#queuePump = pump;
    try {
      await pump;
    } finally {
      if (this.#queuePump === pump) this.#queuePump = null;
    }
  }

  async #startBulk(input: StartDatabaseBulkTaskInput): Promise<DatabaseTask> {
    const commit = DatabaseCommitInputSchema.parse(input.commit);
    const plan = this.#databasePlanEngine.getPlan(commit.planId);
    if (plan.hash !== commit.planHash) {
      throw launchError(
        'task_plan_hash_mismatch',
        'The bulk task must bind the exact current approved plan hash.',
        { expectedPlanHash: plan.hash, providedPlanHash: commit.planHash },
      );
    }
    const affectedRecords = plan.affectedObjects.recordIds.length;
    const queued = await this.#runner.enqueue({
      operation: 'bulk',
      cancellable: false,
      inputState: BulkTaskInputSchema.parse({ kind: 'approved_plan_commit', commit }),
      progress: {
        unit: affectedRecords > 0 ? 'records' : 'steps',
        total: affectedRecords > 0 ? affectedRecords : 1,
        message: 'Queued approved database plan',
      },
    });
    this.#dispatch(queued.id);
    return queued;
  }

  async #startImport(input: StartDatabaseImportTaskInput): Promise<DatabaseTask> {
    const expectedManifestRevision = RevisionSchema.parse(input.expectedManifestRevision);
    const preview = await this.previewImport(input);
    if (!preview.complete) {
      throw launchError(
        'task_target_limit_exceeded',
        'The source onboarding preview exceeded 100000 entries; no partial import was launched.',
        { entryLimit: preview.entryLimit },
      );
    }
    const blockers = preview.items.filter(
      (item) =>
        item.action === 'reject' ||
        (item.action === 'modify' &&
          item.plannedChanges.some((change) => change.type !== 'assign_record_id')),
    );
    if (blockers.length > 0) {
      throw launchError(
        'task_invalid_request',
        'Source onboarding has blocking records; fix the preview issues before starting.',
        {
          blockerCount: blockers.length,
          blockers: blockers.slice(0, 20).map((item) => ({
            path: item.path,
            reasons: item.reasons.map((reason) => reason.code),
          })),
        },
      );
    }
    const actionable = preview.items.filter(
      (item) =>
        item.action === 'include' ||
        (item.action === 'modify' &&
          item.plannedChanges.length > 0 &&
          item.plannedChanges.every((change) => change.type === 'assign_record_id')),
    );
    const records = await Promise.all(
      actionable.map(async (item) => {
        const markdown = await readFile(safeContentPath(this.#contentDir, item.path));
        return {
          path: item.path,
          expectedRevision: sha256(markdown),
          recordId: createDatabaseRecordId(),
        };
      }),
    );
    const queued = await this.#runner.enqueue({
      operation: 'import',
      inputState: ImportTaskInputSchema.parse({
        kind: 'source_onboarding',
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        expectedManifestRevision,
        records,
        excluded: preview.items.length - actionable.length,
      }),
      progress: { unit: 'records', total: records.length, message: 'Queued source onboarding' },
    });
    this.#dispatch(queued.id);
    return queued;
  }

  async #startMigration(input: StartDatabaseMigrationTaskInput): Promise<DatabaseTask> {
    const preview = await this.previewMigration(input);
    if (!preview.committable) {
      throw launchError(
        'task_invalid_request',
        'Manifest migration has blocking targets; resolve the preview before starting.',
        {
          blockerCount: preview.summary.blocked,
          blockers: preview.items
            .filter((item) => item.action === 'blocked')
            .slice(0, 20)
            .map((item) => ({ databaseId: item.databaseId, code: item.code })),
        },
      );
    }
    const manifests = preview.items.map((item) => ({
      databaseId: item.databaseId,
      key: item.databaseKey,
      expectedRevision: item.expectedRevision,
    }));
    const queued = await this.#runner.enqueue({
      operation: 'migration',
      inputState: MigrationTaskInputSchema.parse({
        kind: 'manifest_migration',
        expectedManifestRevision: preview.expectedManifestRevision,
        targetVersion: preview.targetVersion,
        manifests,
      }),
      progress: { unit: 'files', total: manifests.length, message: 'Queued manifest migration' },
    });
    this.#dispatch(queued.id);
    return queued;
  }

  async #runBulk(context: DatabaseTaskExecutionContext): Promise<Record<string, unknown>> {
    const input = BulkTaskInputSchema.parse(context.input);
    context.throwIfCancelled();
    try {
      const result = await this.#databaseCommitEngine.commit(input.commit);
      await context.saveCheckpoint({
        state: { phase: 'committed', mutationId: result.mutationId },
        completed: context.task.progress.total ?? 1,
        message: 'Approved plan committed',
      });
      return {
        mutationId: result.mutationId,
        planId: result.planId,
        planHash: result.planHash,
        changedFiles: result.actualDiff.length,
        snapshotRevision: result.revisions.snapshotRevision,
      };
    } catch (error) {
      if (error instanceof DatabaseCommitError) {
        const retryable = error.code === 'transaction_failed';
        throw executionProblem(
          `task_${error.code}`,
          'Bulk database commit failed',
          'The exact approved database plan could not be committed. Inspect the originating plan and local server diagnostics.',
          retryable,
          error.code === 'transaction_failed' ? 500 : 409,
        );
      }
      throw error;
    }
  }

  async #runImport(context: DatabaseTaskExecutionContext): Promise<Record<string, unknown>> {
    const input = ImportTaskInputSchema.parse(context.input);
    const definition = this.#databaseStore.getById(input.databaseId);
    if (!definition?.sources.some((source) => source.id === input.sourceId)) {
      throw executionProblem(
        'task_schema_changed',
        'Import schema changed',
        'The database or source no longer exists.',
        false,
      );
    }
    const checkpoint = context.checkpoint
      ? ImportCheckpointSchema.parse(context.checkpoint.state)
      : { cursor: 0, assigned: 0, alreadyReady: 0 };
    let { cursor, assigned, alreadyReady } = checkpoint;
    try {
      for (; cursor < input.records.length; cursor += 1) {
        context.throwIfCancelled();
        if (this.#databaseStore.snapshot().revision !== input.expectedManifestRevision) {
          throw executionProblem(
            'task_snapshot_changed',
            'Import snapshot changed',
            'The database schema changed after import planning.',
            false,
          );
        }
        const target = input.records[cursor];
        if (!target) throw new Error('Import checkpoint cursor exceeded the frozen target set');
        const markdown = await readFile(safeContentPath(this.#contentDir, target.path), 'utf8');
        if (sha256(markdown) !== target.expectedRevision) {
          const current = materializeDatabaseRecord({
            definition,
            sourceId: input.sourceId,
            path: target.path,
            markdown,
          });
          if (!current.ok) {
            throw executionProblem(
              'task_target_changed',
              'Import target changed',
              'A frozen import record changed after the target set was planned.',
              false,
            );
          }
          alreadyReady += 1;
        } else {
          const current = materializeDatabaseRecord({
            definition,
            sourceId: input.sourceId,
            path: target.path,
            markdown,
          });
          if (current.ok) {
            alreadyReady += 1;
            await context.saveCheckpoint({
              state: { cursor: cursor + 1, assigned, alreadyReady },
              completed: cursor + 1,
              message: `Onboarded ${cursor + 1} of ${input.records.length} records`,
            });
            continue;
          }
          const planned = ensureDatabaseRecordIdentity({
            markdown,
            databaseId: input.databaseId,
            sourceId: input.sourceId,
            recordId: target.recordId,
          });
          if (!planned.ok) {
            throw executionProblem(
              'task_target_changed',
              'Import target cannot receive its planned identity',
              planned.message,
              false,
            );
          }
          if (planned.changed) {
            await this.#rollbackJournal.prepare({
              taskId: context.task.id,
              path: target.path,
              before: markdown,
              afterSha256: sha256(planned.markdown),
            });
          }
          const result = await this.#databaseStore.assignRecordId({
            databaseId: input.databaseId,
            sourceId: input.sourceId,
            recordPath: target.path,
            recordId: target.recordId,
          });
          if (result.changed) assigned += 1;
          else alreadyReady += 1;
        }
        await context.saveCheckpoint({
          state: { cursor: cursor + 1, assigned, alreadyReady },
          completed: cursor + 1,
          message: `Onboarded ${cursor + 1} of ${input.records.length} records`,
        });
      }
      await this.#refreshDatabaseIndex();
      return {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        assigned,
        alreadyReady,
        excluded: input.excluded,
        processed: input.records.length,
        rollbackAvailable: assigned > 0,
      };
    } catch (error) {
      try {
        await this.#rollbackJournal.rollback(context.task.id);
        await this.#refreshDatabaseIndex();
      } catch (rollbackError) {
        if (
          !(
            rollbackError instanceof DatabaseTaskRollbackError &&
            rollbackError.code === 'rollback_unavailable'
          )
        ) {
          throw executionProblem(
            'task_rollback_failed',
            'Import failed and automatic rollback was incomplete',
            'Inspect the local database task rollback journal before retrying.',
            false,
            500,
          );
        }
      }
      throw error;
    }
  }

  async #runMigration(context: DatabaseTaskExecutionContext): Promise<Record<string, unknown>> {
    const input = MigrationTaskInputSchema.parse(context.input);
    const checkpoint = context.checkpoint
      ? MigrationCheckpointSchema.parse(context.checkpoint.state)
      : { cursor: 0, alreadyCurrent: 0 };
    let { cursor, alreadyCurrent } = checkpoint;
    for (; cursor < input.manifests.length; cursor += 1) {
      context.throwIfCancelled();
      const manifest = input.manifests[cursor];
      if (!manifest) throw new Error('Migration checkpoint cursor exceeded the target set');
      const path = resolve(this.#projectDir, '.ok', 'databases', `${manifest.key}.yml`);
      const yaml = await readFile(path, 'utf8');
      if (sha256(yaml) !== manifest.expectedRevision) {
        throw executionProblem(
          'task_target_changed',
          'Migration target changed',
          `Database "${manifest.databaseId}" changed after migration planning.`,
          false,
        );
      }
      const plan = planDatabaseManifestMigration(yaml, input.targetVersion);
      if (plan.status === 'blocked') {
        throw executionProblem(
          `task_${plan.code}`,
          'Database manifest migration is blocked',
          plan.message,
          false,
        );
      }
      alreadyCurrent += 1;
      await context.saveCheckpoint({
        state: { cursor: cursor + 1, alreadyCurrent },
        completed: cursor + 1,
        message: `Checked ${cursor + 1} of ${input.manifests.length} manifests`,
      });
    }
    await this.#databaseStore.reload();
    return {
      targetVersion: input.targetVersion,
      checked: input.manifests.length,
      alreadyCurrent,
      migrated: 0,
    };
  }
}

export function createDatabaseTaskService(
  options: CreateDatabaseTaskServiceOptions,
): DatabaseTaskService {
  return new DatabaseTaskService(options);
}
