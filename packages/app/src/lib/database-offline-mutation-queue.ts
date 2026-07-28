import {
  type DatabaseRecordMutation,
  DatabaseRecordMutationSchema,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { z } from 'zod';

const OFFLINE_DATABASE_QUEUE_NAME = 'synapsenote-database-offline-v1';
const OFFLINE_DATABASE_QUEUE_STORE = 'mutations';
const OFFLINE_DATABASE_QUEUE_LIMIT = 100;
const OFFLINE_DATABASE_QUEUE_ITEM_MAX_BYTES = 1_048_576;
const OFFLINE_DATABASE_QUEUE_MAX_ATTEMPTS = 10;

const OfflineDatabaseMutationSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^offline_[A-Za-z0-9_-]{1,128}$/),
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    branch: z.string().min(1).max(1_000),
    serverInstanceId: z.string().min(1).max(1_000),
    recordMutations: z.array(DatabaseRecordMutationSchema).min(1).max(10_000),
    actor: z
      .object({
        principalId: z.string().min(1).max(256),
        sessionId: z.string().min(1).max(256).optional(),
      })
      .strict(),
    idempotencyKey: z.string().min(8).max(256),
    label: z.string().min(1).max(200),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    attempts: z.number().int().min(0).max(OFFLINE_DATABASE_QUEUE_MAX_ATTEMPTS),
    state: z.enum(['queued', 'blocked']),
    lastError: z.string().max(2_000).nullable(),
  })
  .strict();

export type OfflineDatabaseMutation = z.output<typeof OfflineDatabaseMutationSchema>;

export interface OfflineDatabaseMutationStore {
  list(): Promise<OfflineDatabaseMutation[]>;
  put(item: OfflineDatabaseMutation): Promise<void>;
  delete(id: string): Promise<void>;
}

export function offlineQueueableRecordMutations(
  desiredState: DatabaseDesiredStateDraftInput,
): DatabaseRecordMutation[] | null {
  const parsedMutations = z
    .array(DatabaseRecordMutationSchema)
    .max(10_000)
    .safeParse(desiredState.recordMutations);
  if (!parsedMutations.success || parsedMutations.data.length === 0) return null;
  if (
    (desiredState.sampleRecords?.length ?? 0) > 0 ||
    (desiredState.recordCopies?.length ?? 0) > 0 ||
    (desiredState.recordArchives?.length ?? 0) > 0 ||
    (desiredState.recordMoves?.length ?? 0) > 0 ||
    (desiredState.recordDeletions?.length ?? 0) > 0
  ) {
    return null;
  }
  if (parsedMutations.data.some((mutation) => mutation.preconditions.length === 0)) {
    return null;
  }
  return structuredClone(parsedMutations.data);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed'));
  });
}

async function openQueueDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('Offline queue storage is unavailable');
  const request = indexedDB.open(OFFLINE_DATABASE_QUEUE_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(OFFLINE_DATABASE_QUEUE_STORE)) {
      request.result.createObjectStore(OFFLINE_DATABASE_QUEUE_STORE, { keyPath: 'id' });
    }
  };
  return requestResult(request);
}

