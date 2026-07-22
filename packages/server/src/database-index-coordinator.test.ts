import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  createDatabaseIndexCoordinator,
  type DatabaseIndexChangeEvent,
} from './database-index-coordinator.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function record(title: string): string {
  return `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_task\ntitle: ${title}\n---\nBody\n`;
}

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-index-coordinator-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  tempDirs.push(projectDir);
  const databaseStore = createDatabaseStore({ projectDir, contentDir });
  await databaseStore.create(
    DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      contract: {
        purpose: 'Track tasks',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'tasks',
          properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
        },
      ],
    }),
  );
  const databaseRecordIndex = createDatabaseRecordIndex({ contentDir, databaseStore });
  const coordinator = createDatabaseIndexCoordinator({ contentDir, databaseRecordIndex });
  return { contentDir, databaseRecordIndex, coordinator };
}

describe('DatabaseIndexCoordinator', () => {
  test('fans out changes to independent subscribers and removes only the closed one', async () => {
    const { coordinator } = await fixture();
    const first: DatabaseIndexChangeEvent[] = [];
    const second: DatabaseIndexChangeEvent[] = [];
    const stopFirst = coordinator.subscribeChanges((event) => first.push(event));
    coordinator.subscribeChanges((event) => second.push(event));

    await coordinator.refresh('startup');
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);

    stopFirst();
    await coordinator.refresh('schema-change');
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(4);
  });

  test('bounds subscribers and releases capacity on unsubscribe', async () => {
    const { contentDir, databaseRecordIndex } = await fixture();
    const bounded = createDatabaseIndexCoordinator({
      contentDir,
      databaseRecordIndex,
      maxChangeListeners: 2,
    });
    const first = () => undefined;
    const second = () => undefined;
    const stopFirst = bounded.subscribeChanges(first);
    bounded.subscribeChanges(second);
    expect(() => bounded.subscribeChanges(() => undefined)).toThrow(/2-listener limit/);
    stopFirst();
    expect(() => bounded.subscribeChanges(() => undefined)).not.toThrow();
  });

  test('applies incremental record events immediately while idle', async () => {
    const { contentDir, databaseRecordIndex, coordinator } = await fixture();
    const events: DatabaseIndexChangeEvent[] = [];
    coordinator.setChangeListener((event) => events.push(event));
    await coordinator.refresh('startup');
    expect(events.map((event) => (event.kind === 'index' ? event.phase : event.kind))).toEqual([
      'rebuilding',
      'ready',
    ]);
    events.length = 0;
    const path = join(contentDir, 'tasks', 'task.md');

    coordinator.applyDiskEvent({
      kind: 'create',
      path,
      docName: 'tasks/task',
      content: record('Created'),
    });
    expect(databaseRecordIndex.getById('rec_task')?.values).toEqual({ prop_title: 'Created' });
    expect(events.at(-1)).toMatchObject({
      kind: 'records',
      reasons: ['record-create'],
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      recordIds: ['rec_task'],
    });

    coordinator.applyDiskEvent({
      kind: 'update',
      path,
      docName: 'tasks/task',
      content: record('Edited'),
    });
    expect(databaseRecordIndex.getById('rec_task')?.values).toEqual({ prop_title: 'Edited' });
    expect(events.at(-1)).toMatchObject({ kind: 'records', reasons: ['record-update'] });

    coordinator.applyDiskEvent({ kind: 'delete', path, docName: 'tasks/task' });
    expect(databaseRecordIndex.getById('rec_task')).toBeNull();
    expect(events.at(-1)).toMatchObject({
      kind: 'records',
      reasons: ['record-delete'],
      recordIds: ['rec_task'],
    });
  });

  test('replays file events that arrive during a canonical rebuild', async () => {
    const { contentDir, databaseRecordIndex, coordinator } = await fixture();
    const path = join(contentDir, 'tasks', 'task.md');
    writeFileSync(path, record('Disk'));

    const originalRebuild = databaseRecordIndex.rebuild.bind(databaseRecordIndex);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    databaseRecordIndex.rebuild = async () => {
      const result = await originalRebuild();
      await gate;
      return result;
    };

    const refresh = coordinator.refresh('schema-change');
    await Bun.sleep(0);
    coordinator.applyDiskEvent({
      kind: 'update',
      path,
      docName: 'tasks/task',
      content: record('Watcher wins'),
    });
    expect(coordinator.pendingReasons()).toEqual([]);
    release();
    await refresh;

    expect(databaseRecordIndex.getById('rec_task')?.values).toEqual({
      prop_title: 'Watcher wins',
    });
  });

  test('runs a later requested refresh against newer canonical state', async () => {
    const { contentDir, databaseRecordIndex, coordinator } = await fixture();
    const path = join(contentDir, 'tasks', 'task.md');
    writeFileSync(path, record('Before'));

    const originalRebuild = databaseRecordIndex.rebuild.bind(databaseRecordIndex);
    let firstRelease!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      firstRelease = resolve;
    });
    let rebuilds = 0;
    databaseRecordIndex.rebuild = async () => {
      rebuilds += 1;
      if (rebuilds === 1) await firstGate;
      return originalRebuild();
    };

    const first = coordinator.refresh('schema-change');
    const second = coordinator.refresh('branch-switch');
    writeFileSync(path, record('After'));
    expect(coordinator.pendingReasons()).toEqual(['branch-switch']);
    firstRelease();
    await Promise.all([first, second]);

    expect(rebuilds).toBe(2);
    expect(databaseRecordIndex.getById('rec_task')?.values).toEqual({ prop_title: 'After' });
  });

  test('converts watcher queue overflow into one canonical follow-up rebuild', async () => {
    const { contentDir, databaseRecordIndex } = await fixture();
    const bounded = createDatabaseIndexCoordinator({
      contentDir,
      databaseRecordIndex,
      maxQueuedEvents: 2,
    });
    const path = join(contentDir, 'tasks', 'task.md');
    writeFileSync(path, record('Before'));
    const originalRebuild = databaseRecordIndex.rebuild.bind(databaseRecordIndex);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let rebuilds = 0;
    databaseRecordIndex.rebuild = async () => {
      rebuilds += 1;
      const result = await originalRebuild();
      if (rebuilds === 1) await gate;
      return result;
    };

    const refresh = bounded.refresh('git-sync');
    await Bun.sleep(0);
    writeFileSync(path, record('Final'));
    for (const title of ['Queued one', 'Queued two', 'Final']) {
      bounded.applyDiskEvent({
        kind: 'update',
        path,
        docName: 'tasks/task',
        content: record(title),
      });
    }
    expect(bounded.pendingReasons()).toEqual(['watcher-overflow']);
    release();
    await refresh;

    expect(rebuilds).toBe(2);
    expect(databaseRecordIndex.getById('rec_task')?.values).toEqual({ prop_title: 'Final' });
  });

  test('publishes rebuilding and error phases without swallowing refresh failure', async () => {
    const { databaseRecordIndex, coordinator } = await fixture();
    const events: DatabaseIndexChangeEvent[] = [];
    coordinator.setChangeListener((event) => events.push(event));
    databaseRecordIndex.rebuild = async () => {
      throw new Error('fixture rebuild failed');
    };

    await expect(coordinator.refresh('git-sync')).rejects.toThrow('fixture rebuild failed');
    expect(events).toEqual([
      { kind: 'index', phase: 'rebuilding', reasons: ['git-sync'] },
      { kind: 'index', phase: 'error', reasons: ['git-sync'] },
    ]);
  });
});
