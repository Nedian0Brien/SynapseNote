import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TASKS_DB = 'db_11111111111111111111111111111111';
const TASKS_SOURCE = 'ds_11111111111111111111111111111111';
const TASKS_TITLE = 'prop_11111111111111111111111111111111';
const PEOPLE_DB = 'db_22222222222222222222222222222222';
const PEOPLE_SOURCE = 'ds_22222222222222222222222222222222';
const PEOPLE_TITLE = 'prop_22222222222222222222222222222222';

function definition(input: {
  id: string;
  key: string;
  sourceId: string;
  titleId: string;
}): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: input.id,
    key: input.key,
    name: input.key,
    contract: {
      purpose: `Manage ${input.key}`,
      canonicality: 'canonical',
      vocabulary: [input.key],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: input.sourceId,
        key: input.key,
        name: input.key,
        recordMeaning: `One ${input.key}`,
        folder: input.key,
        properties: [{ id: input.titleId, key: 'title', name: 'Title', type: 'title' }],
      },
    ],
    views: [
      {
        id: `view_${input.key.padEnd(32, '0')}`,
        key: 'table',
        name: 'Table',
        sourceId: input.sourceId,
        layout: { type: 'table', configuration: {} },
        projection: { propertyIds: [input.titleId], body: 'hidden' },
      },
    ],
  });
}

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-cross-db-relation-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const tasks = definition({
    id: TASKS_DB,
    key: 'tasks',
    sourceId: TASKS_SOURCE,
    titleId: TASKS_TITLE,
  });
  const people = definition({
    id: PEOPLE_DB,
    key: 'people',
    sourceId: PEOPLE_SOURCE,
    titleId: PEOPLE_TITLE,
  });
  for (const each of [tasks, people]) {
    writeFileSync(
      join(projectDir, '.ok', 'databases', `${each.key}.yml`),
      serializeDatabaseManifestYaml(each),
    );
    mkdirSync(join(contentDir, each.key), { recursive: true });
  }
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const recordIndex = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await recordIndex.rebuild();
  let counter = 0;
  const engine = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: recordIndex,
    projectDir,
    contentDir,
    now: () => new Date('2026-07-28T00:00:00.000Z'),
    generateUuid: () => `${String(++counter).padStart(8, '0')}-0000-4000-8000-000000000000`,
  });
  return { engine, tasks };
}

function desiredStateWithRelation(
  tasks: DatabaseDefinition,
  relation: Record<string, unknown>,
): Record<string, unknown> {
  const source = tasks.sources[0];
  if (!source) throw new Error('fixture source missing');
  return {
    database: {
      id: tasks.id,
      key: tasks.key,
      name: tasks.name,
      people: [],
      contract: tasks.contract,
    },
    sources: [
      {
        ...structuredClone(source),
        properties: [
          ...structuredClone(source.properties),
          { key: 'linked', name: 'Linked', type: 'relation', ...relation },
        ],
      },
    ],
    views: tasks.views.map((view) => {
      const { sourceId, ...rest } = structuredClone(view);
      return { ...rest, sourceKey: 'tasks' };
    }),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
    sampleRecords: [],
    recordMutations: [],
  };
}

const missingTarget = expect.objectContaining({ code: 'relation_target_missing' });

/**
 * The manifest schema cannot confirm a target it does not contain, so it defers
 * to the planner — the first layer that sees every database. These pin that the
 * planner actually took the check over rather than dropping it.
 */
describe('cross-database relations', () => {
  test('plans a relation into another database', async () => {
    const { engine, tasks } = await fixture();
    const plan = engine.createPlan(
      engine.createDraft(
        desiredStateWithRelation(tasks, {
          targetSourceId: PEOPLE_SOURCE,
          targetDatabaseId: PEOPLE_DB,
        }),
      ).id,
    );
    expect(plan.conflicts).not.toContainEqual(missingTarget);
    expect(plan.committable).toBe(true);
  });

  test('refuses a target database that is not in the workspace', async () => {
    const { engine, tasks } = await fixture();
    const plan = engine.createPlan(
      engine.createDraft(
        desiredStateWithRelation(tasks, {
          targetSourceId: PEOPLE_SOURCE,
          targetDatabaseId: 'db_99999999999999999999999999999999',
        }),
      ).id,
    );
    expect(plan.conflicts).toContainEqual(missingTarget);
    expect(plan.committable).toBe(false);
  });

  test('refuses a source the target database does not define', async () => {
    const { engine, tasks } = await fixture();
    const plan = engine.createPlan(
      engine.createDraft(
        desiredStateWithRelation(tasks, {
          targetSourceId: 'ds_99999999999999999999999999999999',
          targetDatabaseId: PEOPLE_DB,
        }),
      ).id,
    );
    expect(plan.conflicts).toContainEqual(missingTarget);
    expect(plan.committable).toBe(false);
  });

  test('still plans a same-database self-relation', async () => {
    const { engine, tasks } = await fixture();
    const plan = engine.createPlan(
      engine.createDraft(desiredStateWithRelation(tasks, { targetSourceId: TASKS_SOURCE })).id,
    );
    expect(plan.conflicts).not.toContainEqual(missingTarget);
    expect(plan.committable).toBe(true);
  });
});
