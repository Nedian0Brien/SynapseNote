import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseTaskRunner,
  DatabaseTaskExecutionError,
  type DatabaseTaskHandler,
} from './database-task-runner.ts';
import { createDatabaseTaskStore } from './database-task-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-task-runner-'));
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

function retryable(detail: string): DatabaseTaskExecutionError {
  return new DatabaseTaskExecutionError({
    type: 'urn:ok:error:test-task-failure',
    title: 'Task attempt failed',
    status: 503,
    detail,
    code: 'test_task_failure',
    retryable: true,
  });
}

describe('DatabaseTaskRunner', () => {
  test('executes import, migration, and bulk handlers with private durable checkpoints', async () => {
    const { store } = fixture();
    const handler: DatabaseTaskHandler = async (context) => {
      expect(context.input).toEqual({ records: ['a', 'b'] });
      expect(context.checkpoint).toBeNull();
      await context.saveCheckpoint({
        state: { cursor: 1, source: 'private' },
        completed: 1,
        message: 'One complete',
      });
      await context.saveCheckpoint({ state: { cursor: 2 }, completed: 2 });
      return { processed: 2 };
    };
    const runner = createDatabaseTaskRunner({
      store,
      handlers: { import: handler, migration: handler, bulk: handler },
    });

    for (const operation of ['import', 'migration', 'bulk'] as const) {
      const result = await runner.execute({
        operation,
        inputState: { records: ['a', 'b'] },
        progress: { unit: 'records', total: 2 },
      });
      expect(result).toMatchObject({
        operation,
        state: 'succeeded',
        attempt: 1,
        progress: { completed: 2, total: 2 },
        checkpoint: { sequence: 2, completed: 2 },
        result: { processed: 2 },
      });
      expect(JSON.stringify(result)).not.toContain('private');
      expect((await store.readCheckpoint(result.id))?.state).toEqual({ cursor: 2 });
      expect((await store.readInput(result.id))?.state).toEqual({ records: ['a', 'b'] });
    }
  });

  test('resumes from the last checkpoint after a retryable failure and process restart', async () => {
    const { projectDir, store } = fixture();
    const firstRunner = createDatabaseTaskRunner({
      store,
      handlers: {
        bulk: async (context) => {
          await context.saveCheckpoint({ state: { cursor: 1 }, completed: 1 });
          throw retryable('restart from checkpoint');
        },
      },
    });
    const failed = await firstRunner.execute({
      operation: 'bulk',
      inputState: { selection: 'stable-query' },
      progress: { unit: 'records', total: 2 },
    });
    expect(failed).toMatchObject({
      state: 'failed',
      attempt: 1,
      checkpoint: { sequence: 1, completed: 1 },
      problem: { retryable: true },
    });

    const restartedStore = createDatabaseTaskStore({ projectDir });
    const resumedRunner = createDatabaseTaskRunner({
      store: restartedStore,
      handlers: {
        bulk: async (context) => {
          expect(context.task.attempt).toBe(2);
          expect(context.input).toEqual({ selection: 'stable-query' });
          expect(context.checkpoint?.state).toEqual({ cursor: 1 });
          await context.saveCheckpoint({ state: { cursor: 2 }, completed: 2 });
          return { resumed: true };
        },
      },
    });
    const resumed = await resumedRunner.resume(failed.id, failed.revision);
    expect(resumed).toMatchObject({
      state: 'succeeded',
      attempt: 2,
      checkpoint: { sequence: 2, completed: 2 },
      result: { resumed: true },
    });
  });

  test('retries from immutable input without reusing the failed checkpoint', async () => {
    const { store } = fixture();
    const failingRunner = createDatabaseTaskRunner({
      store,
      handlers: {
        migration: async (context) => {
          await context.saveCheckpoint({ state: { phase: 'partial' }, completed: 1 });
          throw retryable('retry from the beginning');
        },
      },
    });
    const failed = await failingRunner.execute({
      operation: 'migration',
      inputState: { manifest: 'v1' },
      progress: { unit: 'steps', total: 2 },
    });

    const retryRunner = createDatabaseTaskRunner({
      store,
      handlers: {
        migration: async (context) => {
          expect(context.task.attempt).toBe(2);
          expect(context.input).toEqual({ manifest: 'v1' });
          expect(context.checkpoint).toBeNull();
          await context.saveCheckpoint({ state: { phase: 'complete' }, completed: 2 });
          return { retried: true };
        },
      },
    });
    const retried = await retryRunner.retry(failed.id, failed.revision);
    expect(retried).toMatchObject({
      state: 'succeeded',
      attempt: 2,
      checkpoint: { sequence: 1, completed: 2 },
      result: { retried: true },
    });
  });

  test('propagates durable cancellation to a running handler without resurrection', async () => {
    const { store } = fixture();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const runner = createDatabaseTaskRunner({
      store,
      handlers: {
        import: async (context) => {
          await context.saveCheckpoint({ state: { file: 1 }, completed: 1 });
          entered();
          await new Promise<void>((resolve) => {
            context.signal.addEventListener('abort', () => resolve(), { once: true });
          });
          context.throwIfCancelled();
          return { impossible: true };
        },
      },
    });
    const queued = await runner.enqueue({
      operation: 'import',
      inputState: { files: 2 },
      progress: { unit: 'files', total: 2 },
    });
    const pending = runner.run(queued.id);
    await started;
    const running = await store.get(queued.id);
    const cancelled = await store.cancel(running.id, running.revision);
    expect(await pending).toEqual(cancelled);
    expect(await store.get(queued.id)).toMatchObject({
      state: 'cancelled',
      progress: { completed: 1 },
      checkpoint: { completed: 1 },
      result: null,
    });
  });

  test('does not publish unexpected executor messages that may contain private paths', async () => {
    const { store } = fixture();
    const runner = createDatabaseTaskRunner({
      store,
      handlers: {
        import: async () => {
          throw new Error('ENOENT: /private/workspace/customer-secret.md');
        },
      },
    });
    const failed = await runner.execute({ operation: 'import', inputState: { private: true } });
    expect(failed).toMatchObject({
      state: 'failed',
      problem: { code: 'task_execution_failed', retryable: true },
    });
    expect(JSON.stringify(failed)).not.toContain('customer-secret');
    expect(JSON.stringify(failed)).not.toContain('/private/workspace');
  });
});
