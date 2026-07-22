import { describe, expect, test } from 'bun:test';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  DatabasePropertySchema,
  type DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDesiredStateDraftSchema } from '@nedian0brien/synapsenote-server';
import {
  createDatabaseBulkCellMutationDesiredState,
  createDatabaseBulkCheckboxToggleDesiredState,
  createDatabaseCellMutationDesiredState,
  createDatabaseComputedPropertyChangeDesiredState,
  createDatabaseDefaultViewChangeDesiredState,
  createDatabasePageAppearanceDesiredState,
  createDatabasePageTitleDesiredState,
  createDatabasePlacePrivacyChangeDesiredState,
  createDatabaseRecordArchiveDesiredState,
  createDatabaseRecordCopyDesiredState,
  createDatabaseRecordDeletionDesiredState,
  createDatabaseRecordDesiredState,
  createDatabaseRecordMoveDesiredState,
  createDatabaseRenamePropertyDesiredState,
  createDatabaseSelectOptionChangeDesiredState,
  createDatabaseTablePasteDesiredState,
  createDatabaseTemplateLifecycleDesiredState,
  createDatabaseUniqueIdPrefixChangeDesiredState,
  createDatabaseViewConfigurationChangeDesiredState,
  createDatabaseViewFilterChangeDesiredState,
  createDatabaseViewLifecycleChangeDesiredState,
  isDatabaseCellEditable,
  parseDatabaseCellDraft,
  rebaseQueuedDatabaseRecordMutations,
} from './database-cell-mutation.ts';

const database: DatabaseDefinition = {
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
        { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
        {
          id: 'prop_tags',
          key: 'tags',
          name: 'Tags',
          type: 'multi_select',
          options: [
            { id: 'opt_red', key: 'red', name: 'Red' },
            { id: 'opt_blue', key: 'blue', name: 'Blue' },
          ],
        },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [
            { id: 'opt_todo', key: 'todo', name: 'To do' },
            { id: 'opt_done', key: 'done', name: 'Done' },
          ],
        },
        { id: 'prop_complete', key: 'complete', name: 'Complete', type: 'checkbox' },
      ],
    },
  ],
  views: [
    {
      id: 'view_scored',
      key: 'scored',
      name: 'Scored tasks',
      sourceId: 'ds_tasks',
      layout: { type: 'table', configuration: {} },
      where: { propertyId: 'prop_score', operator: 'gte', value: 1 },
      sort: [{ propertyId: 'prop_score', direction: 'desc' }],
      groups: [{ propertyId: 'prop_tags', direction: 'asc', hideEmpty: true }],
      projection: {
        propertyIds: ['prop_title', 'prop_score'],
        body: 'preview',
      },
    },
  ],
  templates: [
    {
      id: 'tpl_default',
      key: 'default-task',
      name: 'Default task',
      sourceId: 'ds_tasks',
      propertyValues: { prop_status: 'opt_todo' },
      body: '## Checklist\n',
      order: 0,
      archivedAt: null,
      defaultFor: { source: true, viewIds: [], entryPoints: [] },
    },
  ],
};

