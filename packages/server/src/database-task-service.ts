/** Product handlers and launch surface for durable database background tasks. */

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  createDatabaseRecordId,
  type DatabaseDefinition,
  ensureDatabaseRecordIdentity,
  isRecordPathInSource,
  materializeDatabaseRecord,
  planDatabaseMarkdownV2Migration,
  planDatabaseManifestMigration,
  serializeDatabaseManifestYaml,
  parseDatabaseMarkdownOwner,
  type DatabaseMarkdownV2MigrationPlan,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile } from '@nedian0brien/synapsenote-core/server';
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
import {
  createDatabaseMigrationJournal,
  type DatabaseMigrationJournal,
} from './database-migration-journal.ts';
import { DatabaseMigrationGate } from './database-migration-gate.ts';
import { tracedAtomicFs } from './fs-traced.ts';

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
          planHash: FileRevisionSchema.optional(),
          migrationCommittedAt: z.string().datetime({ offset: true }).optional(),
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
    phase: z.enum(['planned', 'staged', 'activated']).default('planned'),
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
  /** Plan hashes and timestamps returned by the exact preview being approved. */
  planHashes?: Readonly<Record<string, string>>;
  migrationCommittedAt?: Readonly<Record<string, string>>;
}

export interface DatabaseManifestMigrationPreviewItem {
  databaseId: string;
  databaseKey: string;
  manifestPath: string;
  expectedRevision: string;
  sourceVersion: number | null;
  targetVersion: number;
  action: 'not_needed' | 'ready' | 'blocked';
  migrationIds: readonly string[];
  lossless: boolean;
  changed: boolean;
  planHash?: string;
  ownerPaths?: readonly string[];
  linkedDocumentPaths?: readonly string[];
  blockerCount?: number;
  migrationCommittedAt?: string;
  code?: string;
  message?: string;
}

export interface DatabaseManifestMigrationPreview {
  expectedManifestRevision: string;
  targetVersion: number;
  items: readonly DatabaseManifestMigrationPreviewItem[];
  summary: {
    notNeeded: number;
    ready: number;
    blocked: number;
  };
  complete: true;
  committable: boolean;
}

