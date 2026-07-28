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

const TITLE_ID = 'prop_11111111111111111111111111111111';
const NOTES_ID = 'prop_22222222222222222222222222222222';
const SOURCE_ID = 'ds_11111111111111111111111111111111';

function ownerTable(columns: readonly string[], headers: readonly string[]): string {
  return [
    '<!-- synapsenote:database',
    'version=2',
    'database=db_11111111111111111111111111111111',
    `source=${SOURCE_ID}`,
    'block=dbb_11111111111111111111111111111111_primary',
    `columns=${columns.join(',')}`,
    '-->',
    '',
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    '',
  ].join('\n');
}

function v2Definition(extraStored: boolean): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_11111111111111111111111111111111',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track tasks',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: SOURCE_ID,
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: '.',
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'tasks.md', blockId: 'dbb_11111111111111111111111111111111_primary' },
          titlePropertyId: TITLE_ID,
          storedPropertyIds: extraStored ? [TITLE_ID, NOTES_ID] : [TITLE_ID],
        },
        properties: [
          { id: TITLE_ID, key: 'title', name: 'Title', type: 'title' },
          ...(extraStored ? [{ id: NOTES_ID, key: 'notes', name: 'Notes', type: 'text' }] : []),
        ],
      },
    ],
    views: [
      {
        id: 'view_11111111111111111111111111111111',
        key: 'table',
        name: 'Table',
        sourceId: SOURCE_ID,
        layout: { type: 'table', configuration: {} },
        projection: {
          propertyIds: extraStored ? [TITLE_ID, NOTES_ID] : [TITLE_ID],
          body: 'hidden',
        },
      },
    ],
  });
}

async function fixture(extraStored = false) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-v2-manifest-guard-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const definition = v2Definition(extraStored);
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'tasks.yml'),
    serializeDatabaseManifestYaml(definition),
  );
  writeFileSync(
    join(contentDir, 'tasks.md'),
    extraStored
      ? ownerTable([TITLE_ID, NOTES_ID], ['Title', 'Notes'])
      : ownerTable([TITLE_ID], ['Title']),
  );
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
  return { engine, definition, contentDir };
}

/** Rebuild the wire-shaped desired state the app posts, from a definition. */
function desiredStateFrom(definition: DatabaseDefinition): Record<string, unknown> {
  return {
    database: {
      id: definition.id,
      key: definition.key,
      name: definition.name,
      people: [],
      contract: definition.contract,
    },
    sources: structuredClone(definition.sources),
    views: definition.views.map((view) => {
      const { sourceId, ...rest } = structuredClone(view);
      return { ...rest, sourceKey: 'tasks' };
    }),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
    sampleRecords: [],
    recordMutations: [],
  };
}

const columnConflict = expect.objectContaining({ code: 'source_record_migration_required' });

/**
 * The guard used to refuse EVERY manifest update on a v2 database, which froze
 * the schema and every view of every v2 database. It must refuse exactly the
 * changes that reshape the owner table — nothing less, and nothing more.
 */
describe('v2 manifest update guard', () => {
  test('allows a view-only change', async () => {
    const { engine, definition } = await fixture();
    const state = desiredStateFrom(definition);
    (state.views as Record<string, unknown>[]).push({
      key: 'board',
      name: 'Board',
      sourceKey: 'tasks',
      layout: { type: 'table', configuration: {} },
      projection: { propertyKeys: ['title'], body: 'hidden' },
    });

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.conflicts).not.toContainEqual(columnConflict);
    expect(plan.committable).toBe(true);
  });

  test('allows adding a derived property, which occupies no column', async () => {
    const { engine, definition } = await fixture();
    const state = desiredStateFrom(definition);
    (state.sources as { properties: unknown[] }[])[0]?.properties.push({
      key: 'created',
      name: 'Created',
      type: 'created_time',
    });

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.conflicts).not.toContainEqual(columnConflict);
    expect(plan.committable).toBe(true);
  });

  test('reshapes the owner table when a stored property is added', async () => {
    const { engine, definition } = await fixture();
    const state = desiredStateFrom(definition);
    (state.sources as { properties: unknown[] }[])[0]?.properties.push({
      key: 'notes',
      name: 'Notes',
      type: 'text',
    });

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.conflicts).not.toContainEqual(columnConflict);
    expect(plan.committable).toBe(true);

    // The manifest and the owner table must move in the SAME plan, or a commit
    // could land one without the other and break the marker/manifest binding.
    const owner = plan.diff.manifests.find((entry) => entry.path === 'content/tasks.md');
    const manifest = plan.diff.manifests.find((entry) => entry.path.endsWith('tasks.yml'));
    expect(manifest?.action).toBe('update');
    expect(owner?.action).toBe('update');
    expect(owner?.after).toContain('| Title | Notes |');
    // The added property's ID is minted during planning, so pin the shape:
    // Title keeps column 0 and exactly one column joins it.
    const nextColumns = owner?.after?.match(/columns=(.+)/)?.[1]?.split(',') ?? [];
    expect(nextColumns).toHaveLength(2);
    expect(nextColumns[0]).toBe(TITLE_ID);
    // The manifest must agree with the marker, or materialization reports a
    // storage_mismatch on the very next read.
    expect(manifest?.after).toContain(`- ${nextColumns[0]}`);
    expect(manifest?.after).toContain(`- ${nextColumns[1]}`);
  });

  test('reshapes the owner table when a stored property is removed', async () => {
    // Seeded WITH the notes column so the removal is a real change on disk.
    const { engine, definition } = await fixture(true);
    const state = desiredStateFrom(definition);
    const source = (state.sources as { properties: { key: string }[] }[])[0];
    if (!source) throw new Error('fixture source missing');
    source.properties = source.properties.filter((property) => property.key !== 'notes');
    const view = (state.views as { projection: { propertyIds: string[] } }[])[0];
    if (view) view.projection.propertyIds = [TITLE_ID];

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.conflicts).not.toContainEqual(columnConflict);
    const owner = plan.diff.manifests.find((entry) => entry.path === 'content/tasks.md');
    expect(owner?.after).toContain(`columns=${TITLE_ID}`);
    expect(owner?.after).not.toContain(NOTES_ID);
    expect(owner?.after).toContain('| Title |');
  });

  test('refuses a column change when the owner table cannot be parsed', async () => {
    const { engine, definition, contentDir } = await fixture();
    writeFileSync(join(contentDir, 'tasks.md'), 'no owner marker here\n');
    const state = desiredStateFrom(definition);
    (state.sources as { properties: unknown[] }[])[0]?.properties.push({
      key: 'notes',
      name: 'Notes',
      type: 'text',
    });

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.conflicts).toContainEqual(columnConflict);
    expect(plan.committable).toBe(false);
  });

  test('allows renaming a stored property, which keeps the same column', async () => {
    const { engine, definition } = await fixture(true);
    const state = desiredStateFrom(definition);
    const source = (state.sources as { properties: { key: string; name: string }[] }[])[0];
    const notes = source?.properties.find((property) => property.key === 'notes');
    if (!notes) throw new Error('fixture notes property missing');
    notes.name = 'Renamed notes';

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.conflicts).not.toContainEqual(columnConflict);
  });
});
