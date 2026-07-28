import { describe, expect, test } from 'bun:test';
import type { DatabaseRecordMutation } from '@nedian0brien/synapsenote-server';
import { IDBFactory } from 'fake-indexeddb';
import {
  createIndexedDbOfflineDatabaseMutationStore,
  createOfflineDatabaseMutation,
  enqueueOfflineDatabaseMutation,
  type OfflineDatabaseMutation,
  type OfflineDatabaseMutationStore,
  rebaseOfflineDatabaseMutation,
  reconcileOfflineDatabaseMutations,
} from './database-offline-mutation-queue';

class MemoryStore implements OfflineDatabaseMutationStore {
  readonly items = new Map<string, OfflineDatabaseMutation>();
  async list() {
    return [...this.items.values()].sort((left, right) => left.createdAt - right.createdAt);
  }
  async put(item: OfflineDatabaseMutation) {
    this.items.set(item.id, structuredClone(item));
  }
  async delete(id: string) {
    this.items.delete(id);
  }
}

const mutation: DatabaseRecordMutation = {
  id: 'rec_one',
  sourceKey: 'tasks',
  expectedRevision: `sha256:${'a'.repeat(64)}`,
  preconditions: [{ propertyKey: 'status', present: true, value: 'todo' }],
  operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
};

function item(id: string, overrides: Partial<OfflineDatabaseMutation> = {}) {
  return createOfflineDatabaseMutation({
    id,
    databaseId: 'db_tasks',
    sourceId: 'ds_tasks',
    branch: 'main',
    serverInstanceId: 'server-one',
    recordMutations: [mutation],
    actor: { principalId: 'user:local' },
    idempotencyKey: `offline-request-${id}`,
    label: 'Edit Status',
    now: Number(id.replace(/\D/g, '')) || 1,
    ...overrides,
  });
}

