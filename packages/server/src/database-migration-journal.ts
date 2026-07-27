/** Durable project-scoped journal for v1→v2 multi-file canonical transitions. */

import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { atomicWriteFile } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import { tracedAtomicFs } from './fs-traced.ts';
import { DatabaseTaskRollbackError } from './database-task-rollback.ts';

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const FileSchema = z
  .object({
    path: z.string().min(1).max(4_000),
    before: z.string().nullable(),
    after: z.string().nullable(),
    beforeSha256: Sha256Schema.nullable(),
    afterSha256: Sha256Schema.nullable(),
  })
  .strict();
const EntrySchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().startsWith('task_'),
    state: z.enum(['prepared', 'staged', 'activated', 'rolled_back', 'recovery_required']),
    files: z.array(FileSchema).max(200_000),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type DatabaseMigrationJournalEntry = z.infer<typeof EntrySchema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function safeRelativePath(path: string): string {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new Error(`Unsafe migration journal path: ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe migration journal path: ${path}`);
  }
  return segments.join('/');
}

export class DatabaseMigrationJournal {
  readonly #projectDir: string;
  readonly #root: string;

  constructor(projectDir: string) {
    this.#projectDir = resolve(projectDir);
    this.#root = resolve(projectDir, '.ok', 'local', 'database-migrations');
  }

  async prepare(input: {
    taskId: string;
    files: readonly { path: string; before: string | null; after: string | null }[];
  }): Promise<DatabaseMigrationJournalEntry> {
    const existing = await this.#read(input.taskId, true);
    const nextFiles = input.files.map((file) => ({
      path: safeRelativePath(file.path),
      before: file.before,
      after: file.after,
      beforeSha256: file.before === null ? null : sha256(file.before),
      afterSha256: file.after === null ? null : sha256(file.after),
    }));
    if (existing.files.length > 0 && stableJson(existing.files) !== stableJson(nextFiles)) {
      throw new Error(`Migration journal target changed between attempts: ${input.taskId}`);
    }
    const value = EntrySchema.parse({
      version: 1,
      taskId: input.taskId,
      // A clean rollback is a safe retry boundary. Reusing the exact target
      // set is intentional; a recovery-required journal remains a hard stop.
      state: existing.state === 'rolled_back' ? 'prepared' : existing.state,
      files: nextFiles,
      updatedAt: new Date().toISOString(),
    });
    await this.#write(value);
    return value;
  }

  async checkpoint(
    taskId: string,
    state: DatabaseMigrationJournalEntry['state'],
  ): Promise<DatabaseMigrationJournalEntry> {
    const current = await this.#read(taskId, false);
    const value = EntrySchema.parse({ ...current, state, updatedAt: new Date().toISOString() });
    await this.#write(value);
    return value;
  }

  async get(taskId: string): Promise<DatabaseMigrationJournalEntry> {
    return this.#read(taskId, false);
  }

  async listInflight(): Promise<readonly DatabaseMigrationJournalEntry[]> {
    return (await this.list()).filter(
      (entry) => entry.state !== 'activated' && entry.state !== 'rolled_back',
    );
  }

