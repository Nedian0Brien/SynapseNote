/** Durable, gitignored database mutation/idempotency journal. */

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const UndoFileSchema = z
  .object({
    path: z.string().min(1).max(2_000),
    before: z.string().nullable(),
  })
  .strict();
const RedoFileSchema = z
  .object({
    path: z.string().min(1).max(2_000),
    after: z.string().nullable(),
  })
  .strict();
const CommitEntrySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('commit'),
    requestFingerprint: Sha256Schema,
    undoToken: z.string().regex(/^undo_[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.[A-Za-z0-9_-]+$/),
    undoFiles: z.array(UndoFileSchema).max(100_000).optional(),
    result: z.unknown(),
  })
  .strict();
const RedoEntrySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('redo'),
    mutationId: z.string().regex(/^mut_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    files: z.array(RedoFileSchema).max(100_000),
  })
  .strict();
const UndoEntrySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('undo'),
    idempotencyKeyHash: Sha256Schema,
    requestFingerprint: Sha256Schema,
    result: z.unknown(),
  })
  .strict();
const RepairEntrySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('repair'),
    idempotencyKeyHash: Sha256Schema,
    requestFingerprint: Sha256Schema,
    result: z.unknown(),
  })
  .strict();

export type DurableDatabaseCommitEntry = z.infer<typeof CommitEntrySchema>;
export type DurableDatabaseRedoEntry = z.infer<typeof RedoEntrySchema>;
export type DurableDatabaseUndoEntry = z.infer<typeof UndoEntrySchema>;
export type DurableDatabaseRepairEntry = z.infer<typeof RepairEntrySchema>;

export interface DatabaseTransactionJournalSnapshot {
  commits: DurableDatabaseCommitEntry[];
  redos: DurableDatabaseRedoEntry[];
  undos: DurableDatabaseUndoEntry[];
  repairs: DurableDatabaseRepairEntry[];
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

async function readEntries<T>(
  directory: string,
  schema: z.ZodType<T>,
): Promise<Array<{ path: string; value: T }>> {
  try {
    const stats = await lstat(directory);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`Database transaction journal path is not a safe directory: ${directory}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const entries: Array<{ path: string; value: T }> = [];
  for (const name of names) {
    const path = resolve(directory, name);
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`Database transaction journal entry is not a safe file: ${path}`);
    }
    try {
      entries.push({ path, value: schema.parse(JSON.parse(await readFile(path, 'utf8'))) });
    } catch (error) {
      throw new Error(`Database transaction journal entry is invalid: ${path}`, { cause: error });
    }
  }
  return entries;
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
  const directory = resolve(path, '..');
  await mkdir(directory, { recursive: true });
  try {
    await lstat(path);
    const existing = await readFile(path, 'utf8');
    const serialized = `${stableJson(value)}\n`;
    if (existing === serialized) return;
    throw new Error(
      `Database transaction journal entry already exists with different content: ${path}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${stableJson(value)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(tempPath, path);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export class DatabaseTransactionJournal {
  readonly #root: string;

  constructor(projectDir: string) {
    this.#root = resolve(projectDir, '.ok', 'local', 'database-transactions');
  }

  async load(): Promise<DatabaseTransactionJournalSnapshot> {
    const commits = await readEntries(resolve(this.#root, 'commits'), CommitEntrySchema);
    const redos = await readEntries(resolve(this.#root, 'redos'), RedoEntrySchema);
    const undos = await readEntries(resolve(this.#root, 'undos'), UndoEntrySchema);
    const repairs = await readEntries(resolve(this.#root, 'repairs'), RepairEntrySchema);
    return {
      commits: commits.map((entry) => entry.value),
      redos: redos.map((entry) => entry.value),
      undos: undos.map((entry) => entry.value),
      repairs: repairs.map((entry) => entry.value),
    };
  }

  async persistCommit(
    mutationId: string,
    entry: Omit<DurableDatabaseCommitEntry, 'version' | 'kind'>,
  ): Promise<void> {
    const value = CommitEntrySchema.parse({ version: 1, kind: 'commit', ...entry });
    await writeExclusive(resolve(this.#root, 'commits', `${mutationId}.json`), value);
  }

  async persistUndo(entry: Omit<DurableDatabaseUndoEntry, 'version' | 'kind'>): Promise<void> {
    const value = UndoEntrySchema.parse({ version: 1, kind: 'undo', ...entry });
    const file = entry.idempotencyKeyHash.replace(':', '_');
    await writeExclusive(resolve(this.#root, 'undos', `${file}.json`), value);
  }

  async persistRedo(
    mutationId: string,
    files: ReadonlyArray<{ path: string; after: string | null }>,
  ): Promise<void> {
    const value = RedoEntrySchema.parse({ version: 1, kind: 'redo', mutationId, files });
    await writeExclusive(resolve(this.#root, 'redos', `${mutationId}.json`), value);
  }

  async persistRepair(entry: Omit<DurableDatabaseRepairEntry, 'version' | 'kind'>): Promise<void> {
    const value = RepairEntrySchema.parse({ version: 1, kind: 'repair', ...entry });
    const file = entry.idempotencyKeyHash.replace(':', '_');
    await writeExclusive(resolve(this.#root, 'repairs', `${file}.json`), value);
  }
}

export function createDatabaseTransactionJournal(projectDir: string): DatabaseTransactionJournal {
  return new DatabaseTransactionJournal(projectDir);
}
