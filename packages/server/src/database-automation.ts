import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  applyDatabaseTemplate,
  type DatabaseAutomation,
  type DatabaseAutomationAction,
  type DatabaseDefinition,
  type DatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import { databaseDesiredStateBase } from './database-button.ts';
import type { DatabaseCommitEngine, DatabaseCommitResult } from './database-commit.ts';
import type {
  DatabaseDesiredStateDraftInput,
  DatabasePlanArtifact,
  DatabasePlanEngine,
} from './database-plan.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';
import { incrementDatabaseAutomationRunFailure } from './database-telemetry.ts';
import { latestDatabaseTemplateOccurrence } from './database-template-scheduler.ts';
import { isV1Database, v1MigrationRequiredMessage } from './database-v1-compatibility.ts';

const MAX_EVENTS = 1_000;
const MAX_RUNS = 1_000;
const REVISION = z.string().regex(/^sha256:(?:[a-f0-9]{64}|empty)$/);

export const DatabaseAutomationEventSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('aevt_'),
    deduplicationKey: z.string().min(1).max(256),
    databaseId: z.string().startsWith('db_'),
    kind: z.enum([
      'record_added',
      'property_changed',
      'schedule',
      'form_submitted',
      'button_invoked',
    ]),
    occurredAt: z.string().datetime(),
    sourceId: z.string().startsWith('ds_').nullable(),
    recordId: z.string().startsWith('rec_').nullable(),
    recordRevision: REVISION.nullable(),
    propertyId: z.string().startsWith('prop_').nullable(),
    viewId: z.string().startsWith('view_').nullable(),
    buttonId: z.string().startsWith('dbbtn_').nullable(),
    scheduledFor: z.string().datetime().nullable(),
    targetAutomationId: z.string().startsWith('auto_').nullable().default(null),
    origin: z
      .object({
        runId: z.string().startsWith('autorun_'),
        automationIds: z.array(z.string().startsWith('auto_')).max(16),
        generatedEvents: z.number().int().nonnegative().max(100),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((event, context) => {
    const recordBacked =
      event.kind === 'record_added' ||
      event.kind === 'property_changed' ||
      event.kind === 'form_submitted';
    if (
      recordBacked &&
      (event.sourceId === null || event.recordId === null || event.recordRevision === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: `${event.kind} events require source, record, and exact record revision`,
      });
    }
    if (event.kind === 'property_changed' && event.propertyId === null) {
      context.addIssue({
        code: 'custom',
        path: ['propertyId'],
        message: 'Property-change events require propertyId',
      });
    }
    if (event.kind === 'form_submitted' && event.viewId === null) {
      context.addIssue({ code: 'custom', path: ['viewId'], message: 'Form events require viewId' });
    }
    if (event.kind === 'schedule' && event.scheduledFor === null) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledFor'],
        message: 'Schedule events require scheduledFor',
      });
    }
    if (event.kind === 'button_invoked' && event.buttonId === null && event.propertyId === null) {
      context.addIssue({ code: 'custom', message: 'Button events require buttonId or propertyId' });
    }
  });

export type DatabaseAutomationEvent = z.infer<typeof DatabaseAutomationEventSchema>;

const DatabaseAutomationActionResultSchema = z
  .object({
    actionId: z.string().min(1),
    kind: z.string().min(1),
    state: z.enum(['planned', 'succeeded', 'failed']),
    receiptId: z.string().max(256).nullable(),
    error: z.string().max(2_000).nullable(),
  })
  .strict();

export const DatabaseAutomationRunSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('autorun_'),
    eventId: z.string().startsWith('aevt_'),
    databaseId: z.string().startsWith('db_'),
    automationId: z.string().startsWith('auto_'),
    automationVersion: z.number().int().positive(),
    ownerId: z.string().startsWith('person_'),
    schemaRevision: REVISION,
    state: z.enum(['pending', 'executing', 'retry_wait', 'succeeded', 'failed', 'skipped']),
    attempt: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    nextAttemptAt: z.string().datetime().nullable(),
    internalRequired: z.boolean().default(false),
    internalMutationId: z.string().startsWith('mut_').nullable(),
    actions: z.array(DatabaseAutomationActionResultSchema).max(20),
    errorCode: z
      .enum([
        'stale_schema',
        'stale_record',
        'loop_prevented',
        'fanout_exceeded',
        'permission_denied',
        'migration_required',
        'plan_blocked',
        'external_unavailable',
        'execution_failed',
      ])
      .nullable(),
    error: z.string().max(2_000).nullable(),
  })
  .strict();

export type DatabaseAutomationRun = z.infer<typeof DatabaseAutomationRunSchema>;

class DatabaseAutomationMigrationRequiredError extends Error {
  readonly code = 'migration_required' as const;

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseAutomationMigrationRequiredError';
  }
}

const DatabaseAutomationOutboxItemSchema = z
  .object({
    runId: z.string().startsWith('autorun_'),
    actionId: z.string().min(1),
    kind: z.enum(['notification', 'external_webhook', 'external_email']),
    state: z.enum(['pending', 'succeeded']),
    permissionPolicyId: z.string().min(1),
    permissionPolicyRevision: z.string().min(1),
    connectionId: z.string().startsWith('conn_').nullable(),
    recipientIds: z.array(z.string().startsWith('person_')).max(100),
    title: z.string().max(998).nullable(),
    body: z.string().max(10_000).nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    egressBytes: z.number().int().nonnegative(),
    egressPolicyId: z.string().nullable(),
    egressPolicyRevision: z.string().nullable(),
    receiptId: z.string().max(256).nullable(),
  })
  .strict();

