import { describe, expect, test } from 'bun:test';
import type { DatabaseDefinition } from './schema.ts';
import { previewDatabaseSelectOptionChange } from './select-options.ts';

const definition = {
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
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          semantics: {
            constraints: { unique: false },
            inferencePolicy: 'explicit_only',
            sensitivity: 'inherit',
            defaultValue: 'todo',
          },
          options: [
            { id: 'opt_todo', key: 'todo', name: 'To do', color: 'gray' },
            { id: 'opt_doing', key: 'doing', name: 'Doing', color: 'blue' },
            { id: 'opt_done', key: 'done', name: 'Done', color: 'green' },
          ],
        },
      ],
    },
  ],
  views: [
    {
      id: 'view_todo',
      key: 'todo',
      name: 'To do',
      sourceId: 'ds_tasks',
      layout: { type: 'table' },
      where: {
        and: [
          { propertyId: 'prop_status', operator: 'equals', value: 'opt_todo' },
          { propertyId: 'prop_status', operator: 'not_equals', value: 'todo' },
        ],
      },
    },
  ],
} as DatabaseDefinition;

const records = [
  {
    id: 'rec_first',
    revision: `sha256:${'a'.repeat(64)}`,
    values: { prop_title: 'First', prop_status: 'opt_todo' },
  },
  {
    id: 'rec_second',
    revision: `sha256:${'b'.repeat(64)}`,
    values: { prop_title: 'Second', prop_status: 'opt_done' },
  },
];

