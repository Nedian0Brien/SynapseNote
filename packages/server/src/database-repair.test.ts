import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseRepairEngine, DatabaseRepairError } from './database-repair.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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
            semantics: {
              constraints: { unique: false },
              inferencePolicy: 'explicit_only',
              sensitivity: 'inherit',
              defaultValue: 'todo',
            },
          },
          { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
        ],
      },
    ],
  });
}

function record(
  id: string,
  title: string,
  options: { databaseId?: string; sourceId?: string; status?: string; due?: string } = {},
): string {
  return `---\n_sn:\n  database_id: ${options.databaseId ?? 'db_tasks'}\n  source_id: ${options.sourceId ?? 'ds_tasks'}\n  record_id: ${id}\ntitle: ${title}\nstatus: ${options.status ?? 'todo'}${options.due ? `\ndue: ${options.due}` : ''}\n---\nBody\n`;
}

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-repair-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.create(definition());
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  return { projectDir, contentDir, store, index };
}

function applyInput(
  engine: ReturnType<typeof createDatabaseRepairEngine>,
  plan: Awaited<ReturnType<typeof engine.preview>>,
) {
  return {
    planId: plan.id,
    planHash: plan.hash,
    approvalToken: engine.expectedApprovalToken(plan.hash),
    idempotencyKey: 'repair-request-001',
    principalId: 'agent_database_steward',
  };
}

