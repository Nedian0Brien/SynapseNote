/** Durable reviewed execution for composite database Button plans. */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import type { DatabaseButtonExternalStep, DatabaseButtonPlan } from './database-button.ts';
import type { DatabaseCommitInput, DatabaseCommitResult } from './database-commit.ts';

const REVISION = z.string().regex(/^sha256:(?:[a-f0-9]{64}|empty)$/);
const MAX_RUNS = 1_000;

export const DatabaseButtonExecutionInputSchema = z
  .object({
    buttonPlanId: z.string().startsWith('buttonplan_'),
    buttonPlanHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    idempotencyKey: z.string().min(8).max(256),
    approvalToken: z.string().startsWith('approve:sha256:'),
    actor: z
      .object({
        principalId: z.string().min(1).max(256),
        kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
        sessionId: z.string().min(1).max(256).optional(),
      })
      .strict(),
  })
  .strict();

export type DatabaseButtonExecutionInput = z.infer<typeof DatabaseButtonExecutionInputSchema>;

export type DatabaseButtonExecutionErrorCode =
  | 'button_plan_mismatch'
  | 'button_approval_required'
  | 'button_idempotency_conflict'
  | 'button_permission_denied';

export class DatabaseButtonExecutionError extends Error {
  readonly code: DatabaseButtonExecutionErrorCode;

  constructor(code: DatabaseButtonExecutionErrorCode, message: string) {
    super(message);
    this.name = 'DatabaseButtonExecutionError';
    this.code = code;
  }
}

const ButtonActionReceiptSchema = z
  .object({
    actionId: z.string().min(1),
    kind: z.enum(['internal_commit', 'external_webhook']),
    state: z.enum(['pending', 'succeeded', 'failed']),
    receiptId: z.string().max(256).nullable(),
  })
  .strict();

export const DatabaseButtonRunSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('buttonrun_'),
    buttonPlanId: z.string().startsWith('buttonplan_'),
    buttonPlanHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    recordId: z.string().startsWith('rec_').nullable(),
    buttonId: z.string().startsWith('dbbtn_').nullable(),
    propertyId: z.string().startsWith('prop_').nullable(),
    state: z.enum(['pending', 'executing', 'retry_wait', 'succeeded', 'failed']),
    attempt: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    nextAttemptAt: z.string().datetime().nullable(),
    internalMutationId: z.string().startsWith('mut_').nullable(),
    actions: z.array(ButtonActionReceiptSchema).max(21),
    errorCode: z.enum(['plan_expired', 'permission_changed', 'delivery_failed']).nullable(),
    error: z.string().max(2_000).nullable(),
  })
  .strict();

export type DatabaseButtonRun = z.infer<typeof DatabaseButtonRunSchema>;

const StoredExternalStepSchema = z
  .object({
    actionId: z.string().min(1),
    connectionId: z.string().startsWith('conn_'),
    eventName: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
    egressBytes: z.number().int().nonnegative(),
    policyId: z.string().min(1),
    policyRevision: z.string().min(1),
    deliveredReceiptId: z.string().max(256).nullable(),
  })
  .strict();

const StoredRunSchema = z
  .object({
    public: DatabaseButtonRunSchema,
    idempotencyKeyHash: REVISION,
    actor: DatabaseButtonExecutionInputSchema.shape.actor,
    internal: z
      .object({
        planId: z.string().startsWith('plan_'),
        planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        snapshotRevision: REVISION,
      })
      .strict()
      .nullable(),
    permissionGuards: z.array(
      z.object({ actionId: z.string(), policyId: z.string(), policyRevision: z.string() }).strict(),
    ),
    externalSteps: z.array(StoredExternalStepSchema).max(20),
    undoToken: z.string().startsWith('undo_').nullable(),
    invocationPublished: z.boolean(),
  })
  .strict();

const StateSchema = z
  .object({ version: z.literal(1), runs: z.array(StoredRunSchema).max(MAX_RUNS) })
  .strict();

type StoredRun = z.infer<typeof StoredRunSchema>;

function hash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function compactUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

