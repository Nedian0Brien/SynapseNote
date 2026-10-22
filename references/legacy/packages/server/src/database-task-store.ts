/** Durable local lifecycle store for database import, migration, and bulk tasks. */

import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import { type DatabaseTask, DatabaseTaskSchema } from './database-task-contract.ts';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

const MAX_TASK_BYTES = 32 * 1024;
const MAX_PRIVATE_TASK_BYTES = 16 * 1024 * 1024;
const MAX_TASK_LIST_BYTES = 256 * 1024;
const TaskRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const TaskCursorSchema = z
  .object({
    version: z.literal(1),
    state: DatabaseTaskSchema.shape.state.nullable(),
    createdAt: z.string().datetime(),
    taskId: z.string().startsWith('task_'),
  })
  .strict();
const DatabaseTaskCheckpointSchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().startsWith('task_'),
    operation: DatabaseTaskSchema.shape.operation,
    id: z.string().startsWith('checkpoint_'),
    sequence: z.number().int().positive(),
    completed: z.number().int().nonnegative(),
    savedAt: z.string().datetime(),
    state: z.record(z.string(), z.unknown()),
    revision: TaskRevisionSchema,
  })
  .strict();
const DatabaseTaskInputSchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().startsWith('task_'),
    operation: DatabaseTaskSchema.shape.operation,
    state: z.record(z.string(), z.unknown()),
    revision: TaskRevisionSchema,
  })
  .strict();

export type DatabaseTaskState = DatabaseTask['state'];
export type DatabaseTaskOperation = DatabaseTask['operation'];
export type DatabaseTaskProgress = DatabaseTask['progress'];
export type DatabaseTaskProblem = NonNullable<DatabaseTask['problem']>;
export type DatabaseTaskCheckpoint = z.infer<typeof DatabaseTaskCheckpointSchema>;
export type DatabaseTaskInput = z.infer<typeof DatabaseTaskInputSchema>;

export type DatabaseTaskStoreErrorCode =
  | 'invalid_task'
  | 'invalid_task_cursor'
  | 'task_not_found'
  | 'task_revision_changed'
  | 'task_not_cancellable'
  | 'invalid_task_transition'
  | 'task_store_unsafe'
  | 'task_store_corrupt'
  | 'task_store_io_error';

export class DatabaseTaskStoreError extends Error {
  readonly code: DatabaseTaskStoreErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: DatabaseTaskStoreErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseTaskStoreError';
    this.code = code;
    this.details = details;
  }
}

export interface CreateDatabaseTaskInput {
  operation: DatabaseTaskOperation;
  cancellable?: boolean;
  progress?: Partial<DatabaseTaskProgress> & Pick<DatabaseTaskProgress, 'unit'>;
  /** Private immutable executor input; stored separately and never returned by task APIs. */
  inputState?: Record<string, unknown>;
}

export interface ListDatabaseTasksInput {
  state?: DatabaseTaskState;
  limit?: number;
  cursor?: string;
}

export interface ListDatabaseTasksResult {
  tasks: DatabaseTask[];
  nextCursor: string | null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function errno(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function revisionFor(task: Omit<DatabaseTask, 'revision'>): string {
  return `sha256:${createHash('sha256').update(stableJson(task)).digest('hex')}`;
}

function finalizeTask(task: Omit<DatabaseTask, 'revision'>): DatabaseTask {
  const candidate = DatabaseTaskSchema.parse({ ...task, revision: revisionFor(task) });
  let serialized: string;
  let result: DatabaseTask;
  try {
    serialized = JSON.stringify(candidate);
    result = DatabaseTaskSchema.parse(JSON.parse(serialized));
  } catch (error) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      'Database task metadata must be finite JSON data',
      {},
      error,
    );
  }
  if (!isDeepStrictEqual(candidate, result)) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      'Database task metadata must round-trip through JSON without loss',
    );
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_TASK_BYTES) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      `Database task metadata exceeds the ${MAX_TASK_BYTES}-byte durable limit`,
      { bytes, maxBytes: MAX_TASK_BYTES },
    );
  }
  return result;
}