describe('DatabaseRepairEngine', () => {
  test('repairs missing and duplicate Unique IDs while advancing the manifest watermark', async () => {
    const { projectDir, contentDir, store, index } = await fixture();
    const withUniqueId = definition();
    withUniqueId.sources[0]?.properties.push({
      id: 'prop_ticket',
      key: 'ticket',
      name: 'Ticket',
      type: 'unique_id',
      prefix: 'TASK',
      nextNumber: 10,
      required: false,
      aliases: [],
      semantics: {
        constraints: { unique: false },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
      },
    });
    await store.update(withUniqueId.id, withUniqueId);
    writeFileSync(
      join(contentDir, 'tasks', 'a.md'),
      record('rec_a', 'A').replace('\n---\nBody', '\nticket: 4\n---\nBody'),
    );
    writeFileSync(
      join(contentDir, 'tasks', 'b.md'),
      record('rec_b', 'B').replace('\n---\nBody', '\nticket: 4\n---\nBody'),
    );
    writeFileSync(join(contentDir, 'tasks', 'c.md'), record('rec_c', 'C'));
    await index.rebuild();
    expect(
      index
        .snapshot()
        .issues.map((issue) => issue.code)
        .sort(),
    ).toEqual(['duplicate_unique_value', 'duplicate_unique_value', 'invalid_record']);

    const engine = createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
    });
    const plan = await engine.preview();
    expect(plan).toMatchObject({
      committable: true,
      blockers: [],
      summary: { uniqueIdAllocations: 2, recordRewrites: 2 },
    });
    expect(plan.actions).toEqual([
      expect.objectContaining({
        kind: 'rewrite_record',
        path: 'tasks/b.md',
        categories: ['unique_id_allocation'],
      }),
      expect.objectContaining({
        kind: 'rewrite_record',
        path: 'tasks/c.md',
        categories: ['unique_id_allocation'],
      }),
      {
        kind: 'advance_unique_id_watermark',
        databaseId: 'db_tasks',
        propertyNextNumbers: { prop_ticket: 12 },
      },
    ]);

    const result = await engine.apply(applyInput(engine, plan));
    expect(result.receipt).toMatchObject({ rewrittenDatabaseIds: ['db_tasks'] });
    expect(readFileSync(join(contentDir, 'tasks', 'a.md'), 'utf-8')).toContain('ticket: 4');
    expect(readFileSync(join(contentDir, 'tasks', 'b.md'), 'utf-8')).toContain('ticket: 10');
    expect(readFileSync(join(contentDir, 'tasks', 'c.md'), 'utf-8')).toContain('ticket: 11');
    const repairedProperty = store
      .getById('db_tasks')
      ?.sources[0]?.properties.find((property) => property.id === 'prop_ticket');
    expect(repairedProperty).toMatchObject({ type: 'unique_id', nextNumber: 12 });
    expect(index.snapshot().issues).toEqual([]);
  });

  test('previews and applies identity, value, missing-row, and orphan repairs', async () => {
    const { projectDir, contentDir, store, index } = await fixture();
    writeFileSync(
      join(contentDir, 'tasks', 'identity.md'),
      record('rec_identity', 'Identity', { databaseId: 'db_old', sourceId: 'ds_old' }),
    );
    writeFileSync(
      join(contentDir, 'tasks', 'invalid.md'),
      record('rec_invalid', 'Invalid', { status: 'removed', due: 'someday' }),
    );
    writeFileSync(join(contentDir, 'tasks', 'duplicate-a.md'), record('rec_duplicate', 'First'));
    writeFileSync(join(contentDir, 'tasks', 'duplicate-b.md'), record('rec_duplicate', 'Second'));
    writeFileSync(join(contentDir, 'tasks', 'valid.md'), record('rec_valid', 'Valid'));
    await index.rebuild();
    index.deletePath('tasks/valid.md');
    index.upsertPath('tasks/ghost.md', record('rec_ghost', 'Ghost'));

    const generated = ['00000000-0000-4000-8000-000000000001'];
    const engine = createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      generateUuid: () => generated.shift() ?? crypto.randomUUID(),
    });
    const plan = await engine.preview();

    expect(plan).toMatchObject({
      committable: true,
      blockers: [],
      summary: {
        staleIdentities: 2,
        invalidValues: 2,
        missingRecords: 1,
        orphanedIndexEntries: 1,
        recordRewrites: 3,
        blocked: 0,
      },
    });
    expect(plan.actions.map((action) => action.kind)).toEqual([
      'rewrite_record',
      'rewrite_record',
      'rewrite_record',
      'rebuild_index',
    ]);
    expect(JSON.stringify(plan)).not.toContain(projectDir);

    const input = applyInput(engine, plan);
    const applied = await engine.apply(input);
    expect(applied).toMatchObject({
      idempotentReplay: false,
      receipt: {
        planId: plan.id,
        planHash: plan.hash,
        rewrittenPaths: ['tasks/duplicate-b.md', 'tasks/identity.md', 'tasks/invalid.md'],
        rebuiltIndex: true,
      },
    });
    expect(index.list().map((entry) => entry.id)).toEqual([
      'rec_00000000000040008000000000000001',
      'rec_duplicate',
      'rec_identity',
      'rec_invalid',
      'rec_valid',
    ]);
    expect(index.snapshot().issues).toEqual([]);
    expect(readFileSync(join(contentDir, 'tasks', 'identity.md'), 'utf-8')).toContain(
      'database_id: db_tasks',
    );
    expect(readFileSync(join(contentDir, 'tasks', 'invalid.md'), 'utf-8')).not.toContain('due:');
    expect(await engine.apply(input)).toMatchObject({ idempotentReplay: true });
    const restarted = createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
    });
    expect(await restarted.apply(input)).toMatchObject({
      idempotentReplay: true,
      receipt: { repairId: applied.receipt.repairId },
    });
    expect(existsSync(join(projectDir, '.ok', 'local', 'database-transactions', 'repairs'))).toBe(
      true,
    );
  });

  test('blocks unsafe required-value repair and reports the exact property', async () => {
    const { projectDir, contentDir, store, index } = await fixture();
    writeFileSync(
      join(contentDir, 'tasks', 'blocked.md'),
      record('rec_blocked', '123').replace('title: 123', 'title: [123]'),
    );
    await index.rebuild();
    const engine = createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
    });
    const plan = await engine.preview();
    expect(plan).toMatchObject({
      committable: false,
      summary: { blocked: 1 },
      blockers: [
        {
          path: 'tasks/blocked.md',
          code: 'required_value_needs_input',
          propertyId: 'prop_title',
          propertyKey: 'title',
        },
      ],
    });
    await expect(engine.apply(applyInput(engine, plan))).rejects.toMatchObject({
      code: 'repair_blocked',
    });
  });

  test('refuses stale preview files and rolls back if index verification fails', async () => {
    const { projectDir, contentDir, store, index } = await fixture();
    const path = join(contentDir, 'tasks', 'repair.md');
    const before = record('rec_repair', 'Repair', { status: 'removed' });
    writeFileSync(path, before);
    await index.rebuild();
    const normal = createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
    });
    const stalePlan = await normal.preview();
    writeFileSync(path, `${before}\nExternal edit\n`);
    await expect(normal.apply(applyInput(normal, stalePlan))).rejects.toBeInstanceOf(
      DatabaseRepairError,
    );
    expect(readFileSync(path, 'utf-8')).toEndWith('External edit\n');

    writeFileSync(path, before);
    await index.rebuild();
    let refreshCalls = 0;
    const failing = createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      refreshDatabaseIndex: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) throw new Error('verification unavailable');
        await index.rebuild();
      },
    });
    const rollbackPlan = await failing.preview();
    await expect(failing.apply(applyInput(failing, rollbackPlan))).rejects.toMatchObject({
      code: 'repair_transaction_failed',
    });
    expect(readFileSync(path, 'utf-8')).toBe(before);
    expect(index.snapshot().issues).toHaveLength(1);
    expect(failing.isTransactionActive()).toBe(false);
  });
});