export interface CreateDatabaseButtonExecutorOptions {
  projectDir: string;
  commit: (input: DatabaseCommitInput) => Promise<DatabaseCommitResult>;
  getIdempotentCommit: (idempotencyKey: string) => Promise<DatabaseCommitResult | null>;
  resolvePermission: (input: { databaseId: string; recordId: string | null; actionId: string }) => {
    allowed: boolean;
    policyId: string;
    policyRevision: string;
  };
  resolveExternalPolicy: (step: DatabaseButtonExternalStep) => {
    allowed: boolean;
    policyId: string;
    policyRevision: string;
    maxEgressBytes: number;
  };
  deliverExternal: (input: {
    connectionId: string;
    kind: 'external_webhook';
    payload: Readonly<Record<string, unknown>>;
    idempotencyKey: string;
  }) => Promise<{ receiptId: string }>;
  publishInvocation: (input: {
    executionReceiptId: string;
    databaseId: string;
    sourceId: string;
    recordId: string | null;
    propertyId: string | null;
    buttonId: string | null;
  }) => Promise<void>;
  now?: () => Date;
  generateUuid?: () => string;
}

export class DatabaseButtonExecutor {
  readonly #statePath: string;
  readonly #lockPath: string;
  readonly #commit: CreateDatabaseButtonExecutorOptions['commit'];
  readonly #getIdempotentCommit: CreateDatabaseButtonExecutorOptions['getIdempotentCommit'];
  readonly #resolvePermission: CreateDatabaseButtonExecutorOptions['resolvePermission'];
  readonly #resolveExternalPolicy: CreateDatabaseButtonExecutorOptions['resolveExternalPolicy'];
  readonly #deliverExternal: CreateDatabaseButtonExecutorOptions['deliverExternal'];
  readonly #publishInvocation: CreateDatabaseButtonExecutorOptions['publishInvocation'];
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  #running = false;