function finalizeCheckpoint(
  checkpoint: Omit<DatabaseTaskCheckpoint, 'revision'>,
): DatabaseTaskCheckpoint {
  const revision = `sha256:${createHash('sha256').update(stableJson(checkpoint)).digest('hex')}`;
  let serialized: string;
  let result: DatabaseTaskCheckpoint;
  try {
    result = DatabaseTaskCheckpointSchema.parse({ ...checkpoint, revision });
    serialized = JSON.stringify(result);
    result = DatabaseTaskCheckpointSchema.parse(JSON.parse(serialized));
  } catch (error) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      'Database task checkpoint must be finite JSON data',
      {},
      error,
    );
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_PRIVATE_TASK_BYTES) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      `Database task checkpoint exceeds the ${MAX_PRIVATE_TASK_BYTES}-byte durable limit`,
      { bytes, maxBytes: MAX_PRIVATE_TASK_BYTES },
    );
  }
  return result;
}

function finalizeInput(input: Omit<DatabaseTaskInput, 'revision'>): DatabaseTaskInput {
  const revision = `sha256:${createHash('sha256').update(stableJson(input)).digest('hex')}`;
  let serialized: string;
  let result: DatabaseTaskInput;
  try {
    result = DatabaseTaskInputSchema.parse({ ...input, revision });
    serialized = JSON.stringify(result);
    result = DatabaseTaskInputSchema.parse(JSON.parse(serialized));
  } catch (error) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      'Database task input must be finite JSON data',
      {},
      error,
    );
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_PRIVATE_TASK_BYTES) {
    throw new DatabaseTaskStoreError(
      'invalid_task',
      `Database task input exceeds the ${MAX_PRIVATE_TASK_BYTES}-byte durable limit`,
      { bytes, maxBytes: MAX_PRIVATE_TASK_BYTES },
    );
  }
  return result;
}

function withoutRevision(task: DatabaseTask): Omit<DatabaseTask, 'revision'> {
  const { revision: _revision, ...rest } = task;
  return rest;
}