const PendingAutomationEventSchema = z
  .object({
    runId: z.string().startsWith('autorun_'),
    deduplicationKey: z.string().min(1).max(256),
    kind: z.enum(['record_added', 'property_changed']),
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    recordId: z.string().startsWith('rec_'),
    propertyId: z.string().startsWith('prop_').nullable(),
  })
  .strict();

const StateSchema = z
  .object({
    version: z.literal(1),
    events: z.array(DatabaseAutomationEventSchema).max(MAX_EVENTS),
    runs: z.array(DatabaseAutomationRunSchema).max(MAX_RUNS),
    outbox: z
      .array(DatabaseAutomationOutboxItemSchema)
      .max(MAX_RUNS * 20)
      .default([]),
    pendingEvents: z
      .array(PendingAutomationEventSchema)
      .max(MAX_RUNS * 100)
      .default([]),
  })
  .strict();

export interface DatabaseAutomationPermissionDecision {
  allowed: boolean;
  policyId: string;
  policyRevision: string;
  reason?: string;
}

export interface DatabaseAutomationExternalDecision extends DatabaseAutomationPermissionDecision {
  maxEgressBytes: number;
}

export interface DatabaseAutomationPlan {
  event: DatabaseAutomationEvent;
  automationId: string;
  automationVersion: number;
  internalPlan: DatabasePlanArtifact | null;
  /** True when a production policy must route the internal write through migration first. */
  migrationRequired: boolean;
  notifications: readonly {
    actionId: string;
    recipientIds: readonly string[];
    title: string;
    body: string;
  }[];
  external: readonly {
    actionId: string;
    kind: 'external_webhook' | 'external_email';
    connectionId: string;
    payload: Readonly<Record<string, unknown>>;
    egressBytes: number;
    policyId: string;
    policyRevision: string;
  }[];
  permissionGuards: readonly {
    actionId: string;
    policyId: string;
    policyRevision: string;
  }[];
}

export interface CreateDatabaseAutomationServiceOptions {
  projectDir: string;
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  databasePlanEngine: DatabasePlanEngine;
  databaseCommitEngine: DatabaseCommitEngine;
  resolvePermission: (input: {
    databaseId: string;
    automationId: string;
    ownerId: string;
    action: DatabaseAutomationAction;
    sourceId: string | null;
    recordId: string | null;
  }) => DatabaseAutomationPermissionDecision;
  resolveExternalPolicy?: (input: {
    databaseId: string;
    automationId: string;
    ownerId: string;
    action: Extract<DatabaseAutomationAction, { kind: 'external_webhook' | 'external_email' }>;
    egressBytes: number;
  }) => DatabaseAutomationExternalDecision;
  deliverExternal?: (input: {
    connectionId: string;
    kind: 'external_webhook' | 'external_email';
    payload: Readonly<Record<string, unknown>>;
    idempotencyKey: string;
  }) => Promise<{ receiptId: string }>;
  deliverNotification?: (input: {
    recipientIds: readonly string[];
    title: string;
    body: string;
    idempotencyKey: string;
  }) => Promise<{ receiptId: string }>;
  now?: () => Date;
  generateUuid?: () => string;
  /** Production disables legacy v1 record-file mutations; tests/import callers may opt in. */
  allowLegacyV1Mutation?: boolean;
}

export interface EnqueueDatabaseAutomationEventInput {
  deduplicationKey: string;
  databaseId: string;
  kind: DatabaseAutomationEvent['kind'];
  occurredAt?: string;
  sourceId?: string | null;
  recordId?: string | null;
  recordRevision?: string | null;
  propertyId?: string | null;
  viewId?: string | null;
  buttonId?: string | null;
  scheduledFor?: string | null;
  targetAutomationId?: string | null;
  origin?: DatabaseAutomationEvent['origin'];
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

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function compactUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : 'Automation execution failed').slice(0, 2_000);
}

function automationMatches(
  automation: DatabaseAutomation,
  event: DatabaseAutomationEvent,
): boolean {
  if (event.targetAutomationId !== null && event.targetAutomationId !== automation.id) return false;
  const trigger = automation.trigger;
  if (trigger.kind !== event.kind) return false;
  switch (trigger.kind) {
    case 'record_added':
      return trigger.sourceId === event.sourceId;
    case 'property_changed':
      return trigger.sourceId === event.sourceId && trigger.propertyId === event.propertyId;
    case 'schedule':
      return event.scheduledFor !== null;
    case 'form_submitted':
      return trigger.viewId === event.viewId;
    case 'button_invoked':
      return trigger.buttonId
        ? trigger.buttonId === event.buttonId
        : trigger.propertyId === event.propertyId;
  }
}

function eventValue(value: unknown, record: DatabaseRecord | null): unknown {
  if (!value || typeof value !== 'object' || !('fromEvent' in value)) return structuredClone(value);
  const reference = value as { fromEvent: string; propertyId?: string };
  if (!record) throw new Error(`Event value "${reference.fromEvent}" requires a record`);
  if (reference.fromEvent === 'record_id') return record.id;
  if (reference.fromEvent === 'record_body') return record.body;
  if (reference.fromEvent === 'property' && reference.propertyId) {
    return structuredClone(record.values[reference.propertyId]);
  }
  throw new Error('Automation contains an invalid event value reference');
}

