import { describe, expect, test } from 'bun:test';
import { queryDatabaseRecords } from './query.ts';
import { DatabaseDefinitionSchema } from './schema.ts';
import {
  databaseDefaultStatusOption,
  databaseStatusBoardGroups,
  resolveDatabaseStatus,
} from './status.ts';

function statusProperty() {
  const definition = DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track work',
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
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'status',
            semantics: {
              constraints: { unique: false },
              inferencePolicy: 'explicit_only',
              sensitivity: 'inherit',
              defaultValue: 'not_started',
            },
            groups: [
              { id: 'stg_todo', key: 'todo', name: 'To-do', category: 'todo' },
              {
                id: 'stg_doing',
                key: 'in_progress',
                name: 'In progress',
                category: 'in_progress',
              },
              {
                id: 'stg_complete',
                key: 'complete',
                name: 'Complete',
                category: 'complete',
              },
            ],
            options: [
              {
                id: 'opt_not_started',
                key: 'not_started',
                name: 'Not started',
                groupId: 'stg_todo',
              },
              {
                id: 'opt_doing',
                key: 'doing',
                name: 'Doing',
                groupId: 'stg_doing',
              },
              {
                id: 'opt_done',
                key: 'done',
                name: 'Done',
                groupId: 'stg_complete',
              },
            ],
          },
        ],
      },
    ],
    views: [],
  });
  const property = definition.sources[0]?.properties[1];
  if (!property || property.type !== 'status') throw new Error('missing status fixture');
  return property;
}

describe('Status workflow semantics', () => {
  test('resolves progress and completion from stable option and group IDs', () => {
    const property = statusProperty();
    expect(resolveDatabaseStatus(property, 'opt_not_started')).toMatchObject({
      category: 'todo',
      progress: 0,
      complete: false,
    });
    expect(resolveDatabaseStatus(property, 'opt_doing')).toMatchObject({
      category: 'in_progress',
      progress: 0.5,
      complete: false,
    });
    expect(resolveDatabaseStatus(property, 'opt_done')).toMatchObject({
      category: 'complete',
      progress: 1,
      complete: true,
    });
    expect(resolveDatabaseStatus(property, 'opt_missing')).toBeNull();
  });

  test('exposes deterministic board order and an active default', () => {
    const property = statusProperty();
    expect(
      databaseStatusBoardGroups(property).map(({ group, options, progress }) => ({
        category: group.category,
        options: options.map((option) => option.id),
        progress,
      })),
    ).toEqual([
      { category: 'todo', options: ['opt_not_started'], progress: 0 },
      { category: 'in_progress', options: ['opt_doing'], progress: 0.5 },
      { category: 'complete', options: ['opt_done'], progress: 1 },
    ]);
    expect(databaseDefaultStatusOption(property).id).toBe('opt_not_started');
  });

  test('sorts records and aggregate groups by workflow lane then option order', () => {
    const property = statusProperty();
    const source = {
      id: 'ds_status_sort',
      key: 'status_sort',
      name: 'Status sort',
      recordMeaning: 'One task',
      folder: 'status-sort',
      includeSubfolders: true,
      properties: [
        {
          id: 'prop_status_sort_title',
          key: 'title',
          name: 'Title',
          type: 'title' as const,
          required: true,
          aliases: [],
          semantics: {
            constraints: { unique: false },
            inferencePolicy: 'explicit_only' as const,
            sensitivity: 'inherit' as const,
          },
        },
        property,
      ],
    };
    const records = [
      ['rec_done', 'Done', 'opt_done'],
      ['rec_todo', 'Todo', 'opt_not_started'],
      ['rec_doing', 'Doing', 'opt_doing'],
    ].map(([id, title, status]) => ({
      id: id as string,
      databaseId: 'db_tasks',
      sourceId: source.id,
      path: `${id}.md`,
      revision: null,
      values: { prop_status_sort_title: title as string, [property.id]: status as string },
      body: '',
      archivedAt: null,
    }));
    const result = queryDatabaseRecords({
      source,
      records,
      snapshotRevision: 'snapshot:status-order',
      query: {
        sort: [{ propertyId: property.id, direction: 'asc' }],
        aggregate: {
          groupBy: [
            {
              propertyId: property.id,
              direction: 'asc',
              includeEmpty: false,
              arrayMode: 'set',
            },
          ],
          calculations: [],
          groupLimit: 10,
          membershipLimit: 10,
        },
      },
    });
    expect(result.records.map((record) => record.id)).toEqual([
      'rec_todo',
      'rec_doing',
      'rec_done',
    ]);
    expect(result.aggregation?.groups.map((group) => group.key[0]?.value)).toEqual([
      'opt_not_started',
      'opt_doing',
      'opt_done',
    ]);
  });

  test('rejects invalid board group order', () => {
    const property = statusProperty();
    const invalid = structuredClone(property);
    invalid.groups.reverse();
    const result = DatabaseDefinitionSchema.safeParse({
      version: 1,
      id: 'db_invalid',
      key: 'invalid',
      name: 'Invalid',
      contract: {
        purpose: 'Reject invalid status',
        canonicality: 'canonical',
        vocabulary: [],
        freshness: { expectation: 'manual' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_invalid',
          key: 'invalid',
          name: 'Invalid',
          recordMeaning: 'One record',
          folder: 'invalid',
          properties: [
            { id: 'prop_title_invalid', key: 'title', name: 'Title', type: 'title' },
            invalid,
          ],
        },
      ],
      views: [],
    });
    expect(result.success).toBe(false);
  });
});
