import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
  type DatabaseDefinition,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabaseDataPlane } from './database-data-plane.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';
import { createDatabaseTaskService } from './database-task-service.ts';
import { createDatabaseTaskStore } from './database-task-store.ts';

const tempDirs: string[] = [];

function definition(): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_roundtrip',
    key: 'roundtrip',
    name: 'Round-trip',
    contract: {
      purpose: 'Verify Formula/Rollup migration equivalence',
      canonicality: 'canonical',
      vocabulary: ['order', 'project'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_orders',
        key: 'orders',
        name: 'Orders',
        recordMeaning: 'One order',
        folder: 'orders',
        properties: [
          { id: 'prop_order_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_amount', key: 'amount', name: 'Amount', type: 'number' },
          {
            id: 'prop_projects',
            key: 'projects',
            name: 'Projects',
            type: 'relation',
            targetSourceId: 'ds_projects',
            cardinality: 'many',
          },
          {
            id: 'prop_double_amount',
            key: 'double_amount',
            name: 'Double amount',
            type: 'formula',
            source: 'prop("amount") * 2',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'number',
              expression: {
                type: 'binary',
                operator: 'multiply',
                left: { type: 'property', propertyId: 'prop_amount' },
                right: { type: 'literal', valueType: 'number', value: 2 },
              },
            },
          },
          {
            id: 'prop_broken_amount',
            key: 'broken_amount',
            name: 'Broken amount',
            type: 'formula',
            source: 'prop("amount") / 0',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'number',
              expression: {
                type: 'binary',
                operator: 'divide',
                left: { type: 'property', propertyId: 'prop_amount' },
                right: { type: 'literal', valueType: 'number', value: 0 },
              },
            },
          },
          {
            id: 'prop_project_total',
            key: 'project_total',
            name: 'Project total',
            type: 'rollup',
            relationPropertyId: 'prop_projects',
            targetPropertyId: 'prop_budget',
            function: 'sum',
            targetValueType: 'number',
          },
        ],
      },
      {
        id: 'ds_projects',
        key: 'projects',
        name: 'Projects',
        recordMeaning: 'One project',
        folder: 'projects',
        properties: [
          { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' },
        ],
      },
    ],
  });
}

function v1Markdown(input: {
  sourceId: string;
  recordId: string;
  title: string;
  body?: string;
  amount?: number;
  projects?: string[];
  budget?: number;
}): string {
  const values = [
    `title: ${input.title}`,
    ...(input.amount === undefined ? [] : [`amount: ${input.amount}`]),
    ...(input.projects === undefined ? [] : [`projects: [${input.projects.join(', ')}]`]),
    ...(input.budget === undefined ? [] : [`budget: ${input.budget}`]),
  ];
  return [
    '---',
    '_sn:',
    '  database_id: db_roundtrip',
    `  source_id: ${input.sourceId}`,
    `  record_id: ${input.recordId}`,
    ...values,
    '---',
    input.body ?? `${input.title} body`,
    '',
  ].join('\n');
}

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-roundtrip-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'orders'), { recursive: true });
  mkdirSync(join(contentDir, 'projects'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'roundtrip.yml'),
    serializeDatabaseManifestYaml(definition()),
  );
  writeFileSync(
    join(contentDir, 'orders', 'alpha.md'),
    v1Markdown({
      sourceId: 'ds_orders',
      recordId: 'rec_order_alpha',
      title: 'Alpha',
      amount: 4,
      projects: ['rec_project_one'],
    }),
  );
  writeFileSync(
    join(contentDir, 'projects', 'one.md'),
    v1Markdown({
      sourceId: 'ds_projects',
      recordId: 'rec_project_one',
      title: 'One',
      budget: 10,
    }),
  );
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  const commit = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    git: {
      snapshot: async () => '0'.repeat(40),
      hashBlob: async () => `sha1:${'a'.repeat(40)}`,
    },
  });
  const taskStore = createDatabaseTaskStore({ projectDir });
  const service = createDatabaseTaskService({
    projectDir,
    contentDir,
    taskStore,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    databaseCommitEngine: commit,
  });
  tempDirs.push(projectDir);
  return { projectDir, contentDir, store, index, service };
}

async function coldRuntime(projectDir: string, contentDir: string) {
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const dataPlane = createDatabaseDataPlane({
    databaseStore: store,
    databaseRecordIndex: index,
  });
  return { store, index, dataPlane };
}

