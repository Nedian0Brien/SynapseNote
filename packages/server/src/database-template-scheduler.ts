import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  DatabaseDefinition,
  DatabaseTemplate,
  DatabaseTemplateRepeat,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import type { DatabaseStore } from './database-store.ts';

const MAX_RUNS = 1_000;
export const DatabaseTemplateRunSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('tplrun_'),
    databaseId: z.string().startsWith('db_'),
    templateId: z.string().startsWith('tpl_'),
    ownerId: z.string().startsWith('person_'),
    scheduledFor: z.string().datetime(),
    state: z.enum(['retry_wait', 'succeeded', 'failed']),
    attempt: z.number().int().positive(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    nextAttemptAt: z.string().datetime().nullable(),
    recordIds: z.array(z.string().startsWith('rec_')).max(100),
    error: z.string().max(2_000).nullable(),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export type DatabaseTemplateRun = z.infer<typeof DatabaseTemplateRunSchema>;

const HistorySchema = z
  .object({ version: z.literal(1), runs: z.array(DatabaseTemplateRunSchema).max(MAX_RUNS) })
  .strict();

export interface ExecuteDatabaseTemplateInput {
  definition: DatabaseDefinition;
  template: DatabaseTemplate;
  scheduledFor: string;
  runId: string;
  attempt: number;
}

export interface CreateDatabaseTemplateSchedulerOptions {
  projectDir: string;
  databaseStore: DatabaseStore;
  execute: (input: ExecuteDatabaseTemplateInput) => Promise<{ recordIds: string[] }>;
  now?: () => Date;
  generateUuid?: () => string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function finalize(run: Omit<DatabaseTemplateRun, 'revision'>): DatabaseTemplateRun {
  const revision = `sha256:${createHash('sha256').update(stable(run)).digest('hex')}`;
  return DatabaseTemplateRunSchema.parse({ ...run, revision });
}

function localParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

function zonedInstant(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date | null {
  const desired = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let guess = desired;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = localParts(new Date(guess), timeZone);
    const observedUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    guess += desired - observedUtc;
  }
  const result = new Date(guess);
  const observed = localParts(result, timeZone);
  return observed.year === local.year &&
    observed.month === local.month &&
    observed.day === local.day &&
    observed.hour === local.hour &&
    observed.minute === local.minute
    ? result
    : null;
}

function shiftedLocalDate(
  local: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function isoWeekday(local: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay() || 7;
}

export function latestDatabaseTemplateOccurrence(
  repeat: DatabaseTemplateRepeat,
  now: Date,
): Date | null {
  if (repeat.schedule.kind === 'interval') {
    const anchor = Date.parse(repeat.schedule.anchor);
    const unitMs =
      repeat.schedule.unit === 'hours'
        ? 3_600_000
        : repeat.schedule.unit === 'days'
          ? 86_400_000
          : 604_800_000;
    const interval = unitMs * repeat.schedule.every;
    if (now.getTime() < anchor) return null;
    return new Date(anchor + Math.floor((now.getTime() - anchor) / interval) * interval);
  }

  const current = localParts(now, repeat.timeZone);
  const [hour, minute] = repeat.schedule.time.split(':').map(Number) as [number, number];
  const lookback =
    repeat.schedule.kind === 'monthly' ? 40 : repeat.schedule.kind === 'weekly' ? 8 : 2;
  for (let offset = 0; offset <= lookback; offset += 1) {
    const date = shiftedLocalDate(current, -offset);
    if (repeat.schedule.kind === 'weekly' && !repeat.schedule.weekdays.includes(isoWeekday(date))) {
      continue;
    }
    if (repeat.schedule.kind === 'monthly' && date.day !== repeat.schedule.day) continue;
    const candidate = zonedInstant({ ...date, hour, minute }, repeat.timeZone);
    if (candidate && candidate.getTime() <= now.getTime()) return candidate;
  }
  return null;
}

export class DatabaseTemplateScheduler {
  readonly #historyPath: string;
  readonly #lockPath: string;
  readonly #databaseStore: DatabaseStore;
  readonly #execute: CreateDatabaseTemplateSchedulerOptions['execute'];
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  #running = false;

  constructor(options: CreateDatabaseTemplateSchedulerOptions) {
    this.#historyPath = resolve(options.projectDir, '.ok', 'local', 'database-template-runs.json');
    this.#lockPath = resolve(
      options.projectDir,
      '.ok',
      'local',
      '.database-template-scheduler.lock',
    );
    this.#databaseStore = options.databaseStore;
    this.#execute = options.execute;
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  async list(
    limit = 100,
    filter: { databaseId?: string; templateId?: string } = {},
  ): Promise<DatabaseTemplateRun[]> {
    const history = await this.#read();
    return history.runs
      .filter(
        (run) =>
          (filter.databaseId === undefined || run.databaseId === filter.databaseId) &&
          (filter.templateId === undefined || run.templateId === filter.templateId),
      )
      .slice(0, Math.max(1, Math.min(limit, 500)))
      .map((run) => structuredClone(run));
  }

  async tick(): Promise<DatabaseTemplateRun[]> {
    if (this.#running) return [];
    this.#running = true;
    try {
      await mkdir(dirname(this.#lockPath), { recursive: true });
      return await withFileLock(this.#lockPath, async () => this.#tickLocked());
    } finally {
      this.#running = false;
    }
  }

  async #tickLocked(): Promise<DatabaseTemplateRun[]> {
    const now = this.#now();
    const history = await this.#read();
    const changed: DatabaseTemplateRun[] = [];
    for (const definition of this.#databaseStore.snapshot().databases) {
      for (const template of definition.templates) {
        if (!template.repeat || template.repeat.paused || template.archivedAt !== null) continue;
        const pending = history.runs.find(
          (candidate) =>
            candidate.databaseId === definition.id &&
            candidate.templateId === template.id &&
            candidate.state === 'retry_wait',
        );
        const occurrence = pending
          ? new Date(pending.scheduledFor)
          : latestDatabaseTemplateOccurrence(template.repeat, now);
        if (!occurrence) continue;
        const scheduledFor = occurrence.toISOString();
        let run =
          pending ??
          history.runs.find(
            (candidate) =>
              candidate.databaseId === definition.id &&
              candidate.templateId === template.id &&
              candidate.scheduledFor === scheduledFor,
          );
        if (run?.state === 'succeeded' || run?.state === 'failed') continue;
        if (run?.nextAttemptAt && Date.parse(run.nextAttemptAt) > now.getTime()) continue;
        const attempt = (run?.attempt ?? 0) + 1;
        const runId = run?.id ?? `tplrun_${this.#generateUuid().replaceAll('-', '')}`;
        const startedAt = run?.startedAt ?? now.toISOString();
        run = finalize({
          version: 1,
          id: runId,
          databaseId: definition.id,
          templateId: template.id,
          ownerId: template.repeat.ownerId,
          scheduledFor,
          state: 'retry_wait',
          attempt,
          startedAt,
          finishedAt: null,
          nextAttemptAt: null,
          recordIds: [],
          error: null,
        });
        history.runs = [run, ...history.runs.filter((candidate) => candidate.id !== runId)].slice(
          0,
          MAX_RUNS,
        );
        await this.#write(history);
        try {
          const result = await this.#execute({
            definition,
            template,
            scheduledFor,
            runId,
            attempt,
          });
          run = finalize({
            version: 1,
            id: runId,
            databaseId: definition.id,
            templateId: template.id,
            ownerId: template.repeat.ownerId,
            scheduledFor,
            state: 'succeeded',
            attempt,
            startedAt,
            finishedAt: this.#now().toISOString(),
            nextAttemptAt: null,
            recordIds: result.recordIds,
            error: null,
          });
        } catch (error) {
          const exhausted = attempt >= template.repeat.retry.maxAttempts;
          const delay =
            template.repeat.retry.initialBackoffSeconds *
            template.repeat.retry.multiplier ** Math.max(0, attempt - 1);
          run = finalize({
            version: 1,
            id: runId,
            databaseId: definition.id,
            templateId: template.id,
            ownerId: template.repeat.ownerId,
            scheduledFor,
            state: exhausted ? 'failed' : 'retry_wait',
            attempt,
            startedAt,
            finishedAt: exhausted ? this.#now().toISOString() : null,
            nextAttemptAt: exhausted ? null : new Date(now.getTime() + delay * 1_000).toISOString(),
            recordIds: [],
            error: error instanceof Error ? error.message.slice(0, 2_000) : 'Template run failed',
          });
        }
        history.runs = [run, ...history.runs.filter((candidate) => candidate.id !== run?.id)].slice(
          0,
          MAX_RUNS,
        );
        await this.#write(history);
        changed.push(structuredClone(run));
      }
    }
    return changed;
  }

  async #read(): Promise<z.infer<typeof HistorySchema>> {
    try {
      return HistorySchema.parse(JSON.parse(await readFile(this.#historyPath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, runs: [] };
      throw error;
    }
  }

  async #write(history: z.infer<typeof HistorySchema>): Promise<void> {
    await mkdir(dirname(this.#historyPath), { recursive: true });
    await atomicWriteFile(
      this.#historyPath,
      `${JSON.stringify(HistorySchema.parse(history), null, 2)}\n`,
    );
  }
}

export function createDatabaseTemplateScheduler(
  options: CreateDatabaseTemplateSchedulerOptions,
): DatabaseTemplateScheduler {
  return new DatabaseTemplateScheduler(options);
}
