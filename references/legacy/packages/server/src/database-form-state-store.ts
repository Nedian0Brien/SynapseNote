import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';

const MAX_RECEIPTS = 100_000;
const MAX_RATE_KEYS = 10_000;
const MAX_RATE_EVENTS = 20_000;

const FormSubmissionResultSchema = z
  .object({
    status: z.literal('created'),
    recordId: z.string().startsWith('rec_'),
    submittedAt: z.string().datetime(),
    idempotentReplay: z.boolean(),
    confirmation: z
      .object({
        title: z.string(),
        message: z.string(),
        allowAnotherResponse: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type DatabaseFormStoredResult = z.infer<typeof FormSubmissionResultSchema>;

const FormReceiptSchema = z
  .object({
    id: z.string().startsWith('formrec_'),
    keyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    viewId: z.string().startsWith('view_'),
    recordId: z.string().startsWith('rec_'),
    state: z.enum(['pending', 'created', 'deleted']),
    result: FormSubmissionResultSchema,
    deleteAfter: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type DatabaseFormReceipt = z.infer<typeof FormReceiptSchema>;

const FormStateSchema = z
  .object({
    version: z.literal(1),
    receipts: z.array(FormReceiptSchema).max(MAX_RECEIPTS),
    rates: z
      .array(
        z
          .object({
            keyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            timestamps: z.array(z.number().int().nonnegative()).max(MAX_RATE_EVENTS),
          })
          .strict(),
      )
      .max(MAX_RATE_KEYS),
  })
  .strict();

type FormState = z.infer<typeof FormStateSchema>;

function emptyState(): FormState {
  return { version: 1, receipts: [], rates: [] };
}

export function databaseFormPrivateKey(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export interface ReserveDatabaseFormReceiptInput {
  keyHash: string;
  fingerprint: string;
  databaseId: string;
  sourceId: string;
  viewId: string;
  recordId: string;
  result: DatabaseFormStoredResult;
  deleteAfter: string | null;
  now: string;
}

export class DatabaseFormStateStore {
  readonly #path: string | null;
  readonly #lockPath: string | null;
  #memory = emptyState();

  constructor(projectDir?: string) {
    this.#path = projectDir
      ? resolve(projectDir, '.ok', 'local', 'database-form-state.json')
      : null;
    this.#lockPath = projectDir
      ? resolve(projectDir, '.ok', 'local', '.database-form-state.lock')
      : null;
  }

  async get(keyHash: string): Promise<DatabaseFormReceipt | null> {
    const state = await this.#read();
    const receipt = state.receipts.find((candidate) => candidate.keyHash === keyHash);
    return receipt ? (structuredClone(receipt) as DatabaseFormReceipt) : null;
  }

  async reserve(input: ReserveDatabaseFormReceiptInput): Promise<DatabaseFormReceipt> {
    return this.#mutate((state) => {
      const existing = state.receipts.find((receipt) => receipt.keyHash === input.keyHash);
      if (existing) return existing as DatabaseFormReceipt;
      const receipt = FormReceiptSchema.parse({
        id: `formrec_${input.keyHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
        keyHash: input.keyHash,
        fingerprint: input.fingerprint,
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        viewId: input.viewId,
        recordId: input.recordId,
        state: 'pending',
        result: input.result,
        deleteAfter: input.deleteAfter,
        createdAt: input.now,
        updatedAt: input.now,
      });
      const next = [receipt, ...state.receipts];
      const active = next.filter((candidate) => candidate.state !== 'deleted');
      if (active.length > MAX_RECEIPTS) {
        throw new Error('Durable Form receipt capacity is exhausted; submission was not started');
      }
      state.receipts = [
        ...active,
        ...next.filter((candidate) => candidate.state === 'deleted'),
      ].slice(0, MAX_RECEIPTS);
      return receipt as DatabaseFormReceipt;
    });
  }

  async markCreated(id: string, now: string): Promise<DatabaseFormReceipt> {
    return this.#updateReceipt(id, now, 'created');
  }

  async markDeleted(id: string, now: string): Promise<DatabaseFormReceipt> {
    return this.#updateReceipt(id, now, 'deleted');
  }

  async listDue(now: string, limit = 100): Promise<DatabaseFormReceipt[]> {
    const timestamp = Date.parse(now);
    return (await this.#read()).receipts
      .filter(
        (receipt) =>
          receipt.state === 'created' &&
          receipt.deleteAfter !== null &&
          Date.parse(receipt.deleteAfter) <= timestamp,
      )
      .slice(0, Math.max(1, Math.min(limit, 500)))
      .map((receipt) => structuredClone(receipt) as DatabaseFormReceipt);
  }

  async consumeRate(input: {
    keyHash: string;
    nowMs: number;
    windowSeconds: number;
    limit: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return this.#mutate((state) => {
      const windowStart = input.nowMs - input.windowSeconds * 1_000;
      let entry = state.rates.find((candidate) => candidate.keyHash === input.keyHash);
      if (!entry) {
        entry = { keyHash: input.keyHash, timestamps: [] };
        state.rates.unshift(entry);
      }
      entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > windowStart);
      if (entry.timestamps.length >= input.limit) {
        const oldest = entry.timestamps[0] ?? input.nowMs;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + input.windowSeconds * 1_000 - input.nowMs) / 1_000),
          ),
        };
      }
      entry.timestamps.push(input.nowMs);
      const globalCutoff = input.nowMs - 86_400_000;
      state.rates = state.rates
        .map((candidate) => ({
          ...candidate,
          timestamps: candidate.timestamps.filter((timestamp) => timestamp > globalCutoff),
        }))
        .filter((candidate) => candidate.timestamps.length > 0);
      if (state.rates.length > MAX_RATE_KEYS) {
        throw new Error('Durable Form rate-limit capacity is exhausted; request was refused');
      }
      return { allowed: true, retryAfterSeconds: 0 };
    });
  }

  async #updateReceipt(
    id: string,
    now: string,
    stateValue: 'created' | 'deleted',
  ): Promise<DatabaseFormReceipt> {
    return this.#mutate((state) => {
      const index = state.receipts.findIndex((receipt) => receipt.id === id);
      const receipt = state.receipts[index];
      if (!receipt) throw new Error(`Form receipt "${id}" was not found`);
      const updated = FormReceiptSchema.parse({ ...receipt, state: stateValue, updatedAt: now });
      state.receipts[index] = updated;
      return updated as DatabaseFormReceipt;
    });
  }

  async #mutate<T>(change: (state: FormState) => T): Promise<T> {
    if (!this.#path || !this.#lockPath) {
      const result = change(this.#memory);
      this.#memory = FormStateSchema.parse(this.#memory);
      return structuredClone(result);
    }
    await mkdir(dirname(this.#lockPath), { recursive: true });
    return withFileLock(this.#lockPath, async () => {
      const state = await this.#read();
      const result = change(state);
      await atomicWriteFile(
        this.#path as string,
        `${JSON.stringify(FormStateSchema.parse(state), null, 2)}\n`,
      );
      return structuredClone(result);
    });
  }

  async #read(): Promise<FormState> {
    if (!this.#path) return structuredClone(this.#memory);
    try {
      return FormStateSchema.parse(JSON.parse(await readFile(this.#path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw error;
    }
  }
}

export function createDatabaseFormStateStore(projectDir?: string): DatabaseFormStateStore {
  return new DatabaseFormStateStore(projectDir);
}
