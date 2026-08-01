import { describe, expect, test } from 'bun:test';
import {
  freezeDatabaseMigrationDerivedBaseline,
  planDatabaseMigrationDependencyClosure,
  resolveDatabaseMigrationOwnerSelection,
} from './markdown-table-migration-preflight.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

function definitions() {
  const tasks = DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Tasks',
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
        recordMeaning: 'Task',
        folder: 'tasks',
        properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
      },
    ],
  });
  const tasksSource = tasks.sources[0];
  if (!tasksSource) throw new Error('Tasks fixture source is missing');
  (tasksSource.properties as unknown as Array<Record<string, unknown>>).push({
    id: 'prop_project',
    key: 'project',
    name: 'Project',
    type: 'relation',
    targetSourceId: 'ds_projects',
    cardinality: 'one',
  });
  return [
    tasks,
    DatabaseDefinitionSchema.parse({
      version: 2,
      id: 'db_projects',
      key: 'projects',
      name: 'Projects',
      contract: {
        purpose: 'Projects',
        canonicality: 'canonical',
        vocabulary: ['project'],
        freshness: { expectation: 'realtime' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_projects',
          key: 'projects',
          name: 'Projects',
          recordMeaning: 'Project',
          folder: 'projects',
          storage: {
            kind: 'markdown_table',
            formatVersion: 2,
            owner: { path: 'projects.md', blockId: 'dbb_projects' },
            titlePropertyId: 'prop_title',
            storedPropertyIds: ['prop_title'],
          },
          properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
        },
      ],
    }),
  ];
}

describe('v2 migration preflight contracts', () => {
  test('requires an explicit owner candidate and blocks occupied paths', () => {
    const candidate = {
      kind: 'full_page' as const,
      path: 'db/tasks.md',
      blockId: 'dbb_tasks',
      occupied: true,
    };
    expect(
      resolveDatabaseMigrationOwnerSelection({ sourceId: 'ds_tasks', candidates: [candidate] }),
    ).toMatchObject({ selected: null, blockers: [{ code: 'owner_choice_required' }] });
    expect(
      resolveDatabaseMigrationOwnerSelection({
        sourceId: 'ds_tasks',
        candidates: [candidate],
        selectedPath: candidate.path,
        selectedBlockId: candidate.blockId,
      }),
    ).toMatchObject({ selected: null, blockers: [{ code: 'owner_path_occupied' }] });
    expect(
      resolveDatabaseMigrationOwnerSelection({
        sourceId: 'ds_tasks',
        candidates: [{ ...candidate, occupied: false }],
        selectedPath: candidate.path,
        selectedBlockId: candidate.blockId,
      }),
    ).toMatchObject({ selected: { path: candidate.path }, blockers: [] });
  });

  test('computes cross-database dependency closure and blocks mixed writer versions', () => {
    const result = planDatabaseMigrationDependencyClosure({
      databases: definitions(),
      selectedDatabaseIds: ['db_tasks'],
      targetVersion: 2,
    });
    expect(result.closureDatabaseIds).toEqual(['db_projects', 'db_tasks']);
    expect(result.edges).toEqual([
      expect.objectContaining({
        targetDatabaseId: 'db_projects',
        targetSourceId: 'ds_projects',
        kind: 'relation',
      }),
    ]);
    expect(result.blockers).toEqual([]);
    const mixed = planDatabaseMigrationDependencyClosure({
      databases: definitions().map((database) =>
        database.id === 'db_projects' ? { ...database, version: 1 as const } : database,
      ),
      selectedDatabaseIds: ['db_tasks'],
      targetVersion: 2,
    });
    expect(mixed.blockers).toEqual([
      expect.objectContaining({ code: 'mixed_writer_dependency', targetDatabaseId: 'db_projects' }),
    ]);
  });

  test('freezes a deterministic Formula/Rollup baseline', () => {
    expect(
      freezeDatabaseMigrationDerivedBaseline({
        evaluatedAt: '2026-07-27T00:00:00.000Z',
        timeZone: 'UTC',
        locale: 'en',
        permissionRevision: `sha256:${'a'.repeat(64)}`,
      }),
    ).toEqual({
      evaluatedAt: '2026-07-27T00:00:00.000Z',
      timeZone: 'UTC',
      locale: 'en',
      permissionRevision: `sha256:${'a'.repeat(64)}`,
    });
    expect(() =>
      freezeDatabaseMigrationDerivedBaseline({
        evaluatedAt: 'not-a-date',
        timeZone: 'UTC',
        locale: 'en',
        permissionRevision: `sha256:${'a'.repeat(64)}`,
      }),
    ).toThrow();
  });
});