  /** List every durable migration journal, including terminal history. */
  async list(): Promise<readonly DatabaseMigrationJournalEntry[]> {
    let names: string[];
    try {
      names = (await readdir(this.#root)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: DatabaseMigrationJournalEntry[] = [];
    for (const name of names) {
      const value = EntrySchema.parse(JSON.parse(await readFile(resolve(this.#root, name), 'utf8')));
      entries.push(value);
    }
    return entries;
  }

  async reset(taskId: string): Promise<void> {
    await rm(resolve(this.#root, `${taskId}.json`), { force: true });
    await rm(resolve(this.#root, taskId), { recursive: true, force: true });
  }

  /**
   * Remove task-scoped staging/backup material only after the caller has
   * enforced its retention and undo policy. The journal itself is retained so
   * recovery history and before/after hashes remain inspectable without
   * retaining user content bytes.
   */
  async cleanup(taskId: string): Promise<{ taskId: string; removed: boolean }> {
    const journal = await this.#read(taskId, false);
    if (journal.state !== 'activated' && journal.state !== 'rolled_back') {
      throw new Error(`Migration task ${taskId} is not at a cleanup boundary`);
    }
    await rm(resolve(this.#root, taskId), { recursive: true, force: true });
    return { taskId, removed: true };
  }

  async hasTaskMaterial(taskId: string): Promise<boolean> {
    try {
      const stats = await lstat(resolve(this.#root, taskId));
      return stats.isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async rollback(taskId: string): Promise<{ taskId: string; restored: number; status: 'applied' | 'already_applied' }> {
    const journal = await this.#read(taskId, false);
    if (journal.state === 'rolled_back') return { taskId, restored: journal.files.length, status: 'already_applied' };
    let observed: Array<{
      file: DatabaseMigrationJournalEntry['files'][number];
      absolute: string;
      current: string | null;
      hash: string | null;
    }>;
    try {
      observed = await Promise.all(
        journal.files.map(async (file) => {
          const absolute = this.#absolute(file.path);
          await this.#assertNoSymlinkComponents(file.path);
          const current = await readFile(absolute, 'utf8').catch(() => null);
          return { file, absolute, current, hash: current === null ? null : sha256(current) };
        }),
      );
    } catch (error) {
      await this.checkpoint(taskId, 'recovery_required').catch(() => undefined);
      throw error;
    }
    const conflicts = observed.filter(({ file, hash }) => hash !== file.beforeSha256 && hash !== file.afterSha256);
    if (conflicts.length > 0) {
      await this.checkpoint(taskId, 'recovery_required');
      throw new DatabaseTaskRollbackError(
        'rollback_conflict',
        'Migration rollback blocked by external edits.',
        {
          paths: conflicts.map(({ file }) => file.path),
          count: conflicts.length,
        },
      );
    }
    const applied: typeof observed = [];
    try {
      for (const item of observed) {
        if (item.hash === item.file.beforeSha256) continue;
        if (item.file.before === null) {
          await rm(item.absolute, { force: true });
        } else {
          await mkdir(dirname(item.absolute), { recursive: true });
          await atomicWriteFile(item.absolute, item.file.before, { fs: tracedAtomicFs });
        }
        applied.push(item);
      }
    } catch (error) {
      await this.checkpoint(taskId, 'recovery_required').catch(() => undefined);
      throw error;
    }
    await this.checkpoint(taskId, 'rolled_back');
    return { taskId, restored: applied.length, status: 'applied' };
  }

  #absolute(path: string): string {
    const safe = safeRelativePath(path);
    const absolute = resolve(this.#projectDir, safe);
    const rel = relative(this.#projectDir, absolute);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Migration path escapes project root: ${path}`);
    return absolute;
  }

  async #assertNoSymlinkComponents(path: string): Promise<void> {
    const safe = safeRelativePath(path);
    let current = this.#projectDir;
    for (const segment of safe.split('/')) {
      current = resolve(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink()) throw new Error(`Migration target is a symbolic link: ${path}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
    }
  }

  async #read(taskId: string, create: boolean): Promise<DatabaseMigrationJournalEntry> {
    const path = resolve(this.#root, `${taskId}.json`);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Migration journal is not a regular file: ${path}`);
      return EntrySchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) throw new Error(`Migration journal not found: ${taskId}`);
      return { version: 1, taskId, state: 'prepared', files: [], updatedAt: new Date().toISOString() };
    }
  }

  async #write(value: DatabaseMigrationJournalEntry): Promise<void> {
    await mkdir(this.#root, { recursive: true });
    const path = resolve(this.#root, `${value.taskId}.json`);
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, `${stableJson(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }
}

export function createDatabaseMigrationJournal(projectDir: string): DatabaseMigrationJournal {
  return new DatabaseMigrationJournal(projectDir);
}
