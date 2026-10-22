import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';
import { createDatabaseTemplateExecutor } from './database-template-executor.ts';
import {
  createDatabaseTemplateScheduler,
  latestDatabaseTemplateOccurrence,
} from './database-template-scheduler.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-template-scheduler-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.create(
    DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      people: [
        {
          id: 'person_scheduler',
          key: 'scheduler',
          name: 'Scheduler',
          kind: 'agent',
          subjectId: 'agent:template-scheduler',
        },
      ],
      contract: {
        purpose: 'Track recurring work',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime' },
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
      templates: [
        {
          id: 'tpl_daily',
          key: 'daily',
          name: 'Daily task',
          sourceId: 'ds_tasks',
          propertyValues: { prop_title: 'Daily task' },
          body: '',
          order: 0,
          repeat: {
            schedule: { kind: 'daily', time: '09:00' },
            timeZone: 'Asia/Seoul',
            ownerId: 'person_scheduler',
            paused: false,
            retry: { maxAttempts: 2, initialBackoffSeconds: 60, multiplier: 2 },
          },
        },
      ],
    }),
  );
  return { projectDir, contentDir, store };
}

describe('DatabaseTemplateScheduler', () => {
  test('resolves the latest wall-clock occurrence in the declared timezone', () => {
    const repeat = DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_time',
      key: 'time',
      name: 'Time',
      people: [
        {
          id: 'person_owner',
          key: 'owner',
          name: 'Owner',
          kind: 'local',
          subjectId: 'principal-owner',
        },
      ],
      contract: {
        purpose: 'Test time',
        canonicality: 'canonical',
        vocabulary: ['time'],
        freshness: { expectation: 'daily' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_time',
          key: 'time',
          name: 'Time',
          recordMeaning: 'One time',
          folder: 'time',
          properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
        },
      ],
      templates: [
        {
          id: 'tpl_time',
          key: 'time',
          name: 'Time',
          sourceId: 'ds_time',
          order: 0,
          repeat: {
            schedule: { kind: 'daily', time: '09:00' },
            timeZone: 'Asia/Seoul',
            ownerId: 'person_owner',
            paused: false,
          },
        },
      ],
    }).templates[0]?.repeat;
    if (!repeat) throw new Error('missing repeat fixture');
    expect(
      latestDatabaseTemplateOccurrence(repeat, new Date('2026-07-21T01:00:00.000Z'))?.toISOString(),
    ).toBe('2026-07-21T00:00:00.000Z');
  });

  test('deduplicates an occurrence and persists success history across scheduler restarts', async () => {
    const { projectDir, store } = await fixture();
    const executed: string[] = [];
    const options = {
      projectDir,
      databaseStore: store,
      now: () => new Date('2026-07-21T01:00:00.000Z'),
      generateUuid: () => 'aaaaaaaa-0000-4000-8000-000000000000',
      execute: async ({ scheduledFor }: { scheduledFor: string }) => {
        executed.push(scheduledFor);
        return { recordIds: ['rec_daily'] };
      },
    };
    const first = await createDatabaseTemplateScheduler(options).tick();
    expect(existsSync(join(projectDir, '.ok', 'local', 'database-template-runs.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'template-runs.json'))).toBe(false);
    const second = await createDatabaseTemplateScheduler(options).tick();
    expect(first).toMatchObject([
      {
        id: 'tplrun_aaaaaaaa000040008000000000000000',
        state: 'succeeded',
        scheduledFor: '2026-07-21T00:00:00.000Z',
        recordIds: ['rec_daily'],
      },
    ]);
    expect(second).toEqual([]);
    expect(executed).toEqual(['2026-07-21T00:00:00.000Z']);
  });

  test('persists bounded exponential retry state and stops after the configured attempt limit', async () => {
    const { projectDir, store } = await fixture();
    let now = new Date('2026-07-21T01:00:00.000Z');
    const scheduler = createDatabaseTemplateScheduler({
      projectDir,
      databaseStore: store,
      now: () => now,
      execute: async () => {
        throw new Error('temporary failure');
      },
    });
    expect((await scheduler.tick())[0]).toMatchObject({
      state: 'retry_wait',
      attempt: 1,
      nextAttemptAt: '2026-07-21T01:01:00.000Z',
    });
    expect(await scheduler.tick()).toEqual([]);
    now = new Date('2026-07-22T01:01:00.000Z');
    expect((await scheduler.tick())[0]).toMatchObject({
      state: 'failed',
      attempt: 2,
      scheduledFor: '2026-07-21T00:00:00.000Z',
      nextAttemptAt: null,
      error: 'temporary failure',
    });
  });

  test('executes a due template through the exact plan and verified commit path', async () => {
    const { projectDir, contentDir, store } = await fixture();
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    let uuid = 0;
    const generateUuid = () => `${String(++uuid).padStart(8, '0')}-0000-4000-8000-000000000000`;
    const plans = createDatabasePlanEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      generateUuid,
    });
    const commits = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      generateUuid,
      refreshDatabaseIndex: () => index.rebuild(),
      git: {
        snapshot: async () => '1'.repeat(40),
        hashBlob: async () => `sha1:${'a'.repeat(40)}`,
      },
    });
    const scheduler = createDatabaseTemplateScheduler({
      projectDir,
      databaseStore: store,
      now: () => new Date('2026-07-21T01:00:00.000Z'),
      generateUuid,
      execute: createDatabaseTemplateExecutor({
        databasePlanEngine: plans,
        databaseCommitEngine: commits,
      }),
    });

    const [run] = await scheduler.tick();
    expect(run).toMatchObject({ state: 'succeeded', recordIds: [expect.stringMatching(/^rec_/)] });
    const files = readdirSync(join(contentDir, 'tasks'));
    expect(files).toHaveLength(1);
    expect(readFileSync(join(contentDir, 'tasks', files[0] ?? ''), 'utf8')).toContain(
      'title: Daily task',
    );
    expect(index.list('db_tasks', 'ds_tasks')).toHaveLength(1);
  });
});