describe('Select option lifecycle preview', () => {
  test('renames, recolors, reorders, and archives without changing stable IDs', () => {
    const renamed = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records,
      change: { kind: 'rename', optionId: 'opt_todo', name: 'Backlog' },
    });
    expect(renamed.canApply).toBe(true);
    expect(renamed.definition.sources[0]?.properties[1]).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'opt_todo', key: 'todo', name: 'Backlog' }),
      ]),
    });

    const recolored = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records,
      change: { kind: 'recolor', optionId: 'opt_todo', color: 'purple' },
    });
    expect(recolored.definition.sources[0]?.properties[1]).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'opt_todo', color: 'purple' }),
      ]),
    });

    const reordered = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records,
      change: { kind: 'reorder', optionIds: ['opt_done', 'opt_todo', 'opt_doing'] },
    });
    const reorderedProperty = reordered.definition.sources[0]?.properties[1];
    expect(
      reorderedProperty?.type === 'select' ? reorderedProperty.options.map((o) => o.id) : [],
    ).toEqual(['opt_done', 'opt_todo', 'opt_doing']);

    const archived = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records,
      change: { kind: 'archive', optionId: 'opt_doing', archived: true },
    });
    expect(archived.definition.sources[0]?.properties[1]).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'opt_doing', archived: true }),
      ]),
    });
    expect(definition.sources[0]?.properties[1]).not.toHaveProperty('options.1.archived');
  });

  test('merges record, default, and saved-view references into one target option', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records,
      change: { kind: 'merge', sourceOptionId: 'opt_todo', targetOptionId: 'opt_doing' },
    });
    expect(preview).toMatchObject({
      canApply: true,
      defaultChanged: true,
      affectedViewIds: ['view_todo'],
      recordChanges: [
        {
          recordId: 'rec_first',
          expectedRevision: `sha256:${'a'.repeat(64)}`,
          beforeOptionId: 'opt_todo',
          afterOptionId: 'opt_doing',
        },
      ],
    });
    const property = preview.definition.sources[0]?.properties[1];
    expect(property?.type === 'select' ? property.options.map((option) => option.id) : []).toEqual([
      'opt_doing',
      'opt_done',
    ]);
    expect(property?.semantics.defaultValue).toBe('doing');
    expect(preview.definition.views[0]?.where).toEqual({
      and: [
        { propertyId: 'prop_status', operator: 'equals', value: 'opt_doing' },
        { propertyId: 'prop_status', operator: 'not_equals', value: 'doing' },
      ],
    });
  });

  test('migrates Multi-select arrays, defaults, and dependency checks by stable option ID', () => {
    const multiSelectDefinition: DatabaseDefinition = {
      ...structuredClone(definition),
      sources: definition.sources.map((source) => ({
        ...source,
        properties: source.properties.map((property) =>
          property.id === 'prop_status' && property.type === 'select'
            ? {
                ...property,
                type: 'multi_select' as const,
                semantics: {
                  ...property.semantics,
                  defaultValue: ['todo', 'done'],
                },
              }
            : property,
        ),
      })),
    };
    const multiRecords = [
      {
        id: 'rec_multi',
        revision: `sha256:${'c'.repeat(64)}`,
        values: { prop_title: 'Multi', prop_status: ['opt_todo', 'opt_done'] },
      },
      {
        id: 'rec_target_only',
        revision: `sha256:${'d'.repeat(64)}`,
        values: { prop_title: 'Already target', prop_status: ['opt_doing'] },
      },
    ];
    const merged = previewDatabaseSelectOptionChange({
      definition: multiSelectDefinition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records: multiRecords,
      change: { kind: 'merge', sourceOptionId: 'opt_todo', targetOptionId: 'opt_doing' },
    });
    expect(merged).toMatchObject({
      canApply: true,
      defaultChanged: true,
      recordChanges: [
        {
          recordId: 'rec_multi',
          beforeOptionIds: ['opt_todo', 'opt_done'],
          afterOptionIds: ['opt_doing', 'opt_done'],
        },
      ],
    });
    const property = merged.definition.sources[0]?.properties[1];
    expect(property?.type === 'multi_select' ? property.semantics.defaultValue : undefined).toEqual(
      ['doing', 'done'],
    );
    expect(merged.definition.views[0]?.where).toEqual({
      and: [
        { propertyId: 'prop_status', operator: 'equals', value: 'opt_doing' },
        { propertyId: 'prop_status', operator: 'not_equals', value: 'doing' },
      ],
    });

    const deleted = previewDatabaseSelectOptionChange({
      definition: multiSelectDefinition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records: multiRecords,
      change: { kind: 'delete', optionId: 'opt_todo' },
    });
    expect(deleted.canApply).toBe(false);
    expect(deleted.conflicts).toContainEqual(
      expect.objectContaining({ code: 'delete_in_use', recordIds: ['rec_multi'] }),
    );
  });

  test('blocks deletion while records, defaults, views, or the last option depend on it', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records,
      change: { kind: 'delete', optionId: 'opt_todo' },
    });
    expect(preview.canApply).toBe(false);
    expect(preview.conflicts.map((conflict) => conflict.code)).toEqual([
      'delete_in_use',
      'delete_default_in_use',
      'delete_view_in_use',
    ]);
    expect(preview.conflicts[0]).toMatchObject({ recordIds: ['rec_first'] });

    const oneOption = structuredClone(definition);
    const property = oneOption.sources[0]?.properties[1];
    if (!property || property.type !== 'select') throw new Error('missing Select fixture');
    property.options = [property.options[0] as (typeof property.options)[number]];
    const last = previewDatabaseSelectOptionChange({
      definition: oneOption,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records: [],
      change: { kind: 'archive', optionId: 'opt_todo', archived: true },
    });
    expect(last.canApply).toBe(false);
    expect(last.conflicts).toEqual([expect.objectContaining({ code: 'last_active_option' })]);

    const archivedAlternative = structuredClone(definition);
    const archivedProperty = archivedAlternative.sources[0]?.properties[1];
    if (!archivedProperty || archivedProperty.type !== 'select') {
      throw new Error('missing Select fixture');
    }
    archivedProperty.options = [
      archivedProperty.options[0] as (typeof archivedProperty.options)[number],
      {
        ...(archivedProperty.options[1] as (typeof archivedProperty.options)[number]),
        archived: true,
      },
    ];
    const deleteLastActive = previewDatabaseSelectOptionChange({
      definition: archivedAlternative,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records: [],
      change: { kind: 'delete', optionId: 'opt_todo' },
    });
    expect(deleteLastActive.conflicts).toContainEqual(
      expect.objectContaining({ code: 'last_active_option' }),
    );

    const mergeIntoArchived = previewDatabaseSelectOptionChange({
      definition: archivedAlternative,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records: [],
      change: { kind: 'merge', sourceOptionId: 'opt_todo', targetOptionId: 'opt_doing' },
    });
    expect(mergeIntoArchived.canApply).toBe(false);
    expect(mergeIntoArchived.conflicts).toEqual([
      expect.objectContaining({ code: 'merge_target_archived' }),
    ]);
  });

  test('rejects incomplete or duplicate reorder permutations', () => {
    expect(() =>
      previewDatabaseSelectOptionChange({
        definition,
        sourceId: 'ds_tasks',
        propertyId: 'prop_status',
        records,
        change: { kind: 'reorder', optionIds: ['opt_todo', 'opt_todo', 'opt_done'] },
      }),
    ).toThrow('every stable option ID exactly once');
  });
});

