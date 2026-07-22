import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assessGeneratedDatabaseSummary,
  DatabaseRecordIdSchema,
  type DatabaseSummaryObservation,
  type GeneratedDatabaseSummary,
  GeneratedDatabaseSummarySchema,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

export type DatabaseSummaryStoreErrorCode =
  | 'invalid_summary'
  | 'summary_store_unsafe'
  | 'summary_store_corrupt'
  | 'summary_store_io_error';

export class DatabaseSummaryStoreError extends Error {
  readonly code: DatabaseSummaryStoreErrorCode;

  constructor(code: DatabaseSummaryStoreErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseSummaryStoreError';
    this.code = code;
  }
}

export type PutGeneratedDatabaseSummaryInput = Omit<
  GeneratedDatabaseSummary,
  'version' | 'id' | 'state'
>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function errno(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export class DatabaseSummaryStore {
  readonly #projectDir: string;
  readonly #root: string;
  readonly #lockPath: string;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;

  constructor(options: {
    projectDir: string;
    now?: () => Date;
    generateUuid?: () => string;
  }) {
    this.#projectDir = resolve(options.projectDir);
    this.#root = resolve(this.#projectDir, '.ok', 'local', 'database-summaries', 'v1');
    this.#lockPath = resolve(this.#root, '.summary.lock');
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  async put(input: PutGeneratedDatabaseSummaryInput): Promise<GeneratedDatabaseSummary> {
    let artifact: GeneratedDatabaseSummary;
    try {
      artifact = GeneratedDatabaseSummarySchema.parse({
        ...input,
        version: 1,
        id: `sum_${this.#generateUuid().replaceAll('-', '').toLowerCase()}`,
        state: { stale: false, checkedAt: input.createdAt },
      });
    } catch (error) {
      throw new DatabaseSummaryStoreError(
        'invalid_summary',
        'Generated summary is missing required provenance or freshness metadata',
        error,
      );
    }
    return this.#withLock(async () => {
      await this.#write(artifact);
      return clone(artifact);
    });
  }

  /** Return stored metadata without claiming that the summary is currently fresh. */
  async inspect(recordIdInput: string): Promise<GeneratedDatabaseSummary | null> {
    const recordId = this.#recordId(recordIdInput);
    await this.#assertSafeRoot(false);
    return this.#read(recordId);
  }

  /** Re-evaluate and durably record freshness against exact current observations. */
  async resolve(
    recordIdInput: string,
    observation: DatabaseSummaryObservation,
  ): Promise<GeneratedDatabaseSummary | null> {
    const recordId = this.#recordId(recordIdInput);
    return this.#withLock(async () => {
      const current = await this.#read(recordId);
      if (!current) return null;
      let assessed: GeneratedDatabaseSummary;
      try {
        assessed = assessGeneratedDatabaseSummary(current, observation);
      } catch (error) {
        throw new DatabaseSummaryStoreError(
          'invalid_summary',
          'Summary freshness observation is invalid',
          error,
        );
      }
      if (JSON.stringify(assessed.state) !== JSON.stringify(current.state)) {
        await this.#write(assessed);
      }
      return clone(assessed);
    });
  }

  /** Safe consumption default: stale generated text is never returned as context. */
  async getFresh(
    recordId: string,
    observation: DatabaseSummaryObservation,
  ): Promise<GeneratedDatabaseSummary | null> {
    const summary = await this.resolve(recordId, observation);
    return summary && !summary.state.stale ? summary : null;
  }

  async invalidate(
    recordIdInput: string,
    reason: 'source_missing' | 'manually_invalidated' = 'manually_invalidated',
  ): Promise<GeneratedDatabaseSummary | null> {
    const recordId = this.#recordId(recordIdInput);
    return this.#withLock(async () => {
      const current = await this.#read(recordId);
      if (!current) return null;
      let invalidated: GeneratedDatabaseSummary;
      try {
        invalidated = GeneratedDatabaseSummarySchema.parse({
          ...current,
          state: { stale: true, checkedAt: this.#now().toISOString(), reason },
        });
      } catch (error) {
        throw new DatabaseSummaryStoreError(
          'invalid_summary',
          'Summary invalidation time precedes its creation time',
          error,
        );
      }
      await this.#write(invalidated);
      return clone(invalidated);
    });
  }

  #recordId(input: string): string {
    const parsed = DatabaseRecordIdSchema.safeParse(input);
    if (!parsed.success) {
      throw new DatabaseSummaryStoreError('invalid_summary', 'Summary record ID is invalid');
    }
    return parsed.data;
  }

  #path(recordId: string): string {
    return resolve(this.#root, `${recordId}.json`);
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#assertSafeRoot(true);
    try {
      return await withFileLock(this.#lockPath, operation);
    } catch (error) {
      if (error instanceof DatabaseSummaryStoreError) throw error;
      throw new DatabaseSummaryStoreError(
        'summary_store_io_error',
        `Generated summary store operation failed${errno(error) ? ` (${errno(error)})` : ''}`,
        error,
      );
    }
  }

  async #assertSafeRoot(create: boolean): Promise<void> {
    const segments = ['.ok', 'local', 'database-summaries', 'v1'];
    let current = this.#projectDir;
    for (const segment of segments) {
      current = resolve(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseSummaryStoreError(
            'summary_store_unsafe',
            'Generated summary storage path is not a safe directory',
          );
        }
      } catch (error) {
        if (error instanceof DatabaseSummaryStoreError) throw error;
        if (errno(error) !== 'ENOENT') {
          throw new DatabaseSummaryStoreError(
            'summary_store_io_error',
            'Generated summary storage path cannot be inspected',
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
            throw new DatabaseSummaryStoreError(
              'summary_store_unsafe',
              'Generated summary storage path raced with an unsafe filesystem entry',
            );
          }
        }
      }
    }
  }

  async #read(recordId: string): Promise<GeneratedDatabaseSummary | null> {
    const path = this.#path(recordId);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseSummaryStoreError(
          'summary_store_unsafe',
          'Generated summary entry is not a safe regular file',
        );
      }
      return GeneratedDatabaseSummarySchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (error instanceof DatabaseSummaryStoreError) throw error;
      if (errno(error) === 'ENOENT') return null;
      throw new DatabaseSummaryStoreError(
        'summary_store_corrupt',
        'Generated summary entry is corrupt or unreadable',
        error,
      );
    }
  }

  async #write(artifact: GeneratedDatabaseSummary): Promise<void> {
    await atomicWriteFile(this.#path(artifact.recordId), `${JSON.stringify(artifact, null, 2)}\n`, {
      fs: tracedAtomicFs,
      mode: 0o600,
    });
  }
}

export function createDatabaseSummaryStore(options: {
  projectDir: string;
  now?: () => Date;
  generateUuid?: () => string;
}): DatabaseSummaryStore {
  return new DatabaseSummaryStore(options);
}