describe('database cell mutation compiler', () => {
  test('rebases queued record operations onto the current schema without replaying stale views', () => {
    const currentSource = database.sources[0];
    const statusProperty = currentSource?.properties.find(
      (property) => property.id === 'prop_status',
    );
    if (!currentSource || !statusProperty) throw new Error('expected Status property');
    const queued = createDatabaseCellMutationDesiredState({
      database,
      source: currentSource,
      record: {
        id: 'rec_one',
        path: 'tasks/one.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'One', prop_status: 'opt_todo' },
      },
      property: statusProperty,
      value: 'opt_done',
    });
    const current = {
      ...database,
      name: 'Renamed while offline',
      views: [],
    } satisfies DatabaseDefinition;
    const rebased = rebaseQueuedDatabaseRecordMutations({
      database: current,
      recordMutations: DatabaseDesiredStateDraftSchema.parse(queued).recordMutations,
    });

    expect(rebased.database.name).toBe('Renamed while offline');
    expect(rebased.views).toEqual([]);
    expect(rebased.recordMutations).toEqual(queued.recordMutations);
    expect(rebased.recordCopies).toEqual([]);
    expect(rebased.recordDeletions).toEqual([]);
  });

  test('applies source templates to record creation and compiles lifecycle changes', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid fixture');
    const created = createDatabaseRecordDesiredState({ database, source, title: 'Templated task' });
    expect(created.sampleRecords?.[0]).toMatchObject({
      values: { title: 'Templated task', status: 'opt_todo' },
      body: '## Checklist\n',
    });
    const duplicated = createDatabaseTemplateLifecycleDesiredState({
      database,
      source,
      change: {
        kind: 'duplicate',
        template: {
          ...(database.templates[0] as NonNullable<(typeof database.templates)[number]>),
          id: 'tpl_copy',
          key: 'default-task-copy',
          name: 'Default task copy',
          order: 1,
          defaultFor: { source: false, viewIds: ['view_scored'], entryPoints: [] },
        },
      },
    });
    expect(duplicated.templates).toHaveLength(2);
    const archived = createDatabaseTemplateLifecycleDesiredState({
      database,
      source,
      change: {
        kind: 'archive',
        templateId: 'tpl_default',
        archivedAt: '2026-07-21T01:00:00.000Z',
      },
    });
    expect(archived.templates?.[0]).toMatchObject({
      archivedAt: '2026-07-21T01:00:00.000Z',
      defaultFor: { source: false, viewKeys: [], entryPoints: [] },
    });
    const repeatedDatabase = DatabaseDefinitionSchema.parse({
      ...database,
      people: [
        {
          id: 'person_scheduler',
          key: 'scheduler',
          name: 'Scheduler',
          kind: 'agent',
          subjectId: 'agent:template-scheduler',
        },
      ],
      templates: database.templates.map((template) => ({
        ...template,
        repeat: {
          schedule: { kind: 'daily' as const, time: '09:00' },
          timeZone: 'UTC',
          ownerId: 'person_scheduler',
          paused: false,
        },
      })),
    });
    const archivedRepeat = createDatabaseTemplateLifecycleDesiredState({
      database: repeatedDatabase,
      source: repeatedDatabase.sources[0] as DatabaseSource,
      change: {
        kind: 'archive',
        templateId: 'tpl_default',
        archivedAt: '2026-07-21T01:00:00.000Z',
      },
    });
    expect(archivedRepeat.templates?.[0]?.repeat).toMatchObject({
      ownerKey: 'scheduler',
      paused: true,
    });
  });

  test('renames one schema property without changing its stable identity or values', () => {
    const source = database.sources[0] as DatabaseSource;
    const property = source.properties.find((candidate) => candidate.id === 'prop_status');
    if (!property) throw new Error('expected Status property');
    const desired = createDatabaseRenamePropertyDesiredState({
      database,
      source,
      property,
      name: '  State  ',
    });
    const renamedSource = desired.sources.find((candidate) => candidate.id === source.id);
    const renamed = renamedSource?.properties.find((candidate) => candidate.id === property.id);
    expect(renamed).toMatchObject({
      id: property.id,
      key: property.key,
      name: 'State',
      type: property.type,
      options: property.options,
    });
    expect(desired.sampleRecords).toEqual([]);
    expect(desired.recordMutations).toEqual([]);
    expect(() =>
      createDatabaseRenamePropertyDesiredState({
        database,
        source,
        property,
        name: 'Score',
      }),
    ).toThrow('already exists');
    expect(() =>
      createDatabaseRenamePropertyDesiredState({ database, source, property, name: '   ' }),
    ).toThrow('name is required');
  });

  test('keeps created and last edited time immutable in every cell write path', () => {
    for (const type of [
      'created_time',
      'last_edited_time',
      'created_by',
      'last_edited_by',
    ] as const) {
      const property = DatabasePropertySchema.parse({
        id: `prop_${type}`,
        key: type,
        name: type,
        type,
      });
      expect(isDatabaseCellEditable(property)).toBe(false);
      expect(() => parseDatabaseCellDraft(property, '2026-07-20T00:00:00.000Z')).toThrow(
        'derived read-only',
      );
    }
  });

  test('compiles one revision-bound stable-property edit without canonical side effects', () => {
    const source = database.sources[0];
    const property = source?.properties[1];
    if (!source || !property) throw new Error('invalid fixture');
    const desired = createDatabaseCellMutationDesiredState({
      database,
      source,
      property,
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'First', prop_score: 1 },
      },
      value: 2,
    });
    expect(desired.recordMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: `sha256:${'a'.repeat(64)}`,
        sourceKey: 'tasks',
        preconditions: [{ propertyKey: 'score', present: true, value: 1 }],
        operations: [{ op: 'set', propertyKey: 'score', value: 2 }],
      },
    ]);
    expect(desired.views).toEqual([
      {
        id: 'view_scored',
        key: 'scored',
        name: 'Scored tasks',
        sourceKey: 'tasks',
        layout: { type: 'table', configuration: {} },
        where: { propertyId: 'prop_score', operator: 'gte', value: 1 },
        sort: [{ propertyId: 'prop_score', direction: 'desc' }],
        groups: [{ propertyId: 'prop_tags', direction: 'asc', hideEmpty: true }],
        projection: {
          propertyIds: ['prop_title', 'prop_score'],
          body: 'preview',
        },
      },
    ]);
    expect(desired.policy).toMatchObject({ mode: 'review', maxRecordsPerCommit: 1 });
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
  });

  test('persists nested AND, OR, and NOT groups in one saved-view schema plan', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid saved filter fixture');
    const where = {
      and: [
        { propertyId: 'prop_score', operator: 'gte' as const, value: 2 },
        {
          or: [
            { propertyId: 'prop_status', operator: 'eq' as const, value: 'opt_todo' },
            { not: { propertyId: 'prop_complete', operator: 'eq' as const, value: true } },
          ],
        },
      ],
    };
    const desired = createDatabaseViewFilterChangeDesiredState({
      database,
      source,
      viewId: 'view_scored',
      where,
    });
    expect(desired.views[0]?.where).toEqual(where);
    expect(desired.sampleRecords).toEqual([]);
    expect(desired.recordMutations).toEqual([]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(() =>
      createDatabaseViewFilterChangeDesiredState({
        database,
        source,
        viewId: 'view_scored',
        where: { propertyId: 'prop_score', operator: 'contains', value: '2' },
      }),
    ).toThrow('not valid for number');
  });

  test('sets and clears a source default view without changing the view itself', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid default view fixture');
    const desired = createDatabaseDefaultViewChangeDesiredState({
      database,
      source,
      viewId: 'view_scored',
    });
    expect(desired.sources[0]?.defaultViewId).toBe('view_scored');
    expect(desired.views[0]).toMatchObject({ id: 'view_scored', name: 'Scored tasks' });
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);

    const definitionWithDefault = {
      ...database,
      sources: [{ ...source, defaultViewId: 'view_scored' }],
    };
    const cleared = createDatabaseDefaultViewChangeDesiredState({
      database: definitionWithDefault,
      source: definitionWithDefault.sources[0] as typeof source,
    });
    expect(cleared.sources[0]?.defaultViewId).toBeUndefined();
    expect(() =>
      createDatabaseDefaultViewChangeDesiredState({
        database,
        source,
        viewId: 'view_missing',
      }),
    ).toThrow('must belong');
  });

  test('renames the visible source page while preserving stable identities', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid page title fixture');
    const desired = createDatabasePageTitleDesiredState({
      database,
      source,
      name: 'Roadmap',
    });
    expect(desired.database).toMatchObject({ id: database.id, key: database.key, name: 'Roadmap' });
    expect(desired.sources[0]).toMatchObject({
      id: source.id,
      key: source.key,
      name: 'Roadmap',
    });
    expect(desired.recordMutations).toEqual([]);
    expect(() => createDatabasePageTitleDesiredState({ database, source, name: '   ' })).toThrow(
      'page title is required',
    );
  });

  test('persists page icon and cover metadata without changing stable identities', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid page appearance fixture');
    const desired = createDatabasePageAppearanceDesiredState({
      database,
      source,
      icon: '🗂️',
      cover: 'assets/database-cover.png',
    });
    expect(desired.database).toMatchObject({
      id: database.id,
      key: database.key,
      icon: '🗂️',
      cover: 'assets/database-cover.png',
    });
    expect(desired.recordMutations).toEqual([]);
    const cleared = createDatabasePageAppearanceDesiredState({
      database: { ...database, icon: '🗂️', cover: 'assets/database-cover.png' },
      source,
      icon: null,
      cover: null,
    });
    expect(cleared.database.icon).toBeUndefined();
    expect(cleared.database.cover).toBeUndefined();
  });

  test('persists a complete saved-view revision without record mutations', () => {
    const source = database.sources[0];
    const current = database.views[0];
    if (!source || !current) throw new Error('invalid saved view fixture');
    const desired = createDatabaseViewConfigurationChangeDesiredState({
      database,
      source,
      view: {
        ...current,
        sort: [
          { propertyId: 'prop_status', direction: 'asc' },
          { propertyId: 'prop_score', direction: 'desc' },
        ],
        groups: [
          { propertyId: 'prop_status', direction: 'asc', hideEmpty: true },
          { propertyId: 'prop_complete', direction: 'desc', hideEmpty: false },
        ],
        projection: {
          propertyIds: ['prop_title', 'prop_status', 'prop_score'],
          body: 'full',
        },
        layout: {
          type: 'table',
          configuration: {
            wrap: true,
            rowHeight: 'compact',
            propertyWidths: { prop_title: 320, prop_status: 180 },
          },
        },
      },
    });
    expect(desired.views[0]).toMatchObject({
      sort: [
        { propertyId: 'prop_status', direction: 'asc' },
        { propertyId: 'prop_score', direction: 'desc' },
      ],
      groups: [
        { propertyId: 'prop_status', direction: 'asc', hideEmpty: true },
        { propertyId: 'prop_complete', direction: 'desc', hideEmpty: false },
      ],
      projection: {
        propertyIds: ['prop_title', 'prop_status', 'prop_score'],
        body: 'full',
      },
      layout: {
        type: 'table',
        configuration: {
          wrap: true,
          rowHeight: 'compact',
          propertyWidths: { prop_title: 320, prop_status: 180 },
        },
      },
    });
    expect(desired.recordMutations).toEqual([]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
  });

  test('compiles stable-ID saved-view lifecycle changes and protects the default', () => {
    const source = database.sources[0];
    const current = database.views[0];
    if (!source || !current) throw new Error('invalid saved view lifecycle fixture');
    const second = {
      ...current,
      id: 'view_recent',
      key: 'recent',
      name: 'Recent tasks',
      favorite: true,
    };
    const databaseWithViews = { ...database, views: [current, second] };
    const createdView = {
      ...current,
      id: 'view_all',
      key: 'all',
      name: 'All tasks',
      where: undefined,
    };
    const created = createDatabaseViewLifecycleChangeDesiredState({
      database: databaseWithViews,
      source,
      change: { kind: 'create', view: createdView },
    });
    expect(created.views.map((view) => view.id)).toEqual([
      'view_scored',
      'view_recent',
      'view_all',
    ]);

    const renamed = createDatabaseViewLifecycleChangeDesiredState({
      database: databaseWithViews,
      source,
      change: { kind: 'rename', viewId: current.id, name: 'Highest scores' },
    });
    expect(renamed.views[0]?.name).toBe('Highest scores');
    const favorited = createDatabaseViewLifecycleChangeDesiredState({
      database: databaseWithViews,
      source,
      change: { kind: 'favorite', viewId: current.id, favorite: true },
    });
    expect(favorited.views[0]?.favorite).toBe(true);
    const reordered = createDatabaseViewLifecycleChangeDesiredState({
      database: databaseWithViews,
      source,
      change: { kind: 'reorder', viewId: second.id, direction: -1 },
    });
    expect(reordered.views.map((view) => view.id)).toEqual(['view_recent', 'view_scored']);
    const dragged = createDatabaseViewLifecycleChangeDesiredState({
      database: { ...databaseWithViews, views: [current, second, createdView] },
      source,
      change: { kind: 'reorder-to', viewId: current.id, targetViewId: createdView.id },
    });
    expect(dragged.views.map((view) => view.id)).toEqual([
      'view_recent',
      'view_all',
      'view_scored',
    ]);
    const deleted = createDatabaseViewLifecycleChangeDesiredState({
      database: databaseWithViews,
      source,
      change: { kind: 'delete', viewId: second.id },
    });
    expect(deleted.views.map((view) => view.id)).toEqual(['view_scored']);
    expect(deleted.recordMutations).toEqual([]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(deleted).success).toBe(true);

    expect(() =>
      createDatabaseViewLifecycleChangeDesiredState({
        database: { ...databaseWithViews, sources: [{ ...source, defaultViewId: current.id }] },
        source: { ...source, defaultViewId: current.id },
        change: { kind: 'delete', viewId: current.id },
      }),
    ).toThrow('Clear or change');
  });

  test('compiles deduplicated multi-select sets as one exact bulk mutation per record', () => {
    const source = database.sources[0];
    const property = source?.properties.find((candidate) => candidate.id === 'prop_tags');
    if (!source || !property || property.type !== 'multi_select') {
      throw new Error('invalid multi-select fixture');
    }
    const value = parseDatabaseCellDraft(property, '["opt_red","opt_red","opt_blue"]');
    const desired = createDatabaseBulkCellMutationDesiredState({
      database,
      source,
      property,
      value,
      records: ['a', 'b'].map((suffix) => ({
        id: `rec_${suffix}`,
        path: `tasks/${suffix}.md`,
        revision: `sha256:${suffix.repeat(64)}`,
        values: { prop_title: suffix.toUpperCase() },
      })),
    });
    expect(desired.recordMutations).toHaveLength(2);
    expect(desired.recordMutations.map((mutation) => mutation.operations)).toEqual([
      [{ op: 'set', propertyKey: 'tags', value: ['opt_red', 'opt_blue'] }],
      [{ op: 'set', propertyKey: 'tags', value: ['opt_red', 'opt_blue'] }],
    ]);
    expect(desired.policy).toMatchObject({ maxRecordsPerCommit: 2 });
  });

  test('parses ordered Files values without losing captions and rejects unsafe or duplicate sources', () => {
    const property = DatabasePropertySchema.parse({
      id: 'prop_assets',
      key: 'assets',
      name: 'Assets',
      type: 'files',
      required: true,
    });
    const value = [
      { kind: 'local', path: 'assets/brief.pdf', caption: 'Approved' },
      { kind: 'external', url: 'https://cdn.example.com/demo.mp4', name: 'Demo' },
    ];
    expect(parseDatabaseCellDraft(property, JSON.stringify(value))).toEqual(value);
    const filesSource = {
      ...database.sources[0],
      properties: [...(database.sources[0]?.properties ?? []), property],
    };
    const filesDatabase = { ...database, sources: [filesSource] };
    const desired = createDatabaseBulkCellMutationDesiredState({
      database: filesDatabase,
      source: filesSource,
      property,
      value,
      records: [
        {
          id: 'rec_files',
          path: 'tasks/files.md',
          revision: `sha256:${'f'.repeat(64)}`,
          values: { prop_title: 'Files' },
        },
      ],
    });
    expect(desired.recordMutations?.[0]?.operations).toEqual([
      { op: 'set', propertyKey: 'assets', value },
    ]);
    expect(() =>
      parseDatabaseCellDraft(property, JSON.stringify([{ kind: 'local', path: '../escape.pdf' }])),
    ).toThrow(/unique safe local assets/);
    expect(() =>
      parseDatabaseCellDraft(
        property,
        JSON.stringify([
          { kind: 'local', path: 'assets/a.pdf' },
          { kind: 'local', path: 'assets/a.pdf' },
        ]),
      ),
    ).toThrow(/unique safe local assets/);
    expect(() => parseDatabaseCellDraft(property, '[]')).toThrow(/requires/);
  });

  test('parses one/many Relation values and compiles stable record-ID edits', () => {
    const one = DatabasePropertySchema.parse({
      id: 'prop_project',
      key: 'project',
      name: 'Project',
      type: 'relation',
      targetSourceId: 'ds_tasks',
      cardinality: 'one',
    });
    const many = DatabasePropertySchema.parse({
      id: 'prop_dependencies',
      key: 'dependencies',
      name: 'Dependencies',
      type: 'relation',
      targetSourceId: 'ds_tasks',
      cardinality: 'many',
      required: true,
    });
    expect(parseDatabaseCellDraft(one, 'rec_project')).toBe('rec_project');
    expect(() => parseDatabaseCellDraft(one, 'project')).toThrow('stable record ID');
    expect(parseDatabaseCellDraft(many, '["rec_a","rec_b"]')).toEqual(['rec_a', 'rec_b']);
    expect(() => parseDatabaseCellDraft(many, '["rec_a","rec_a"]')).toThrow('unique');
    expect(() => parseDatabaseCellDraft(many, '[]')).toThrow('cardinality');

    const relationSource = {
      ...database.sources[0],
      properties: [...(database.sources[0]?.properties ?? []), one, many],
    };
    const relationDatabase = { ...database, sources: [relationSource] };
    const desired = createDatabaseCellMutationDesiredState({
      database: relationDatabase,
      source: relationSource,
      property: many,
      record: {
        id: 'rec_relation',
        path: 'tasks/relation.md',
        revision: `sha256:${'c'.repeat(64)}`,
        values: { prop_title: 'Relation' },
      },
      value: ['rec_a', 'rec_b'],
    });
    expect(desired.recordMutations[0]?.operations).toEqual([
      { op: 'set', propertyKey: 'dependencies', value: ['rec_a', 'rec_b'] },
    ]);
  });

  test('refuses direct edits to derived Formula properties', () => {
    const formula = DatabasePropertySchema.parse({
      id: 'prop_score_double',
      key: 'score_double',
      name: 'Double score',
      type: 'formula',
      source: 'prop("score") * 2',
      ast: {
        language: 'synapse-formula-1',
        version: 1,
        resultType: 'number',
        expression: { type: 'property', propertyId: 'prop_score' },
      },
    });
    expect(() => parseDatabaseCellDraft(formula, '10')).toThrow('derived read-only');
  });

  test('compiles a Formula schema edit without writing a derived record value', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid Formula schema fixture');
    const formula = DatabasePropertySchema.parse({
      id: 'prop_score_double',
      key: 'score_double',
      name: 'Double score',
      type: 'formula',
      source: 'prop("score") * 3',
      ast: {
        language: 'synapse-formula-1',
        version: 1,
        resultType: 'number',
        expression: {
          type: 'binary',
          operator: 'multiply',
          left: { type: 'property', propertyId: 'prop_score' },
          right: { type: 'literal', valueType: 'number', value: 3 },
        },
      },
    });
    const databaseWithFormula: DatabaseDefinition = {
      ...database,
      sources: [{ ...source, properties: [...source.properties, formula] }],
    };
    const desired = createDatabaseComputedPropertyChangeDesiredState({
      database: databaseWithFormula,
      source: databaseWithFormula.sources[0] as (typeof databaseWithFormula.sources)[number],
      property: formula,
    });

    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.sources[0]?.properties.at(-1)).toMatchObject({
      id: formula.id,
      source: 'prop("score") * 3',
      ast: { resultType: 'number' },
    });
    expect(desired.sampleRecords).toEqual([]);
    expect(desired.recordMutations).toEqual([]);
  });

  test('compiles a Unique ID prefix edit without changing numbers or the watermark', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid Unique ID schema fixture');
    const uniqueId = DatabasePropertySchema.parse({
      id: 'prop_ticket',
      key: 'ticket',
      name: 'Ticket',
      type: 'unique_id',
      prefix: 'TASK',
      nextNumber: 42,
    });
    const databaseWithUniqueId: DatabaseDefinition = {
      ...database,
      sources: [{ ...source, properties: [...source.properties, uniqueId] }],
    };
    const desired = createDatabaseUniqueIdPrefixChangeDesiredState({
      database: databaseWithUniqueId,
      source: databaseWithUniqueId.sources[0] as (typeof databaseWithUniqueId.sources)[number],
      property: uniqueId,
      prefix: 'ISSUE',
    });

    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.sources[0]?.properties.at(-1)).toMatchObject({
      type: 'unique_id',
      prefix: 'ISSUE',
      nextNumber: 42,
    });
    expect(desired.sampleRecords).toEqual([]);
    expect(() =>
      createDatabaseUniqueIdPrefixChangeDesiredState({
        database: databaseWithUniqueId,
        source: databaseWithUniqueId.sources[0] as (typeof databaseWithUniqueId.sources)[number],
        property: uniqueId,
        prefix: 'bad prefix',
      }),
    ).toThrow('letters, numbers');
  });

  test('compiles fail-closed Place privacy policy changes without rewriting records', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid Place schema fixture');
    const place = DatabasePropertySchema.parse({
      id: 'prop_place',
      key: 'place',
      name: 'Place',
      type: 'place',
    });
    const databaseWithPlace: DatabaseDefinition = {
      ...database,
      sources: [{ ...source, properties: [...source.properties, place] }],
    };
    const desired = createDatabasePlacePrivacyChangeDesiredState({
      database: databaseWithPlace,
      source: databaseWithPlace.sources[0] as (typeof databaseWithPlace.sources)[number],
      property: place,
      externalSearch: 'explicit',
      externalMap: 'disabled',
    });

    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.sources[0]?.properties.at(-1)).toMatchObject({
      type: 'place',
      externalSearch: 'explicit',
      externalMap: 'disabled',
    });
    expect(desired.sampleRecords).toEqual([]);
    expect(desired.recordMutations).toEqual([]);
  });

  test('parses Place drafts canonically and removes exact coordinates at approximate precision', () => {
    const place = DatabasePropertySchema.parse({
      id: 'prop_place',
      key: 'place',
      name: 'Place',
      type: 'place',
    });
    expect(
      parseDatabaseCellDraft(
        place,
        JSON.stringify({
          label: 'City Hall',
          address: 'Seoul',
          lat: 37.5666805,
          lon: 126.9784147,
          precision: 'approximate',
          source: 'manual',
        }),
      ),
    ).toEqual({
      label: 'City Hall',
      address: 'Seoul',
      lat: 37.57,
      lon: 126.98,
      precision: 'approximate',
      source: 'manual',
    });
    expect(() =>
      parseDatabaseCellDraft(
        place,
        JSON.stringify({
          label: 'Invalid',
          address: '',
          lat: null,
          lon: 126.9,
          precision: 'exact',
          source: 'manual',
        }),
      ),
    ).toThrow('valid coordinates');
  });

  test('compiles a revision-bound bulk Checkbox toggle from each canonical value', () => {
    const source = database.sources[0];
    const property = source?.properties.find((candidate) => candidate.id === 'prop_complete');
    if (!source || !property || property.type !== 'checkbox') {
      throw new Error('invalid Checkbox fixture');
    }
    const desired = createDatabaseBulkCheckboxToggleDesiredState({
      database,
      source,
      property,
      records: [
        {
          id: 'rec_checked',
          path: 'tasks/checked.md',
          revision: `sha256:${'c'.repeat(64)}`,
          values: { prop_title: 'Checked', prop_complete: true },
        },
        {
          id: 'rec_unchecked',
          path: 'tasks/unchecked.md',
          revision: `sha256:${'d'.repeat(64)}`,
          values: { prop_title: 'Unchecked', prop_complete: false },
        },
        {
          id: 'rec_empty',
          path: 'tasks/empty.md',
          revision: `sha256:${'e'.repeat(64)}`,
          values: { prop_title: 'Empty' },
        },
      ],
    });
    expect(desired.recordMutations.map((mutation) => mutation.operations)).toEqual([
      [{ op: 'set', propertyKey: 'complete', value: false }],
      [{ op: 'set', propertyKey: 'complete', value: true }],
      [{ op: 'set', propertyKey: 'complete', value: true }],
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
  });

  test('rejects missing revisions and invalid numeric or required values', () => {
    const source = database.sources[0];
    const title = source?.properties[0];
    const score = source?.properties[1];
    const tags = source?.properties[2];
    if (!source || !title || !score || !tags) throw new Error('invalid fixture');
    expect(() => parseDatabaseCellDraft(score, 'not-a-number')).toThrow(/finite number/);
    expect(() => parseDatabaseCellDraft(title, '')).toThrow(/cannot be empty/);
    expect(
      parseDatabaseCellDraft(
        { id: 'prop_url', key: 'url', name: 'URL', type: 'url' },
        'https://example.com',
      ),
    ).toBe('https://example.com');
    expect(() =>
      parseDatabaseCellDraft(
        { id: 'prop_url', key: 'url', name: 'URL', type: 'url' },
        'javascript:alert(1)',
      ),
    ).toThrow(/HTTP or HTTPS/);
    expect(() =>
      parseDatabaseCellDraft(
        { id: 'prop_email', key: 'email', name: 'Email', type: 'email' },
        'not an email',
      ),
    ).toThrow(/valid email/);
    expect(() =>
      parseDatabaseCellDraft(
        { id: 'prop_phone', key: 'phone', name: 'Phone', type: 'phone' },
        'call me',
      ),
    ).toThrow(/dialable phone/);
    const constrainedNumber = DatabasePropertySchema.parse({
      id: 'prop_bounded',
      key: 'bounded',
      name: 'Bounded',
      type: 'number',
      semantics: {
        constraints: { unique: false, min: 0, max: 10 },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
      },
    });
    expect(() => parseDatabaseCellDraft(constrainedNumber, '11')).toThrow(/at most 10/);
    expect(
      parseDatabaseCellDraft(
        { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
        'true',
      ),
    ).toBe(true);
    expect(() =>
      parseDatabaseCellDraft(
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [{ id: 'opt_open', key: 'open', name: 'Open' }],
        },
        'opt_unknown',
      ),
    ).toThrow(/valid option/);
    expect(() =>
      parseDatabaseCellDraft(
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [{ id: 'opt_archived', key: 'archived', name: 'Archived', archived: true }],
        },
        'opt_archived',
      ),
    ).toThrow(/valid option/);
    expect(() =>
      createDatabaseCellMutationDesiredState({
        database,
        source,
        property: title,
        record: { id: 'rec_first', path: 'tasks/first.md', revision: null, values: {} },
        value: 'Changed',
      }),
    ).toThrow(/exact record revision/);
    expect(parseDatabaseCellDraft(tags, '["opt_red","opt_red"]')).toEqual(['opt_red']);
    expect(() => parseDatabaseCellDraft(tags, '["opt_unknown"]')).toThrow(/valid option list/);
  });

  test('compiles a new record as reviewed non-canonical desired state', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid fixture');
    const desired = createDatabaseRecordDesiredState({
      database,
      source,
      title: '  New task  ',
    });
    expect(desired.sampleRecords).toEqual([
      {
        sourceKey: 'tasks',
        values: { title: 'New task', status: 'opt_todo' },
        body: '## Checklist\n',
      },
    ]);
    expect(desired.recordMutations).toEqual([]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(() => createDatabaseRecordDesiredState({ database, source, title: '  ' })).toThrow(
      /cannot be empty/,
    );
  });

  test('compiles an exact revision-bound record deletion', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid fixture');
    const desired = createDatabaseRecordDeletionDesiredState({
      database,
      source,
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'First' },
      },
    });
    expect(desired.sampleRecords).toEqual([]);
    expect(desired.recordMutations).toEqual([]);
    expect(desired.recordDeletions).toEqual([
      {
        id: 'rec_first',
        expectedRevision: `sha256:${'a'.repeat(64)}`,
        sourceKey: 'tasks',
      },
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(() =>
      createDatabaseRecordDeletionDesiredState({
        database,
        source,
        record: { id: 'rec_first', path: 'tasks/first.md', revision: null, values: {} },
      }),
    ).toThrow(/exact record revision/);
  });

  test('compiles a duplicate as an exact source-bound server copy', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid fixture');
    const desired = createDatabaseRecordCopyDesiredState({
      database,
      source,
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'First' },
      },
    });
    expect(desired.recordCopies).toEqual([
      {
        id: 'rec_first',
        expectedRevision: `sha256:${'a'.repeat(64)}`,
        sourceKey: 'tasks',
        title: 'First copy',
      },
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
  });

  test('compiles archive and restore as exact canonical state transitions', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid fixture');
    const record = {
      id: 'rec_first',
      path: 'tasks/first.md',
      revision: `sha256:${'a'.repeat(64)}`,
      values: { prop_title: 'First' },
    };
    const archived = createDatabaseRecordArchiveDesiredState({
      database,
      source,
      record,
      action: 'archive',
    });
    expect(archived.recordArchives).toEqual([
      {
        id: 'rec_first',
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        action: 'archive',
      },
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(archived).success).toBe(true);
    expect(() =>
      createDatabaseRecordArchiveDesiredState({ database, source, record, action: 'restore' }),
    ).toThrow(/Only an archived/);
    expect(
      createDatabaseRecordArchiveDesiredState({
        database,
        source,
        record: { ...record, archivedAt: '2026-07-20T01:02:03.000Z' },
        action: 'restore',
      }).recordArchives,
    ).toEqual([expect.objectContaining({ action: 'restore' })]);
  });

  test('compiles a source move without copying projected values in the browser', () => {
    const source = database.sources[0];
    if (!source) throw new Error('invalid fixture');
    const targetSource = {
      ...structuredClone(source),
      id: 'ds_archive',
      key: 'archive',
      folder: 'archive',
      properties: source.properties.map((property) => ({
        ...structuredClone(property),
        id: `${property.id}_archive`,
        ...('options' in property
          ? {
              options: property.options.map((option) => ({
                ...option,
                id: `${option.id}_archive`,
              })),
            }
          : {}),
      })) as DatabaseDefinition['sources'][number]['properties'],
    };
    const databaseWithTarget: DatabaseDefinition = {
      ...database,
      sources: [source, targetSource],
      sourceMappings: [
        {
          sourceId: source.id,
          targetSourceId: targetSource.id,
          propertyMappings: source.properties.map((property) => ({
            sourcePropertyId: property.id,
            targetPropertyId: `${property.id}_archive`,
            optionMappings:
              'options' in property
                ? property.options.map((option) => ({
                    sourceOptionId: option.id,
                    targetOptionId: `${option.id}_archive`,
                  }))
                : [],
          })),
        },
      ],
    };
    const desired = createDatabaseRecordMoveDesiredState({
      database: databaseWithTarget,
      source,
      targetSource,
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'First' },
      },
    });
    expect(desired.recordMoves).toEqual([
      {
        id: 'rec_first',
        expectedRevision: `sha256:${'a'.repeat(64)}`,
        sourceKey: 'tasks',
        targetSourceKey: 'archive',
      },
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.sourceMappings?.[0]).toMatchObject({
      sourceKey: 'tasks',
      targetSourceKey: 'archive',
    });
    expect(desired.sourceMappings?.[0]?.propertyMappings[0]).toMatchObject({
      sourcePropertyKey: 'title',
      targetPropertyKey: 'title',
    });
    expect(() =>
      createDatabaseRecordMoveDesiredState({
        database: { ...databaseWithTarget, sourceMappings: [] },
        source,
        targetSource,
        record: {
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First' },
        },
      }),
    ).toThrow(/compatibility mapping/);
  });

  test('compiles a bounded multi-record property edit with exact revisions', () => {
    const source = database.sources[0];
    const property = source?.properties[2];
    if (!source || !property) throw new Error('invalid fixture');
    const desired = createDatabaseBulkCellMutationDesiredState({
      database,
      source,
      property,
      records: [
        {
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: {},
        },
        {
          id: 'rec_second',
          path: 'tasks/second.md',
          revision: `sha256:${'b'.repeat(64)}`,
          values: {},
        },
      ],
      value: ['opt_red', 'opt_blue'],
    });
    expect(desired.policy.maxRecordsPerCommit).toBe(2);
    expect(desired.recordMutations).toEqual([
      expect.objectContaining({
        id: 'rec_first',
        expectedRevision: `sha256:${'a'.repeat(64)}`,
        operations: [{ op: 'set', propertyKey: 'tags', value: ['opt_red', 'opt_blue'] }],
      }),
      expect.objectContaining({ id: 'rec_second', expectedRevision: `sha256:${'b'.repeat(64)}` }),
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(() =>
      createDatabaseBulkCellMutationDesiredState({
        database,
        source,
        property,
        records: [],
        value: [],
      }),
    ).toThrow(/Select at least one/);
  });

  test('compiles a rectangular table paste into one exact mutation per record', () => {
    const source = database.sources[0];
    const score = source?.properties[1];
    const tags = source?.properties[2];
    if (!source || !score || !tags) throw new Error('invalid fixture');
    const first = {
      id: 'rec_first',
      path: 'tasks/first.md',
      revision: `sha256:${'a'.repeat(64)}`,
      values: {},
    };
    const second = {
      id: 'rec_second',
      path: 'tasks/second.md',
      revision: `sha256:${'b'.repeat(64)}`,
      values: {},
    };
    const desired = createDatabaseTablePasteDesiredState({
      database,
      source,
      changes: [
        { record: first, property: score, value: 10 },
        { record: first, property: tags, value: ['opt_red'] },
        { record: second, property: score, value: 20 },
        { record: second, property: tags, value: ['opt_blue'] },
      ],
    });
    expect(desired.policy.maxRecordsPerCommit).toBe(2);
    expect(desired.recordMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: first.revision,
        sourceKey: 'tasks',
        preconditions: [
          { propertyKey: 'score', present: false },
          { propertyKey: 'tags', present: false },
        ],
        operations: [
          { op: 'set', propertyKey: 'score', value: 10 },
          { op: 'set', propertyKey: 'tags', value: ['opt_red'] },
        ],
      },
      {
        id: 'rec_second',
        expectedRevision: second.revision,
        sourceKey: 'tasks',
        preconditions: [
          { propertyKey: 'score', present: false },
          { propertyKey: 'tags', present: false },
        ],
        operations: [
          { op: 'set', propertyKey: 'score', value: 20 },
          { op: 'set', propertyKey: 'tags', value: ['opt_blue'] },
        ],
      },
    ]);
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
  });

  test('compiles Select rename and merge as stable schema plus exact record migrations', () => {
    const source = database.sources[0];
    const property = source?.properties.find((candidate) => candidate.id === 'prop_status');
    if (!source || !property || property.type !== 'select')
      throw new Error('invalid Select fixture');
    const records = [
      {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'First', prop_status: 'opt_todo' },
      },
      {
        id: 'rec_second',
        path: 'tasks/second.md',
        revision: `sha256:${'b'.repeat(64)}`,
        values: { prop_title: 'Second', prop_status: 'opt_done' },
      },
    ];
    const renamed = createDatabaseSelectOptionChangeDesiredState({
      database,
      source,
      property,
      records: [],
      recordsComplete: false,
      change: { kind: 'rename', optionId: 'opt_todo', name: 'Backlog' },
    });
    const renamedProperty = renamed.desiredState.sources[0]?.properties.find(
      (candidate) => candidate.id === property.id,
    );
    expect(renamedProperty).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({ id: 'opt_todo', key: 'todo', name: 'Backlog' }),
      ]),
    });
    expect(renamed.desiredState.recordMutations).toEqual([]);

    const merged = createDatabaseSelectOptionChangeDesiredState({
      database,
      source,
      property,
      records,
      recordsComplete: true,
      change: { kind: 'merge', sourceOptionId: 'opt_todo', targetOptionId: 'opt_done' },
    });
    expect(merged.desiredState.recordMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: `sha256:${'a'.repeat(64)}`,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'opt_done' }],
      },
    ]);
    const mergedProperty = merged.desiredState.sources[0]?.properties.find(
      (candidate) => candidate.id === property.id,
    );
    expect(mergedProperty).toMatchObject({
      options: [expect.objectContaining({ id: 'opt_done' })],
    });
    const largeMerge = createDatabaseSelectOptionChangeDesiredState({
      database,
      source,
      property,
      records: Array.from({ length: 101 }, (_, index) => ({
        id: `rec_bulk_${index}`,
        path: `tasks/bulk-${index}.md`,
        revision: `sha256:${(index % 16).toString(16).repeat(64)}`,
        values: { prop_title: `Bulk ${index}`, prop_status: 'opt_todo' },
      })),
      recordsComplete: true,
      change: { kind: 'merge', sourceOptionId: 'opt_todo', targetOptionId: 'opt_done' },
    });
    expect(largeMerge.desiredState.recordMutations).toHaveLength(101);
    expect(DatabaseDesiredStateDraftSchema.safeParse(largeMerge.desiredState).success).toBe(true);
    expect(() =>
      createDatabaseSelectOptionChangeDesiredState({
        database,
        source,
        property,
        records,
        recordsComplete: false,
        change: { kind: 'delete', optionId: 'opt_todo' },
      }),
    ).toThrow('complete source snapshot');
  });
});