type DraftMutationOperation = NonNullable<
  DatabaseDesiredStateDraftInput['recordMutations']
>[number]['operations'][number];

function mutationOperation(
  definition: DatabaseDefinition,
  sourceId: string,
  operation: Extract<
    DatabaseAutomationAction,
    { kind: 'update_trigger_record' }
  >['operations'][number],
): DraftMutationOperation {
  const source = definition.sources.find((candidate) => candidate.id === sourceId);
  const property =
    operation.propertyId === undefined
      ? undefined
      : source?.properties.find((candidate) => candidate.id === operation.propertyId);
  if (operation.propertyId !== undefined && !property) {
    throw new Error(`Automation mutation property "${operation.propertyId}" was removed`);
  }
  if (operation.op === 'append' && operation.propertyId === undefined) {
    return { op: 'append', value: operation.value };
  }
  if (!property) throw new Error('Automation mutation requires a property');
  if (operation.op === 'set')
    return { op: 'set', propertyKey: property.key, value: operation.value };
  if (operation.op === 'unset') return { op: 'unset', propertyKey: property.key };
  if (operation.op === 'increment') {
    return { op: 'increment', propertyKey: property.key, by: operation.by };
  }
  if (operation.op === 'append') {
    return { op: 'append', propertyKey: property.key, value: operation.value };
  }
  if (operation.op === 'link' || operation.op === 'unlink') {
    return { op: operation.op, propertyKey: property.key, recordId: operation.recordId };
  }
  if (operation.op === 'add' || operation.op === 'remove') {
    return { op: operation.op, propertyKey: property.key, value: operation.value };
  }
  throw new Error('Automation contains an unsupported record mutation');
}

export class DatabaseAutomationService {
  readonly #statePath: string;
  readonly #lockPath: string;
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #databasePlanEngine: DatabasePlanEngine;
  readonly #databaseCommitEngine: DatabaseCommitEngine;
  readonly #resolvePermission: CreateDatabaseAutomationServiceOptions['resolvePermission'];
  readonly #resolveExternalPolicy: CreateDatabaseAutomationServiceOptions['resolveExternalPolicy'];
  readonly #deliverExternal: CreateDatabaseAutomationServiceOptions['deliverExternal'];
  readonly #deliverNotification: CreateDatabaseAutomationServiceOptions['deliverNotification'];
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #allowLegacyV1Mutation: boolean;
  #running = false;

  constructor(options: CreateDatabaseAutomationServiceOptions) {
    this.#statePath = resolve(options.projectDir, '.ok', 'local', 'database-automation-runs.json');
    this.#lockPath = resolve(options.projectDir, '.ok', 'local', '.database-automation.lock');
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#databasePlanEngine = options.databasePlanEngine;
    this.#databaseCommitEngine = options.databaseCommitEngine;
    this.#resolvePermission = options.resolvePermission;
    this.#resolveExternalPolicy = options.resolveExternalPolicy;
    this.#deliverExternal = options.deliverExternal;
    this.#deliverNotification = options.deliverNotification;
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#allowLegacyV1Mutation = options.allowLegacyV1Mutation ?? true;
  }

  async listRuns(filter: { databaseId?: string; automationId?: string; limit?: number } = {}) {
    const state = await this.#read();
    return state.runs
      .filter(
        (run) =>
          (filter.databaseId === undefined || run.databaseId === filter.databaseId) &&
          (filter.automationId === undefined || run.automationId === filter.automationId),
      )
      .slice(0, Math.max(1, Math.min(filter.limit ?? 100, 500)))
      .map((run) => structuredClone(run));
  }