const statusDefinition = {
  version: 1,
  id: 'db_work',
  key: 'work',
  name: 'Work',
  contract: {
    purpose: 'Track work',
    canonicality: 'canonical',
    vocabulary: ['work'],
    freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_work',
      key: 'work',
      name: 'Work',
      recordMeaning: 'One item',
      folder: 'work',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
        {
          id: 'prop_stage',
          key: 'stage',
          name: 'Stage',
          type: 'status',
          groups: [
            { id: 'stg_todo', key: 'todo', name: 'To-do', category: 'todo' },
            { id: 'stg_doing', key: 'in_progress', name: 'In progress', category: 'in_progress' },
            { id: 'stg_done', key: 'complete', name: 'Complete', category: 'complete' },
          ],
          options: [
            { id: 'opt_new', key: 'not_started', name: 'Not started', groupId: 'stg_todo' },
            { id: 'opt_extra', key: 'blocked', name: 'Blocked', groupId: 'stg_todo' },
            { id: 'opt_doing', key: 'in_progress', name: 'In progress', groupId: 'stg_doing' },
            { id: 'opt_done', key: 'done', name: 'Done', groupId: 'stg_done' },
          ],
        },
      ],
    },
  ],
  views: [],
} as unknown as DatabaseDefinition;

/**
 * Status options are the same options with a group attached, so the engine
 * treats them alike — except that the manifest requires every one of the three
 * fixed groups to keep an option, which delete and merge can both violate.
 */
describe('status options', () => {
  test('renames a status option like any other', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition: statusDefinition,
      sourceId: 'ds_work',
      propertyId: 'prop_stage',
      records: [],
      change: { kind: 'rename', optionId: 'opt_done', name: 'Shipped' },
    });
    expect(preview.canApply).toBe(true);
    const property = preview.definition.sources[0]?.properties[1];
    const options = property && 'options' in property ? property.options : [];
    expect(options.find((option) => option.id === 'opt_done')?.name).toBe('Shipped');
  });

  test('deletes an option while its group keeps another', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition: statusDefinition,
      sourceId: 'ds_work',
      propertyId: 'prop_stage',
      records: [],
      change: { kind: 'delete', optionId: 'opt_extra' },
    });
    expect(preview.canApply).toBe(true);
  });

  test('refuses to empty a status group by deleting its last option', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition: statusDefinition,
      sourceId: 'ds_work',
      propertyId: 'prop_stage',
      records: [],
      change: { kind: 'delete', optionId: 'opt_done' },
    });
    expect(preview.canApply).toBe(false);
    expect(preview.conflicts.map((conflict) => conflict.code)).toContain('last_group_option');
  });

  test('refuses to empty a status group by merging its last option away', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition: statusDefinition,
      sourceId: 'ds_work',
      propertyId: 'prop_stage',
      records: [],
      change: { kind: 'merge', sourceOptionId: 'opt_doing', targetOptionId: 'opt_done' },
    });
    expect(preview.canApply).toBe(false);
    expect(preview.conflicts.map((conflict) => conflict.code)).toContain('last_group_option');
  });

  test('leaves a Select property free of the group rule', () => {
    const preview = previewDatabaseSelectOptionChange({
      definition,
      sourceId: 'ds_tasks',
      propertyId: 'prop_status',
      records: [],
      change: { kind: 'rename', optionId: 'opt_todo', name: 'Queued' },
    });
    expect(preview.conflicts.map((conflict) => conflict.code)).not.toContain('last_group_option');
  });
});