interface DatabaseV2ContentPlan {
  plan: DatabaseMarkdownV2MigrationPlan;
  manifestPath: string;
  manifestBefore: string;
  manifestAfter: string;
  files: readonly { path: string; before: string | null; after: string | null }[];
  planHash: string;
  expectedRecords: readonly {
    sourceId: string;
    legacyRecordId: string;
    canonicalRecordId: string;
    path: string;
    values: Readonly<Record<string, unknown>>;
    invalidValues: Readonly<Record<string, unknown>> | null;
  }[];
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
  | 'task_plan_hash_required'
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
  migrationGate?: DatabaseMigrationGate;
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function migrationPlanHash(files: readonly { path: string; after: string | null }[]): string {
  return sha256(stableJson(files.map((file) => ({ path: file.path, after: file.after === null ? null : sha256(file.after) }))));
}

function defaultOwnerPath(databaseKey: string, sourceKey: string): string {
  return `${databaseKey}/${sourceKey}.md`;
}

function projectRelativeContentPath(projectDir: string, contentDir: string, path: string): string {
  const contentRoot = relative(projectDir, contentDir);
  if (contentRoot === '..' || contentRoot.startsWith(`..${sep}`) || isAbsolute(contentRoot)) {
    throw executionProblem(
      'task_target_unsafe',
      'Database task target is unsafe',
      'The database content directory must be inside the project directory.',
      false,
      400,
    );
  }
  return contentRoot ? `${contentRoot}/${path}` : path;
}

function safeProjectRelativePath(path: string): string {
  if (
    !path ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe project-relative migration path: ${path}`);
  }
  return path;
}

async function assertNoSymlinkComponents(root: string, relativePath: string): Promise<void> {
  const safe = safeProjectRelativePath(relativePath);
  const segments = safe.split('/');
  let current = resolve(root);
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) throw new Error(`Migration target is a symlink: ${relativePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
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
  readonly #migrationJournal: DatabaseMigrationJournal;
  readonly #migrationGate: DatabaseMigrationGate;
  readonly #runner: DatabaseTaskRunner;
  readonly #active = new Map<string, Promise<DatabaseTask>>();
  #migrationGateHydrated = false;
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
    this.#migrationJournal = createDatabaseMigrationJournal(this.#projectDir);
    this.#migrationGate = options.migrationGate ?? new DatabaseMigrationGate();
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
    await this.#ensureMigrationGateHydrated();
    const activeMigration = this.#migrationGate.current();
    if (activeMigration && input.operation !== 'migration') {
      throw launchError(
        'task_invalid_request',
        'A v1→v2 migration currently owns the database mutation freeze.',
        { taskId: activeMigration.taskId },
      );
    }
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

  async #buildV2ContentPlan(
    database: DatabaseDefinition,
    migrationCommittedAt?: string,
  ): Promise<DatabaseV2ContentPlan> {
    const manifestPath = `.ok/databases/${database.key}.yml`;
    const manifestBefore = await readFile(resolve(this.#projectDir, manifestPath), 'utf8');
    const recordPaths = new Set<string>();
    const records: Array<{ databaseId: string; sourceId: string; path: string; markdown: string }> = [];
    for (const source of database.sources) {
      for (const record of this.#databaseRecordIndex.list(database.id, source.id)) {
        recordPaths.add(record.path);
        records.push({
          databaseId: database.id,
          sourceId: source.id,
          path: record.path,
          markdown: await readFile(safeContentPath(this.#contentDir, record.path), 'utf8'),
        });
      }
    }
    const owners = database.sources.map((source) => ({
      sourceId: source.id,
      path: defaultOwnerPath(database.key, source.key),
      blockId: `dbb_${source.id.replace(/^ds_/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 110)}_primary`,
    }));
    const migration = planDatabaseMarkdownV2Migration({
      definition: database,
      records,
      owners,
      ...(migrationCommittedAt ? { migrationCommittedAt } : {}),
    });
    const blockers = [...migration.blockers];
    // The migration must be based on a complete, frozen v1 inventory. An
    // index issue means that at least one source file could not be included
    // deterministically; allowing the plan to proceed would silently drop
    // data during cutover. Surface the issue as a plan blocker instead of
    // relying on the later materializer to discover it after activation.
    for (const issue of this.#databaseRecordIndex.snapshot().issues) {
      const issueSource = issue.sourceId
        ? database.sources.find((source) => source.id === issue.sourceId)
        : database.sources.find((source) => isRecordPathInSource(issue.path, source));
      if (issue.databaseId !== database.id && issueSource === undefined) continue;
      blockers.push({
        code: 'record_materialization_failed',
        ...(issue.sourceId ? { sourceId: issue.sourceId } : {}),
        path: issue.path,
        message: `The frozen v1 inventory contains an unresolved index issue (${issue.code}).`,
      });
    }
    const ownerBefore = new Map<string, string | null>();
    for (const owner of owners) {
      if (recordPaths.has(owner.path)) {
        blockers.push({
          code: 'owner_path_collision',
          sourceId: owner.sourceId,
          path: owner.path,
          message: `Selected owner path "${owner.path}" is also a v1 record path`,
        });
        continue;
      }
      const existing = await readFile(safeContentPath(this.#contentDir, owner.path), 'utf8').catch(() => null);
      ownerBefore.set(owner.path, existing);
      if (existing !== null && existing !== migration.ownerDocuments[owner.path]) {
        blockers.push({
          code: 'owner_path_collision',
          sourceId: owner.sourceId,
          path: owner.path,
          message: `Selected owner path "${owner.path}" already contains unrelated content`,
        });
      }
    }
    if (blockers.length > 0 || !migration.definition) {
      const blocked: DatabaseMarkdownV2MigrationPlan = {
        ...migration,
        status: 'blocked',
        definition: null,
        ownerDocuments: {},
        linkedDocuments: {},
        blockers,
      };
      return {
        plan: blocked,
        manifestPath,
        manifestBefore,
        manifestAfter: manifestBefore,
        files: [],
        planHash: migrationPlanHash([]),
        expectedRecords: [],
      };
    }
    const manifestAfter = serializeDatabaseManifestYaml(migration.definition);
    const files = [
      ...Object.entries(migration.linkedDocuments).map(([path, after]) => ({
        path: projectRelativeContentPath(this.#projectDir, this.#contentDir, path),
        before: records.find((record) => record.path === path)?.markdown ?? null,
        after,
      })),
      ...Object.entries(migration.ownerDocuments).map(([path, after]) => ({
        path: projectRelativeContentPath(this.#projectDir, this.#contentDir, path),
        before: ownerBefore.get(path) ?? null,
        after,
      })),
      { path: manifestPath, before: manifestBefore, after: manifestAfter },
    ].sort((left, right) => left.path.localeCompare(right.path));
    const aliasesByLegacyId = new Map(
      migration.aliases.map((alias) => [alias.legacyRecordId, alias]),
    );
    const canonicalByLegacyId = new Map(
      migration.aliases.map((alias) => [alias.legacyRecordId, alias.canonicalRecordId]),
    );
    const expectedRecords = records
      .map((recordInput) => {
        const current = this.#databaseRecordIndex
          .list(database.id, recordInput.sourceId)
          .find((record) => record.path === recordInput.path);
        if (!current) return null;
        const alias = aliasesByLegacyId.get(current.id);
        if (!alias) return null;
        const values = structuredClone(current.values) as Record<string, unknown>;
        const source = database.sources.find((candidate) => candidate.id === current.sourceId);
        for (const property of source?.properties ?? []) {
          if (property.type !== 'relation') continue;
          const value = values[property.id];
          if (Array.isArray(value)) {
            values[property.id] = value.map((target) => canonicalByLegacyId.get(String(target)) ?? target);
          } else if (value !== undefined) {
            values[property.id] = canonicalByLegacyId.get(String(value)) ?? value;
          }
        }
        return {
          sourceId: current.sourceId,
          legacyRecordId: current.id,
          canonicalRecordId: alias.canonicalRecordId,
          path: current.path,
          values,
          invalidValues: current.invalidValues ? structuredClone(current.invalidValues) : null,
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .sort((left, right) => left.canonicalRecordId.localeCompare(right.canonicalRecordId));
    return {
      plan: migration,
      manifestPath,
      manifestBefore,
      manifestAfter,
      files,
      planHash: migrationPlanHash(files),
      expectedRecords,
    };
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
        if (targetVersion === 2 && database.version === 1) {
          const migrationCommittedAt =
            input.migrationCommittedAt?.[database.id] ?? new Date().toISOString();
          const contentPlan = await this.#buildV2ContentPlan(database, migrationCommittedAt);
          const blocked = contentPlan.plan.status === 'blocked';
          return {
            databaseId: database.id,
            databaseKey: database.key,
            manifestPath,
            expectedRevision: sha256(yaml),
            sourceVersion: database.version,
            targetVersion,
            action: blocked ? 'blocked' : 'ready',
            migrationIds: ['database-markdown-table-v2-content'],
            lossless: !blocked,
            changed: !blocked,
            planHash: contentPlan.planHash,
            ownerPaths: Object.keys(contentPlan.plan.ownerDocuments).sort(),
            linkedDocumentPaths: Object.keys(contentPlan.plan.linkedDocuments).sort(),
            blockerCount: contentPlan.plan.blockers.length,
            migrationCommittedAt,
            ...(blocked
              ? {
                  code: contentPlan.plan.blockers[0]?.code ?? 'content_migration_blocked',
                  message:
                    contentPlan.plan.blockers[0]?.message ??
                    'Markdown table content migration is blocked',
                }
              : {}),
          };
        }
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
    const ready = items.filter((item) => item.action === 'ready').length;
    const mismatchedPlan = items.find(
      (item) =>
        item.action === 'ready' &&
        input.planHashes?.[item.databaseId] !== undefined &&
        input.planHashes[item.databaseId] !== item.planHash,
    );
    if (mismatchedPlan) {
      throw launchError(
        'task_plan_hash_mismatch',
        `Migration preview plan hash for database "${mismatchedPlan.databaseId}" no longer matches the approved hash.`,
        {
          databaseId: mismatchedPlan.databaseId,
          expectedPlanHash: mismatchedPlan.planHash,
          providedPlanHash: input.planHashes?.[mismatchedPlan.databaseId],
        },
      );
    }
    return {
      expectedManifestRevision,
      targetVersion,
      items,
      summary: { notNeeded: items.length - blocked - ready, ready, blocked },
      complete: true,
      committable: blocked === 0,
    };
  }

  async retry(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    await this.#ensureMigrationGateHydrated();
    const current = this.#migrationGate.current();
    const existing = await this.#taskStore.get(taskId);
    if (current && existing.operation !== 'migration') {
      throw launchError('task_invalid_request', 'A migration currently owns the database mutation freeze.', {
        taskId: current.taskId,
      });
    }
    const queued = await this.#runner.queueRetry(taskId, expectedRevision);
    if (queued.operation === 'import' || queued.operation === 'migration') {
      await this.#rollbackJournal.resetRolledBack(taskId);
      if (queued.operation === 'migration') await this.#migrationJournal.reset(taskId);
    }
    this.#dispatch(queued.id);
    return queued;
  }

  async resume(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    await this.#ensureMigrationGateHydrated();
    const current = this.#migrationGate.current();
    const existing = await this.#taskStore.get(taskId);
    if (current && existing.operation !== 'migration') {
      throw launchError('task_invalid_request', 'A migration currently owns the database mutation freeze.', {
        taskId: current.taskId,
      });
    }
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
    await this.#ensureMigrationGateHydrated();
    return this.#taskStore.cancel(taskId, expectedRevision);
  }

  async rollback(taskId: string, expectedRevision: string): Promise<DatabaseTaskRollbackResult> {
    await this.#ensureMigrationGateHydrated();
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
      const result =
        task.operation === 'migration'
          ? await this.#migrationJournal.rollback(taskId)
          : await this.#rollbackJournal.rollback(taskId);
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
    await this.#ensureMigrationGateHydrated();
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
    await this.#ensureMigrationGateHydrated();
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
    let operation: DatabaseTask['operation'] | null = null;
    const completion = (async () => {
      const task = await this.#taskStore.get(taskId);
      operation = task.operation;
      const ownsMigrationGate =
        task.operation !== 'migration' || this.#migrationGate.tryAcquire(task.id);
      if (!ownsMigrationGate) return task;
      try {
        return await this.#runner.run(taskId);
      } finally {
        if (task.operation === 'migration') this.#migrationGate.release(task.id);
      }
    })();
    this.#active.set(taskId, completion);
    void completion
      .catch(() => undefined)
      .finally(() => {
        this.#active.delete(taskId);
        if (this.#drainQueued || operation === 'migration') {
          this.#drainQueued = true;
          queueMicrotask(() => {
            void this.#pumpQueued().catch(() => undefined);
          });
        }
      });
  }

  async #ensureMigrationGateHydrated(): Promise<void> {
    if (this.#migrationGateHydrated) return;
    const entries = await this.#migrationJournal.listInflight();
    // There is only one workspace-wide migration gate. Multiple inflight
    // journals indicate an already-degraded state; keep the first stable
    // owner so every other mutation fails closed until recovery is resolved.
    for (const entry of [...entries].sort((left, right) => left.taskId.localeCompare(right.taskId))) {
      this.#migrationGate.restore(entry.taskId);
      break;
    }
    this.#migrationGateHydrated = true;
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
      for (const task of [...queued.tasks].reverse()) {
        if (task.operation === 'migration' && this.#migrationGate.current() !== null) continue;
        this.#dispatch(task.id);
      }
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
    const v2Items = preview.items.filter(
      (item) => item.sourceVersion === 1 && item.targetVersion === 2 && item.action === 'ready',
    );
    const missingBinding = v2Items.find(
      (item) =>
        !input.planHashes?.[item.databaseId] ||
        !input.migrationCommittedAt?.[item.databaseId],
    );
    if (missingBinding) {
      throw launchError(
        'task_plan_hash_required',
        'A v1→v2 migration must include the exact approved plan hash and committed timestamp for every target database.',
        { databaseId: missingBinding.databaseId },
      );
    }
    const manifests = preview.items.map((item) => ({
      databaseId: item.databaseId,
      key: item.databaseKey,
      expectedRevision: item.expectedRevision,
      ...(item.planHash ? { planHash: item.planHash } : {}),
      ...(item.migrationCommittedAt ? { migrationCommittedAt: item.migrationCommittedAt } : {}),
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

  async #verifyV2ContentPlans(
    contentPlans: readonly DatabaseV2ContentPlan[],
  ): Promise<{ verifiedRows: number; verifiedOwners: number }> {
    let verifiedRows = 0;
    let verifiedOwners = 0;
    const snapshot = this.#databaseStore.snapshot();
    for (const contentPlan of contentPlans) {
      const definition = contentPlan.plan.definition;
      if (!definition || definition.version !== 2) {
        throw executionProblem(
          'task_post_commit_verification_failed',
          'Migration cold verification failed',
          'The generated v2 definition was not available after activation.',
          false,
          500,
        );
      }
      const database = snapshot.databases.find((candidate) => candidate.id === definition.id);
      if (!database || database.version !== 2) {
        throw executionProblem(
          'task_post_commit_verification_failed',
          'Migration cold verification failed',
          `Database "${definition.id}" did not rebuild as a v2 manifest.`,
          false,
          500,
        );
      }
      for (const source of database.sources) {
        const storage = source.storage;
        if (!storage || storage.kind !== 'markdown_table') {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            `Source "${source.id}" has no Markdown owner-table binding after activation.`,
            false,
            500,
          );
        }
        const ownerMarkdown = await readFile(safeContentPath(this.#contentDir, storage.owner.path), 'utf8');
        const parsed = parseDatabaseMarkdownOwner(ownerMarkdown);
        if (!parsed.ok) {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            `Owner "${storage.owner.path}" failed strict parse: ${parsed.message}`,
            false,
            500,
          );
        }
        if (
          parsed.owner.marker.databaseId !== database.id ||
          parsed.owner.marker.sourceId !== source.id ||
          parsed.owner.marker.blockId !== storage.owner.blockId ||
          parsed.owner.marker.columns.join('\0') !== storage.storedPropertyIds.join('\0')
        ) {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            `Owner "${storage.owner.path}" marker does not match the activated manifest binding.`,
            false,
            500,
          );
        }
        const expected = contentPlan.expectedRecords.filter((record) => record.sourceId === source.id);
        const actual = this.#databaseRecordIndex.list(database.id, source.id);
        if (actual.length !== expected.length || parsed.owner.rows.length !== expected.length) {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            `Source "${source.id}" row count differs from the approved v1 snapshot.`,
            false,
            500,
          );
        }
        const actualById = new Map(actual.map((record) => [record.id, record]));
        for (const planned of expected) {
          const migrated = actualById.get(planned.canonicalRecordId);
          if (
            !migrated ||
            migrated.path !== planned.path ||
            stableJson(migrated.values) !== stableJson(planned.values) ||
            stableJson(migrated.invalidValues ?? null) !== stableJson(planned.invalidValues)
          ) {
            throw executionProblem(
              'task_post_commit_verification_failed',
              'Migration cold verification failed',
              `Record "${planned.canonicalRecordId}" differs from its approved v1 logical snapshot.`,
              false,
              500,
            );
          }
          verifiedRows += 1;
        }
        verifiedOwners += 1;
      }
    }
    return { verifiedRows, verifiedOwners };
  }

  async #verifyActivatedMigration(
    input: z.infer<typeof MigrationTaskInputSchema>,
  ): Promise<{ verifiedRows: number; verifiedOwners: number }> {
    const snapshot = this.#databaseStore.snapshot();
    let verifiedRows = 0;
    let verifiedOwners = 0;
    for (const manifest of input.manifests) {
      const database = snapshot.databases.find((candidate) => candidate.id === manifest.databaseId);
      if (!database || database.version !== 2) {
        throw executionProblem(
          'task_post_commit_verification_failed',
          'Migration cold verification failed',
          'The activated migration manifest is not a v2 definition.',
          false,
          500,
        );
      }
      for (const source of database.sources) {
        const storage = source.storage;
        if (!storage || storage.kind !== 'markdown_table') {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            'An activated source has no Markdown owner-table binding.',
            false,
            500,
          );
        }
        const ownerMarkdown = await readFile(safeContentPath(this.#contentDir, storage.owner.path), 'utf8');
        const parsed = parseDatabaseMarkdownOwner(ownerMarkdown);
        if (!parsed.ok || parsed.owner.marker.databaseId !== database.id || parsed.owner.marker.sourceId !== source.id) {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            'An activated owner table failed its manifest binding check.',
            false,
            500,
          );
        }
        const rows = this.#databaseRecordIndex.list(database.id, source.id);
        if (rows.length !== parsed.owner.rows.length) {
          throw executionProblem(
            'task_post_commit_verification_failed',
            'Migration cold verification failed',
            'The activated owner row count differs from the rebuilt index.',
            false,
            500,
          );
        }
        verifiedRows += rows.length;
        verifiedOwners += 1;
      }
    }
    return { verifiedRows, verifiedOwners };
  }

  async #runMigration(context: DatabaseTaskExecutionContext): Promise<Record<string, unknown>> {
    const input = MigrationTaskInputSchema.parse(context.input);
    const checkpoint = context.checkpoint
      ? MigrationCheckpointSchema.parse(context.checkpoint.state)
      : { cursor: 0, alreadyCurrent: 0, phase: 'planned' as const };
    const journal = await this.#migrationJournal.get(context.task.id).catch(() => null);
    if (journal?.state === 'recovery_required') {
      throw executionProblem(
        'task_recovery_required',
        'Migration recovery is required',
        'The previous migration attempt left mixed canonical bytes. Resolve the durable journal before retrying.',
        false,
        500,
      );
    }
    if (journal && (journal.state === 'prepared' || journal.state === 'staged')) {
      try {
        await this.#migrationJournal.rollback(context.task.id);
        await this.#databaseStore.reload();
        await this.#refreshDatabaseIndex();
      } catch (error) {
        throw executionProblem(
          'task_recovery_required',
          'Migration recovery is required',
          'The interrupted migration could not be rolled back to its exact v1 bytes.',
          false,
          500,
        );
      }
    }
    if (journal?.state === 'activated') {
      const observed = await Promise.all(
        journal.files.map(async (file) => {
          await assertNoSymlinkComponents(this.#projectDir, file.path);
          const absolute = resolve(this.#projectDir, safeProjectRelativePath(file.path));
          const current = await readFile(absolute, 'utf8').catch(() => null);
          return {
            before: file.beforeSha256,
            after: file.afterSha256,
            current: current === null ? null : sha256(current),
          };
        }),
      );
      const allBefore = observed.every((entry) => entry.current === entry.before);
      const allAfter = observed.every((entry) => entry.current === entry.after);
      if (allAfter) {
        await this.#databaseStore.reload();
        await this.#refreshDatabaseIndex();
        const verification = await this.#verifyActivatedMigration(input);
        return {
          targetVersion: input.targetVersion,
          checked: input.manifests.length,
          alreadyCurrent: checkpoint.alreadyCurrent,
          migrated: input.manifests.length - checkpoint.alreadyCurrent,
          verified: true,
          journalState: 'activated',
          verification,
        };
      }
      if (!allBefore) {
        try {
          await this.#migrationJournal.rollback(context.task.id);
        } catch {
          throw executionProblem(
            'task_recovery_required',
            'Migration recovery is required',
            'The activated migration contains bytes outside its recorded before/after hashes.',
            false,
            500,
          );
        }
      } else {
        await this.#migrationJournal.rollback(context.task.id);
      }
      await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
    }

    const snapshot = await this.#databaseStore.reload();
    const contentPlans: DatabaseV2ContentPlan[] = [];
    let alreadyCurrent = checkpoint.alreadyCurrent;
    for (const manifest of input.manifests) {
      context.throwIfCancelled();
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
      const database = snapshot.databases.find((candidate) => candidate.id === manifest.databaseId);
      if (!database) {
        throw executionProblem('task_schema_changed', 'Migration schema changed', 'A selected database no longer exists.', false);
      }
      if (database.version === 2) {
        alreadyCurrent += 1;
        continue;
      }
      if (input.targetVersion !== 2) {
        const manifestPlan = planDatabaseManifestMigration(yaml, input.targetVersion);
        if (manifestPlan.status === 'blocked') {
          throw executionProblem(`task_${manifestPlan.code}`, 'Database manifest migration is blocked', manifestPlan.message, false);
        }
        alreadyCurrent += 1;
        continue;
      }
      const contentPlan = await this.#buildV2ContentPlan(
        database,
        manifest.migrationCommittedAt,
      );
      if (contentPlan.plan.status === 'blocked') {
        throw executionProblem(
          `task_${contentPlan.plan.blockers[0]?.code ?? 'content_migration_blocked'}`,
          'Database Markdown content migration is blocked',
          contentPlan.plan.blockers[0]?.message ?? 'Resolve the migration preview blockers before applying.',
          false,
        );
      }
      if (manifest.planHash && manifest.planHash !== contentPlan.planHash) {
        throw executionProblem(
          'task_plan_hash_mismatch',
          'Migration plan changed',
          `Database "${manifest.databaseId}" content plan no longer matches the approved preview.`,
          false,
        );
      }
      contentPlans.push(contentPlan);
    }
    if (contentPlans.length === 0) {
      await this.#databaseStore.reload();
      await context.saveCheckpoint({
        state: {
          cursor: input.manifests.length,
          alreadyCurrent,
          phase: 'activated',
        },
        completed: input.manifests.length,
        message: 'Migration target set is already at the requested version',
      });
      return {
        targetVersion: input.targetVersion,
        checked: input.manifests.length,
        alreadyCurrent,
        migrated: 0,
        verified: true,
        journalState: 'activated',
      };
    }

    const files = contentPlans.flatMap((plan) => plan.files);
    for (const file of files) {
      try {
        await assertNoSymlinkComponents(this.#projectDir, file.path);
      } catch (error) {
        throw executionProblem(
          'task_target_unsafe',
          'Migration target is unsafe',
          error instanceof Error ? error.message : String(error),
          false,
          400,
        );
      }
    }
    await this.#migrationJournal.prepare({ taskId: context.task.id, files });
    const stagingRoot = resolve(this.#projectDir, '.ok', 'local', 'database-migrations', context.task.id, 'staging');
    try {
      for (const file of files) {
        context.throwIfCancelled();
        if (file.after === null) continue;
        const staged = resolve(stagingRoot, safeProjectRelativePath(file.path));
        await mkdir(dirname(staged), { recursive: true });
        await writeFile(staged, file.after, { encoding: 'utf8', mode: 0o600 });
        if (sha256(await readFile(staged, 'utf8')) !== sha256(file.after)) {
          throw executionProblem('task_staging_verification_failed', 'Migration staging verification failed', `Staged file "${file.path}" did not match its approved hash.`, false, 500);
        }
      }
      await this.#migrationJournal.checkpoint(context.task.id, 'staged');
      await context.saveCheckpoint({
        state: { cursor: 0, alreadyCurrent, phase: 'staged' },
        completed: 0,
        message: 'Migration staging verified; awaiting canonical activation',
      });
      context.throwIfCancelled();
      const linkedPaths = new Set(
        contentPlans.flatMap((plan) => Object.keys(plan.plan.linkedDocuments).map((path) =>
          projectRelativeContentPath(this.#projectDir, this.#contentDir, path),
        )),
      );
      for (const file of [...files].sort((left, right) => {
        const leftManifest = left.path.startsWith('.ok/databases/') ? 1 : 0;
        const rightManifest = right.path.startsWith('.ok/databases/') ? 1 : 0;
        const leftLinked = linkedPaths.has(left.path) ? 1 : 0;
        const rightLinked = linkedPaths.has(right.path) ? 1 : 0;
        // Owner/additive files first, manifest activation second, and removal
        // of v1 database-owned frontmatter only after the v2 boundary.
        return leftLinked - rightLinked || leftManifest - rightManifest || left.path.localeCompare(right.path);
      })) {
        await assertNoSymlinkComponents(this.#projectDir, file.path);
        const absolute = resolve(this.#projectDir, safeProjectRelativePath(file.path));
        if (file.after === null) await rm(absolute, { force: true });
        else {
          await mkdir(dirname(absolute), { recursive: true });
          await atomicWriteFile(absolute, file.after, { fs: tracedAtomicFs });
        }
      }
      await this.#migrationJournal.checkpoint(context.task.id, 'activated');
      await context.saveCheckpoint({
        state: { cursor: input.manifests.length, alreadyCurrent, phase: 'activated' },
        completed: input.manifests.length,
        message: 'Migration canonical bytes activated; verifying cold rebuild',
      });
      await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
      const verification = await this.#verifyV2ContentPlans(contentPlans);
      return {
        targetVersion: input.targetVersion,
        checked: input.manifests.length,
        alreadyCurrent,
        migrated: contentPlans.length,
        verified: true,
        journalState: 'activated',
        planHashes: contentPlans.map((plan) => plan.planHash),
        verification,
      };
    } catch (error) {
      try {
        await this.#migrationJournal.rollback(context.task.id);
        await this.#databaseStore.reload();
        await this.#refreshDatabaseIndex();
      } catch (rollbackError) {
        throw executionProblem(
          'task_rollback_failed',
          'Migration failed and automatic rollback was incomplete',
          'Inspect the durable migration journal before retrying or making manual edits.',
          false,
          500,
        );
      }
      throw error;
    } finally {
      await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export function createDatabaseTaskService(
  options: CreateDatabaseTaskServiceOptions,
): DatabaseTaskService {
  return new DatabaseTaskService(options);
}
