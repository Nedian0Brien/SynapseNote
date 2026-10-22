import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type DatabaseAgentRun, DatabaseAgentRunSchema } from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import type { DatabaseCommitInput, DatabaseCommitResult } from './database-commit.ts';
import type { DatabaseDraftArtifact, DatabasePlanArtifact } from './database-plan.ts';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

const MAX_PROPOSED_DIFF_BYTES = 128 * 1024;
const MAX_STORE_BYTES = 8 * 1024 * 1024;
const MAX_PLAN_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_RUNS = 50;
const PLAN_ID_PATTERN = /^plan_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
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

const PlanBundleSchema = z
  .object({
    version: z.literal(1),
    plan: z.record(z.string(), z.unknown()),
    draft: z.record(z.string(), z.unknown()),
    revision: RevisionSchema,
  })
  .strict();

export interface DatabaseAgentRunPlanBundle {
  version: 1;
  plan: DatabasePlanArtifact;
  draft: DatabaseDraftArtifact;
  revision: string;
}

export type DatabaseAgentRunStoreErrorCode =
  | 'agent_run_not_found'
  | 'agent_run_plan_unavailable'
  | 'agent_run_not_retryable'
  | 'agent_run_revision_changed'
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

function idempotencyKeyHash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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

function parsePlanBundle(value: unknown): DatabaseAgentRunPlanBundle {
  const parsed = PlanBundleSchema.safeParse(value);
  if (!parsed.success) {
    throw new DatabaseAgentRunStoreError(
      'agent_run_store_corrupt',
      'Persisted Agent Run plan bundle is corrupt',
    );
  }
  const { plan, draft } = parsed.data;
  if (
    typeof plan.id !== 'string' ||
    !PLAN_ID_PATTERN.test(plan.id) ||
    typeof plan.hash !== 'string' ||
    typeof plan.draftId !== 'string' ||
    typeof plan.draftRevision !== 'string' ||
    typeof plan.expiresAt !== 'string' ||
    typeof draft.id !== 'string' ||
    typeof draft.revision !== 'string' ||
    typeof draft.expiresAt !== 'string' ||
    plan.draftId !== draft.id ||
    plan.draftRevision !== draft.revision
  ) {
    throw new DatabaseAgentRunStoreError(
      'agent_run_store_corrupt',
      'Persisted Agent Run plan bundle does not contain a matching plan and draft',
    );
  }
  if (parsed.data.revision !== revision({ version: 1, plan, draft })) {
    throw new DatabaseAgentRunStoreError(
      'agent_run_store_corrupt',
      'Persisted Agent Run plan bundle revision does not match its content',
    );
  }
  return {
    version: 1,
    plan: structuredClone(plan) as unknown as DatabasePlanArtifact,
    draft: structuredClone(draft) as unknown as DatabaseDraftArtifact,
    revision: parsed.data.revision,
  };
}

export class DatabaseAgentRunStore {
  readonly #projectDir: string;
  readonly #root: string;
  readonly #path: string;
  readonly #lockPath: string;
  readonly #plansRoot: string;
  readonly #now: () => Date;
  readonly #generateId: () => string;

  constructor(options: { projectDir: string; now?: () => Date; generateId?: () => string }) {
    this.#projectDir = resolve(options.projectDir);
    this.#root = resolve(this.#projectDir, '.ok', 'local', 'database-agent-runs', 'v1');
    this.#path = resolve(this.#root, 'runs.json');
    this.#lockPath = resolve(this.#root, '.runs.lock');
    this.#plansRoot = resolve(this.#root, 'plans');
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

  /**
   * Keep the exact plan inputs needed to recover an Agent Run after a process restart.
   * The run history intentionally contains only a bounded diff summary; this sidecar is
   * owner-only, revision-bound, and written atomically so recovery never silently falls
   * back to a newly inferred plan.
   */
  async persistPlanBundle(
    plan: DatabasePlanArtifact,
    draft: DatabaseDraftArtifact,
  ): Promise<DatabaseAgentRunPlanBundle> {
    if (!PLAN_ID_PATTERN.test(plan.id) || plan.draftId !== draft.id) {
      throw new DatabaseAgentRunStoreError(
        'agent_run_store_corrupt',
        'Agent Run plan bundle has an invalid plan/draft identity',
      );
    }
    if (plan.draftRevision !== draft.revision) {
      throw new DatabaseAgentRunStoreError(
        'agent_run_store_corrupt',
        'Agent Run plan bundle draft revision does not match the plan',
      );
    }
    const bundle: DatabaseAgentRunPlanBundle = {
      version: 1,
      plan: structuredClone(plan),
      draft: structuredClone(draft),
      revision: revision({ version: 1, plan, draft }),
    };
    const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PLAN_BUNDLE_BYTES) {
      throw new DatabaseAgentRunStoreError(
        'agent_run_store_corrupt',
        'Agent Run plan bundle exceeds its bounded local store',
      );
    }
    await this.#assertPlansRoot(true);
    await atomicWriteFile(resolve(this.#plansRoot, `${plan.id}.json`), serialized, {
      fs: tracedAtomicFs,
      mode: 0o600,
    });
    return structuredClone(bundle);
  }