export function createIndexedDbOfflineDatabaseMutationStore(): OfflineDatabaseMutationStore {
  return {
    async list() {
      const database = await openQueueDatabase();
      try {
        const transaction = database.transaction(OFFLINE_DATABASE_QUEUE_STORE, 'readonly');
        const done = transactionDone(transaction);
        const raw = await requestResult(
          transaction.objectStore(OFFLINE_DATABASE_QUEUE_STORE).getAll(),
        );
        await done;
        return raw
          .flatMap((value) => {
            const parsed = OfflineDatabaseMutationSchema.safeParse(value);
            return parsed.success ? [parsed.data] : [];
          })
          .sort(
            (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
          );
      } finally {
        database.close();
      }
    },
    async put(item) {
      const parsed = OfflineDatabaseMutationSchema.parse(item);
      const database = await openQueueDatabase();
      try {
        const transaction = database.transaction(OFFLINE_DATABASE_QUEUE_STORE, 'readwrite');
        const done = transactionDone(transaction);
        transaction.objectStore(OFFLINE_DATABASE_QUEUE_STORE).put(parsed);
        await done;
      } finally {
        database.close();
      }
    },
    async delete(id) {
      const database = await openQueueDatabase();
      try {
        const transaction = database.transaction(OFFLINE_DATABASE_QUEUE_STORE, 'readwrite');
        const done = transactionDone(transaction);
        transaction.objectStore(OFFLINE_DATABASE_QUEUE_STORE).delete(id);
        await done;
      } finally {
        database.close();
      }
    },
  };
}

export const offlineDatabaseMutationStore = createIndexedDbOfflineDatabaseMutationStore();

export function createOfflineDatabaseMutation(input: {
  databaseId: string;
  sourceId: string;
  branch: string | null;
  serverInstanceId: string | null;
  recordMutations: readonly DatabaseRecordMutation[];
  actor: OfflineDatabaseMutation['actor'];
  idempotencyKey: string;
  label: string;
  id?: string;
  now?: number;
}): OfflineDatabaseMutation {
  if (!input.branch || !input.serverInstanceId) {
    throw new Error('Offline writes require a known branch and server instance');
  }
  if (input.recordMutations.some((mutation) => (mutation.preconditions?.length ?? 0) === 0)) {
    throw new Error('Offline record writes require exact property preconditions');
  }
  const now = input.now ?? Date.now();
  const item = OfflineDatabaseMutationSchema.parse({
    version: 1,
    id: input.id ?? `offline_${crypto.randomUUID()}`,
    databaseId: input.databaseId,
    sourceId: input.sourceId,
    branch: input.branch,
    serverInstanceId: input.serverInstanceId,
    recordMutations: input.recordMutations,
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    label: input.label,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    state: 'queued',
    lastError: null,
  });
  if (
    new TextEncoder().encode(JSON.stringify(item)).byteLength >
    OFFLINE_DATABASE_QUEUE_ITEM_MAX_BYTES
  ) {
    throw new Error('Offline database mutation exceeds the 1 MiB queue item limit');
  }
  return item;
}

export async function enqueueOfflineDatabaseMutation(
  store: OfflineDatabaseMutationStore,
  item: OfflineDatabaseMutation,
): Promise<void> {
  const entries = await store.list();
  if (entries.length >= OFFLINE_DATABASE_QUEUE_LIMIT) {
    throw new Error(`Offline database queue is limited to ${OFFLINE_DATABASE_QUEUE_LIMIT} writes`);
  }
  await store.put(item);
}

export interface OfflineDatabaseReconcileResult {
  committed: string[];
  converged: string[];
  blocked: string[];
  remaining: number;
  stoppedOffline: boolean;
}

export interface OfflineDatabaseRebaseConflict {
  mutationId: string;
  recordId: string | null;
  code:
    | 'branch_changed'
    | 'server_instance_changed'
    | 'record_deleted'
    | 'precondition_changed'
    | 'unstable_target';
  propertyKeys: readonly string[];
}

export type OfflineDatabaseRebaseResult =
  | { status: 'ready'; item: OfflineDatabaseMutation; rebasedRecordIds: readonly string[] }
  | { status: 'converged'; item: OfflineDatabaseMutation; convergedRecordIds: readonly string[] }
  | {
      status: 'conflict';
      item: OfflineDatabaseMutation;
      conflicts: readonly OfflineDatabaseRebaseConflict[];
    };

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyOperation(
  value: unknown,
  operation: DatabaseRecordMutation['operations'][number],
): unknown {
  switch (operation.op) {
    case 'set':
      return operation.value;
    case 'unset':
      return undefined;
    case 'increment':
      return typeof value === 'number' ? value + operation.by : value;
    case 'append':
      return `${typeof value === 'string' ? value : ''}${operation.value}`;
    case 'add': {
      const current = Array.isArray(value) ? [...value] : [];
      return current.some((entry) => equalValue(entry, operation.value))
        ? current
        : [...current, operation.value];
    }
    case 'remove':
      return Array.isArray(value)
        ? value.filter((entry) => !equalValue(entry, operation.value))
        : value;
    case 'link': {
      const current = Array.isArray(value) ? [...value] : [];
      return current.includes(operation.recordId) ? current : [...current, operation.recordId];
    }
    case 'unlink':
      return Array.isArray(value) ? value.filter((entry) => entry !== operation.recordId) : value;
  }
}

function operationPropertyKeys(mutation: DatabaseRecordMutation): readonly string[] {
  return [
    ...new Set(
      mutation.operations
        .map((operation) => ('propertyKey' in operation ? operation.propertyKey : null))
        .filter((propertyKey): propertyKey is string => propertyKey !== null),
    ),
  ].sort();
}

/** Rebase an offline queue item against the current stable-ID snapshot. */
export function rebaseOfflineDatabaseMutation(input: {
  item: OfflineDatabaseMutation;
  branch: string;
  serverInstanceId: string;
  records: ReadonlyMap<
    string,
    { revision: string | null; values: Readonly<Record<string, unknown>> }
  >;
}): OfflineDatabaseRebaseResult {
  const { item } = input;
  if (item.branch !== input.branch) {
    return {
      status: 'conflict',
      item,
      conflicts: [
        { mutationId: item.id, recordId: null, code: 'branch_changed', propertyKeys: [] },
      ],
    };
  }
  if (item.serverInstanceId !== input.serverInstanceId) {
    return {
      status: 'conflict',
      item,
      conflicts: [
        { mutationId: item.id, recordId: null, code: 'server_instance_changed', propertyKeys: [] },
      ],
    };
  }
  const rebasedRecordIds: string[] = [];
  const convergedRecordIds: string[] = [];
  const conflicts: OfflineDatabaseRebaseConflict[] = [];
  const recordMutations: DatabaseRecordMutation[] = [];
  for (const mutation of item.recordMutations) {
    if (!mutation.id) {
      conflicts.push({
        mutationId: item.id,
        recordId: null,
        code: 'unstable_target',
        propertyKeys: operationPropertyKeys(mutation),
      });
      continue;
    }
    const record = input.records.get(mutation.id);
    if (!record) {
      conflicts.push({
        mutationId: item.id,
        recordId: mutation.id,
        code: 'record_deleted',
        propertyKeys: operationPropertyKeys(mutation),
      });
      continue;
    }
    if (record.revision === null) {
      conflicts.push({
        mutationId: item.id,
        recordId: mutation.id,
        code: 'unstable_target',
        propertyKeys: operationPropertyKeys(mutation),
      });
      continue;
    }
    const preconditionsMatch = mutation.preconditions.every((precondition) => {
      const present = Object.hasOwn(record.values, precondition.propertyKey);
      return (
        present === precondition.present &&
        (!present || equalValue(record.values[precondition.propertyKey], precondition.value))
      );
    });
    const alreadyApplied = mutation.operations.every((operation) => {
      const propertyKey = 'propertyKey' in operation ? operation.propertyKey : null;
      if (!propertyKey) return false;
      const next = applyOperation(record.values[propertyKey], operation);
      return equalValue(next, record.values[propertyKey]);
    });
    if (!preconditionsMatch && alreadyApplied) {
      convergedRecordIds.push(mutation.id);
      continue;
    }
    if (!preconditionsMatch) {
      conflicts.push({
        mutationId: item.id,
        recordId: mutation.id,
        code: 'precondition_changed',
        propertyKeys: operationPropertyKeys(mutation),
      });
      continue;
    }
    recordMutations.push({ ...mutation, expectedRevision: record.revision });
    if (mutation.expectedRevision !== record.revision) rebasedRecordIds.push(mutation.id);
  }
  if (conflicts.length > 0) return { status: 'conflict', item, conflicts };
  const nextItem = { ...item, recordMutations, updatedAt: Date.now() };
  if (recordMutations.length === 0)
    return { status: 'converged', item: nextItem, convergedRecordIds };
  return { status: 'ready', item: nextItem, rebasedRecordIds };
}

export async function reconcileOfflineDatabaseMutations(input: {
  store: OfflineDatabaseMutationStore;
  branch: string | null;
  serverInstanceId: string | null;
  rebase?: (
    item: OfflineDatabaseMutation,
  ) => Promise<OfflineDatabaseRebaseResult> | OfflineDatabaseRebaseResult;
  execute: (
    item: OfflineDatabaseMutation,
  ) => Promise<'committed' | 'converged' | 'blocked' | 'review_declined'>;
  shouldProcess?: (item: OfflineDatabaseMutation) => boolean;
  isOfflineError: (cause: unknown) => boolean;
  now?: () => number;
}): Promise<OfflineDatabaseReconcileResult> {
  const result: OfflineDatabaseReconcileResult = {
    committed: [],
    converged: [],
    blocked: [],
    remaining: 0,
    stoppedOffline: false,
  };
  const entries = await input.store.list();
  for (const item of entries) {
    if (item.state === 'blocked') continue;
    if (input.shouldProcess && !input.shouldProcess(item)) continue;
    if (
      !input.branch ||
      !input.serverInstanceId ||
      item.branch !== input.branch ||
      item.serverInstanceId !== input.serverInstanceId
    ) {
      await input.store.put({
        ...item,
        state: 'blocked',
        updatedAt: input.now?.() ?? Date.now(),
        lastError: 'Workspace branch or server instance changed before reconciliation',
      });
      result.blocked.push(item.id);
      continue;
    }
    try {
      const rebased = input.rebase
        ? await input.rebase(item)
        : ({ status: 'ready', item, rebasedRecordIds: [] } satisfies OfflineDatabaseRebaseResult);
      if (rebased.status === 'conflict') {
        await input.store.put({
          ...item,
          state: 'blocked',
          attempts: Math.min(item.attempts + 1, OFFLINE_DATABASE_QUEUE_MAX_ATTEMPTS),
          updatedAt: input.now?.() ?? Date.now(),
          lastError:
            `Offline rebase conflict: ${rebased.conflicts.map((conflict) => conflict.code).join(', ')}`.slice(
              0,
              2_000,
            ),
        });
        result.blocked.push(item.id);
        continue;
      }
      if (rebased.status === 'converged') {
        await input.store.delete(item.id);
        result.converged.push(item.id);
        continue;
      }
      const outcome = await input.execute(rebased.item);
      if (outcome === 'committed' || outcome === 'converged') {
        await input.store.delete(item.id);
        result[outcome].push(item.id);
      } else {
        await input.store.put({
          ...item,
          state: 'blocked',
          attempts: Math.min(item.attempts + 1, OFFLINE_DATABASE_QUEUE_MAX_ATTEMPTS),
          updatedAt: input.now?.() ?? Date.now(),
          lastError:
            outcome === 'review_declined'
              ? 'Reconciled plan was not approved'
              : 'Current canonical state conflicts with the queued write',
        });
        result.blocked.push(item.id);
      }
    } catch (cause) {
      const attempts = Math.min(item.attempts + 1, OFFLINE_DATABASE_QUEUE_MAX_ATTEMPTS);
      const offline = input.isOfflineError(cause);
      await input.store.put({
        ...item,
        attempts,
        state: !offline || attempts >= OFFLINE_DATABASE_QUEUE_MAX_ATTEMPTS ? 'blocked' : 'queued',
        updatedAt: input.now?.() ?? Date.now(),
        lastError: cause instanceof Error ? cause.message.slice(0, 2_000) : 'Reconciliation failed',
      });
      if (offline) {
        result.stoppedOffline = true;
        break;
      }
      result.blocked.push(item.id);
    }
  }
  result.remaining = (await input.store.list()).length;
  return result;
}