  async enqueue(input: EnqueueDatabaseAutomationEventInput): Promise<DatabaseAutomationEvent> {
    await mkdir(dirname(this.#lockPath), { recursive: true });
    return withFileLock(this.#lockPath, async () => {
      const state = await this.#read();
      const duplicate = state.events.find(
        (event) =>
          event.databaseId === input.databaseId &&
          event.deduplicationKey === input.deduplicationKey,
      );
      if (duplicate) return structuredClone(duplicate);
      const event = DatabaseAutomationEventSchema.parse({
        version: 1,
        id: `aevt_${compactUuid(this.#generateUuid)}`,
        deduplicationKey: input.deduplicationKey,
        databaseId: input.databaseId,
        kind: input.kind,
        occurredAt: input.occurredAt ?? this.#now().toISOString(),
        sourceId: input.sourceId ?? null,
        recordId: input.recordId ?? null,
        recordRevision: input.recordRevision ?? null,
        propertyId: input.propertyId ?? null,
        viewId: input.viewId ?? null,
        buttonId: input.buttonId ?? null,
        scheduledFor: input.scheduledFor ?? null,
        targetAutomationId: input.targetAutomationId ?? null,
        origin: input.origin ?? null,
      });
      const snapshot = this.#databaseStore.snapshot();
      const definition = snapshot.databases.find((database) => database.id === event.databaseId);
      const newRuns: DatabaseAutomationRun[] = [];
      for (const automation of definition?.automations ?? []) {
        if (!automation.enabled || !automationMatches(automation, event)) continue;
        const runId = `autorun_${digest({ eventId: event.id, automationId: automation.id, version: automation.version }).slice(0, 32)}`;
        const loop = event.origin?.automationIds.includes(automation.id) ?? false;
        const fanout = (event.origin?.generatedEvents ?? 0) > automation.limits.maxGeneratedEvents;
        newRuns.push({
          version: 1,
          id: runId,
          eventId: event.id,
          databaseId: event.databaseId,
          automationId: automation.id,
          automationVersion: automation.version,
          ownerId: automation.ownerId,
          schemaRevision: snapshot.revision,
          state: loop || fanout ? 'skipped' : 'pending',
          attempt: 0,
          createdAt: this.#now().toISOString(),
          startedAt: null,
          finishedAt: loop || fanout ? this.#now().toISOString() : null,
          nextAttemptAt: null,
          internalRequired: false,
          internalMutationId: null,
          actions: [],
          errorCode: loop ? 'loop_prevented' : fanout ? 'fanout_exceeded' : null,
          error: loop
            ? 'Automation ancestry already contains this automation'
            : fanout
              ? 'Automation-generated event limit was exceeded'
              : null,
        });
      }
      state.events = [event, ...state.events].slice(0, MAX_EVENTS);
      state.runs = [
        ...newRuns,
        ...state.runs.filter((run) => !newRuns.some((candidate) => candidate.id === run.id)),
      ].slice(0, MAX_RUNS);
      await this.#write(state);
      return structuredClone(event);
    });
  }

  async dryRun(input: {
    databaseId: string;
    automationId: string;
    event: EnqueueDatabaseAutomationEventInput;
  }): Promise<DatabaseAutomationPlan> {
    const event = DatabaseAutomationEventSchema.parse({
      version: 1,
      id: `aevt_test_${compactUuid(this.#generateUuid)}`,
      deduplicationKey: input.event.deduplicationKey,
      databaseId: input.databaseId,
      kind: input.event.kind,
      occurredAt: input.event.occurredAt ?? this.#now().toISOString(),
      sourceId: input.event.sourceId ?? null,
      recordId: input.event.recordId ?? null,
      recordRevision: input.event.recordRevision ?? null,
      propertyId: input.event.propertyId ?? null,
      viewId: input.event.viewId ?? null,
      buttonId: input.event.buttonId ?? null,
      scheduledFor: input.event.scheduledFor ?? null,
      targetAutomationId: input.automationId,
      origin: input.event.origin ?? null,
    });
    const definition = this.#databaseStore.getById(input.databaseId);
    const automation = definition?.automations.find(
      (candidate) => candidate.id === input.automationId,
    );
    if (!definition || !automation) throw new Error('Automation was not found');
    if (!automationMatches(automation, event))
      throw new Error('Test event does not match the trigger');
    return this.#compile(definition, automation, event);
  }

  async tick(): Promise<DatabaseAutomationRun[]> {
    if (this.#running) return [];
    this.#running = true;
    try {
      await mkdir(dirname(this.#lockPath), { recursive: true });
      return await withFileLock(this.#lockPath, async () => {
        const state = await this.#read();
        await this.#enqueueSchedulesLocked(state);
        const changed: DatabaseAutomationRun[] = [];
        for (const original of [...state.runs].reverse()) {
          if (
            original.state !== 'pending' &&
            original.state !== 'executing' &&
            original.state !== 'retry_wait'
          )
            continue;
          if (original.nextAttemptAt && Date.parse(original.nextAttemptAt) > this.#now().getTime())
            continue;
          const run = await this.#executeRun(state, original);
          state.runs = [run, ...state.runs.filter((candidate) => candidate.id !== run.id)].slice(
            0,
            MAX_RUNS,
          );
          await this.#write(state);
          changed.push(structuredClone(run));
        }
        return changed;
      });
    } finally {
      this.#running = false;
    }
  }

  async #executeRun(
    state: z.infer<typeof StateSchema>,
    original: DatabaseAutomationRun,
  ): Promise<DatabaseAutomationRun> {
    const now = this.#now();
    const attempt = original.attempt + 1;
    const running: DatabaseAutomationRun = {
      ...structuredClone(original),
      state: 'executing',
      attempt,
      startedAt: original.startedAt ?? now.toISOString(),
      nextAttemptAt: null,
      errorCode: null,
      error: null,
    };
    state.runs = [running, ...state.runs.filter((run) => run.id !== running.id)].slice(0, MAX_RUNS);
    await this.#write(state);
    const snapshot = this.#databaseStore.snapshot();
    const definition = snapshot.databases.find((database) => database.id === running.databaseId);
    const automation = definition?.automations.find(
      (candidate) => candidate.id === running.automationId,
    );
    const event = state.events.find((candidate) => candidate.id === running.eventId);
    if (!definition || !automation || !event || automation.version !== running.automationVersion) {
      return {
        ...running,
        state: 'skipped',
        finishedAt: now.toISOString(),
        errorCode: 'stale_schema',
        error: 'Automation or database schema changed after the event was captured',
      };
    }
    try {
      const commitKey = `automation-run:${running.id}:internal`;
      let commit: DatabaseCommitResult | null =
        await this.#databaseCommitEngine.getIdempotentResult(commitKey);
      let outbox = state.outbox.filter((item) => item.runId === running.id);
      let plan: DatabaseAutomationPlan | null = null;
      if (!commit && (outbox.length === 0 || running.internalRequired)) {
        if (snapshot.revision !== running.schemaRevision) {
          throw new Error('Automation or database schema changed after the event was captured');
        }
        plan = this.#compile(definition, automation, event);
      }
      if (
        plan?.internalPlan &&
        !plan.internalPlan.committable &&
        plan.internalPlan.conflicts.some(
          (conflict) => conflict.code === 'source_record_migration_required',
        )
      ) {
        throw new DatabaseAutomationMigrationRequiredError(
          'This automation targets a v1/read-only database; preview and approve its v1→v2 migration before editing it.',
        );
      }
      if (plan?.migrationRequired) {
        throw new DatabaseAutomationMigrationRequiredError(
          v1MigrationRequiredMessage('This automation target'),
        );
      }
      if (outbox.length === 0 && !(commit && running.internalRequired)) {
        plan ??= this.#compile(definition, automation, event);
        const guardByAction = new Map(
          plan.permissionGuards.map((guard) => [guard.actionId, guard]),
        );
        outbox = [
          ...plan.notifications.map((notification) => {
            const guard = guardByAction.get(notification.actionId);
            if (!guard) throw new Error('Automation notification permission guard is missing');
            return DatabaseAutomationOutboxItemSchema.parse({
              runId: running.id,
              actionId: notification.actionId,
              kind: 'notification',
              state: 'pending',
              permissionPolicyId: guard.policyId,
              permissionPolicyRevision: guard.policyRevision,
              connectionId: null,
              recipientIds: notification.recipientIds,
              title: notification.title,
              body: notification.body,
              payload: null,
              egressBytes: 0,
              egressPolicyId: null,
              egressPolicyRevision: null,
              receiptId: null,
            });
          }),
          ...plan.external.map((external) => {
            const guard = guardByAction.get(external.actionId);
            if (!guard) throw new Error('Automation external permission guard is missing');
            return DatabaseAutomationOutboxItemSchema.parse({
              runId: running.id,
              actionId: external.actionId,
              kind: external.kind,
              state: 'pending',
              permissionPolicyId: guard.policyId,
              permissionPolicyRevision: guard.policyRevision,
              connectionId: external.connectionId,
              recipientIds: [],
              title: null,
              body: null,
              payload: external.payload,
              egressBytes: external.egressBytes,
              egressPolicyId: external.policyId,
              egressPolicyRevision: external.policyRevision,
              receiptId: null,
            });
          }),
        ];
        running.internalRequired = plan.internalPlan !== null;
        state.outbox = [...outbox, ...state.outbox.filter((item) => item.runId !== running.id)];
        if (plan.internalPlan) {
          const pending = plan.internalPlan.diff.records.flatMap((change) => {
            if (change.action === 'delete') return [];
            if (change.action === 'create') {
              return [
                PendingAutomationEventSchema.parse({
                  runId: running.id,
                  deduplicationKey: `automation:${running.id}:record:${change.recordId}`,
                  kind: 'record_added',
                  databaseId: definition.id,
                  sourceId: change.sourceId,
                  recordId: change.recordId,
                  propertyId: null,
                }),
              ];
            }
            const before = change.before?.values ?? {};
            const after = change.after?.values ?? {};
            return [...new Set([...Object.keys(before), ...Object.keys(after)])]
              .filter((propertyId) => stable(before[propertyId]) !== stable(after[propertyId]))
              .map((propertyId) =>
                PendingAutomationEventSchema.parse({
                  runId: running.id,
                  deduplicationKey: `automation:${running.id}:record:${change.recordId}:property:${propertyId}`,
                  kind: 'property_changed',
                  databaseId: definition.id,
                  sourceId: change.sourceId,
                  recordId: change.recordId,
                  propertyId,
                }),
              );
          });
          state.pendingEvents = [
            ...pending,
            ...state.pendingEvents.filter((item) => item.runId !== running.id),
          ];
        }
        state.runs = [running, ...state.runs.filter((run) => run.id !== running.id)].slice(
          0,
          MAX_RUNS,
        );
        await this.#write(state);
      }
      if (!commit && plan?.internalPlan) {
        if (!plan.internalPlan.committable) throw new Error('Automation internal plan is blocked');
        commit = await this.#databaseCommitEngine.commit({
          planId: plan.internalPlan.id,
          planHash: plan.internalPlan.hash,
          expectedSnapshotRevision: plan.internalPlan.snapshotRevision,
          idempotencyKey: commitKey,
          approvalToken: this.#databaseCommitEngine.expectedApprovalToken(plan.internalPlan.hash),
          actor: {
            principalId: `automation-owner:${automation.ownerId}`,
            kind: 'system',
            sessionId: running.id,
          },
        });
      }
      const generated = state.pendingEvents.filter((item) => item.runId === running.id);
      for (const pending of generated) {
        const changedRecord = this.#databaseRecordIndex.getById(pending.recordId);
        if (!changedRecord?.revision) {
          throw new Error('Committed automation event record is not exactly indexed');
        }
        this.#appendEventLocked(state, {
          deduplicationKey: pending.deduplicationKey,
          databaseId: pending.databaseId,
          kind: pending.kind,
          sourceId: pending.sourceId,
          recordId: pending.recordId,
          recordRevision: changedRecord.revision,
          propertyId: pending.propertyId,
          origin: {
            runId: running.id,
            automationIds: [...(event.origin?.automationIds ?? []), automation.id].slice(-16),
            generatedEvents: (event.origin?.generatedEvents ?? 0) + generated.length,
          },
        });
      }
      state.pendingEvents = state.pendingEvents.filter((item) => item.runId !== running.id);
      await this.#write(state);
      const results: DatabaseAutomationRun['actions'] = [];
      for (let item of outbox) {
        const action = automation.actions.find((candidate) => candidate.id === item.actionId);
        if (!action) throw new Error('Automation delivery action changed after planning');
        const permission = this.#resolvePermission({
          databaseId: definition.id,
          automationId: automation.id,
          ownerId: automation.ownerId,
          action,
          sourceId: event.sourceId,
          recordId: event.recordId,
        });
        if (
          !permission.allowed ||
          permission.policyId !== item.permissionPolicyId ||
          permission.policyRevision !== item.permissionPolicyRevision
        ) {
          throw new Error('Automation delivery permission changed after planning');
        }
        if (item.state !== 'succeeded') {
          let receipt: { receiptId: string };
          if (item.kind === 'notification') {
            if (!this.#deliverNotification || item.title === null || item.body === null) {
              throw new Error('Internal notification delivery is unavailable');
            }
            receipt = await this.#deliverNotification({
              recipientIds: item.recipientIds,
              title: item.title,
              body: item.body,
              idempotencyKey: `automation-run:${running.id}:action:${item.actionId}`,
            });
          } else {
            if (
              !this.#deliverExternal ||
              !this.#resolveExternalPolicy ||
              !item.connectionId ||
              !item.payload
            ) {
              throw new Error('External automation delivery is unavailable');
            }
            if (action.kind !== 'external_webhook' && action.kind !== 'external_email') {
              throw new Error('External automation action changed after planning');
            }
            const currentPolicy = this.#resolveExternalPolicy({
              databaseId: definition.id,
              automationId: automation.id,
              ownerId: automation.ownerId,
              action,
              egressBytes: item.egressBytes,
            });
            if (
              !currentPolicy.allowed ||
              currentPolicy.policyId !== item.egressPolicyId ||
              currentPolicy.policyRevision !== item.egressPolicyRevision ||
              item.egressBytes > currentPolicy.maxEgressBytes
            ) {
              throw new Error('External egress permission changed after planning');
            }
            receipt = await this.#deliverExternal({
              connectionId: item.connectionId,
              kind: item.kind,
              payload: item.payload,
              idempotencyKey: `automation-run:${running.id}:action:${item.actionId}`,
            });
          }
          item = { ...item, state: 'succeeded', receiptId: receipt.receiptId };
          state.outbox = state.outbox.map((candidate) =>
            candidate.runId === item.runId && candidate.actionId === item.actionId
              ? item
              : candidate,
          );
          await this.#write(state);
        }
        results.push({
          actionId: item.actionId,
          kind: item.kind,
          state: 'succeeded',
          receiptId: item.receiptId,
          error: null,
        });
      }
      state.outbox = state.outbox.filter((item) => item.runId !== running.id);
      return {
        ...running,
        state: 'succeeded',
        finishedAt: this.#now().toISOString(),
        internalMutationId: commit?.mutationId ?? null,
        actions: automation.actions.map(
          (action) =>
            results.find((candidate) => candidate.actionId === action.id) ?? {
              actionId: action.id,
              kind: action.kind,
              state: 'succeeded',
              receiptId: commit?.mutationId ?? null,
              error: null,
            },
        ),
        errorCode: null,
        error: null,
      };
    } catch (error) {
      const migrationRequired = error instanceof DatabaseAutomationMigrationRequiredError;
      const exhausted = migrationRequired || attempt >= automation.retry.maxAttempts;
      if (exhausted) incrementDatabaseAutomationRunFailure();
      const delay =
        automation.retry.initialBackoffSeconds *
        automation.retry.multiplier ** Math.max(0, attempt - 1);
      return {
        ...running,
        state: exhausted ? 'failed' : 'retry_wait',
        finishedAt: exhausted ? this.#now().toISOString() : null,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + delay * 1_000).toISOString(),
        errorCode: migrationRequired
          ? 'migration_required'
          : errorText(error).includes('permission')
            ? 'permission_denied'
            : errorText(error).includes('External')
              ? 'external_unavailable'
              : 'execution_failed',
        error: errorText(error),
      };
    }
  }

  #compile(
    definition: DatabaseDefinition,
    automation: DatabaseAutomation,
    event: DatabaseAutomationEvent,
  ): DatabaseAutomationPlan {
    const record = event.recordId ? this.#databaseRecordIndex.getById(event.recordId) : null;
    if (
      event.recordId &&
      (!record || record.databaseId !== definition.id || record.revision !== event.recordRevision)
    ) {
      throw new Error('Automation event record revision is stale');
    }
    const sampleRecords: NonNullable<DatabaseDesiredStateDraftInput['sampleRecords']> = [];
    const recordMutations: NonNullable<DatabaseDesiredStateDraftInput['recordMutations']> = [];
    const notifications: DatabaseAutomationPlan['notifications'][number][] = [];
    const external: DatabaseAutomationPlan['external'][number][] = [];
    const guards: DatabaseAutomationPlan['permissionGuards'][number][] = [];
    for (const action of automation.actions) {
      const decision = this.#resolvePermission({
        databaseId: definition.id,
        automationId: automation.id,
        ownerId: automation.ownerId,
        action,
        sourceId: record?.sourceId ?? null,
        recordId: record?.id ?? null,
      });
      if (!decision.allowed)
        throw new Error(`Automation permission denied for action "${action.id}"`);
      guards.push({
        actionId: action.id,
        policyId: decision.policyId,
        policyRevision: decision.policyRevision,
      });
      if (action.kind === 'create_record') {
        const source = definition.sources.find((candidate) => candidate.id === action.sourceId);
        if (!source) throw new Error(`Automation source "${action.sourceId}" was removed`);
        sampleRecords.push({
          sourceKey: source.key,
          values: Object.fromEntries(
            Object.entries(action.values).map(([propertyId, value]) => {
              const property = source.properties.find((candidate) => candidate.id === propertyId);
              if (!property) throw new Error(`Automation property "${propertyId}" was removed`);
              return [property.key, eventValue(value, record)];
            }),
          ),
          body: action.body === undefined ? '' : String(eventValue(action.body, record) ?? ''),
        });
      } else if (action.kind === 'apply_template') {
        const template = definition.templates.find(
          (candidate) => candidate.id === action.templateId,
        );
        if (!template) throw new Error(`Automation template "${action.templateId}" was removed`);
        const source = definition.sources.find((candidate) => candidate.id === template.sourceId);
        if (!source) throw new Error('Automation template source was removed');
        const applied = applyDatabaseTemplate(definition, {
          sourceId: source.id,
          templateId: template.id,
        });
        sampleRecords.push({
          sourceKey: source.key,
          values: Object.fromEntries(
            Object.entries(applied.values).map(([propertyId, value]) => {
              const property = source.properties.find((candidate) => candidate.id === propertyId);
              if (!property) throw new Error(`Template property "${propertyId}" was removed`);
              return [property.key, value];
            }),
          ),
          body: applied.body,
        });
      } else if (action.kind === 'notification') {
        notifications.push({
          actionId: action.id,
          recipientIds: action.recipientIds,
          title: action.title,
          body: action.body,
        });
      } else if (action.kind === 'external_webhook' || action.kind === 'external_email') {
        if (!this.#resolveExternalPolicy)
          throw new Error('External automation policy is unavailable');
        const payload: Record<string, unknown> = {
          databaseId: definition.id,
          automationId: automation.id,
          eventId: event.id,
          kind: event.kind,
          recordId: record?.id ?? null,
          recordRevision: record?.revision ?? null,
          properties: Object.fromEntries(
            action.propertyIds.map((propertyId) => [
              propertyId,
              structuredClone(record?.values[propertyId]),
            ]),
          ),
          ...(action.includeBody ? { body: record?.body ?? '' } : {}),
          ...(action.kind === 'external_webhook'
            ? { eventName: action.eventName }
            : { to: action.to, subject: action.subject }),
        };
        const egressBytes = Buffer.byteLength(JSON.stringify(payload));
        const policy = this.#resolveExternalPolicy({
          databaseId: definition.id,
          automationId: automation.id,
          ownerId: automation.ownerId,
          action,
          egressBytes,
        });
        if (!policy.allowed || egressBytes > policy.maxEgressBytes)
          throw new Error(`External egress permission denied for action "${action.id}"`);
        external.push({
          actionId: action.id,
          kind: action.kind,
          connectionId: action.connectionId,
          payload,
          egressBytes,
          policyId: policy.policyId,
          policyRevision: policy.policyRevision,
        });
      } else {
        if (!record?.revision)
          throw new Error(`Automation action "${action.kind}" requires an exact record`);
        const source = definition.sources.find((candidate) => candidate.id === record.sourceId);
        if (!source) throw new Error('Automation event source was removed');
        let operations: DraftMutationOperation[];
        if (action.kind === 'update_trigger_record') {
          operations = action.operations.map((operation) =>
            mutationOperation(definition, source.id, operation),
          );
        } else if (action.kind === 'change_relation') {
          const property = source.properties.find(
            (candidate) => candidate.id === action.propertyId,
          );
          if (!property) throw new Error('Automation relation property was removed');
          operations = [
            {
              op: action.operation === 'add' ? 'link' : 'unlink',
              propertyKey: property.key,
              recordId: action.recordId,
            },
          ];
        } else {
          const property = source.properties.find(
            (candidate) => candidate.id === action.propertyId,
          );
          const person = definition.people.find((candidate) => candidate.id === action.personId);
          if (!property || !person) throw new Error('Automation person reference was removed');
          operations =
            action.operation === 'set'
              ? [{ op: 'set', propertyKey: property.key, value: [person.key] }]
              : [{ op: action.operation, propertyKey: property.key, value: person.key }];
        }
        recordMutations.push({
          id: record.id,
          expectedRevision: record.revision,
          sourceKey: source.key,
          operations,
        });
      }
    }
    let internalPlan: DatabasePlanArtifact | null = null;
    if (sampleRecords.length > 0 || recordMutations.length > 0) {
      const draft = this.#databasePlanEngine.createDraft({
        ...databaseDesiredStateBase(definition),
        sampleRecords,
        recordMutations,
        recordArchives: [],
      });
      internalPlan = this.#databasePlanEngine.createPlan(draft.id);
    }
    const migrationRequired =
      !this.#allowLegacyV1Mutation &&
      isV1Database(definition) &&
      (sampleRecords.length > 0 || recordMutations.length > 0);
    return {
      event,
      automationId: automation.id,
      automationVersion: automation.version,
      internalPlan,
      migrationRequired,
      notifications,
      external,
      permissionGuards: guards,
    };
  }

  async #enqueueSchedulesLocked(state: z.infer<typeof StateSchema>): Promise<void> {
    const now = this.#now();
    const snapshot = this.#databaseStore.snapshot();
    for (const definition of snapshot.databases) {
      for (const automation of definition.automations) {
        if (!automation.enabled || automation.trigger.kind !== 'schedule') continue;
        const occurrence = latestDatabaseTemplateOccurrence(
          {
            schedule: automation.trigger.schedule,
            timeZone: automation.trigger.timeZone,
            ownerId: automation.ownerId,
            paused: false,
            retry: automation.retry,
          },
          now,
        );
        if (!occurrence) continue;
        const scheduledFor = occurrence.toISOString();
        const deduplicationKey = `schedule:${automation.id}:v${automation.version}:${scheduledFor}`;
        if (state.events.some((event) => event.deduplicationKey === deduplicationKey)) continue;
        const event = DatabaseAutomationEventSchema.parse({
          version: 1,
          id: `aevt_${compactUuid(this.#generateUuid)}`,
          deduplicationKey,
          databaseId: definition.id,
          kind: 'schedule',
          occurredAt: now.toISOString(),
          sourceId: null,
          recordId: null,
          recordRevision: null,
          propertyId: null,
          viewId: null,
          buttonId: null,
          scheduledFor,
          targetAutomationId: automation.id,
          origin: null,
        });
        const run: DatabaseAutomationRun = {
          version: 1,
          id: `autorun_${digest({ eventId: event.id, automationId: automation.id, version: automation.version }).slice(0, 32)}`,
          eventId: event.id,
          databaseId: definition.id,
          automationId: automation.id,
          automationVersion: automation.version,
          ownerId: automation.ownerId,
          schemaRevision: snapshot.revision,
          state: 'pending',
          attempt: 0,
          createdAt: now.toISOString(),
          startedAt: null,
          finishedAt: null,
          nextAttemptAt: null,
          internalRequired: false,
          internalMutationId: null,
          actions: [],
          errorCode: null,
          error: null,
        };
        state.events = [event, ...state.events].slice(0, MAX_EVENTS);
        state.runs = [run, ...state.runs].slice(0, MAX_RUNS);
      }
    }
    await this.#write(state);
  }

  #appendEventLocked(
    state: z.infer<typeof StateSchema>,
    input: EnqueueDatabaseAutomationEventInput,
  ): DatabaseAutomationEvent {
    const duplicate = state.events.find(
      (event) =>
        event.databaseId === input.databaseId && event.deduplicationKey === input.deduplicationKey,
    );
    if (duplicate) return duplicate;
    const event = DatabaseAutomationEventSchema.parse({
      version: 1,
      id: `aevt_${compactUuid(this.#generateUuid)}`,
      deduplicationKey: input.deduplicationKey,
      databaseId: input.databaseId,
      kind: input.kind,
      occurredAt: input.occurredAt ?? this.#now().toISOString(),
      sourceId: input.sourceId ?? null,
      recordId: input.recordId ?? null,
      recordRevision: input.recordRevision ?? null,
      propertyId: input.propertyId ?? null,
      viewId: input.viewId ?? null,
      buttonId: input.buttonId ?? null,
      scheduledFor: input.scheduledFor ?? null,
      targetAutomationId: input.targetAutomationId ?? null,
      origin: input.origin ?? null,
    });
    const snapshot = this.#databaseStore.snapshot();
    const definition = snapshot.databases.find((database) => database.id === event.databaseId);
    const newRuns: DatabaseAutomationRun[] = [];
    for (const automation of definition?.automations ?? []) {
      if (!automation.enabled || !automationMatches(automation, event)) continue;
      const runId = `autorun_${digest({ eventId: event.id, automationId: automation.id, version: automation.version }).slice(0, 32)}`;
      const loop = event.origin?.automationIds.includes(automation.id) ?? false;
      const fanout = (event.origin?.generatedEvents ?? 0) > automation.limits.maxGeneratedEvents;
      newRuns.push({
        version: 1,
        id: runId,
        eventId: event.id,
        databaseId: event.databaseId,
        automationId: automation.id,
        automationVersion: automation.version,
        ownerId: automation.ownerId,
        schemaRevision: snapshot.revision,
        state: loop || fanout ? 'skipped' : 'pending',
        attempt: 0,
        createdAt: this.#now().toISOString(),
        startedAt: null,
        finishedAt: loop || fanout ? this.#now().toISOString() : null,
        nextAttemptAt: null,
        internalRequired: false,
        internalMutationId: null,
        actions: [],
        errorCode: loop ? 'loop_prevented' : fanout ? 'fanout_exceeded' : null,
        error: loop
          ? 'Automation ancestry already contains this automation'
          : fanout
            ? 'Automation-generated event limit was exceeded'
            : null,
      });
    }
    state.events = [event, ...state.events].slice(0, MAX_EVENTS);
    state.runs = [
      ...newRuns,
      ...state.runs.filter((run) => !newRuns.some((candidate) => candidate.id === run.id)),
    ].slice(0, MAX_RUNS);
    return event;
  }

  async #read(): Promise<z.infer<typeof StateSchema>> {
    try {
      return StateSchema.parse(JSON.parse(await readFile(this.#statePath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, events: [], runs: [], outbox: [], pendingEvents: [] };
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

export function createDatabaseAutomationService(options: CreateDatabaseAutomationServiceOptions) {
  return new DatabaseAutomationService(options);
}
