/**
 * End-to-end crash fixture for the v1 -> v2 migration boundary.
 *
 * The child process is deliberately killed after each staging and canonical
 * activation file write. The parent then boots a fresh task store/service, marks the
 * orphaned task as interrupted, resumes (or retries when no checkpoint exists)
 * and verifies the v2 manifest/index from disk only.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseMigrationJournal } from './database-migration-journal.ts';
import { createDatabaseStore } from './database-store.ts';
import { createDatabaseTaskService } from './database-task-service.ts';
import { createDatabaseTaskStore } from './database-task-store.ts';
import { createDatabasePlanEngine } from './database-plan.ts';

const tempDirs: string[] = [];
const SERVER_PACKAGE_ROOT = resolve(import.meta.dir, '..');

const CHILD_DRIVER = String.raw`
  const { join } = await import('node:path');
  const { createDatabaseCommitEngine } = await import('./src/database-commit.ts');
  const { createDatabaseRecordIndex } = await import('./src/database-record-index.ts');
  const { createDatabaseStore } = await import('./src/database-store.ts');
  const { createDatabaseTaskService } = await import('./src/database-task-service.ts');
  const { createDatabaseTaskStore } = await import('./src/database-task-store.ts');
  const { createDatabasePlanEngine } = await import('./src/database-plan.ts');

  const projectDir = process.env.SYNAPSENOTE_CRASH_PROJECT;
  const crashPhase = process.env.SYNAPSENOTE_CRASH_PHASE;
  const crashIndex = Number(process.env.SYNAPSENOTE_CRASH_INDEX);
  if (!projectDir || (crashPhase !== 'stage' && crashPhase !== 'activate') || !Number.isInteger(crashIndex) || crashIndex < 0) {
    console.error('invalid crash fixture environment');
    process.exit(91);
  }
  const contentDir = join(projectDir, 'content');
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  const commit = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    git: {
      snapshot: async () => '0'.repeat(40),
      hashBlob: async () => 'sha1:' + 'a'.repeat(40),
    },
  });
  const taskStore = createDatabaseTaskStore({ projectDir });
  const service = createDatabaseTaskService({
    projectDir,
    contentDir,
    taskStore,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    databaseCommitEngine: commit,
    migrationFileOperationHook: ({ phase, index }) => {
      if (phase === crashPhase && index === crashIndex) {
        process.kill(process.pid, 'SIGKILL');
      }
    },
  });
  const database = store.list()[0];
  if (!database) throw new Error('crash fixture database is missing');
  const expectedManifestRevision = store.snapshot().revision;
  const preview = await service.previewMigration({
    operation: 'migration',
    databaseIds: [database.id],
    expectedManifestRevision,
    targetVersion: 2,
  });
  const item = preview.items[0];
  if (!item?.planHash || !item.migrationCommittedAt) {
    throw new Error('crash fixture migration preview was not committable');
  }
  const task = await service.start({
    operation: 'migration',
    databaseIds: [database.id],
    expectedManifestRevision,
    targetVersion: 2,
    planHashes: { [database.id]: item.planHash },
    migrationCommittedAt: { [database.id]: item.migrationCommittedAt },
  });
  await service.wait(task.id);
`;

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'task-service',
    name: 'Task service',
    contract: {
      purpose: 'Verify process-kill recovery',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: 'tasks',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
        ],
      },
    ],
  });
}

function seedV1Project(): { projectDir: string; contentDir: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-migration-crash-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'task-service.yml'),
    serializeDatabaseManifestYaml(definition()),
  );
  writeFileSync(
    join(contentDir, 'tasks', 'alpha.md'),
    '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\ntitle: Alpha\nstatus: todo\n---\nAlpha body\n',
  );
  writeFileSync(
    join(contentDir, 'tasks', 'beta.md'),
    '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_beta\ntitle: Beta\nstatus: done\n---\nBeta body\n',
  );
  tempDirs.push(projectDir);
  return { projectDir, contentDir };
}

function taskIds(projectDir: string): string[] {
  const root = join(projectDir, '.ok', 'local', 'database-tasks', 'v1');
  return readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length));
}

function runKilledChild(projectDir: string, crashPhase: 'stage' | 'activate', crashIndex: number) {
  return Bun.spawnSync({
    cmd: ['bun', '--conditions=development', '-e', CHILD_DRIVER],
    cwd: SERVER_PACKAGE_ROOT,
    env: {
      ...process.env,
      NO_COLOR: '1',
      OTEL_SDK_DISABLED: 'true',
      SYNAPSENOTE_CRASH_PROJECT: projectDir,
      SYNAPSENOTE_CRASH_PHASE: crashPhase,
      SYNAPSENOTE_CRASH_INDEX: String(crashIndex),
    },
  });
}

async function recoverAfterCrash(projectDir: string, contentDir: string, taskId: string) {
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  const commit = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    git: {
      snapshot: async () => '0'.repeat(40),
      hashBlob: async () => 'sha1:' + 'a'.repeat(40),
    },
  });
  const taskStore = createDatabaseTaskStore({ projectDir });
  const service = createDatabaseTaskService({
    projectDir,
    contentDir,
    taskStore,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    databaseCommitEngine: commit,
  });

  const interrupted = await taskStore.recoverInterrupted();
  expect(interrupted).toContainEqual(expect.objectContaining({ id: taskId, state: 'failed' }));
  const inspection = await service.inspectMigration(taskId);
  expect(['prepared', 'staged']).toContain(inspection.state);
  const failed = await taskStore.get(taskId);
  const queued = failed.checkpoint
    ? await service.resume(taskId, failed.revision)
    : await service.retry(taskId, failed.revision);
  const finished = await service.wait(queued.id);

  expect(finished).toMatchObject({ state: 'succeeded', result: { verified: true } });
  await store.reload();
  await index.rebuild();
  expect(store.list()[0]).toMatchObject({ version: 2 });
  expect(index.list('db_tasks', 'ds_tasks')).toHaveLength(2);
  expect(readFileSync(join(contentDir, 'tasks', 'alpha.md'), 'utf8')).not.toContain('database_id:');
  expect(readFileSync(join(contentDir, 'tasks', 'beta.md'), 'utf8')).not.toContain('database_id:');
  const recoveredJournal = await createDatabaseMigrationJournal(projectDir).get(taskId);
  expect(recoveredJournal.state).toBe('activated');
  return { fileCount: recoveredJournal.files.length, taskId };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('database migration process-kill recovery', () => {
  test('recovers from SIGKILL at every staging and activation file boundary', async () => {
    const runCase = async (crashPhase: 'stage' | 'activate', crashIndex: number) => {
      const { projectDir, contentDir } = seedV1Project();
      const child = runKilledChild(projectDir, crashPhase, crashIndex);
      expect(child.exitCode).not.toBe(0);
      const ids = taskIds(projectDir);
      expect(ids).toHaveLength(1);
      const taskId = ids[0];
      if (!taskId) throw new Error('crash fixture task id is missing');
      const journal = await createDatabaseMigrationJournal(projectDir).get(taskId);
      expect(['prepared', 'staged']).toContain(journal.state);
      return recoverAfterCrash(projectDir, contentDir, taskId);
    };

    const firstStage = await runCase('stage', 0);
    expect(firstStage.fileCount).toBeGreaterThan(0);
    for (const phase of ['stage', 'activate'] as const) {
      for (let index = phase === 'stage' ? 1 : 0; index < firstStage.fileCount; index += 1) {
        const result = await runCase(phase, index);
        expect(result.fileCount).toBe(firstStage.fileCount);
      }
    }
  }, 60_000);
});
