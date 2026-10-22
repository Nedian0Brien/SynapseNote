import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { atomicWriteFile } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import { incrementDatabaseTaskRollbackApplied } from './database-telemetry.ts';
import { tracedAtomicFs } from './fs-traced.ts';

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const JournalSchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().startsWith('task_'),
    state: z.enum(['available', 'rolled_back']),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(2_000),
            before: z.string(),
            beforeSha256: Sha256Schema,
            afterSha256: Sha256Schema,
          })
          .strict(),
      )
      .max(100_000),
  })
  .strict();

type Journal = z.infer<typeof JournalSchema>;

export interface DatabaseTaskRollbackResult {
  taskId: string;
  status: 'applied' | 'already_applied';
  restored: number;
}

export class DatabaseTaskRollbackError extends Error {
  readonly code: 'rollback_unavailable' | 'rollback_conflict';
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseTaskRollbackError['code'],
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabaseTaskRollbackError';
    this.code = code;
    this.details = details;
  }
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function safePath(root: string, path: string): string {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!path || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new DatabaseTaskRollbackError('rollback_conflict', 'Rollback path escapes content root', {
      path,
    });
  }
  return absolute;
}

export class DatabaseTaskRollbackJournal {
  readonly #contentDir: string;
  readonly #projectDir: string;
  readonly #root: string;

  constructor(projectDir: string, contentDir: string) {
    this.#projectDir = resolve(projectDir);
    this.#contentDir = resolve(contentDir);
    this.#root = resolve(projectDir, '.ok', 'local', 'database-task-rollbacks');
  }

  async prepare(input: {
    taskId: string;
    path: string;
    before: string;
    afterSha256: string;
  }): Promise<void> {
    safePath(this.#contentDir, input.path);
    Sha256Schema.parse(input.afterSha256);
    const current = await this.#read(input.taskId, true);
    if (current.state !== 'available') {
      throw new DatabaseTaskRollbackError(
        'rollback_conflict',
        'A rolled-back task cannot prepare additional files',
      );
    }
    const existing = current.files.find((file) => file.path === input.path);
    const entry = {
      path: input.path,
      before: input.before,
      beforeSha256: sha256(input.before),
      afterSha256: input.afterSha256,
    };
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(entry)) {
        throw new DatabaseTaskRollbackError(
          'rollback_conflict',
          'Rollback journal target changed between attempts',
          { path: input.path },
        );
      }
      return;
    }
    await this.#write({ ...current, files: [...current.files, entry] });
  }

  async rollback(taskId: string): Promise<DatabaseTaskRollbackResult> {
    const journal = await this.#read(taskId, false);
    if (journal.state === 'rolled_back') {
      return { taskId, status: 'already_applied', restored: journal.files.length };
    }
    const observed = await Promise.all(
      journal.files.map(async (file) => {
        const absolute = safePath(this.#contentDir, file.path);
        const stats = await lstat(absolute).catch(() => null);
        if (!stats?.isFile() || stats.isSymbolicLink()) {
          return { file, absolute, sha256: null, content: null };
        }
        const [contentRoot, target] = await Promise.all([
          realpath(this.#contentDir),
          realpath(absolute),
        ]);
        const escaped = relative(contentRoot, target);
        if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
          return { file, absolute, sha256: null, content: null };
        }
        const content = await readFile(absolute, 'utf8');
        return { file, absolute, sha256: sha256(content), content };
      }),
    );
    const conflicts = observed
      .filter(
        ({ file, sha256: observedSha }) =>
          observedSha !== file.beforeSha256 && observedSha !== file.afterSha256,
      )
      .map(({ file, sha256: observedSha }) => ({
        path: file.path,
        expectedAfterSha256: file.afterSha256,
        observedSha256: observedSha,
      }));
    if (conflicts.length > 0) {
      throw new DatabaseTaskRollbackError(
        'rollback_conflict',
        'Rollback refused because imported files changed after the task',
        { conflicts },
      );
    }
    const applied: typeof observed = [];
    try {
      for (const item of observed) {
        if (item.sha256 === item.file.beforeSha256) continue;
        await atomicWriteFile(item.absolute, item.file.before, { fs: tracedAtomicFs });
        applied.push(item);
      }
    } catch {
      const compensationErrors: string[] = [];
      for (const item of [...applied].reverse()) {
        try {
          if (item.content === null) throw new Error('missing compensation bytes');
          await atomicWriteFile(item.absolute, item.content, { fs: tracedAtomicFs });
        } catch {
          compensationErrors.push(item.file.path);
        }
      }
      throw new DatabaseTaskRollbackError(
        'rollback_conflict',
        compensationErrors.length > 0
          ? 'Rollback failed and compensation was incomplete'
          : 'Rollback write failed and every attempted file was restored to its post-task state',
        { compensationErrors },
      );
    }
    await this.#write({ ...journal, state: 'rolled_back' });
    incrementDatabaseTaskRollbackApplied();
    return { taskId, status: 'applied', restored: applied.length };
  }

  async isRolledBack(taskId: string): Promise<boolean> {
    try {
      return (await this.#read(taskId, false)).state === 'rolled_back';
    } catch (error) {
      if (error instanceof DatabaseTaskRollbackError && error.code === 'rollback_unavailable')
        return false;
      throw error;
    }
  }

  async resetRolledBack(taskId: string): Promise<void> {
    if (!(await this.isRolledBack(taskId))) return;
    const path = resolve(this.#root, `${taskId}.json`);
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new DatabaseTaskRollbackError(
        'rollback_conflict',
        'Rollback journal is not a safe regular file',
      );
    }
    await rm(path);
  }

  async #read(taskId: string, create: boolean): Promise<Journal> {
    const path = resolve(this.#root, `${taskId}.json`);
    let raw: string;
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseTaskRollbackError(
          'rollback_conflict',
          'Rollback journal is not a safe regular file',
        );
      }
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) {
        throw new DatabaseTaskRollbackError(
          'rollback_unavailable',
          `Database task "${taskId}" has no rollback journal`,
        );
      }
      return { version: 1, taskId, state: 'available', files: [] };
    }
    // The journal is written via write-temp-then-rename (see `#write`), so a
    // crash mid-write cannot torn-write the file at `path` itself — but the
    // bytes on disk can still be corrupt for other reasons (manual edit,
    // filesystem-level corruption, an out-of-process writer). JSON.parse and
    // schema validation must not leak an untyped SyntaxError/ZodError past
    // this class's documented `DatabaseTaskRollbackError` contract.
    try {
      return JournalSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new DatabaseTaskRollbackError(
        'rollback_conflict',
        `Rollback journal for task "${taskId}" is corrupt`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async #write(journal: Journal): Promise<void> {
    const parsed = JournalSchema.parse(journal);
    await this.#ensureRoot();
    const path = resolve(this.#root, `${parsed.taskId}.json`);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(parsed)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async #ensureRoot(): Promise<void> {
    for (const directory of [
      resolve(this.#projectDir, '.ok'),
      resolve(this.#projectDir, '.ok', 'local'),
      this.#root,
    ]) {
      try {
        const stats = await lstat(directory);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseTaskRollbackError(
            'rollback_conflict',
            'Rollback journal directory is not a safe directory',
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await mkdir(directory, { mode: 0o700 });
      }
    }
  }
}

export function createDatabaseTaskRollbackJournal(
  projectDir: string,
  contentDir: string,
): DatabaseTaskRollbackJournal {
  return new DatabaseTaskRollbackJournal(projectDir, contentDir);
}
