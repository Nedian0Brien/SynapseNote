import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';
import { createDatabaseTaskService } from './database-task-service.ts';
import { createDatabaseTaskStore } from './database-task-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function desiredState() {
  return {
    database: {
      key: 'task-service',
      name: 'Task service',
      contract: {
        purpose: 'Verify durable database job execution',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
    },
    sources: [
      {
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: 'tasks',
        properties: [
          { key: 'title', name: 'Title', type: 'title', required: true },
          {
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { key: 'todo', name: 'Todo' },
              { key: 'done', name: 'Done' },
            ],
          },
        ],
      },
    ],
    views: [],
    templates: [],
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: { title: 'Bulk one', status: 'todo' },
        body: '',
      },
      {
        sourceKey: 'tasks',
        values: { title: 'Bulk two', status: 'done' },
        body: '',
      },
    ],
  };
}

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-task-service-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  let id = 0;
  const generateUuid = () => `${++id}`.padStart(32, '0');
  const store = createDatabaseStore({ projectDir, contentDir, generateUuid });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
    generateUuid,
  });
  const draft = plans.createDraft(desiredState());
  const plan = plans.createPlan(draft.id);
  let checkpoint = 0;
  const commit = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    generateUuid,
    git: {
      snapshot: async () => String(++checkpoint).repeat(40).slice(0, 40),
      hashBlob: async () => `sha1:${'a'.repeat(40)}`,
    },
  });
  const taskStore = createDatabaseTaskStore({ projectDir, generateUuid });
  const service = createDatabaseTaskService({
    projectDir,
    contentDir,
    taskStore,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    databaseCommitEngine: commit,
  });
  return { projectDir, contentDir, store, index, plans, draft, plan, commit, taskStore, service };
}

