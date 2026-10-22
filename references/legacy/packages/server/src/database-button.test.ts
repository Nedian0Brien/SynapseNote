import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  createDatabaseButtonPlanner,
  type DatabaseButtonPermissionRequest,
  DatabaseButtonPlanError,
} from './database-button.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function definition() {
  return DatabaseDefinitionSchema.parse({
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
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { id: 'opt_todo', key: 'todo', name: 'Todo' },
              { id: 'opt_done', key: 'done', name: 'Done' },
            ],
          },
          {
            id: 'prop_finish',
            key: 'finish',
            name: 'Finish',
            type: 'button',
            label: 'Mark done',
            confirmation: {
              title: 'Finish this task?',
              description: 'This updates the record and notifies the configured integration.',
            },
            actions: [
              {
                id: 'mark_done',
                kind: 'update_record',
                operations: [{ op: 'set', propertyId: 'prop_status', value: 'opt_done' }],
              },
              {
                id: 'notify_tracker',
                kind: 'external_webhook',
                connectionId: 'conn_issue_tracker',
                eventName: 'task_finished',
                propertyIds: ['prop_title', 'prop_status'],
                includeBody: true,
              },
            ],
          },
        ],
      },
    ],
    templates: [
      {
        id: 'tpl_task',
        key: 'task',
        name: 'Task',
        sourceId: 'ds_tasks',
        propertyValues: { prop_status: 'opt_todo' },
        body: '## Context\n',
        order: 0,
        defaultFor: { source: true },
      },
    ],
    buttons: [
      {
        id: 'dbbtn_pair',
        key: 'create-pair',
        name: 'Create task pair',
        placement: { kind: 'source', sourceId: 'ds_tasks' },
        confirmation: { title: 'Create both tasks?' },
        actions: [
          {
            id: 'create_first',
            kind: 'create_record',
            sourceId: 'ds_tasks',
            values: { prop_title: 'First generated task', prop_status: 'opt_todo' },
            body: 'Generated together.\n',
          },
          {
            id: 'create_second',
            kind: 'create_record',
            sourceId: 'ds_tasks',
            values: { prop_title: 'Second generated task', prop_status: 'opt_todo' },
            body: 'Generated together.\n',
          },
        ],
      },
    ],
  });
}

async function fixture(allowed = true) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-button-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.create(definition());
  writeFileSync(
    join(contentDir, 'tasks', 'one.md'),
    `---
_sn:
  database_id: db_tasks
  source_id: ds_tasks
  record_id: rec_one
title: First task
status: todo
---
Private task context.
`,
  );
  const recordIndex = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await recordIndex.rebuild();
  let counter = 0;
  const planEngine = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: recordIndex,
    projectDir,
    contentDir,
    now: () => new Date('2026-07-20T02:00:00.000Z'),
    generateUuid: () => `${String(++counter).padStart(8, '0')}-0000-4000-8000-000000000000`,
  });
  const requests: DatabaseButtonPermissionRequest[] = [];
  const planner = createDatabaseButtonPlanner({
    databaseStore: store,
    databaseRecordIndex: recordIndex,
    databasePlanEngine: planEngine,
    now: () => new Date('2026-07-20T02:00:00.000Z'),
    generateUuid: () => 'aaaaaaaa-0000-4000-8000-000000000000',
    resolvePermission: (request) => {
      requests.push(structuredClone(request));
      return {
        allowed,
        policyId: 'policy_button_test',
        policyRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ...(allowed ? {} : { reason: 'test denial' }),
      };
    },
  });
  const record = recordIndex.getById('rec_one');
  if (!record?.revision) throw new Error('button fixture record is missing');
  return { planner, record, requests };
}

