import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type DatabaseAgentRun, DatabaseAgentRunSchema } from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import type { DatabaseCommitInput, DatabaseCommitResult } from './database-commit.ts';
import type { DatabasePlanArtifact } from './database-plan.ts';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

const MAX_PROPOSED_DIFF_BYTES = 128 * 1024;
const MAX_STORE_BYTES = 8 * 1024 * 1024;
const MAX_RUNS = 50;
const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const StateSchema = z
  .object({
    version: z.literal(1),
    runs: z.array(DatabaseAgentRunSchema).max(MAX_RUNS),
    revision: RevisionSchema,
  })
  .strict();

type State = z.infer<typeof StateSchema>;

export type DatabaseAgentRunStoreErrorCode =
  | 'agent_run_not_found'
  | 'agent_run_store_unsafe'
  | 'agent_run_store_corrupt';

export class DatabaseAgentRunStoreError extends Error {
  readonly code: DatabaseAgentRunStoreErrorCode;

  constructor(code: DatabaseAgentRunStoreError['code'], message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseAgentRunStoreError';
    this.code = code;
  }
}

function errno(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
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

function revision(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function withRunRevision(value: Omit<DatabaseAgentRun, 'revision'>): DatabaseAgentRun {
  return DatabaseAgentRunSchema.parse({ ...value, revision: revision(value) });
}

function finalize(runs: DatabaseAgentRun[]): State {
  return StateSchema.parse({ version: 1, runs, revision: revision({ version: 1, runs }) });
}

function summary(plan: DatabasePlanArtifact): string {
  const effects = [
    plan.diff.manifests.length > 0 ? `${plan.diff.manifests.length} manifest(s)` : '',
    plan.diff.records.length > 0 ? `${plan.diff.records.length} record(s)` : '',
  ].filter(Boolean);
  return effects.length > 0
    ? `Apply plan ${plan.id} to ${effects.join(' and ')}`
    : `Verify already-converged plan ${plan.id}`;
}

function proposedDiff(plan: DatabasePlanArtifact): DatabaseAgentRun['proposedDiff'] {
  const value = plan.diff;
  const originalBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  return originalBytes <= MAX_PROPOSED_DIFF_BYTES
    ? { complete: true, omittedReason: null, originalBytes, value }
    : { complete: false, omittedReason: 'size_limit', originalBytes, value: null };
}

export class DatabaseAgentRunStore {
  readonly #projectDir: string;
  readonly #root: string;
  readonly #path: string;
  readonly #lockPath: string;
  readonly #now: () => Date;
  readonly #generateId: () => string;

  constructor(options: { projectDir: string; now?: () => Date; generateId?: () => string }) {
    this.#projectDir = resolve(options.projectDir);
    this.#root = resolve(this.#projectDir, '.ok', 'local', 'database-agent-runs', 'v1');
    this.#path = resolve(this.#root, 'runs.json');
    this.#lockPath = resolve(this.#root, '.runs.lock');
    this.#now = options.now ?? (() => new Date());
    this.#generateId = options.generateId ?? (() => `run_${randomUUID().replaceAll('-', '')}`);
  }

  async list(): Promise<{ runs: DatabaseAgentRun[]; revision: string }> {
    await this.#assertSafeRoot(false);
    const state = await this.#read();
    return { runs: structuredClone(state.runs), revision: state.revision };
  }

  async get(id: string): Promise<DatabaseAgentRun> {
    const run = (await this.list()).runs.find((candidate) => candidate.id === id);
    if (!run) throw new DatabaseAgentRunStoreError('agent_run_not_found', 'Agent run not found');
    return run;
  }

  async propose(
    plan: DatabasePlanArtifact,
    actor: DatabaseCommitInput['actor'],
  ): Promise<DatabaseAgentRun> {
    return this.#update((state) => {
      const existing = state.runs.find(
        (run) =>
          run.plan.hash === plan.hash &&
          run.actor.principalId === actor.principalId &&
          run.actor.sessionId === (actor.sessionId ?? null) &&
          (run.state === 'awaiting_approval' || run.state === 'executing'),
      );
      if (existing) return { state, result: existing };
      const timestamp = this.#now().toISOString();
      const run = withRunRevision({
        version: 1,
        id: this.#generateId(),
        state: 'awaiting_approval',
        createdAt: timestamp,
        updatedAt: timestamp,
        actor: { ...actor, sessionId: actor.sessionId ?? null },
        intent: { summary: summary(plan), rawPromptStored: false },
        scope: {
          databaseIds: [...plan.affectedObjects.databaseIds],
          sourceIds: [...plan.affectedObjects.sourceIds],
          propertyIds: [...plan.affectedObjects.propertyIds],
          viewIds: [...plan.affectedObjects.viewIds],
          recordIds: [...plan.affectedObjects.recordIds],
        },
        plan: {
          id: plan.id,
          hash: plan.hash,
          snapshotRevision: plan.snapshotRevision,
          expiresAt: plan.expiresAt,
          risk: { level: plan.risk.level, reasons: [...plan.risk.reasons] },
          approvals: plan.approvals.map((approval) => ({ ...approval })),
        },
        proposedDiff: proposedDiff(plan),
        execution: { startedAt: null, finishedAt: null, mutationId: null, actualDiff: [] },
        verification: { status: 'pending', checks: [] },
        failure: null,
        undo: { available: false, token: null },
      });
      return { state: { ...state, runs: [run, ...state.runs].slice(0, MAX_RUNS) }, result: run };
    });
  }

  async markExecuting(id: string): Promise<DatabaseAgentRun> {
    return this.#replace(id, (run) => ({
      ...run,
      state: 'executing',
      updatedAt: this.#now().toISOString(),
      execution: { ...run.execution, startedAt: this.#now().toISOString() },
      failure: null,
    }));
  }

  async markSucceeded(id: string, result: DatabaseCommitResult): Promise<DatabaseAgentRun> {
    return this.#replace(id, (run) => ({
      ...run,
      state: 'succeeded',
      updatedAt: this.#now().toISOString(),
      execution: {
        ...run.execution,
        finishedAt: this.#now().toISOString(),
        mutationId: result.mutationId,
        actualDiff: structuredClone(result.actualDiff),
      },
      verification: structuredClone(result.verification),
      failure: null,
      undo: { available: true, token: result.undoToken },
    }));
  }

  async markFailed(
    id: string,
    failure: { code: string; message: string },
  ): Promise<DatabaseAgentRun> {
    return this.#replace(id, (run) => ({
      ...run,
      state: 'failed',
      updatedAt: this.#now().toISOString(),
      execution: { ...run.execution, finishedAt: this.#now().toISOString() },
      verification: {
        status: 'failed',
        checks: run.verification.checks,
      },
      failure,
      undo: { available: false, token: null },
    }));
  }

  async #replace(
    id: string,
    mutate: (run: DatabaseAgentRun) => Omit<DatabaseAgentRun, 'revision'>,
  ): Promise<DatabaseAgentRun> {
    return this.#update((state) => {
      const index = state.runs.findIndex((run) => run.id === id);
      if (index < 0)
        throw new DatabaseAgentRunStoreError('agent_run_not_found', 'Agent run not found');
      const current = state.runs[index] as DatabaseAgentRun;
      const next = withRunRevision(mutate(current));
      const runs = [...state.runs];
      runs[index] = next;
      return { state: { ...state, runs }, result: next };
    });
  }

  async #update(
    mutate: (state: State) => { state: Omit<State, 'revision'>; result: DatabaseAgentRun },
  ): Promise<DatabaseAgentRun> {
    await this.#assertSafeRoot(true);
    return withFileLock(this.#lockPath, async () => {
      const current = await this.#read();
      const changed = mutate(current);
      const next = finalize(changed.state.runs);
      const serialized = `${JSON.stringify(next, null, 2)}\n`;
      if (Buffer.byteLength(serialized, 'utf8') > MAX_STORE_BYTES) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_corrupt',
          'Agent run history exceeds its bounded local store',
        );
      }
      await atomicWriteFile(this.#path, serialized, { fs: tracedAtomicFs, mode: 0o600 });
      return structuredClone(changed.result);
    });
  }

  async #read(): Promise<State> {
    try {
      const stats = await lstat(this.#path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_unsafe',
          'Agent run store is not a safe regular file',
        );
      }
      if (stats.size > MAX_STORE_BYTES) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_corrupt',
          'Agent run store is too large',
        );
      }
      const state = StateSchema.parse(JSON.parse(await readFile(this.#path, 'utf8')));
      if (state.revision !== revision({ version: state.version, runs: state.runs })) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_corrupt',
          'Agent run store revision does not match its content',
        );
      }
      return state;
    } catch (error) {
      if (error instanceof DatabaseAgentRunStoreError) throw error;
      if (errno(error) === 'ENOENT') return { version: 1, runs: [], revision: 'sha256:empty' };
      throw new DatabaseAgentRunStoreError(
        'agent_run_store_corrupt',
        'Agent run store is corrupt or unreadable',
        error,
      );
    }
  }

  async #assertSafeRoot(create: boolean): Promise<void> {
    let current = this.#projectDir;
    for (const segment of ['.ok', 'local', 'database-agent-runs', 'v1']) {
      current = resolve(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseAgentRunStoreError(
            'agent_run_store_unsafe',
            'Agent run storage path is not a safe directory',
          );
        }
      } catch (error) {
        if (error instanceof DatabaseAgentRunStoreError) throw error;
        if (errno(error) !== 'ENOENT') throw error;
        if (!create) return;
        try {
          await tracedMkdir(current, { recursive: false, mode: 0o700 });
        } catch (mkdirError) {
          if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
          const stats = await lstat(current);
          if (stats.isSymbolicLink() || !stats.isDirectory()) {
            throw new DatabaseAgentRunStoreError(
              'agent_run_store_unsafe',
              'Agent run storage path raced with an unsafe entry',
            );
          }
        }
      }
    }
  }
}

export function createDatabaseAgentRunStore(options: {
  projectDir: string;
  now?: () => Date;
  generateId?: () => string;
}): DatabaseAgentRunStore {
  return new DatabaseAgentRunStore(options);
}
