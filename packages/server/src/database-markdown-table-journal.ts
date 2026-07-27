import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const JournalFileSchema = z.object({
  path: z.string().min(1).max(2_000),
  beforeSha256: Sha256Schema.nullable(),
  afterSha256: Sha256Schema.nullable(),
  before: z.string().nullable(),
  after: z.string().nullable(),
}).strict();
const JournalSchema = z.object({
  version: z.literal(1),
  mutationId: z.string().startsWith('mut_'),
  state: z.enum(['prepared', 'writing', 'committed', 'rolled_back', 'recovery_required']),
  checkpoint: z.number().int().nonnegative(),
  files: z.array(JournalFileSchema).min(1).max(4),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type DatabaseMarkdownTableJournalEntry = z.infer<typeof JournalSchema>;

function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  return (async () => {
    await mkdir(resolve(path, '..'), { recursive: true });
    try {
      await writeFile(temp, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
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

  async prepare(input: Omit<DatabaseMarkdownTableJournalEntry, 'version' | 'state' | 'checkpoint' | 'createdAt' | 'updatedAt'>): Promise<DatabaseMarkdownTableJournalEntry> {
    const now = new Date().toISOString();
    const entry = JournalSchema.parse({ ...input, version: 1, state: 'prepared', checkpoint: 0, createdAt: now, updatedAt: now });
    const path = resolve(this.#root, `${entry.mutationId}.json`);
    try {
      const existing = JournalSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      if (JSON.stringify(existing.files) !== JSON.stringify(entry.files)) throw new Error(`Journal ${entry.mutationId} already contains a different transaction`);
      return existing;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeJson(path, entry);
      return entry;
    }
  }

  async checkpoint(mutationId: string, state: DatabaseMarkdownTableJournalEntry['state']): Promise<DatabaseMarkdownTableJournalEntry> {
    const current = await this.get(mutationId);
    const next = JournalSchema.parse({ ...current, state, checkpoint: current.checkpoint + 1, updatedAt: new Date().toISOString() });
    await writeJson(resolve(this.#root, `${mutationId}.json`), next);
    return next;
  }

  async get(mutationId: string): Promise<DatabaseMarkdownTableJournalEntry> {
    const path = resolve(this.#root, `${mutationId}.json`);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Unsafe v2 transaction journal entry: ${path}`);
      return JournalSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`V2 transaction journal ${mutationId} was not found`, { cause: error });
      throw error;
    }
  }

  async listInflight(): Promise<DatabaseMarkdownTableJournalEntry[]> {
    let names: string[];
    try { names = (await readdir(this.#root)).filter((name) => name.endsWith('.json')).sort(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const entries: DatabaseMarkdownTableJournalEntry[] = [];
    for (const name of names) {
      const entry = await this.get(name.slice(0, -5));
      if (entry.state !== 'committed' && entry.state !== 'rolled_back') entries.push(entry);
    }
    return entries;
  }
}

export function createDatabaseMarkdownTableJournal(projectDir: string): DatabaseMarkdownTableJournal {
  return new DatabaseMarkdownTableJournal(projectDir);
}