describe('DatabaseTaskService product handlers', () => {
  test('creates a blank v2 owner table through the reviewed plan without a generated record folder', async () => {
    const { contentDir, store, plans, commit, service } = await fixture();
    const state = desiredState();
    (state.sources[0] as (typeof state.sources)[number] & { storage?: 'markdown_table' }).storage =
      'markdown_table';
    state.sampleRecords = [];
    const draft = plans.createDraft(state);
    const v2Definition = draft.normalized.definition;
    expect(v2Definition.version).toBe(2);
    const plan = plans.createPlan(draft.id);
    expect(plan.committable).toBe(true);
    expect(plan.diff.manifests).toContainEqual(
      expect.objectContaining({ path: 'content/task-service/tasks.md', action: 'create' }),
    );
    const task = await service.start({
      operation: 'bulk',
      commit: {
        planId: plan.id,
        planHash: plan.hash,
        expectedSnapshotRevision: plan.snapshotRevision,
        idempotencyKey: 'durable-v2-blank-create-0001',
        approvalToken: commit.expectedApprovalToken(plan.hash),
        actor: { principalId: 'agent:v2-blank-create', kind: 'agent' },
      },
    });
    await expect(service.wait(task.id)).resolves.toMatchObject({ state: 'succeeded' });
    expect(store.list()[0]).toMatchObject({ version: 2 });
    expect(readFileSync(join(contentDir, 'task-service', 'tasks.md'), 'utf8')).toContain(
      'synapsenote:database',
    );
    expect(() => readFileSync(join(contentDir, 'tasks', 'rec_1.md'))).toThrow();
  });

  test('migrates a v1 record-file database into owner-table v2 with cold verification', async () => {
    const { projectDir, contentDir, store, index, plan, commit, service } = await fixture();
    await service.wait(
      await (async () => {
        const task = await service.start({
          operation: 'bulk',
          commit: {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: 'durable-v2-migration-bulk-0001',
            approvalToken: commit.expectedApprovalToken(plan.hash),
            actor: { principalId: 'agent:v2-migration', kind: 'agent' },
          },
        });
        return task.id;
      })(),
    );
    const database = store.list()[0];
    if (!database) throw new Error('expected committed database');
    const expectedManifestRevision = store.snapshot().revision;
    const preview = await service.previewMigration({
      operation: 'migration',
      databaseIds: [database.id],
      expectedManifestRevision,
      targetVersion: 2,
    });
    const item = preview.items[0];
    if (!item?.planHash || !item.migrationCommittedAt) throw new Error('expected v2 migration plan');
    expect(preview).toMatchObject({ committable: true, summary: { ready: 1, blocked: 0 } });

    await expect(
      service.start({
        operation: 'migration',
        databaseIds: [database.id],
        expectedManifestRevision,
        targetVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'task_plan_hash_required' });

    const task = await service.start({
      operation: 'migration',
      databaseIds: [database.id],
      expectedManifestRevision,
      targetVersion: 2,
      planHashes: { [database.id]: item.planHash },
      migrationCommittedAt: { [database.id]: item.migrationCommittedAt },
    });
    const migrated = await service.wait(task.id);
    expect(migrated).toMatchObject({
      state: 'succeeded',
      result: {
        verification: { verifiedRows: 2, verifiedOwners: 1 },
        backup: { fileCount: 4, revision: expect.stringMatching(/^sha256:/) },
      },
    });
    expect(readFileSync(join(projectDir, '.ok', 'databases', 'task-service.yml'), 'utf8')).toContain('version: 2');
    expect(readFileSync(join(contentDir, 'task-service', 'tasks.md'), 'utf8')).toContain(
      'synapsenote:database',
    );
    for (const path of readdirSync(join(contentDir, 'tasks'))) {
      if (path.endsWith('.md')) {
        expect(readFileSync(join(contentDir, 'tasks', path), 'utf8')).not.toContain('database_id:');
      }
    }
    expect(index.list()).toHaveLength(2);
  });

  test('runs approved bulk commit, frozen source import, and manifest migration tasks', async () => {
    const { projectDir, contentDir, store, index, plan, commit, taskStore, service } =
      await fixture();
    const approvalToken = commit.expectedApprovalToken(plan.hash);
    const bulk = await service.start({
      operation: 'bulk',
      commit: {
        planId: plan.id,
        planHash: plan.hash,
        expectedSnapshotRevision: plan.snapshotRevision,
        idempotencyKey: 'durable-bulk-commit-0001',
        approvalToken,
        actor: { principalId: 'agent:task-service', kind: 'agent' },
        assertions: { databaseAbsent: true, createdRecords: 2 },
      },
    });
    expect(bulk).toMatchObject({ operation: 'bulk', state: 'queued', progress: { total: 2 } });
    const bulkResult = await service.wait(bulk.id);
    expect(bulkResult).toMatchObject({
      state: 'succeeded',
      progress: { completed: 2, total: 2 },
      result: { planId: plan.id, changedFiles: 3 },
    });
    expect(index.list()).toHaveLength(2);
    expect(JSON.stringify(bulkResult)).not.toContain(approvalToken);

    mkdirSync(join(contentDir, 'tasks'), { recursive: true });
    writeFileSync(
      join(contentDir, 'tasks', 'external.md'),
      '---\ntitle: External task\nstatus: todo\n---\nExternal body\n',
    );
    const database = store.list()[0];
    const source = database?.sources[0];
    if (!database || !source) throw new Error('expected committed database source');
    const importTask = await service.start({
      operation: 'import',
      databaseId: database.id,
      sourceId: source.id,
      expectedManifestRevision: store.snapshot().revision,
    });
    const imported = await service.wait(importTask.id);
    expect(imported).toMatchObject({
      state: 'succeeded',
      result: { assigned: 1, processed: 3, excluded: 0, rollbackAvailable: true },
    });
    expect(readFileSync(join(contentDir, 'tasks', 'external.md'), 'utf8')).toContain(
      'record_id: rec_',
    );
    expect(index.list()).toHaveLength(3);
    expect(JSON.stringify(await taskStore.get(importTask.id))).not.toContain('external.md');
    expect((await taskStore.readInput(importTask.id))?.state).toMatchObject({
      kind: 'source_onboarding',
      records: expect.arrayContaining([expect.objectContaining({ path: 'tasks/external.md' })]),
    });
    expect(await service.rollback(importTask.id, imported.revision)).toEqual({
      taskId: importTask.id,
      status: 'applied',
      restored: 1,
    });
    expect(readFileSync(join(contentDir, 'tasks', 'external.md'), 'utf8')).not.toContain('_sn:');
    expect(index.list()).toHaveLength(2);
    expect(await service.rollback(importTask.id, imported.revision)).toMatchObject({
      status: 'already_applied',
    });

    const migration = await service.start({
      operation: 'migration',
      expectedManifestRevision: store.snapshot().revision,
      targetVersion: 1,
      databaseIds: [database.id],
    });
    const migrated = await service.wait(migration.id);
    expect(migrated).toMatchObject({
      state: 'succeeded',
      progress: { completed: 1, total: 1 },
      result: { checked: 1, alreadyCurrent: 1, migrated: 0 },
    });
    expect(
      readFileSync(join(projectDir, '.ok', 'databases', 'task-service.yml'), 'utf8'),
    ).toContain('version: 1');
  });

  test('refuses stale launch snapshots and changed frozen import targets', async () => {
    const { contentDir, store, plan, commit, service } = await fixture();
    await service.wait(
      (
        await service.start({
          operation: 'bulk',
          commit: {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: 'durable-bulk-commit-0002',
            approvalToken: commit.expectedApprovalToken(plan.hash),
            actor: { principalId: 'agent:task-service', kind: 'agent' },
          },
        })
      ).id,
    );
    const database = store.list()[0];
    const source = database?.sources[0];
    if (!database || !source) throw new Error('expected database source');
    await expect(
      service.start({
        operation: 'import',
        databaseId: database.id,
        sourceId: source.id,
        expectedManifestRevision: `sha256:${'f'.repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: 'task_snapshot_changed' });

    writeFileSync(
      join(contentDir, 'tasks', 'changed.md'),
      '---\ntitle: Before\nstatus: todo\n---\n',
    );
    const queued = await service.start({
      operation: 'import',
      databaseId: database.id,
      sourceId: source.id,
      expectedManifestRevision: store.snapshot().revision,
    });
    writeFileSync(
      join(contentDir, 'tasks', 'changed.md'),
      '---\ntitle: After\nstatus: todo\n---\n',
    );
    const result = await service.wait(queued.id);
    expect(result).toMatchObject({
      state: 'failed',
      problem: { code: 'task_target_changed', retryable: false },
    });
    expect(readFileSync(join(contentDir, 'tasks', 'changed.md'), 'utf8')).not.toContain(
      'record_id:',
    );
  });

  test('automatically rolls back already-written records when a running import is cancelled', async () => {
    const { contentDir, store, plan, commit, taskStore, service } = await fixture();
    await service.wait(
      (
        await service.start({
          operation: 'bulk',
          commit: {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: 'durable-bulk-cancel-fixture',
            approvalToken: commit.expectedApprovalToken(plan.hash),
            actor: { principalId: 'agent:task-service', kind: 'agent' },
          },
        })
      ).id,
    );
    const database = store.list()[0];
    const source = database?.sources[0];
    if (!database || !source) throw new Error('expected database source');
    const originals = new Map<string, string>();
    for (const name of ['cancel-one.md', 'cancel-two.md']) {
      const markdown = `---\ntitle: ${name}\nstatus: todo\n---\nBody\n`;
      originals.set(name, markdown);
      writeFileSync(join(contentDir, 'tasks', name), markdown);
    }

    const originalAssign = store.assignRecordId.bind(store);
    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstWrittenResolve!: () => void;
    const firstWritten = new Promise<void>((resolve) => {
      firstWrittenResolve = resolve;
    });
    let held = false;
    store.assignRecordId = async (input) => {
      const result = await originalAssign(input);
      if (result.changed && !held) {
        held = true;
        firstWrittenResolve();
        await holdFirst;
      }
      return result;
    };

    const task = await service.start({
      operation: 'import',
      databaseId: database.id,
      sourceId: source.id,
      expectedManifestRevision: store.snapshot().revision,
    });
    await firstWritten;
    const running = await taskStore.get(task.id);
    expect(running.state).toBe('running');
    const cancelled = await service.cancel(task.id, running.revision);
    releaseFirst();
    const finished = await service.wait(task.id);

    expect(cancelled.state).toBe('cancelled');
    expect(finished.state).toBe('cancelled');
    for (const [name, markdown] of originals) {
      expect(readFileSync(join(contentDir, 'tasks', name), 'utf8')).toBe(markdown);
    }
    await expect(service.resume(task.id, finished.revision)).rejects.toMatchObject({
      code: 'task_invalid_request',
    });
  });

  test('previews source onboarding without writes and refuses unresolved blockers', async () => {
    const { contentDir, store, plan, commit, service } = await fixture();
    await service.wait(
      (
        await service.start({
          operation: 'bulk',
          commit: {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: 'durable-bulk-onboarding-preview',
            approvalToken: commit.expectedApprovalToken(plan.hash),
            actor: { principalId: 'agent:onboarding-preview', kind: 'agent' },
          },
        })
      ).id,
    );
    const database = store.list()[0];
    const source = database?.sources[0];
    if (!database || !source) throw new Error('expected committed database source');
    const blockedPath = join(contentDir, 'tasks', 'missing-title.md');
    const before = '---\nstatus: todo\n---\nNeeds a title\n';
    writeFileSync(blockedPath, before);

    const input = {
      operation: 'import' as const,
      databaseId: database.id,
      sourceId: source.id,
      expectedManifestRevision: store.snapshot().revision,
    };
    const preview = await service.previewImport(input);

    expect(preview.items).toContainEqual(
      expect.objectContaining({
        path: 'tasks/missing-title.md',
        action: 'modify',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'required_property_missing' }),
        ]),
        plannedChanges: expect.arrayContaining([
          expect.objectContaining({ type: 'provide_required_property' }),
        ]),
      }),
    );
    expect(readFileSync(blockedPath, 'utf8')).toBe(before);
    await expect(service.start(input)).rejects.toMatchObject({
      code: 'task_invalid_request',
      details: { blockerCount: 1 },
    });
    expect(readFileSync(blockedPath, 'utf8')).toBe(before);
  });

  test('previews manifest migration without writes and refuses blocked targets before queueing', async () => {
    const { projectDir, store, plan, commit, service } = await fixture();
    await service.wait(
      (
        await service.start({
          operation: 'bulk',
          commit: {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: 'durable-migration-preview',
            approvalToken: commit.expectedApprovalToken(plan.hash),
            actor: { principalId: 'agent:migration-preview', kind: 'agent' },
          },
        })
      ).id,
    );
    const database = store.list()[0];
    if (!database) throw new Error('expected committed database');
    const path = join(projectDir, '.ok', 'databases', `${database.key}.yml`);
    const before = readFileSync(path, 'utf8');
    const target = {
      operation: 'migration' as const,
      databaseIds: [database.id],
      expectedManifestRevision: store.snapshot().revision,
      targetVersion: 1,
    };

    const preview = await service.previewMigration(target);
    expect(preview).toMatchObject({
      targetVersion: 1,
      summary: { notNeeded: 1, blocked: 0 },
      complete: true,
      committable: true,
      items: [
        {
          databaseId: database.id,
          action: 'not_needed',
          sourceVersion: 1,
          targetVersion: 1,
          migrationIds: ['database-manifest-v1-identity'],
          lossless: true,
          changed: false,
        },
      ],
    });
    expect(readFileSync(path, 'utf8')).toBe(before);

    const blockedInput = { ...target, targetVersion: 3 };
    const blocked = await service.previewMigration(blockedInput);
    expect(blocked).toMatchObject({
      summary: { notNeeded: 0, blocked: 1 },
      committable: false,
      items: [{ action: 'blocked', code: 'unsupported_target_version', changed: false }],
    });
    await expect(service.start(blockedInput)).rejects.toMatchObject({
      code: 'task_invalid_request',
      details: { blockerCount: 1 },
    });
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  test('blocks migration when the frozen v1 index contains an unresolved record issue', async () => {
    const { contentDir, store, index, plan, commit, service } = await fixture();
    await service.wait(
      (
        await service.start({
          operation: 'bulk',
          commit: {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: 'durable-migration-index-blocker',
            approvalToken: commit.expectedApprovalToken(plan.hash),
            actor: { principalId: 'agent:migration-index-blocker', kind: 'agent' },
          },
        })
      ).id,
    );
    const database = store.list()[0];
    if (!database) throw new Error('expected committed database');
    const recordName = readdirSync(join(contentDir, 'tasks')).find((name) => name.endsWith('.md'));
    if (!recordName) throw new Error('expected a committed v1 record');
    const recordPath = `tasks/${recordName}`;
    index.upsertPath(recordPath, '---\ntitle: Missing identity\nstatus: todo\n---\n');

    const preview = await service.previewMigration({
      operation: 'migration',
      databaseIds: [database.id],
      expectedManifestRevision: store.snapshot().revision,
      targetVersion: 2,
    });
    expect(preview).toMatchObject({
      committable: false,
      summary: { blocked: 1 },
      items: [
        {
          action: 'blocked',
          code: 'record_materialization_failed',
          message: expect.stringContaining('invalid_record'),
        },
      ],
    });
  });

  test('dispatches durably queued work and wires product retry and resume semantics', async () => {
    const { projectDir, store, plan, commit, taskStore, service } = await fixture();
    const bulk = await service.start({
      operation: 'bulk',
      commit: {
        planId: plan.id,
        planHash: plan.hash,
        expectedSnapshotRevision: plan.snapshotRevision,
        idempotencyKey: 'durable-bulk-commit-recovery',
        approvalToken: commit.expectedApprovalToken(plan.hash),
        actor: { principalId: 'agent:task-recovery', kind: 'agent' },
      },
    });
    await service.wait(bulk.id);
    const database = store.list()[0];
    if (!database) throw new Error('expected committed database');
    const manifest = readFileSync(
      join(projectDir, '.ok', 'databases', `${database.key}.yml`),
      'utf8',
    );
    const migrationInput = {
      kind: 'manifest_migration',
      expectedManifestRevision: store.snapshot().revision,
      targetVersion: 1,
      manifests: [
        {
          databaseId: database.id,
          key: database.key,
          expectedRevision: `sha256:${createHash('sha256').update(manifest).digest('hex')}`,
        },
      ],
    };
    const progress = { unit: 'files' as const, total: 1 };

    const recoveredQueue = await Promise.all(
      Array.from({ length: 3 }, () =>
        taskStore.create({
          operation: 'migration',
          inputState: migrationInput,
          progress,
        }),
      ),
    );
    await service.runQueued(1);
    const oldestRecovered = recoveredQueue.toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )[0];
    expect(await service.wait(oldestRecovered?.id ?? '')).toMatchObject({
      state: 'succeeded',
      result: { checked: 1, alreadyCurrent: 1 },
    });
    for (const recovered of recoveredQueue) {
      expect(await taskStore.get(recovered.id)).toMatchObject({ state: 'succeeded' });
    }

    const retryQueued = await taskStore.create({
      operation: 'migration',
      inputState: migrationInput,
      progress,
    });
    const retryRunning = await taskStore.start(retryQueued.id, retryQueued.revision);
    const retryFailed = await taskStore.fail(retryRunning.id, retryRunning.revision, {
      type: 'urn:ok:error:database-task-interrupted',
      title: 'Database task interrupted',
      status: 503,
      detail: 'Retry from immutable input.',
      code: 'task_interrupted',
      retryable: true,
    });
    const retried = await service.retry(retryFailed.id, retryFailed.revision);
    expect(retried).toMatchObject({ state: 'queued', attempt: 2, checkpoint: null });
    expect(await service.wait(retried.id)).toMatchObject({ state: 'succeeded', attempt: 2 });

    const resumeQueued = await taskStore.create({
      operation: 'migration',
      inputState: migrationInput,
      progress,
    });
    const resumeRunning = await taskStore.start(resumeQueued.id, resumeQueued.revision);
    const saved = await taskStore.checkpoint(resumeRunning.id, resumeRunning.revision, {
      state: { cursor: 0, alreadyCurrent: 0 },
      completed: 0,
    });
    const resumeFailed = await taskStore.fail(saved.task.id, saved.task.revision, {
      type: 'urn:ok:error:database-task-interrupted',
      title: 'Database task interrupted',
      status: 503,
      detail: 'Resume from the durable checkpoint.',
      code: 'task_interrupted',
      retryable: true,
    });
    const resumed = await service.resume(resumeFailed.id, resumeFailed.revision);
    expect(resumed).toMatchObject({ state: 'queued', attempt: 2, checkpoint: { completed: 0 } });
    expect(await service.wait(resumed.id)).toMatchObject({ state: 'succeeded', attempt: 2 });
  });
});