describe('DatabaseButtonPlanner', () => {
  test('plans a database-level multi-step button atomically without a record context', async () => {
    const { planner, requests } = await fixture();
    const plan = planner.createPlan({ databaseId: 'db_tasks', buttonId: 'dbbtn_pair' });
    expect(plan).toMatchObject({
      buttonId: 'dbbtn_pair',
      propertyId: null,
      recordId: null,
      expectedRecordRevision: null,
      label: 'Create task pair',
      requiresApproval: true,
    });
    expect(plan.internalPlan?.diff.records).toHaveLength(2);
    expect(plan.internalPlan?.diff.records.map((record) => record.action)).toEqual([
      'create',
      'create',
    ]);
    expect(plan.internalPlan?.diff.manifests).toEqual([]);
    expect(requests).toEqual([
      expect.objectContaining({
        sourceId: 'ds_tasks',
        action: 'create_record',
        propertyIds: ['prop_title', 'prop_status'],
        touchesBody: true,
      }),
      expect.objectContaining({
        sourceId: 'ds_tasks',
        action: 'create_record',
        propertyIds: ['prop_title', 'prop_status'],
        touchesBody: true,
      }),
    ]);
  });

  test('binds record revision, permission guards, internal diff, and exact reviewed egress', async () => {
    const { planner, record, requests } = await fixture();
    const plan = planner.createPlan({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: record.id,
      propertyId: 'prop_finish',
      expectedRecordRevision: record.revision,
    });

    expect(plan).toMatchObject({
      id: 'buttonplan_aaaaaaaa000040008000000000000000',
      label: 'Mark done',
      expectedRecordRevision: record.revision,
      requiresApproval: true,
      risk: { level: 'high', reasons: ['external_side_effect', 'button_confirmation'] },
    });
    expect(plan.internalPlan?.diff.records).toEqual([
      expect.objectContaining({
        recordId: 'rec_one',
        action: 'update',
        after: expect.objectContaining({
          values: expect.objectContaining({ prop_status: 'opt_done' }),
        }),
      }),
    ]);
    expect(plan.internalPlan?.diff.manifests).toEqual([]);
    expect(plan.internalPlan?.targetResolutions).toContainEqual(
      expect.objectContaining({ kind: 'template', targetId: 'tpl_task' }),
    );
    expect(plan.externalSteps).toEqual([
      expect.objectContaining({
        actionId: 'notify_tracker',
        connectionId: 'conn_issue_tracker',
        eventName: 'task_finished',
        payload: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId: 'rec_one',
          recordRevision: record.revision,
          properties: { prop_title: 'First task', prop_status: 'opt_todo' },
          body: 'Private task context.\n',
        },
      }),
    ]);
    expect(plan.externalSteps[0]?.egressBytes).toBeGreaterThan(0);
    expect(plan.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(requests).toEqual([
      expect.objectContaining({
        action: 'update_record',
        propertyIds: ['prop_status'],
        touchesBody: false,
      }),
      expect.objectContaining({
        action: 'external_webhook',
        connectionId: 'conn_issue_tracker',
        propertyIds: ['prop_title', 'prop_status'],
        touchesBody: true,
      }),
    ]);
    expect(JSON.stringify(plan)).not.toContain('https://');
    expect(JSON.stringify(plan)).not.toContain('secret');
  });

  test('fails closed on stale record revisions before resolving permissions', async () => {
    const { planner, requests } = await fixture();
    expect(() =>
      planner.createPlan({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_one',
        propertyId: 'prop_finish',
        expectedRecordRevision:
          'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    ).toThrow(expect.objectContaining({ code: 'record_revision_changed' }));
    expect(requests).toEqual([]);
  });

  test('fails closed when any step is outside the effective permission scope', async () => {
    const { planner, record } = await fixture(false);
    try {
      planner.createPlan({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: record.id,
        propertyId: 'prop_finish',
        expectedRecordRevision: record.revision,
      });
      throw new Error('expected permission denial');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseButtonPlanError);
      expect(error).toMatchObject({
        code: 'permission_denied',
        details: { actionId: 'mark_done', reason: 'test denial' },
      });
    }
  });
});