function encodeCursor(task: DatabaseTask, state: DatabaseTaskState | undefined): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      state: state ?? null,
      createdAt: task.createdAt,
      taskId: task.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(cursor: string, state: DatabaseTaskState | undefined) {
  try {
    const parsed = TaskCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    if (parsed.state !== (state ?? null)) {
      throw new DatabaseTaskStoreError(
        'invalid_task_cursor',
        'Task cursor belongs to a different state filter',
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof DatabaseTaskStoreError) throw error;
    throw new DatabaseTaskStoreError('invalid_task_cursor', 'Task cursor is invalid', {}, error);
  }
}

function compareNewestFirst(left: DatabaseTask, right: DatabaseTask): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export class DatabaseTaskStore {
  readonly #projectDir: string;
  readonly #root: string;
  readonly #lockPath: string;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #cancelHandlers = new Map<string, () => void>();

  constructor(options: {
    projectDir: string;
    now?: () => Date;
    generateUuid?: () => string;
  }) {
    this.#projectDir = resolve(options.projectDir);
    this.#root = resolve(this.#projectDir, '.ok', 'local', 'database-tasks', 'v1');
    this.#lockPath = resolve(this.#root, '.tasks.lock');
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  async create(input: CreateDatabaseTaskInput): Promise<DatabaseTask> {
    return this.#withLock(async () => {
      const now = this.#now().toISOString();
      const id = await this.#nextId();
      const durableInput =
        input.inputState === undefined
          ? null
          : finalizeInput({
              version: 1,
              taskId: id,
              operation: input.operation,
              state: input.inputState,
            });
      const task = finalizeTask({
        version: 1,
        id,
        operation: input.operation,
        state: 'queued',
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        cancellable: input.cancellable ?? true,
        progress: {
          completed: input.progress?.completed ?? 0,
          total: input.progress?.total ?? null,
          unit: input.progress?.unit ?? 'steps',
          message: input.progress?.message ?? null,
        },
        attempt: 1,
        checkpoint: null,
        result: null,
        problem: null,
      });
      if (durableInput) await this.#writeInput(durableInput);
      await this.#write(task);
      return clone(task);
    });
  }

  async list(input: ListDatabaseTasksInput = {}): Promise<ListDatabaseTasksResult> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new DatabaseTaskStoreError('invalid_task', 'Task list limit must be from 1 to 200');
    }
    const cursor = input.cursor ? decodeCursor(input.cursor, input.state) : null;
    const tasks = (await this.#readAll())
      .filter((task) => input.state === undefined || task.state === input.state)
      .sort(compareNewestFirst)
      .filter(
        (task) =>
          cursor === null ||
          task.createdAt < cursor.createdAt ||
          (task.createdAt === cursor.createdAt && task.id < cursor.taskId),
      );
    const page: DatabaseTask[] = [];
    let pageBytes = 0;
    for (const task of tasks) {
      if (page.length >= limit) break;
      const bytes = Buffer.byteLength(JSON.stringify(task), 'utf8');
      if (page.length > 0 && pageBytes + bytes > MAX_TASK_LIST_BYTES) break;
      page.push(task);
      pageBytes += bytes;
    }
    return {
      tasks: clone(page),
      nextCursor:
        tasks.length > page.length && page.length > 0
          ? encodeCursor(page[page.length - 1] as DatabaseTask, input.state)
          : null,
    };
  }

  async get(taskId: string): Promise<DatabaseTask> {
    return clone(await this.#readRequired(taskId));
  }

  async readInput(taskId: string): Promise<DatabaseTaskInput | null> {
    await this.#readRequired(taskId);
    const path = this.#inputPath(taskId);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseTaskStoreError(
          'task_store_unsafe',
          'Database task input is not a safe regular file',
          { path, taskId },
        );
      }
      const input = DatabaseTaskInputSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      const { revision, ...body } = input;
      const expectedRevision = `sha256:${createHash('sha256')
        .update(stableJson(body))
        .digest('hex')}`;
      if (revision !== expectedRevision || input.taskId !== taskId) {
        throw new DatabaseTaskStoreError(
          'task_store_corrupt',
          'Database task input revision or task identity is invalid',
          { path, taskId },
        );
      }
      return clone(input);
    } catch (error) {
      if (error instanceof DatabaseTaskStoreError) throw error;
      if (errno(error) === 'ENOENT') return null;
      throw new DatabaseTaskStoreError(
        'task_store_corrupt',
        'Database task input is corrupt or unreadable',
        { path, taskId },
        error,
      );
    }
  }

  /** Transition a queued task to running and attach its in-process abort signal. */
  async start(
    taskId: string,
    expectedRevision: string,
    onCancel?: () => void,
  ): Promise<DatabaseTask> {
    if (onCancel) this.#cancelHandlers.set(taskId, onCancel);
    try {
      return await this.#transition(taskId, expectedRevision, ['queued'], (current) => ({
        ...withoutRevision(current),
        state: 'running',
        startedAt: this.#now().toISOString(),
        progress: { ...current.progress, message: current.progress.message ?? 'Running' },
      }));
    } catch (error) {
      if (onCancel) this.#cancelHandlers.delete(taskId);
      throw error;
    }
  }

  async updateProgress(
    taskId: string,
    expectedRevision: string,
    progress: Partial<Pick<DatabaseTaskProgress, 'completed' | 'total' | 'message'>>,
  ): Promise<DatabaseTask> {
    return this.#transition(taskId, expectedRevision, ['running'], (current) => {
      const completed = progress.completed ?? current.progress.completed;
      const total = progress.total === undefined ? current.progress.total : progress.total;
      if (completed < current.progress.completed) {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          'Task progress cannot move backwards',
          { taskId, previousCompleted: current.progress.completed, completed },
        );
      }
      if (current.progress.total !== null && total !== null && total !== current.progress.total) {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          'A known task progress total cannot change',
          { taskId, previousTotal: current.progress.total, total },
        );
      }
      return {
        ...withoutRevision(current),
        progress: {
          ...current.progress,
          completed,
          total,
          message: progress.message === undefined ? current.progress.message : progress.message,
        },
      };
    });
  }

  async checkpoint(
    taskId: string,
    expectedRevision: string,
    input: {
      state: Record<string, unknown>;
      completed?: number;
      message?: string | null;
    },
  ): Promise<{ task: DatabaseTask; checkpoint: DatabaseTaskCheckpoint }> {
    TaskRevisionSchema.parse(expectedRevision);
    return this.#withLock(async () => {
      const current = await this.#readRequired(taskId);
      this.#assertRevision(current, expectedRevision);
      if (current.state !== 'running') {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          `Database task "${taskId}" can checkpoint only while running`,
          { taskId, state: current.state },
        );
      }
      const completed = input.completed ?? current.progress.completed;
      if (completed < current.progress.completed) {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          'Task checkpoint progress cannot move backwards',
          { taskId, previousCompleted: current.progress.completed, completed },
        );
      }
      if (current.progress.total !== null && completed > current.progress.total) {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          'Task checkpoint progress cannot exceed the known total',
          { taskId, total: current.progress.total, completed },
        );
      }
      const savedAt = this.#now().toISOString();
      const checkpoint = finalizeCheckpoint({
        version: 1,
        taskId,
        operation: current.operation,
        id: `checkpoint_${this.#generateUuid().replaceAll('-', '').toLowerCase()}`,
        sequence: (current.checkpoint?.sequence ?? 0) + 1,
        completed,
        savedAt,
        state: input.state,
      });
      const next = finalizeTask({
        ...withoutRevision(current),
        progress: {
          ...current.progress,
          completed,
          message: input.message === undefined ? current.progress.message : input.message,
        },
        checkpoint: {
          id: checkpoint.id,
          sequence: checkpoint.sequence,
          completed: checkpoint.completed,
          savedAt: checkpoint.savedAt,
        },
      });
      await this.#writeCheckpoint(checkpoint);
      await this.#write(next);
      return { task: clone(next), checkpoint: clone(checkpoint) };
    });
  }

  async readCheckpoint(taskId: string): Promise<DatabaseTaskCheckpoint | null> {
    const task = await this.#readRequired(taskId);
    if (!task.checkpoint) return null;
    const checkpoint = await this.#readCheckpointRequired(taskId);
    this.#assertCheckpointMatches(task, checkpoint);
    return clone(checkpoint);
  }

  async retry(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    TaskRevisionSchema.parse(expectedRevision);
    return this.#withLock(async () => {
      const current = await this.#readRequired(taskId);
      this.#assertRetryableFailure(current, expectedRevision);
      const next = finalizeTask({
        ...withoutRevision(current),
        state: 'queued',
        startedAt: null,
        finishedAt: null,
        cancellable: current.operation !== 'bulk',
        progress: {
          ...current.progress,
          completed: 0,
          message: 'Queued for retry',
        },
        attempt: (current.attempt ?? 1) + 1,
        checkpoint: null,
        result: null,
        problem: null,
      });
      await this.#write(next);
      await this.#deleteCheckpoint(taskId);
      return clone(next);
    });
  }

  async resume(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    TaskRevisionSchema.parse(expectedRevision);
    return this.#withLock(async () => {
      const current = await this.#readRequired(taskId);
      this.#assertRetryableFailure(current, expectedRevision);
      if (!current.checkpoint) {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          `Database task "${taskId}" has no durable checkpoint to resume`,
          { taskId },
        );
      }
      const checkpoint = await this.#readCheckpointRequired(taskId);
      this.#assertCheckpointMatches(current, checkpoint);
      const next = finalizeTask({
        ...withoutRevision(current),
        state: 'queued',
        startedAt: null,
        finishedAt: null,
        cancellable: current.operation !== 'bulk',
        progress: {
          ...current.progress,
          completed: checkpoint.completed,
          message: `Queued from checkpoint ${checkpoint.sequence}`,
        },
        attempt: (current.attempt ?? 1) + 1,
        result: null,
        problem: null,
      });
      await this.#write(next);
      return clone(next);
    });
  }

  async succeed(
    taskId: string,
    expectedRevision: string,
    result: Record<string, unknown>,
  ): Promise<DatabaseTask> {
    const task = await this.#transition(taskId, expectedRevision, ['running'], (current) => ({
      ...withoutRevision(current),
      state: 'succeeded',
      finishedAt: this.#now().toISOString(),
      cancellable: false,
      progress: {
        ...current.progress,
        completed: current.progress.total ?? current.progress.completed,
        message: 'Completed',
      },
      result,
    }));
    this.#cancelHandlers.delete(taskId);
    return task;
  }

  async fail(
    taskId: string,
    expectedRevision: string,
    problem: DatabaseTaskProblem,
  ): Promise<DatabaseTask> {
    const task = await this.#transition(
      taskId,
      expectedRevision,
      ['queued', 'running'],
      (current) => ({
        ...withoutRevision(current),
        state: 'failed',
        finishedAt: this.#now().toISOString(),
        cancellable: false,
        progress: { ...current.progress, message: problem.title },
        problem,
      }),
    );
    this.#cancelHandlers.delete(taskId);
    return task;
  }

  async cancel(taskId: string, expectedRevision: string): Promise<DatabaseTask> {
    const task = await this.#transition(
      taskId,
      expectedRevision,
      ['queued', 'running'],
      (current) => {
        if (!current.cancellable) {
          throw new DatabaseTaskStoreError(
            'task_not_cancellable',
            `Database task "${taskId}" cannot be cancelled`,
            { taskId, state: current.state },
          );
        }
        return {
          ...withoutRevision(current),
          state: 'cancelled',
          finishedAt: this.#now().toISOString(),
          cancellable: false,
          progress: { ...current.progress, message: 'Cancelled' },
        };
      },
    );
    const cancel = this.#cancelHandlers.get(taskId);
    this.#cancelHandlers.delete(taskId);
    try {
      cancel?.();
    } catch {
      // The durable cancelled state is authoritative; an executor callback
      // cannot turn cancellation into an HTTP failure or resurrect the task.
    }
    return task;
  }

  /** Fail orphaned running work honestly after a server restart. */
  async recoverInterrupted(): Promise<DatabaseTask[]> {
    if (!(await this.#readAll()).some((task) => task.state === 'running')) return [];
    return this.#withLock(async () => {
      const recovered: DatabaseTask[] = [];
      for (const current of await this.#readAll()) {
        if (current.state !== 'running') continue;
        const next = finalizeTask({
          ...withoutRevision(current),
          state: 'failed',
          finishedAt: this.#now().toISOString(),
          cancellable: false,
          progress: { ...current.progress, message: 'Interrupted by server restart' },
          problem: {
            type: 'urn:ok:error:database-task-interrupted',
            title: 'Database task interrupted',
            status: 503,
            detail: 'The server restarted before the task reached a durable checkpoint.',
            code: 'task_interrupted',
            retryable: true,
          },
        });
        await this.#write(next);
        recovered.push(next);
      }
      return clone(recovered);
    });
  }

  #assertRevision(task: DatabaseTask, expectedRevision: string): void {
    if (task.revision !== expectedRevision) {
      throw new DatabaseTaskStoreError(
        'task_revision_changed',
        `Database task "${task.id}" changed since it was read`,
        {
          taskId: task.id,
          expectedRevision,
          observedRevision: task.revision,
          state: task.state,
        },
      );
    }
  }

  #assertRetryableFailure(task: DatabaseTask, expectedRevision: string): void {
    this.#assertRevision(task, expectedRevision);
    if (task.state !== 'failed' || task.problem?.retryable !== true) {
      throw new DatabaseTaskStoreError(
        'invalid_task_transition',
        `Database task "${task.id}" is not a retryable failure`,
        { taskId: task.id, state: task.state, retryable: task.problem?.retryable ?? false },
      );
    }
  }

  #assertCheckpointMatches(task: DatabaseTask, checkpoint: DatabaseTaskCheckpoint): void {
    if (
      !task.checkpoint ||
      checkpoint.taskId !== task.id ||
      checkpoint.operation !== task.operation ||
      checkpoint.id !== task.checkpoint.id ||
      checkpoint.sequence !== task.checkpoint.sequence ||
      checkpoint.completed !== task.checkpoint.completed ||
      checkpoint.savedAt !== task.checkpoint.savedAt
    ) {
      throw new DatabaseTaskStoreError(
        'task_store_corrupt',
        'Database task checkpoint does not match its public durable metadata',
        { taskId: task.id, checkpointId: checkpoint.id },
      );
    }
  }

  async #transition(
    taskId: string,
    expectedRevision: string,
    allowedStates: readonly DatabaseTaskState[],
    mutate: (current: DatabaseTask) => Omit<DatabaseTask, 'revision'>,
  ): Promise<DatabaseTask> {
    TaskRevisionSchema.parse(expectedRevision);
    return this.#withLock(async () => {
      const current = await this.#readRequired(taskId);
      this.#assertRevision(current, expectedRevision);
      if (!allowedStates.includes(current.state)) {
        throw new DatabaseTaskStoreError(
          'invalid_task_transition',
          `Database task "${taskId}" cannot transition from ${current.state}`,
          { taskId, state: current.state, allowedStates },
        );
      }
      const next = finalizeTask(mutate(current));
      await this.#write(next);
      return clone(next);
    });
  }

  #path(taskId: string): string {
    if (!/^task_[a-z0-9]+$/i.test(taskId)) {
      throw new DatabaseTaskStoreError('invalid_task', 'Database task ID is invalid', { taskId });
    }
    return resolve(this.#root, `${taskId}.json`);
  }

  #checkpointPath(taskId: string): string {
    this.#path(taskId);
    return resolve(this.#root, `${taskId}.checkpoint`);
  }

  #inputPath(taskId: string): string {
    this.#path(taskId);
    return resolve(this.#root, `${taskId}.input`);
  }

  async #nextId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const taskId = `task_${this.#generateUuid().replaceAll('-', '').toLowerCase()}`;
      const path = this.#path(taskId);
      try {
        const stats = await lstat(path);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          throw new DatabaseTaskStoreError(
            'task_store_unsafe',
            'Database task ID collided with an unsafe filesystem entry',
            { path, taskId },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseTaskStoreError) throw error;
        if (errno(error) === 'ENOENT') return taskId;
        throw error;
      }
    }
    throw new DatabaseTaskStoreError(
      'invalid_task',
      'Unable to allocate a unique database task ID',
    );
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#assertSafeRoot(true);
    try {
      return await withFileLock(this.#lockPath, operation);
    } catch (error) {
      if (error instanceof DatabaseTaskStoreError) throw error;
      throw new DatabaseTaskStoreError(
        'task_store_io_error',
        `Database task store operation failed${errno(error) ? ` (${errno(error)})` : ''}`,
        {},
        error,
      );
    }
  }

  async #assertSafeRoot(create: boolean): Promise<void> {
    const segments = ['.ok', 'local', 'database-tasks', 'v1'];
    let current = this.#projectDir;
    for (const segment of segments) {
      current = resolve(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseTaskStoreError(
            'task_store_unsafe',
            'Database task storage path is not a safe directory',
            { path: current },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseTaskStoreError) throw error;
        if (errno(error) !== 'ENOENT') {
          throw new DatabaseTaskStoreError(
            'task_store_io_error',
            'Database task storage path cannot be inspected',
            { path: current },
            error,
          );
        }
        if (!create) return;
        try {
          await tracedMkdir(current, { recursive: false, mode: 0o700 });
        } catch (mkdirError) {
          if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
          const stats = await lstat(current);
          if (stats.isSymbolicLink() || !stats.isDirectory()) {
            throw new DatabaseTaskStoreError(
              'task_store_unsafe',
              'Database task storage path raced with an unsafe filesystem entry',
              { path: current },
            );
          }
        }
      }
    }
  }

  async #readAll(): Promise<DatabaseTask[]> {
    await this.#assertSafeRoot(false);
    let names: string[];
    try {
      names = (await readdir(this.#root)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      if (errno(error) === 'ENOENT') return [];
      throw new DatabaseTaskStoreError(
        'task_store_io_error',
        'Database task directory cannot be read',
        {},
        error,
      );
    }
    const tasks: DatabaseTask[] = [];
    for (const name of names) {
      const path = resolve(this.#root, name);
      try {
        const stats = await lstat(path);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          throw new DatabaseTaskStoreError(
            'task_store_unsafe',
            'Database task entry is not a safe regular file',
            { path },
          );
        }
        const task = DatabaseTaskSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        if (`${task.id}.json` !== name) {
          throw new DatabaseTaskStoreError(
            'task_store_corrupt',
            'Database task filename does not match its stable ID',
            { path, taskId: task.id },
          );
        }
        const { revision, ...body } = task;
        if (revisionFor(body) !== revision) {
          throw new DatabaseTaskStoreError(
            'task_store_corrupt',
            'Database task revision does not match its durable content',
            { path, taskId: task.id },
          );
        }
        tasks.push(task);
      } catch (error) {
        if (error instanceof DatabaseTaskStoreError) throw error;
        throw new DatabaseTaskStoreError(
          'task_store_corrupt',
          'Database task entry is corrupt or unreadable',
          { path },
          error,
        );
      }
    }
    return tasks;
  }

  async #readRequired(taskId: string): Promise<DatabaseTask> {
    const path = this.#path(taskId);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseTaskStoreError(
          'task_store_unsafe',
          'Database task entry is not a safe regular file',
          { path, taskId },
        );
      }
      const task = DatabaseTaskSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      if (task.id !== taskId) {
        throw new DatabaseTaskStoreError(
          'task_store_corrupt',
          'Database task file contains a different stable ID',
          { path, taskId, observedTaskId: task.id },
        );
      }
      const { revision, ...body } = task;
      if (revisionFor(body) !== revision) {
        throw new DatabaseTaskStoreError(
          'task_store_corrupt',
          'Database task revision does not match its durable content',
          { path, taskId },
        );
      }
      return task;
    } catch (error) {
      if (error instanceof DatabaseTaskStoreError) throw error;
      if (errno(error) === 'ENOENT') {
        throw new DatabaseTaskStoreError(
          'task_not_found',
          `Database task "${taskId}" was not found`,
          { taskId },
        );
      }
      throw new DatabaseTaskStoreError(
        'task_store_corrupt',
        'Database task entry is corrupt or unreadable',
        { path, taskId },
        error,
      );
    }
  }

  async #readCheckpointRequired(taskId: string): Promise<DatabaseTaskCheckpoint> {
    const path = this.#checkpointPath(taskId);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseTaskStoreError(
          'task_store_unsafe',
          'Database task checkpoint is not a safe regular file',
          { path, taskId },
        );
      }
      const checkpoint = DatabaseTaskCheckpointSchema.parse(
        JSON.parse(await readFile(path, 'utf8')),
      );
      const { revision, ...body } = checkpoint;
      const expectedRevision = `sha256:${createHash('sha256')
        .update(stableJson(body))
        .digest('hex')}`;
      if (revision !== expectedRevision) {
        throw new DatabaseTaskStoreError(
          'task_store_corrupt',
          'Database task checkpoint revision does not match its durable content',
          { path, taskId },
        );
      }
      return checkpoint;
    } catch (error) {
      if (error instanceof DatabaseTaskStoreError) throw error;
      throw new DatabaseTaskStoreError(
        'task_store_corrupt',
        'Database task checkpoint is missing, corrupt, or unreadable',
        { path, taskId },
        error,
      );
    }
  }

  async #writeCheckpoint(checkpoint: DatabaseTaskCheckpoint): Promise<void> {
    await atomicWriteFile(
      this.#checkpointPath(checkpoint.taskId),
      `${JSON.stringify(checkpoint, null, 2)}\n`,
      { fs: tracedAtomicFs, mode: 0o600 },
    );
  }

  async #writeInput(input: DatabaseTaskInput): Promise<void> {
    await atomicWriteFile(this.#inputPath(input.taskId), `${JSON.stringify(input, null, 2)}\n`, {
      fs: tracedAtomicFs,
      mode: 0o600,
    });
  }

  async #deleteCheckpoint(taskId: string): Promise<void> {
    try {
      await unlink(this.#checkpointPath(taskId));
    } catch (error) {
      if (errno(error) !== 'ENOENT') throw error;
    }
  }

  async #write(task: DatabaseTask): Promise<void> {
    await atomicWriteFile(this.#path(task.id), `${JSON.stringify(task, null, 2)}\n`, {
      fs: tracedAtomicFs,
      mode: 0o600,
    });
  }
}

export function createDatabaseTaskStore(options: {
  projectDir: string;
  now?: () => Date;
  generateUuid?: () => string;
}): DatabaseTaskStore {
  return new DatabaseTaskStore(options);
}
