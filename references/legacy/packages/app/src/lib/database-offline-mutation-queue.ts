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

export async function reconcileOfflineDatabaseMutations(input: {
  store: OfflineDatabaseMutationStore;
  branch: string | null;
  serverInstanceId: string | null;
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
      const outcome = await input.execute(item);
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