  constructor(options: CreateDatabaseButtonExecutorOptions) {
    this.#statePath = resolve(options.projectDir, '.ok', 'local', 'database-button-runs.json');
    this.#lockPath = resolve(options.projectDir, '.ok', 'local', '.database-button.lock');
    this.#commit = options.commit;
    this.#getIdempotentCommit = options.getIdempotentCommit;
    this.#resolvePermission = options.resolvePermission;
    this.#resolveExternalPolicy = options.resolveExternalPolicy;
    this.#deliverExternal = options.deliverExternal;
    this.#publishInvocation = options.publishInvocation;
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  async execute(
    plan: DatabaseButtonPlan,
    rawInput: unknown,
  ): Promise<{ run: DatabaseButtonRun; undoToken: string | null }> {
    const input = DatabaseButtonExecutionInputSchema.parse(rawInput);
    if (input.buttonPlanId !== plan.id || input.buttonPlanHash !== plan.hash) {
      throw new DatabaseButtonExecutionError(
        'button_plan_mismatch',
        'Button execution does not match the reviewed plan',
      );
    }
    if (input.approvalToken !== `approve:${plan.hash}`) {
      throw new DatabaseButtonExecutionError(
        'button_approval_required',
        'Button execution requires exact plan approval',
      );
    }
    await mkdir(dirname(this.#lockPath), { recursive: true });
    return withFileLock(this.#lockPath, async () => {
      const state = await this.#read();
      const idempotencyKeyHash = hash(input.idempotencyKey);
      const existing = state.runs.find(
        (candidate) => candidate.idempotencyKeyHash === idempotencyKeyHash,
      );
      if (existing) {
        if (existing.public.buttonPlanHash !== plan.hash) {
          throw new DatabaseButtonExecutionError(
            'button_idempotency_conflict',
            'Button idempotency key was reused for a different plan',
          );
        }
        if (existing.public.state === 'succeeded' || existing.public.state === 'failed') {
          return { run: structuredClone(existing.public), undoToken: existing.undoToken };
        }
        const advanced = await this.#advance(existing, true);
        this.#replace(state, advanced);
        await this.#write(state);
        return { run: structuredClone(advanced.public), undoToken: advanced.undoToken };
      }
      const createdAt = this.#now().toISOString();
      const guards = new Map(plan.permissionGuards.map((guard) => [guard.actionId, guard]));
      const stored = StoredRunSchema.parse({
        public: {
          version: 1,
          id: `buttonrun_${compactUuid(this.#generateUuid)}`,
          buttonPlanId: plan.id,
          buttonPlanHash: plan.hash,
          databaseId: plan.databaseId,
          sourceId: plan.sourceId,
          recordId: plan.recordId,
          buttonId: plan.buttonId,
          propertyId: plan.propertyId,
          state: 'pending',
          attempt: 0,
          createdAt,
          startedAt: null,
          finishedAt: null,
          nextAttemptAt: null,
          internalMutationId: null,
          actions: [
            ...(plan.internalPlan
              ? [
                  {
                    actionId: 'internal_commit',
                    kind: 'internal_commit',
                    state: 'pending',
                    receiptId: null,
                  },
                ]
              : []),
            ...plan.externalSteps.map((step) => ({
              actionId: step.actionId,
              kind: 'external_webhook',
              state: 'pending',
              receiptId: null,
            })),
          ],
          errorCode: null,
          error: null,
        },
        idempotencyKeyHash,
        actor: input.actor,
        internal: plan.internalPlan
          ? {
              planId: plan.internalPlan.id,
              planHash: plan.internalPlan.hash,
              snapshotRevision: plan.internalPlan.snapshotRevision,
            }
          : null,
        permissionGuards: plan.permissionGuards,
        externalSteps: plan.externalSteps.map((step) => {
          const guard = guards.get(step.actionId);
          if (!guard)
            throw new DatabaseButtonExecutionError(
              'button_permission_denied',
              `Button external action "${step.actionId}" lacks a permission guard`,
            );
          const policy = this.#resolveExternalPolicy(step);
          if (!policy.allowed || step.egressBytes > policy.maxEgressBytes) {
            throw new DatabaseButtonExecutionError(
              'button_permission_denied',
              `Button external action "${step.actionId}" is denied by egress policy`,
            );
          }
          return {
            actionId: step.actionId,
            connectionId: step.connectionId,
            eventName: step.eventName,
            payload: step.payload,
            egressBytes: step.egressBytes,
            policyId: policy.policyId,
            policyRevision: policy.policyRevision,
            deliveredReceiptId: null,
          };
        }),
        undoToken: null,
        invocationPublished: false,
      });
      state.runs = [stored, ...state.runs].slice(0, MAX_RUNS);
      await this.#write(state);
      const advanced = await this.#advance(stored, true);
      this.#replace(state, advanced);
      await this.#write(state);
      return { run: structuredClone(advanced.public), undoToken: advanced.undoToken };
    });
  }

  async tick(): Promise<DatabaseButtonRun[]> {
    if (this.#running) return [];
    this.#running = true;
    try {
      await mkdir(dirname(this.#lockPath), { recursive: true });
      return await withFileLock(this.#lockPath, async () => {
        const state = await this.#read();
        const changed: DatabaseButtonRun[] = [];
        for (const run of [...state.runs].reverse()) {
          if (!['pending', 'executing', 'retry_wait'].includes(run.public.state)) continue;
          if (
            run.public.nextAttemptAt &&
            Date.parse(run.public.nextAttemptAt) > this.#now().getTime()
          )
            continue;
          const advanced = await this.#advance(run, false);
          this.#replace(state, advanced);
          await this.#write(state);
          changed.push(structuredClone(advanced.public));
        }
        return changed;
      });
    } finally {
      this.#running = false;
    }
  }

  async list(limit = 100): Promise<DatabaseButtonRun[]> {
    return (await this.#read()).runs
      .slice(0, Math.max(1, Math.min(limit, 500)))
      .map((run) => structuredClone(run.public));
  }

  async #advance(run: StoredRun, planAvailable: boolean): Promise<StoredRun> {
    const next = structuredClone(run);
    next.public.state = 'executing';
    next.public.attempt += 1;
    next.public.startedAt ??= this.#now().toISOString();
    next.public.nextAttemptAt = null;
    next.public.error = null;
    next.public.errorCode = null;
    try {
      let commit: DatabaseCommitResult | null = null;
      if (next.internal) {
        const commitIdempotencyKey = `button:${next.idempotencyKeyHash}:internal`;
        commit = await this.#getIdempotentCommit(commitIdempotencyKey);
        if (!commit) {
          if (!planAvailable) throw new Error('Button internal plan expired before durable commit');
          commit = await this.#commit({
            planId: next.internal.planId,
            planHash: next.internal.planHash,
            expectedSnapshotRevision: next.internal.snapshotRevision,
            idempotencyKey: commitIdempotencyKey,
            approvalToken: `approve:${next.internal.planHash}`,
            actor: next.actor,
          });
        }
        next.public.internalMutationId = commit.mutationId;
        next.undoToken = commit.undoToken;
        const action = next.public.actions.find(
          (candidate) => candidate.kind === 'internal_commit',
        );
        if (action) {
          action.state = 'succeeded';
          action.receiptId = commit.mutationId;
        }
      }
      if (!next.invocationPublished) {
        await this.#publishInvocation({
          executionReceiptId: commit?.mutationId ?? next.public.id,
          databaseId: next.public.databaseId,
          sourceId: next.public.sourceId,
          recordId: next.public.recordId,
          propertyId: next.public.propertyId,
          buttonId: next.public.buttonId,
        });
        next.invocationPublished = true;
      }
      for (const step of next.externalSteps) {
        if (step.deliveredReceiptId) continue;
        const guard = next.permissionGuards.find(
          (candidate) => candidate.actionId === step.actionId,
        );
        const permission = this.#resolvePermission({
          databaseId: next.public.databaseId,
          recordId: next.public.recordId,
          actionId: step.actionId,
        });
        if (
          !guard ||
          !permission.allowed ||
          permission.policyId !== guard.policyId ||
          permission.policyRevision !== guard.policyRevision
        ) {
          throw new Error(`Button permission changed for action "${step.actionId}"`);
        }
        const policy = this.#resolveExternalPolicy({
          actionId: step.actionId,
          kind: 'external_webhook',
          connectionId: step.connectionId,
          eventName: step.eventName,
          payload: step.payload as DatabaseButtonExternalStep['payload'],
          egressBytes: step.egressBytes,
        });
        if (
          !policy.allowed ||
          policy.policyId !== step.policyId ||
          policy.policyRevision !== step.policyRevision ||
          step.egressBytes > policy.maxEgressBytes
        ) {
          throw new Error(`Button egress policy changed for action "${step.actionId}"`);
        }
        const delivered = await this.#deliverExternal({
          connectionId: step.connectionId,
          kind: 'external_webhook',
          payload: { ...step.payload, eventName: step.eventName },
          idempotencyKey: `button-run:${next.public.id}:action:${step.actionId}`,
        });
        step.deliveredReceiptId = delivered.receiptId;
        const action = next.public.actions.find(
          (candidate) => candidate.actionId === step.actionId,
        );
        if (action) {
          action.state = 'succeeded';
          action.receiptId = delivered.receiptId;
        }
      }
      next.public.state = 'succeeded';
      next.public.finishedAt = this.#now().toISOString();
      return StoredRunSchema.parse(next);
    } catch (error) {
      const message = errorText(error);
      const expired = message.includes('plan expired');
      const permissionChanged =
        message.includes('permission changed') || message.includes('policy changed');
      const exhausted = next.public.attempt >= 3 || expired || permissionChanged;
      next.public.state = exhausted ? 'failed' : 'retry_wait';
      next.public.finishedAt = exhausted ? this.#now().toISOString() : null;
      next.public.nextAttemptAt = exhausted
        ? null
        : new Date(this.#now().getTime() + 60_000 * 2 ** (next.public.attempt - 1)).toISOString();
      next.public.errorCode = expired
        ? 'plan_expired'
        : permissionChanged
          ? 'permission_changed'
          : 'delivery_failed';
      next.public.error = message;
      if (exhausted) {
        const pending = next.public.actions.find((action) => action.state === 'pending');
        if (pending) pending.state = 'failed';
      }
      return StoredRunSchema.parse(next);
    }
  }

  #replace(state: z.infer<typeof StateSchema>, run: StoredRun): void {
    state.runs = [
      run,
      ...state.runs.filter((candidate) => candidate.public.id !== run.public.id),
    ].slice(0, MAX_RUNS);
  }

  async #read(): Promise<z.infer<typeof StateSchema>> {
    try {
      return StateSchema.parse(JSON.parse(await readFile(this.#statePath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, runs: [] };
      throw error;
    }
  }

  async #write(state: z.infer<typeof StateSchema>): Promise<void> {
    await mkdir(dirname(this.#statePath), { recursive: true });
    await atomicWriteFile(
      this.#statePath,
      `${JSON.stringify(StateSchema.parse(state), null, 2)}\n`,
    );
  }
}

export function createDatabaseButtonExecutor(options: CreateDatabaseButtonExecutorOptions) {
  return new DatabaseButtonExecutor(options);
}
