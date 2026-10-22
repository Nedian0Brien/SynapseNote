import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { createDatabaseAutomationService } from './database-automation.ts';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function fixture(actions: unknown[], additionalAutomations: unknown[] = []) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-automation-'));
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
          id: 'person_automation',
          key: 'automation',
          name: 'Automation',
          kind: 'agent',
          subjectId: 'agent:automation',
          active: true,
        },
      ],
      contract: {
        purpose: 'Track automated work',
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
      automations: [
        {
          id: 'auto_daily',
          key: 'daily',
          name: 'Daily automation',
          version: 1,
          enabled: true,
          ownerId: 'person_automation',
          trigger: {
            kind: 'schedule',
            schedule: { kind: 'daily', time: '09:00' },
            timeZone: 'Asia/Seoul',
          },
          actions,
          retry: { maxAttempts: 2, initialBackoffSeconds: 60, multiplier: 2 },
          limits: { maxActionsPerRun: 20, maxGeneratedEvents: 2 },
        },
        ...additionalAutomations,
      ],
    }),
  );
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
  return { projectDir, contentDir, store, index, plans, commits, generateUuid };
}

describe('DatabaseAutomationService', () => {
  test('targets an explicit schedule test event to only the requested automation', async () => {
    const action = {
      id: 'notify_owner',
      kind: 'notification',
      recipientIds: ['person_automation'],
      title: 'Scheduled',
    };
    const setup = await fixture(
      [action],
      [
        {
          id: 'auto_weekly',
          key: 'weekly',
          name: 'Weekly automation',
          version: 1,
          enabled: true,
          ownerId: 'person_automation',
          trigger: {
            kind: 'schedule',
            schedule: { kind: 'weekly', weekdays: [1], time: '09:00' },
            timeZone: 'Asia/Seoul',
          },
          actions: [action],
          retry: { maxAttempts: 2, initialBackoffSeconds: 60, multiplier: 2 },
          limits: { maxActionsPerRun: 20, maxGeneratedEvents: 2 },
        },
      ],
    );
    const service = createDatabaseAutomationService({
      ...setup,
      databaseStore: setup.store,
      databaseRecordIndex: setup.index,
      databasePlanEngine: setup.plans,
      databaseCommitEngine: setup.commits,
      resolvePermission: () => ({
        allowed: true,
        policyId: 'policy_automation',
        policyRevision: 'rev_1',
      }),
    });
    const event = await service.enqueue({
      deduplicationKey: 'targeted-schedule-test',
      databaseId: 'db_tasks',
      kind: 'schedule',
      scheduledFor: '2026-07-21T00:00:00.000Z',
      targetAutomationId: 'auto_weekly',
    });
    expect(event.targetAutomationId).toBe('auto_weekly');
    expect(await service.listRuns()).toEqual([
      expect.objectContaining({ automationId: 'auto_weekly', state: 'pending' }),
    ]);
  });

  test('deduplicates trigger delivery and records loop prevention before execution', async () => {
    const setup = await fixture([
      {
        id: 'publish_task',
        kind: 'external_webhook',
        connectionId: 'conn_tasks',
        eventName: 'daily_tick',
      },
    ]);
    const service = createDatabaseAutomationService({
      ...setup,
      databaseStore: setup.store,
      databaseRecordIndex: setup.index,
      databasePlanEngine: setup.plans,
      databaseCommitEngine: setup.commits,
      now: () => new Date('2026-07-21T01:00:00.000Z'),
      resolvePermission: () => ({
        allowed: true,
        policyId: 'policy_automation',
        policyRevision: 'rev_1',
      }),
    });
    const input = {
      deduplicationKey: 'test-loop-event',
      databaseId: 'db_tasks',
      kind: 'schedule' as const,
      scheduledFor: '2026-07-21T00:00:00.000Z',
      origin: {
        runId: 'autorun_parent',
        automationIds: ['auto_daily'],
        generatedEvents: 1,
      },
    };
    const first = await service.enqueue(input);
    const replay = await service.enqueue(input);
    expect(replay.id).toBe(first.id);
    expect(await service.listRuns()).toEqual([
      expect.objectContaining({
        eventId: first.id,
        automationId: 'auto_daily',
        state: 'skipped',
        attempt: 0,
        errorCode: 'loop_prevented',
      }),
    ]);
  });

  test('executes internal changes and reviewed deliveries once through durable run history', async () => {
    const setup = await fixture([
      {
        id: 'create_task',
        kind: 'create_record',
        sourceId: 'ds_tasks',
        values: { prop_title: 'Automated task' },
      },
      {
        id: 'notify_owner',
        kind: 'notification',
        recipientIds: ['person_automation'],
        title: 'Task created',
      },
      {
        id: 'publish_task',
        kind: 'external_webhook',
        connectionId: 'conn_tasks',
        eventName: 'task_created',
      },
    ]);
    const deliveries: string[] = [];
    const options = {
      ...setup,
      databaseStore: setup.store,
      databaseRecordIndex: setup.index,
      databasePlanEngine: setup.plans,
      databaseCommitEngine: setup.commits,
      now: () => new Date('2026-07-21T01:00:00.000Z'),
      resolvePermission: () => ({
        allowed: true,
        policyId: 'policy_automation',
        policyRevision: 'rev_1',
      }),
      resolveExternalPolicy: () => ({
        allowed: true,
        policyId: 'policy_egress',
        policyRevision: 'rev_1',
        maxEgressBytes: 10_000,
      }),
      deliverNotification: async ({ idempotencyKey }: { idempotencyKey: string }) => {
        deliveries.push(idempotencyKey);
        return { receiptId: 'notification_1' };
      },
      deliverExternal: async ({ idempotencyKey }: { idempotencyKey: string }) => {
        deliveries.push(idempotencyKey);
        return { receiptId: 'webhook_1' };
      },
    };
    const first = await createDatabaseAutomationService(options).tick();
    expect(
      existsSync(join(setup.projectDir, '.ok', 'local', 'database-automation-runs.json')),
    ).toBe(true);
    expect(existsSync(join(setup.projectDir, '.ok', 'databases', 'automation-runs.json'))).toBe(
      false,
    );
    const second = await createDatabaseAutomationService(options).tick();

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      state: 'succeeded',
      attempt: 1,
      internalMutationId: expect.stringMatching(/^mut_/),
      actions: [
        { actionId: 'create_task', state: 'succeeded' },
        { actionId: 'notify_owner', receiptId: 'notification_1' },
        { actionId: 'publish_task', receiptId: 'webhook_1' },
      ],
    });
    expect(second).toEqual([]);
    expect(readdirSync(join(setup.contentDir, 'tasks'))).toHaveLength(1);
    expect(deliveries).toHaveLength(2);
  });

  test('persists an isolated external outbox and resumes it after restart without duplicate events', async () => {
    const setup = await fixture([
      {
        id: 'publish_task',
        kind: 'external_webhook',
        connectionId: 'conn_tasks',
        eventName: 'daily_tick',
      },
    ]);
    let now = new Date('2026-07-21T01:00:00.000Z');
    let attempts = 0;
    const options = {
      ...setup,
      databaseStore: setup.store,
      databaseRecordIndex: setup.index,
      databasePlanEngine: setup.plans,
      databaseCommitEngine: setup.commits,
      now: () => now,
      resolvePermission: () => ({
        allowed: true,
        policyId: 'policy_automation',
        policyRevision: 'rev_1',
      }),
      resolveExternalPolicy: () => ({
        allowed: true,
        policyId: 'policy_egress',
        policyRevision: 'rev_1',
        maxEgressBytes: 10_000,
      }),
      deliverExternal: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary delivery failure');
        return { receiptId: 'webhook_recovered' };
      },
    };
    expect((await createDatabaseAutomationService(options).tick())[0]).toMatchObject({
      state: 'retry_wait',
      attempt: 1,
      nextAttemptAt: '2026-07-21T01:01:00.000Z',
    });
    now = new Date('2026-07-21T01:01:00.000Z');
    expect((await createDatabaseAutomationService(options).tick())[0]).toMatchObject({
      state: 'succeeded',
      attempt: 2,
      actions: [{ actionId: 'publish_task', receiptId: 'webhook_recovered' }],
    });
    expect(attempts).toBe(2);
    expect(await createDatabaseAutomationService(options).tick()).toEqual([]);
  });
});
