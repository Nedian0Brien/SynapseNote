import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseRecordActorSchema } from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

/**
 * Finished journal entries kept on disk. Large enough that the recent history
 * a manual recovery would reach for is still there, small enough that the
 * directory cannot grow without bound.
 */
export const DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION = 50;

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const JournalFileSchema = z
  .object({
    path: z.string().min(1).max(2_000),
    beforeSha256: Sha256Schema.nullable(),
    afterSha256: Sha256Schema.nullable(),
    before: z.string().nullable(),
    after: z.string().nullable(),
  })
  .strict();
const JournalSchema = z
  .object({
    version: z.literal(1),
    mutationId: z.string().startsWith('mut_'),
    state: z.enum(['prepared', 'writing', 'committed', 'rolled_back', 'recovery_required']),
    checkpoint: z.number().int().nonnegative(),
    files: z.array(JournalFileSchema).min(1).max(4),
    actor: DatabaseRecordActorSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    history: z
      .object({
        operation: z.string().min(1).max(64),
        databaseId: z.string().min(1).max(256),
        sourceId: z.string().min(1).max(256),
        recordId: z.string().min(1).max(256).optional(),
        propertyId: z.string().min(1).max(256).optional(),
        beforeRevision: Sha256Schema.nullable(),
        afterRevision: Sha256Schema.nullable(),
      })
      .optional(),
  })
  .strict();

export type DatabaseMarkdownTableJournalEntry = z.infer<typeof JournalSchema>;

function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  return (async () => {
    await mkdir(resolve(path, '..'), { recursive: true });
    try {
      await writeFile(temp, `${JSON.stringify(value)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  })();
}

export class DatabaseMarkdownTableJournal {
  readonly #root: string;

  constructor(projectDir: string) {
    this.#root = resolve(projectDir, '.ok', 'local', 'database-markdown-table-transactions');
  }

  async prepare(
    input: Omit<
      DatabaseMarkdownTableJournalEntry,
      'version' | 'state' | 'checkpoint' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<DatabaseMarkdownTableJournalEntry> {
    const now = new Date().toISOString();
    const entry = JournalSchema.parse({
      ...input,
      version: 1,
      state: 'prepared',
      checkpoint: 0,
      createdAt: now,
      updatedAt: now,
    });
    const path = resolve(this.#root, `${entry.mutationId}.json`);
    try {
      const existing = JournalSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      if (JSON.stringify(existing.files) !== JSON.stringify(entry.files))
        throw new Error(`Journal ${entry.mutationId} already contains a different transaction`);
      return existing;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeJson(path, entry);
      return entry;
    }
  }

  async checkpoint(
    mutationId: string,
    state: DatabaseMarkdownTableJournalEntry['state'],
  ): Promise<DatabaseMarkdownTableJournalEntry> {
    const current = await this.get(mutationId);
    const next = JournalSchema.parse({
      ...current,
      state,
      checkpoint: current.checkpoint + 1,
      updatedAt: new Date().toISOString(),
    });
    await writeJson(resolve(this.#root, `${mutationId}.json`), next);
    if (next.state === 'committed' || next.state === 'rolled_back') await this.#prune();
    return next;
  }

  /**
   * Drop finished entries beyond {@link DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION}.
   *
   * Nothing used to remove them. Each entry carries the before AND after bytes
   * of every file the transaction touched — for a v2 row insert that is the
   * whole owner table twice, ~12KB and growing with the table — so one editing
   * session left 176 files and 1.3MB behind, forever. Two things degrade with
   * that pile: `listInflight` reads every entry on boot to find the unfinished
   * ones, and the write of each new entry into an ever-larger directory is
   * where this path's p99 sits (345ms against a 44ms median, with the spike
   * landing in the committed checkpoint every time).
   *
   * Finished entries are kept, not deleted outright: a receipt that cannot
   * recover its own before-bytes is told to fall back to this journal, so the
   * recent window has to stay readable.
   */
  async #prune(): Promise<void> {
    try {
      const names = (await readdir(this.#root)).filter((name) => name.endsWith('.json'));
      // Hysteresis: the sweep is O(entries) in stat calls, so let the directory
      // drift above the cap rather than paying for it on every commit.
      if (names.length <= DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION * 2) return;
      const dated = await Promise.all(
        names.map(async (name) => {
          const path = resolve(this.#root, name);
          try {
            return { name, path, modifiedAt: (await stat(path)).mtimeMs };
          } catch {
            return null;
          }
        }),
      );
      const ordered = dated
        .filter(
          (entry): entry is { name: string; path: string; modifiedAt: number } => entry !== null,
        )
        .sort((left, right) => right.modifiedAt - left.modifiedAt);
      for (const candidate of ordered.slice(DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION)) {
        try {
          const entry = await this.get(candidate.name.slice(0, -5));
          // Never remove work that has not reached a terminal state — that is
          // exactly what recovery needs to find.
          if (entry.state !== 'committed' && entry.state !== 'rolled_back') continue;
          await rm(candidate.path, { force: true });
        } catch {
          // A single unreadable or racing entry must not fail the mutation
          // whose checkpoint triggered the sweep.
        }
      }
    } catch {
      // Pruning is maintenance. It never decides whether a transaction
      // committed, so a failure here is dropped rather than surfaced.
    }
  }

  async get(mutationId: string): Promise<DatabaseMarkdownTableJournalEntry> {
    const path = resolve(this.#root, `${mutationId}.json`);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile())
        throw new Error(`Unsafe v2 transaction journal entry: ${path}`);
      return JournalSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error(`V2 transaction journal ${mutationId} was not found`, { cause: error });
      throw error;
    }
  }

  async listInflight(): Promise<DatabaseMarkdownTableJournalEntry[]> {
    let names: string[];
    try {
      names = (await readdir(this.#root)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: DatabaseMarkdownTableJournalEntry[] = [];
    for (const name of names) {
      const entry = await this.get(name.slice(0, -5));
      if (entry.state !== 'committed' && entry.state !== 'rolled_back') entries.push(entry);
    }
    return entries;
  }
}

export function createDatabaseMarkdownTableJournal(
  projectDir: string,
): DatabaseMarkdownTableJournal {
  return new DatabaseMarkdownTableJournal(projectDir);
}