function snapshotFiles(projectDir: string, contentDir: string): Record<string, string> {
  const result: Record<string, string> = {
    '.ok/databases/roundtrip.yml': readFileSync(
      join(projectDir, '.ok', 'databases', 'roundtrip.yml'),
      'utf8',
    ),
  };
  for (const source of ['orders', 'projects']) {
    for (const name of readdirSync(join(contentDir, source)).filter((entry) => entry.endsWith('.md'))) {
      result[`content/${source}/${name}`] = readFileSync(join(contentDir, source, name), 'utf8');
    }
  }
  return result;
}

describe('v1 to v2 migration round-trip', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test('requires and verifies a frozen Formula/Rollup baseline through apply, cold rebuild, and undo', async () => {
    const { projectDir, contentDir, store, index, service } = await fixture();
    const before = snapshotFiles(projectDir, contentDir);
    const database = store.getById('db_roundtrip');
    if (!database) throw new Error('round-trip database is missing');
    const baseline = {
      evaluatedAt: '2026-07-27T00:00:00.000Z',
      timeZone: 'UTC',
      locale: 'en',
      permissionRevision: `sha256:${'a'.repeat(64)}`,
    };
    const expectedManifestRevision = store.snapshot().revision;
    const blocked = await service.previewMigration({
      operation: 'migration',
      databaseIds: [database.id],
      expectedManifestRevision,
      targetVersion: 2,
    });
    expect(blocked.items[0]).toMatchObject({
      action: 'blocked',
      code: 'derived_baseline_required',
    });

    const preview = await service.previewMigration({
      operation: 'migration',
      databaseIds: [database.id],
      expectedManifestRevision,
      targetVersion: 2,
      derivedBaselines: { [database.id]: baseline },
    });
    const item = preview.items[0];
    expect(preview).toMatchObject({ committable: true, summary: { ready: 1, blocked: 0 } });
    if (!item?.planHash || !item.migrationCommittedAt) {
      throw new Error('round-trip plan is missing approval bindings');
    }
    const task = await service.start({
      operation: 'migration',
      databaseIds: [database.id],
      expectedManifestRevision,
      targetVersion: 2,
      planHashes: { [database.id]: item.planHash },
      migrationCommittedAt: { [database.id]: item.migrationCommittedAt },
    });
    const migrated = await service.wait(task.id);
    expect(migrated).toMatchObject({
      state: 'succeeded',
      result: { verification: { verifiedRows: 2, verifiedOwners: 2, verifiedDerived: 1 } },
    });

    const v2 = await coldRuntime(projectDir, contentDir);
    const v2Query = v2.dataPlane.query({
      databaseId: database.id,
      sourceId: 'ds_orders',
      query: {
        select: ['prop_order_title', 'prop_double_amount', 'prop_broken_amount', 'prop_project_total'],
      },
    });
    expect(v2Query.records[0]?.computedResults).toMatchObject({
      prop_double_amount: { kind: 'value', value: 8 },
      prop_broken_amount: { kind: 'error', problem: { code: 'divide_by_zero' } },
      prop_project_total: { kind: 'value', value: 10 },
    });
    expect(v2Query.derivedRevision).toMatch(/^sha256:/);
    const v2Export = v2.dataPlane.exportMarkdownTable({
      databaseId: database.id,
      sourceId: 'ds_orders',
      mode: 'computed_snapshot',
      query: { select: ['prop_order_title', 'prop_double_amount', 'prop_project_total'] },
    });
    expect(v2Export.derivedRevision).toBe(v2Query.derivedRevision);
    expect(v2.index.list(database.id, 'ds_orders')).toHaveLength(1);

    const rollback = await service.rollback(migrated.id, migrated.revision);
    expect(rollback).toMatchObject({ status: 'applied', restored: 5 });
    const v1 = await coldRuntime(projectDir, contentDir);
    const v1Query = v1.dataPlane.query({
      databaseId: database.id,
      sourceId: 'ds_orders',
      query: {
        select: ['prop_order_title', 'prop_double_amount', 'prop_broken_amount', 'prop_project_total'],
      },
    });
    expect(v1Query.records[0]?.computedResults).toMatchObject({
      prop_double_amount: { kind: 'value', value: 8 },
      prop_broken_amount: { kind: 'error', problem: { code: 'divide_by_zero' } },
      prop_project_total: { kind: 'value', value: 10 },
    });
    expect(snapshotFiles(projectDir, contentDir)).toEqual(before);
    expect(v1.index.list(database.id, 'ds_orders')).toHaveLength(1);
  });
});