describe('offline database mutation queue', () => {
  test('persists validated writes through the production IndexedDB adapter', async () => {
    const previous = globalThis.indexedDB;
    Object.assign(globalThis, { indexedDB: new IDBFactory() });
    try {
      const first = createIndexedDbOfflineDatabaseMutationStore();
      await first.put(item('offline_1'));
      const afterRemount = createIndexedDbOfflineDatabaseMutationStore();
      expect(await afterRemount.list()).toEqual([item('offline_1')]);
      await afterRemount.delete('offline_1');
      expect(await first.list()).toEqual([]);
    } finally {
      Object.assign(globalThis, { indexedDB: previous });
    }
  });

  test('requires environment binding and exact property preconditions', () => {
    expect(() => item('offline_1', { branch: '' })).toThrow(/known branch/);
    expect(() =>
      createOfflineDatabaseMutation({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        branch: 'main',
        serverInstanceId: 'server-one',
        recordMutations: [{ ...mutation, preconditions: [] }],
        actor: { principalId: 'user:local' },
        idempotencyKey: 'offline-request-no-precondition',
        label: 'Unsafe edit',
      }),
    ).toThrow(/exact property preconditions/);
    expect(() =>
      createOfflineDatabaseMutation({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        branch: 'main',
        serverInstanceId: 'server-one',
        recordMutations: [
          {
            ...mutation,
            operations: [{ op: 'set', propertyKey: 'status', value: 'x'.repeat(1_048_576) }],
          },
        ],
        actor: { principalId: 'user:local' },
        idempotencyKey: 'offline-request-too-large',
        label: 'Oversized edit',
      }),
    ).toThrow(/1 MiB/);
  });

  test('refuses a 101st durable queue entry', async () => {
    const store = new MemoryStore();
    for (let index = 0; index < 100; index += 1) {
      await enqueueOfflineDatabaseMutation(store, item(`offline_${index}`));
    }
    await expect(enqueueOfflineDatabaseMutation(store, item('offline_100'))).rejects.toThrow(
      /limited to 100/,
    );
  });

  test('reconciles queued writes sequentially and removes committed or converged entries', async () => {
    const store = new MemoryStore();
    await enqueueOfflineDatabaseMutation(store, item('offline_1'));
    await enqueueOfflineDatabaseMutation(store, item('offline_2'));
    const seen: string[] = [];
    const result = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      execute: async (queued) => {
        seen.push(queued.id);
        return queued.id === 'offline_1' ? 'committed' : 'converged';
      },
      isOfflineError: () => false,
    });
    expect(seen).toEqual(['offline_1', 'offline_2']);
    expect(result).toMatchObject({
      committed: ['offline_1'],
      converged: ['offline_2'],
      remaining: 0,
      stoppedOffline: false,
    });
  });

  test('reconciles through the stable-ID rebase boundary before executing a queued write', async () => {
    const store = new MemoryStore();
    await enqueueOfflineDatabaseMutation(store, item('offline_1'));
    let observedRevision: string | undefined;
    const result = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      rebase: (queued) =>
        rebaseOfflineDatabaseMutation({
          item: queued,
          branch: 'main',
          serverInstanceId: 'server-one',
          records: new Map([
            ['rec_one', { revision: `sha256:${'b'.repeat(64)}`, values: { status: 'todo' } }],
          ]),
        }),
      execute: async (queued) => {
        observedRevision = queued.recordMutations[0]?.expectedRevision;
        return 'committed';
      },
      isOfflineError: () => false,
    });
    expect(observedRevision).toBe(`sha256:${'b'.repeat(64)}`);
    expect(result).toMatchObject({ committed: ['offline_1'], blocked: [], remaining: 0 });
  });

  test('blocks a different workspace epoch without executing its write', async () => {
    const store = new MemoryStore();
    await store.put(item('offline_1'));
    let executions = 0;
    const result = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'feature',
      serverInstanceId: 'server-two',
      execute: async () => {
        executions += 1;
        return 'committed';
      },
      isOfflineError: () => false,
      now: () => 100,
    });
    expect(executions).toBe(0);
    expect(result.blocked).toEqual(['offline_1']);
    expect((await store.list())[0]).toMatchObject({
      state: 'blocked',
      lastError: expect.stringContaining('branch or server instance changed'),
    });
  });

  test('stops at a transport failure and leaves later writes ordered and queued', async () => {
    const store = new MemoryStore();
    await store.put(item('offline_1'));
    await store.put(item('offline_2'));
    const result = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      execute: async () => {
        throw new TypeError('Failed to fetch');
      },
      isOfflineError: (cause) => cause instanceof TypeError,
    });
    expect(result).toMatchObject({ stoppedOffline: true, remaining: 2 });
    expect(
      (await store.list()).map(({ id, state, attempts }) => ({ id, state, attempts })),
    ).toEqual([
      { id: 'offline_1', state: 'queued', attempts: 1 },
      { id: 'offline_2', state: 'queued', attempts: 0 },
    ]);
  });

  // R-008 gap: `execute()` can resolve `'blocked'` — the queued write's
  // preconditions (e.g. a property renamed or removed) no longer match the
  // canonical state — or `'review_declined'`, without ever throwing. Both
  // were wired but never exercised by a test.
  test('blocks a queued write whose preconditions no longer match the current canonical state', async () => {
    const store = new MemoryStore();
    await store.put(item('offline_1'));
    const result = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      execute: async () => 'blocked',
      isOfflineError: () => false,
    });
    expect(result).toMatchObject({ committed: [], converged: [], blocked: ['offline_1'] });
    expect((await store.list())[0]).toMatchObject({
      state: 'blocked',
      attempts: 1,
      lastError: expect.stringContaining('conflicts with the queued write'),
    });
  });

  test('blocks a queued write whose reconciled plan was declined in review', async () => {
    const store = new MemoryStore();
    await store.put(item('offline_1'));
    const result = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      execute: async () => 'review_declined',
      isOfflineError: () => false,
    });
    expect(result).toMatchObject({ committed: [], converged: [], blocked: ['offline_1'] });
    expect((await store.list())[0]).toMatchObject({
      state: 'blocked',
      attempts: 1,
      lastError: expect.stringContaining('was not approved'),
    });
  });

  test('leaves a blocked write blocked and never re-executes it on a later reconciliation pass', async () => {
    const store = new MemoryStore();
    await store.put(item('offline_1'));
    let executions = 0;
    await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      execute: async () => {
        executions += 1;
        return 'blocked';
      },
      isOfflineError: () => false,
    });
    expect(executions).toBe(1);
    const second = await reconcileOfflineDatabaseMutations({
      store,
      branch: 'main',
      serverInstanceId: 'server-one',
      execute: async () => {
        executions += 1;
        return 'committed';
      },
      isOfflineError: () => false,
    });
    expect(executions).toBe(1);
    expect(second).toMatchObject({ committed: [], converged: [], blocked: [], remaining: 1 });
  });

  test('rebases stable record IDs after unrelated edits and reports wrong-cell conflicts', () => {
    const queued = item('offline_1');
    const rebased = rebaseOfflineDatabaseMutation({
      item: queued,
      branch: 'main',
      serverInstanceId: 'server-one',
      records: new Map([
        [
          'rec_one',
          { revision: `sha256:${'b'.repeat(64)}`, values: { status: 'todo', title: 'Task' } },
        ],
      ]),
    });
    expect(rebased).toMatchObject({ status: 'ready', rebasedRecordIds: ['rec_one'] });
    if (rebased.status === 'ready') {
      expect(rebased.item.recordMutations[0]?.expectedRevision).toBe(`sha256:${'b'.repeat(64)}`);
    }
    const conflict = rebaseOfflineDatabaseMutation({
      item: queued,
      branch: 'main',
      serverInstanceId: 'server-one',
      records: new Map([
        ['rec_one', { revision: `sha256:${'b'.repeat(64)}`, values: { status: 'in_progress' } }],
      ]),
    });
    expect(conflict).toMatchObject({
      status: 'conflict',
      conflicts: [{ code: 'precondition_changed', recordId: 'rec_one' }],
    });
  });

  test('converges when a queued set already landed and blocks unstable targets', () => {
    const queued = item('offline_1');
    const converged = rebaseOfflineDatabaseMutation({
      item: queued,
      branch: 'main',
      serverInstanceId: 'server-one',
      records: new Map([
        ['rec_one', { revision: `sha256:${'b'.repeat(64)}`, values: { status: 'done' } }],
      ]),
    });
    expect(converged).toMatchObject({ status: 'converged', convergedRecordIds: ['rec_one'] });
    const uniqueTarget = createOfflineDatabaseMutation({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      branch: 'main',
      serverInstanceId: 'server-one',
      recordMutations: [
        { ...mutation, id: undefined, expectedRevision: undefined, uniqueValue: 'Task' },
      ],
      actor: { principalId: 'user:local' },
      idempotencyKey: 'offline-request-unique',
      label: 'Unstable target',
    });
    expect(
      rebaseOfflineDatabaseMutation({
        item: uniqueTarget,
        branch: 'main',
        serverInstanceId: 'server-one',
        records: new Map(),
      }),
    ).toMatchObject({ status: 'conflict', conflicts: [{ code: 'unstable_target' }] });
  });
});
