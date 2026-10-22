import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseTaskStore } from './database-task-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-tasks-'));
  tempDirs.push(projectDir);
  let tick = 0;
  let id = 0;
  const store = createDatabaseTaskStore({
    projectDir,
    now: () => new Date(Date.UTC(2026, 6, 19, 0, 0, tick++)),
    generateUuid: () => `${++id}`.padStart(32, '0'),
  });
  return { projectDir, store };
}

describe('DatabaseTaskStore', () => {
  test('persists revision-checked lifecycle state and signals running cancellation', async () => {
    const { projectDir, store } = fixture();
    const queued = await store.create({
      operation: 'bulk',
      progress: { completed: 0, total: 3, unit: 'records', message: 'Queued records' },
    });
    expect(queued).toMatchObject({ state: 'queued', cancellable: true });

    let aborted = false;
    const running = await store.start(queued.id, queued.revision, () => {
      aborted = true;
    });
    const progressed = await store.updateProgress(running.id, running.revision, {
      completed: 2,
      message: 'Two records complete',
    });
    await expect(
      store.updateProgress(progressed.id, running.revision, { completed: 3 }),
    ).rejects.toMatchObject({ code: 'task_revision_changed' });

    const cancelled = await store.cancel(progressed.id, progressed.revision);
    expect(aborted).toBe(true);
    expect(cancelled).toMatchObject({
      state: 'cancelled',
      cancellable: false,
      finishedAt: '2026-07-19T00:00:02.000Z',
      progress: { completed: 2, total: 3, message: 'Cancelled' },
      result: null,
      problem: null,
    });
    expect(cancelled.revision).not.toBe(progressed.revision);

    const reloaded = createDatabaseTaskStore({ projectDir });
    expect(await reloaded.get(cancelled.id)).toEqual(cancelled);
    const taskPath = join(
      projectDir,
      '.ok',
      'local',
      'database-tasks',
      'v1',
      `${cancelled.id}.json`,
    );
    expect(statSync(taskPath).mode & 0o777).toBe(0o600);
  });

  test('completes successful work and converts orphaned running work to retryable failure', async () => {
    const { projectDir, store } = fixture();
    const successQueued = await store.create({
      operation: 'import',
      progress: { unit: 'files', total: 2 },
    });
    const successRunning = await store.start(successQueued.id, successQueued.revision);
    const success = await store.succeed(successRunning.id, successRunning.revision, {
      importedFiles: 2,
      checkpointId: 'checkpoint_import_1',
    });
    expect(success).toMatchObject({
      state: 'succeeded',
      cancellable: false,
      progress: { completed: 2, total: 2, message: 'Completed' },
      result: { importedFiles: 2, checkpointId: 'checkpoint_import_1' },
    });

    const interruptedQueued = await store.create({ operation: 'migration' });
    const interruptedRunning = await store.start(interruptedQueued.id, interruptedQueued.revision);
    const restarted = createDatabaseTaskStore({
      projectDir,
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    });
    const recovered = await restarted.recoverInterrupted();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      id: interruptedRunning.id,
      state: 'failed',
      cancellable: false,
      problem: { code: 'task_interrupted', retryable: true, status: 503 },
    });
    expect(await restarted.get(success.id)).toEqual(success);
  });

  test('paginates newest-first without overlap and binds cursors to filters', async () => {
    const { store } = fixture();
    const created = [];
    for (let index = 0; index < 5; index++) {
      created.push(await store.create({ operation: index % 2 === 0 ? 'bulk' : 'import' }));
    }

    const first = await store.list({ limit: 2 });
    expect(first.tasks.map((task) => task.id)).toEqual([created[4]?.id, created[3]?.id]);
    expect(first.nextCursor).not.toBeNull();
    const inserted = await store.create({ operation: 'migration' });
    const second = await store.list({ limit: 2, cursor: first.nextCursor ?? undefined });
    const third = await store.list({ limit: 2, cursor: second.nextCursor ?? undefined });
    const traversed = [...first.tasks, ...second.tasks, ...third.tasks].map((task) => task.id);
    expect(traversed).toEqual(created.toReversed().map((task) => task.id));
    expect(traversed).not.toContain(inserted.id);
    expect(new Set(traversed).size).toBe(5);

    await expect(
      store.list({ state: 'queued', cursor: first.nextCursor ?? undefined }),
    ).rejects.toMatchObject({ code: 'invalid_task_cursor' });
  });

  test('detects tampered durable content instead of trusting its stored revision', async () => {
    const { projectDir, store } = fixture();
    const task = await store.create({ operation: 'bulk' });
    const path = join(projectDir, '.ok', 'local', 'database-tasks', 'v1', `${task.id}.json`);
    const tampered = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    tampered.operation = 'import';
    writeFileSync(path, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });

    await expect(store.get(task.id)).rejects.toMatchObject({ code: 'task_store_corrupt' });
  });

  test('keeps atomic bulk work non-cancellable across retry and resume transitions', async () => {
    const { store } = fixture();
    const problem = {
      type: 'urn:ok:error:bulk-interrupted',
      title: 'Bulk task interrupted',
      status: 503,
      detail: 'The atomic commit outcome must be replayed by idempotency key.',
      code: 'task_interrupted',
      retryable: true,
    };

    const retryQueued = await store.create({ operation: 'bulk', cancellable: false });
    const retryRunning = await store.start(retryQueued.id, retryQueued.revision);
    const retryFailed = await store.fail(retryRunning.id, retryRunning.revision, problem);
    const retried = await store.retry(retryFailed.id, retryFailed.revision);
    expect(retried).toMatchObject({ state: 'queued', cancellable: false, attempt: 2 });
    await expect(store.cancel(retried.id, retried.revision)).rejects.toMatchObject({
      code: 'task_not_cancellable',
    });

    const resumeQueued = await store.create({ operation: 'bulk', cancellable: false });
    const resumeRunning = await store.start(resumeQueued.id, resumeQueued.revision);
    const saved = await store.checkpoint(resumeRunning.id, resumeRunning.revision, {
      state: { phase: 'committed' },
      completed: 1,
    });
    const resumeFailed = await store.fail(saved.task.id, saved.task.revision, problem);
    const resumed = await store.resume(resumeFailed.id, resumeFailed.revision);
    expect(resumed).toMatchObject({ state: 'queued', cancellable: false, attempt: 2 });
    await expect(store.cancel(resumed.id, resumed.revision)).rejects.toMatchObject({
      code: 'task_not_cancellable',
    });
  });

  test('detects tampered private input and checkpoint state without exposing it publicly', async () => {
    const { projectDir, store } = fixture();
    const queued = await store.create({
      operation: 'import',
      inputState: { privatePaths: ['secret.md'] },
      progress: { unit: 'files', total: 1 },
    });
    const running = await store.start(queued.id, queued.revision);
    const saved = await store.checkpoint(running.id, running.revision, {
      state: { cursor: 1, privatePath: 'secret.md' },
      completed: 1,
    });
    expect(JSON.stringify(saved.task)).not.toContain('secret.md');
    const root = join(projectDir, '.ok', 'local', 'database-tasks', 'v1');
    const inputPath = join(root, `${queued.id}.input`);
    const checkpointPath = join(root, `${queued.id}.checkpoint`);
    const originalInput = readFileSync(inputPath, 'utf8');
    const tamperedInput = JSON.parse(originalInput) as { state: Record<string, unknown> };
    tamperedInput.state.privatePaths = ['changed.md'];
    writeFileSync(inputPath, JSON.stringify(tamperedInput));
    await expect(store.readInput(queued.id)).rejects.toMatchObject({ code: 'task_store_corrupt' });
    writeFileSync(inputPath, originalInput);

    const tamperedCheckpoint = JSON.parse(readFileSync(checkpointPath, 'utf8')) as {
      state: Record<string, unknown>;
    };
    tamperedCheckpoint.state.cursor = 0;
    writeFileSync(checkpointPath, JSON.stringify(tamperedCheckpoint));
    await expect(store.readCheckpoint(queued.id)).rejects.toMatchObject({
      code: 'task_store_corrupt',
    });
  });

  test('rejects lossy JSON metadata and bounds aggregate list payloads', async () => {
    const { store } = fixture();
    const invalidQueued = await store.create({ operation: 'bulk' });
    const invalidRunning = await store.start(invalidQueued.id, invalidQueued.revision);
    await expect(
      store.succeed(invalidRunning.id, invalidRunning.revision, { invalidNumber: Number.NaN }),
    ).rejects.toMatchObject({ code: 'invalid_task' });
    expect(await store.get(invalidRunning.id)).toMatchObject({
      state: 'running',
      revision: invalidRunning.revision,
    });

    const ids: string[] = [];
    for (let index = 0; index < 14; index++) {
      const queued = await store.create({ operation: 'import' });
      const running = await store.start(queued.id, queued.revision);
      const succeeded = await store.succeed(running.id, running.revision, {
        summary: `${index}:`.padEnd(20_000, 'x'),
      });
      ids.push(succeeded.id);
    }
    const first = await store.list({ state: 'succeeded', limit: 200 });
    expect(first.tasks.length).toBeLessThan(ids.length);
    expect(first.nextCursor).not.toBeNull();
    const traversed = [...first.tasks];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await store.list({ state: 'succeeded', limit: 200, cursor });
      traversed.push(...page.tasks);
      cursor = page.nextCursor;
    }
    expect(traversed.map((task) => task.id)).toEqual(ids.toReversed());
  });
});
