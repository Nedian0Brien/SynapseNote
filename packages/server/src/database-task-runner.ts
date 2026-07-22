/** Checkpointed executor for durable database import, migration, and bulk tasks. */

import type { DatabaseTask } from './database-task-contract.ts';
import {
  type CreateDatabaseTaskInput,
  type DatabaseTaskCheckpoint,
  type DatabaseTaskOperation,
  type DatabaseTaskProblem,
  type DatabaseTaskStore,
  DatabaseTaskStoreError,
} from './database-task-store.ts';

export interface DatabaseTaskExecutionContext {
  task: DatabaseTask;
  input: Readonly<Record<string, unknown>> | null;
  checkpoint: DatabaseTaskCheckpoint | null;
  signal: AbortSignal;
  saveCheckpoint(input: {
    state: Record<string, unknown>;
    completed?: number;
    message?: string | null;
  }): Promise<DatabaseTaskCheckpoint>;
  throwIfCancelled(): void;
}

export type DatabaseTaskHandler = (
  context: DatabaseTaskExecutionContext,
) => Promise<Record<string, unknown>>;

export type DatabaseTaskHandlers = Readonly<
  Partial<Record<DatabaseTaskOperation, DatabaseTaskHandler>>
>;

export class DatabaseTaskExecutionError extends Error {
  readonly problem: DatabaseTaskProblem;

  constructor(problem: DatabaseTaskProblem, cause?: unknown) {
    super(problem.detail, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseTaskExecutionError';
    this.problem = structuredClone(problem);
  }
}

function fallbackProblem(operation: DatabaseTaskOperation, error: unknown): DatabaseTaskProblem {
  void error;
  return {
    type: 'urn:ok:error:database-task-execution-failed',
    title: `Database ${operation} task failed`,
    status: 500,
    detail:
      'The task executor failed unexpectedly. Inspect local server diagnostics before retrying.',
    code: 'task_execution_failed',
    retryable: true,
  };
}

export class DatabaseTaskRunner {
  readonly #store: DatabaseTaskStore;
  readonly #handlers: DatabaseTaskHandlers;
  readonly #running = new Set<string>();

  constructor(options: { store: DatabaseTaskStore; handlers: DatabaseTaskHandlers }) {
    this.#store = options.store;
    this.#handlers = { ...options.handlers };
  }

  async enqueue(input: CreateDatabaseTaskInput): Promise<DatabaseTask> {
    return this.#store.create(input);
  }

  async execute(input: CreateDatabaseTaskInput): Promise<DatabaseTask> {
    const task = await this.enqueue(input);
    return this.run(task.id);
  }

  async run(taskId: string): Promise<DatabaseTask> {
    if (this.#running.has(taskId)) {
      throw new DatabaseTaskStoreError(
        'invalid_task_transition',
        `Database task "${taskId}" is already executing in this process`,
        { taskId },
      );
    }
    const queued = await this.#store.get(taskId);
    if (queued.state !== 'queued') {
      throw new DatabaseTaskStoreError(
        'invalid_task_transition',
        `Database task "${taskId}" must be queued before execution`,
        { taskId, state: queued.state },
      );
    }
    this.#running.add(taskId);
    const abort = new AbortController();
    let current = await this.#store.start(taskId, queued.revision, () => abort.abort());
    try {
      const handler = this.#handlers[queued.operation];
      if (!handler) {
        throw new Error(`No executor is registered for database ${queued.operation} tasks`);
      }
      const checkpoint = await this.#store.readCheckpoint(taskId);
      const input = await this.#store.readInput(taskId);
      const result = await handler({
        task: structuredClone(current),
        input: input ? structuredClone(input.state) : null,
        checkpoint,
        signal: abort.signal,
        saveCheckpoint: async (input) => {
          abort.signal.throwIfAborted();
          const saved = await this.#store.checkpoint(taskId, current.revision, input);
          current = saved.task;
          return saved.checkpoint;
        },
        throwIfCancelled: () => abort.signal.throwIfAborted(),
      });
      abort.signal.throwIfAborted();
      return await this.#store.succeed(taskId, current.revision, result);
    } catch (error) {
      const observed = await this.#store.get(taskId);
      if (observed.state === 'cancelled') return observed;
      if (observed.state !== 'running') throw error;
      const problem =
        error instanceof DatabaseTaskExecutionError
          ? error.problem
          : fallbackProblem(observed.operation, error);
      return this.#store.fail(taskId, observed.revision, problem);
    } finally {
      this.#running.delete(taskId);
    }
  }

  async retry(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    const queued = await this.queueRetry(taskId, expectedRevision);
    return this.run(queued.id);
  }

  async resume(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    const queued = await this.queueResume(taskId, expectedRevision);
    return this.run(queued.id);
  }

  async queueRetry(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    return this.#store.retry(taskId, expectedRevision);
  }

  async queueResume(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    return this.#store.resume(taskId, expectedRevision);
  }

  async runQueued(limit = 10): Promise<DatabaseTask[]> {
    const queued = await this.#store.list({ state: 'queued', limit });
    const results: DatabaseTask[] = [];
    for (const task of [...queued.tasks].reverse()) results.push(await this.run(task.id));
    return results;
  }
}

export function createDatabaseTaskRunner(options: {
  store: DatabaseTaskStore;
  handlers: DatabaseTaskHandlers;
}): DatabaseTaskRunner {
  return new DatabaseTaskRunner(options);
}