  async getPlanBundle(planId: string): Promise<DatabaseAgentRunPlanBundle> {
    if (!PLAN_ID_PATTERN.test(planId)) {
      throw new DatabaseAgentRunStoreError(
        'agent_run_plan_unavailable',
        'The Agent Run plan identity is invalid or unavailable; recreate the plan',
      );
    }
    await this.#assertSafeRoot(false);
    try {
      const stats = await lstat(this.#plansRoot);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_unsafe',
          'Agent Run plan storage is not a safe directory',
        );
      }
      const path = resolve(this.#plansRoot, `${planId}.json`);
      const fileStats = await lstat(path);
      if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_unsafe',
          'Agent Run plan bundle is not a safe regular file',
        );
      }
      if (fileStats.size > MAX_PLAN_BUNDLE_BYTES) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_corrupt',
          'Agent Run plan bundle is too large',
        );
      }
      return parsePlanBundle(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (error instanceof DatabaseAgentRunStoreError) throw error;
      if (errno(error) === 'ENOENT') {
        throw new DatabaseAgentRunStoreError(
          'agent_run_plan_unavailable',
          'The immutable Agent Run plan is unavailable after restart; recreate the plan',
          error,
        );
      }
      throw new DatabaseAgentRunStoreError(
        'agent_run_store_corrupt',
        'Agent Run plan bundle is corrupt or unreadable',
        error,
      );
    }
  }

  async propose(
    plan: DatabasePlanArtifact,
    actor: DatabaseCommitInput['actor'],
    recovery?: {
      action: 'retry' | 'resume';
      sourceRunId: string;
      idempotencyKey: string;
    },
  ): Promise<DatabaseAgentRun> {
    return this.#update((state) => {
      const recoveryHash = recovery ? idempotencyKeyHash(recovery.idempotencyKey) : null;
      if (recoveryHash) {
        const replay = state.runs.find((run) => run.recovery?.idempotencyKeyHash === recoveryHash);
        if (replay) return { state, result: replay };
      }
      const existing = recovery
        ? undefined
        : state.runs.find(
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
        recovery: {
          attempt: recovery
            ? (state.runs.find((candidate) => candidate.id === recovery.sourceRunId)?.recovery
                ?.attempt ?? 1) + 1
            : 1,
          action: recovery?.action ?? 'initial',
          sourceRunId: recovery?.sourceRunId ?? null,
          idempotencyKeyHash: recoveryHash,
        },
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

  async prepareRecovery(id: string, expectedRevision: string): Promise<DatabaseAgentRun> {
    const run = await this.get(id);
    if (run.revision !== expectedRevision) {
      throw new DatabaseAgentRunStoreError(
        'agent_run_revision_changed',
        'Agent run changed after the latest inspection',
      );
    }
    if (run.state !== 'failed' || run.actor.kind !== 'agent') {
      throw new DatabaseAgentRunStoreError(
        'agent_run_not_retryable',
        'Only failed agent runs can be retried or resumed',
      );
    }
    return run;
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

  async #assertPlansRoot(create: boolean): Promise<void> {
    await this.#assertSafeRoot(create);
    try {
      const stats = await lstat(this.#plansRoot);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new DatabaseAgentRunStoreError(
          'agent_run_store_unsafe',
          'Agent Run plan storage is not a safe directory',
        );
      }
    } catch (error) {
      if (error instanceof DatabaseAgentRunStoreError) throw error;
      if (errno(error) !== 'ENOENT' || !create) {
        if (errno(error) === 'ENOENT' && !create) {
          throw new DatabaseAgentRunStoreError(
            'agent_run_plan_unavailable',
            'The immutable Agent Run plan is unavailable after restart; recreate the plan',
            error,
          );
        }
        throw error;
      }
      try {
        await tracedMkdir(this.#plansRoot, { recursive: false, mode: 0o700 });
      } catch (mkdirError) {
        if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
        const stats = await lstat(this.#plansRoot);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseAgentRunStoreError(
            'agent_run_store_unsafe',
            'Agent Run plan storage raced with an unsafe entry',
          );
        }
      }
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
