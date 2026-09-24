import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  createDatabaseContextPack,
  type DatabaseContextPackDependencies,
  DatabaseContextPackError,
  decodeColumnarDatabaseRecords,
} from './database-context-pack.ts';

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track work',
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
        { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
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
      ],
    },
  ],
});

const relationalDatabase = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_work',
  key: 'work',
  name: 'Work',
  contract: {
    purpose: 'Connect tasks, projects, and people',
    canonicality: 'canonical',
    vocabulary: ['task', 'project', 'person'],
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
        { id: 'prop_task_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_task_projects',
          key: 'projects',
          name: 'Projects',
          type: 'relation',
          targetSourceId: 'ds_projects',
          cardinality: 'many',
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
        { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_project_owner',
          key: 'owner',
          name: 'Owner',
          type: 'relation',
          targetSourceId: 'ds_people',
          cardinality: 'one',
        },
        {
          id: 'prop_project_tasks',
          key: 'tasks',
          name: 'Tasks',
          type: 'relation',
          targetSourceId: 'ds_tasks',
          cardinality: 'many',
        },
      ],
    },
    {
      id: 'ds_people',
      key: 'people',
      name: 'People',
      recordMeaning: 'One person',
      folder: 'people',
      properties: [
        { id: 'prop_person_title', key: 'title', name: 'Name', type: 'title' },
        { id: 'prop_person_email', key: 'email', name: 'Email', type: 'email' },
        {
          id: 'prop_person_manager',
          key: 'manager',
          name: 'Manager',
          type: 'relation',
          targetSourceId: 'ds_people',
          cardinality: 'one',
        },
      ],
    },
  ],
});

function relationDependencies(): DatabaseContextPackDependencies {
  const records = [
    {
      id: 'rec_task_1',
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      path: 'tasks/one.md',
      revision: 'sha256:task1',
      values: {
        prop_task_title: 'First task',
        prop_task_projects: ['rec_project_1', 'rec_project_2', 'rec_project_2', 'rec_missing'],
      },
      body: 'First task body',
    },
    {
      id: 'rec_task_2',
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      path: 'tasks/two.md',
      revision: 'sha256:task2',
      values: {
        prop_task_title: 'Second task',
        prop_task_projects: ['rec_project_1'],
      },
      body: 'Second task body',
    },
    {
      id: 'rec_project_1',
      databaseId: 'db_work',
      sourceId: 'ds_projects',
      path: 'projects/one.md',
      revision: 'sha256:project1',
      values: {
        prop_project_title: 'Project one',
        prop_project_owner: 'rec_person_1',
        prop_project_tasks: ['rec_task_1'],
      },
      body: 'Project one body',
    },
    {
      id: 'rec_project_2',
      databaseId: 'db_work',
      sourceId: 'ds_projects',
      path: 'projects/two.md',
      revision: 'sha256:project2',
      values: {
        prop_project_title: 'Project two',
        prop_project_owner: 'rec_person_1',
        prop_project_tasks: [],
      },
      body: 'Project two body',
    },
    {
      id: 'rec_person_1',
      databaseId: 'db_work',
      sourceId: 'ds_people',
      path: 'people/one.md',
      revision: 'sha256:person1',
      values: {
        prop_person_title: 'Ada',
        prop_person_email: 'ada@example.com',
        prop_person_manager: 'rec_person_1',
      },
      body: 'Ada body',
    },
  ] as const;
  const roots = records.filter((record) => record.sourceId === 'ds_tasks');
  return {
    describe: () => ({
      manifestRevision: 'sha256:manifest',
      schemaRevision: 'sha256:schema',
      database: relationalDatabase,
      source: relationalDatabase.sources[0] ?? null,
    }),
    query: () => ({
      sourceId: 'ds_tasks',
      indexRevision: 'sha256:index',
      snapshotRevision: 'sha256:index',
      matched: roots.length,
      returned: roots.length,
      isComplete: true,
      nextCursor: null,
      truncatedBy: null,
      indexFreshness: 'snapshot',
      relationRecords: [
        { id: 'rec_project_1', sourceId: 'ds_projects', title: 'Project one' },
        { id: 'rec_project_2', sourceId: 'ds_projects', title: 'Project two' },
        { id: 'rec_unreferenced', sourceId: 'ds_projects', title: 'Unreferenced' },
      ],
      records: roots.map((record) => ({
        id: record.id,
        path: record.path,
        revision: record.revision,
        values: { ...record.values },
      })),
    }),
    searchText: () => ({
      query: '',
      terms: [],
      offsetEncoding: 'utf16_code_units',
      matched: 0,
      returned: 0,
      isComplete: true,
      hits: [],
      trace: {
        strategy: 'lexical_and',
        scope: {
          databaseId: 'db_work',
          sourceId: 'ds_tasks',
          propertyIds: [],
          includeBody: true,
        },
        termStats: [],
        ranking: {
          titleWeight: 40,
          propertyWeight: 20,
          bodyWeight: 10,
          tieBreakers: ['path', 'record_id'],
        },
        noMatchReason: 'no_terms',
      },
    }),
    getRecord: (recordId) =>
      ({
        record:
          (records.find((record) => record.id === recordId) as
            | (typeof records)[number]
            | undefined) ?? null,
        deniedRecord: false,
        deniedPropertyIds: [],
      }) as ReturnType<DatabaseContextPackDependencies['getRecord']>,
  };
}

function dependencies(recordCount = 8, bodyPadding = 0): DatabaseContextPackDependencies {
  const records = Array.from({ length: recordCount }, (_, index) => ({
    id: `rec_${index}`,
    path: `tasks/${index}.md`,
    revision: `sha256:${index}`,
    values: {
      prop_title: `Task ${index} with enough text to exercise the explicit token budget`,
      prop_status: index % 2 === 0 ? 'opt_todo' : 'opt_done',
      prop_notes: `Owner [@Alice](synapsenote://person/person_alice) for task ${index}`,
    },
    textProjections: {
      prop_notes: {
        plainText: `Owner @Alice for task ${index}`,
        references: [
          {
            kind: 'person' as const,
            target: 'person_alice',
            label: '@Alice',
            start: 6,
            end: 65,
          },
        ],
      },
    },
  }));
  return {
    describe: () => ({
      manifestRevision: 'sha256:manifest',
      schemaRevision: 'sha256:schema',
      database,
      source: database.sources[0] ?? null,
    }),
    query: () => ({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      indexRevision: 'sha256:index',
      snapshotRevision: 'sha256:index',
      matched: recordCount,
      returned: recordCount,
      isComplete: true,
      nextCursor: null,
      truncatedBy: null,
      indexFreshness: 'snapshot',
      records,
    }),
    searchText: (input) => ({
      query: input.text,
      terms: ['task'],
      offsetEncoding: 'utf16_code_units',
      matched: records.length,
      returned: records.length,
      isComplete: true,
      trace: {
        strategy: 'lexical_and',
        scope: {
          databaseId: input.databaseId,
          sourceId: input.sourceId,
          propertyIds: input.propertyIds,
          includeBody: input.includeBody !== false,
        },
        termStats: [
          { term: 'task', indexedRecords: records.length, scopedRecords: records.length },
        ],
        ranking: {
          titleWeight: 40,
          propertyWeight: 20,
          bodyWeight: 10,
          tieBreakers: ['path', 'record_id'],
        },
        noMatchReason: records.length > 0 ? null : 'term_absent_in_scope',
      },
      hits: records.map((record, index) => ({
        recordId: record.id,
        path: record.path,
        revision: record.revision,
        score: 40,
        scoreBreakdown: { title: 40, property: 0, body: 0 },
        matchedBy: ['title'],
        evidence: [
          {
            id: `ev_${String(index).padStart(24, '0')}`,
            recordId: record.id,
            path: record.path,
            field: 'property',
            propertyId: 'prop_title',
            start: 0,
            end: 4,
            offsetEncoding: 'utf16_code_units',
            snippet: String(record.values.prop_title),
            snippetStart: 0,
            snippetEnd: String(record.values.prop_title).length,
            matchedTerms: ['task'],
          },
        ],
      })),
    }),
    getRecord: (recordId) => {
      const record = records.find((candidate) => candidate.id === recordId);
      return {
        record: record
          ? {
              ...record,
              databaseId: 'db_tasks',
              sourceId: 'ds_tasks',
              body: `Full Markdown body for ${record.id}.${'x'.repeat(bodyPadding)}`,
            }
          : null,
        deniedRecord: false,
        deniedPropertyIds: [],
      };
    },
  };
}

const baseInput = {
  databaseId: 'db_tasks',
  sourceId: 'ds_tasks',
  goal: 'Find the highest priority tasks',
  propertyIds: ['prop_title', 'prop_status'],
  maxTokens: 10_000,
  reserveTokens: 100,
  tokenizer: 'utf8_bytes_div3' as const,
  encoding: 'object_rows' as const,
};

describe('database context packs', () => {
  test('cooperatively cancels token packing without returning a partial pack', () => {
    let checkpoints = 0;
    expect(() =>
      createDatabaseContextPack(dependencies(64), {
        ...baseInput,
        maxTokens: 1_000_000,
        throwIfCancelled: () => {
          checkpoints += 1;
          if (checkpoints === 3) throw new DOMException('cancelled', 'AbortError');
        },
      }),
    ).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(checkpoints).toBe(3);
  });

  test('packs only referenced permission-safe Person identity cards', () => {
    const taskSource = database.sources[0];
    if (!taskSource) throw new Error('expected task source');
    const personDatabase = DatabaseDefinitionSchema.parse({
      ...database,
      people: [
        {
          id: 'person_owner',
          key: 'owner',
          name: 'Owner',
          kind: 'local',
          subjectId: 'principal-owner',
        },
        {
          id: 'person_unused',
          key: 'unused',
          name: 'Unused',
          kind: 'agent',
          subjectId: 'agent:unused',
        },
      ],
      sources: [
        {
          ...taskSource,
          properties: [
            ...taskSource.properties,
            {
              id: 'prop_owner',
              key: 'owner',
              name: 'Owner',
              type: 'person',
              multiple: false,
            },
          ],
        },
      ],
    });
    const base = dependencies(1);
    const deps: DatabaseContextPackDependencies = {
      ...base,
      describe: () => ({
        manifestRevision: 'sha256:manifest',
        schemaRevision: 'sha256:schema',
        database: personDatabase,
        source: personDatabase.sources[0] ?? null,
      }),
      query: (input) => {
        const result = base.query(input);
        return {
          ...result,
          records: result.records.map((record) => ({
            ...record,
            values: { ...record.values, prop_owner: ['person_owner'] },
          })),
          people: [
            {
              id: 'person_owner',
              key: 'owner',
              name: 'Owner',
              kind: 'local',
              active: true,
            },
          ],
        };
      },
    };
    const pack = createDatabaseContextPack(deps, {
      ...baseInput,
      propertyIds: ['prop_title', 'prop_owner'],
    });
    expect(pack.schema.people).toEqual([
      {
        id: 'person_owner',
        key: 'owner',
        name: 'Owner',
        kind: 'local',
        active: true,
      },
    ]);
    expect(pack.schema.properties.find((property) => property.id === 'prop_owner')).toMatchObject({
      type: 'person',
      multiple: false,
    });
    expect(JSON.stringify(pack.schema.people)).not.toContain('subjectId');
    expect(JSON.stringify(pack.schema.people)).not.toContain('person_unused');
  });

  test('packs schema once, omits null fields, and reports the explicit budget', () => {
    const pack = createDatabaseContextPack(dependencies(2), baseInput);
    expect(pack).toMatchObject({
      database: { id: 'db_tasks', purpose: 'Track work' },
      schema: { sourceId: 'ds_tasks' },
      returned: 2,
      isComplete: true,
      nextCursor: null,
      budget: {
        tokenizer: 'utf8_bytes_div3',
        maxTokens: 10_000,
        reserveTokens: 100,
        availableTokens: 9_900,
      },
    });
    expect(pack.retrieval).toMatchObject({
      query: { filter: null, sort: [], includeArchived: false },
      filters: { propertyIds: [] },
      ranking: {
        strategy: 'typed_sort_then_created_at_then_record_id',
        sort: [],
        tieBreakers: ['created_at', 'record_id'],
      },
      projection: {
        requestedPropertyIds: ['prop_title', 'prop_status'],
        returnedPropertyIds: ['prop_title', 'prop_status'],
        omittedPropertyIds: [],
      },
      result: {
        matched: 2,
        returned: 2,
        omittedRecords: 0,
        complete: true,
        continuationAvailable: false,
      },
      permission: null,
      evidence: { mode: 'records', searchText: null, matched: 0, returned: 0 },
    });
    expect(pack.budget.estimatedTokens).toBeLessThanOrEqual(pack.budget.availableTokens);
    expect(JSON.stringify(pack.records)).not.toContain('null');
  });

  test('stops at the budget, returns a bound cursor, and continues without overlap', () => {
    const first = createDatabaseContextPack(dependencies(), { ...baseInput, maxTokens: 700 });
    expect(first.returned).toBeGreaterThan(0);
    expect(first.returned).toBeLessThan(8);
    expect(first.isComplete).toBe(false);
    expect(first.omitted.reason).toBe('token_budget');
    if (!first.nextCursor) throw new Error('expected overflow cursor');

    const second = createDatabaseContextPack(dependencies(), {
      ...baseInput,
      maxTokens: 700,
      cursor: first.nextCursor,
    });
    const firstIds = (first.records as Array<{ id: string }>).map((record) => record.id);
    const secondIds = (second.records as Array<{ id: string }>).map((record) => record.id);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);

    expect(() =>
      createDatabaseContextPack(dependencies(), {
        ...baseInput,
        goal: 'A different request',
        maxTokens: 700,
        cursor: first.nextCursor ?? undefined,
      }),
    ).toThrow(DatabaseContextPackError);
  });

  test('columnar dictionaries round-trip to object-row semantics', () => {
    const objectPack = createDatabaseContextPack(dependencies(3), baseInput);
    const columnar = createDatabaseContextPack(dependencies(3), {
      ...baseInput,
      encoding: 'columnar_dictionary',
    });
    expect(decodeColumnarDatabaseRecords(columnar.records as never)).toEqual(objectPack.records);
    expect((columnar.records as { dictionaries: Record<string, string[]> }).dictionaries).toEqual({
      prop_status: ['opt_todo', 'opt_done'],
    });
  });

  test('packs Text as deterministic plain text with stable references in both encodings', () => {
    const input = { ...baseInput, propertyIds: ['prop_notes'] };
    const objectPack = createDatabaseContextPack(dependencies(1), input);
    expect(objectPack.records).toMatchObject([
      {
        values: { prop_notes: 'Owner @Alice for task 0' },
        textReferences: { prop_notes: [{ kind: 'person', target: 'person_alice' }] },
      },
    ]);
    const columnar = createDatabaseContextPack(dependencies(1), {
      ...input,
      encoding: 'columnar_dictionary',
    });
    expect(decodeColumnarDatabaseRecords(columnar.records as never)).toEqual(objectPack.records);
    expect(JSON.stringify(objectPack)).not.toContain('synapsenote://person');
  });

  test('progressively adds exact evidence and full bodies only when explicitly requested', () => {
    const compact = createDatabaseContextPack(dependencies(2), baseInput);
    expect(compact.disclosure).toEqual({ level: 'records' });
    expect(JSON.stringify(compact)).not.toContain('Full Markdown body');

    const evidence = createDatabaseContextPack(dependencies(2), {
      ...baseInput,
      disclosure: { level: 'evidence', searchText: 'task' },
    });
    expect(evidence.disclosure).toMatchObject({
      level: 'evidence',
      searchText: 'task',
      matched: 2,
      isComplete: true,
      evidence: [
        { id: 'ev_000000000000000000000000', recordId: 'rec_0', start: 0, end: 4 },
        { id: 'ev_000000000000000000000001', recordId: 'rec_1', start: 0, end: 4 },
      ],
    });
    expect(JSON.stringify(evidence)).not.toContain('Full Markdown body');

    const full = createDatabaseContextPack(dependencies(2), {
      ...baseInput,
      disclosure: { level: 'full_body' },
    });
    expect(full.disclosure).toMatchObject({
      level: 'full_body',
      fullBodies: [
        { recordId: 'rec_0', body: 'Full Markdown body for rec_0.' },
        { recordId: 'rec_1', body: 'Full Markdown body for rec_1.' },
      ],
    });
    expect(full.budget.estimatedTokens).toBeGreaterThan(compact.budget.estimatedTokens);
  });

  test('keeps explicit full-body expansion inside budget and reports continuation', () => {
    const full = createDatabaseContextPack(dependencies(3, 1_000), {
      ...baseInput,
      maxTokens: 1_100,
      disclosure: { level: 'full_body' },
    });
    expect(full.returned).toBeGreaterThan(0);
    expect(full.returned).toBeLessThan(3);
    expect(full.isComplete).toBe(false);
    expect(full.nextCursor).not.toBeNull();
    expect(full.omitted).toMatchObject({ reason: 'token_budget' });
    expect(full.omitted.fullBodies).toBeGreaterThan(0);
    expect(full.budget.estimatedTokens).toBeLessThanOrEqual(full.budget.availableTokens);

    expect(() =>
      createDatabaseContextPack(dependencies(1, 5_000), {
        ...baseInput,
        maxTokens: 700,
        disclosure: { level: 'full_body' },
      }),
    ).toThrow(DatabaseContextPackError);
    try {
      createDatabaseContextPack(dependencies(1, 5_000), {
        ...baseInput,
        maxTokens: 700,
        disclosure: { level: 'full_body' },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'budget_too_small',
        details: { nextRecordId: 'rec_0', minimumTokens: expect.any(Number) },
      });
    }
  });

  test('returns property recovery candidates and a minimum budget', () => {
    expect(() =>
      createDatabaseContextPack(dependencies(), {
        ...baseInput,
        propertyIds: ['prop_missing'],
      }),
    ).toThrow(DatabaseContextPackError);
    expect(() =>
      createDatabaseContextPack(dependencies(), {
        ...baseInput,
        propertyIds: ['prop_title', 'prop_title'],
      }),
    ).toThrow(DatabaseContextPackError);
    try {
      createDatabaseContextPack(dependencies(), {
        ...baseInput,
        maxTokens: 128,
        reserveTokens: 127,
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'budget_too_small',
        details: { availableTokens: 1 },
      });
    }
    expect(() =>
      createDatabaseContextPack(dependencies(), {
        ...baseInput,
        maxTokens: 100,
        reserveTokens: 100,
      }),
    ).toThrow(DatabaseContextPackError);
  });

  test('expands relations by depth with projections, deduplication, and cycle diagnostics', () => {
    const pack = createDatabaseContextPack(relationDependencies(), {
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      goal: 'Understand task ownership',
      propertyIds: ['prop_task_title', 'prop_task_projects'],
      maxTokens: 20_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      relationExpansion: {
        maxDepth: 2,
        maxRecords: 10,
        maxRecordsPerRelation: 3,
        projections: [
          { sourceId: 'ds_projects', propertyIds: ['prop_project_title'] },
          {
            sourceId: 'ds_people',
            propertyIds: ['prop_person_title', 'prop_person_email'],
          },
        ],
      },
    });
    expect(pack.relationExpansion).toMatchObject({
      requested: { maxDepth: 2, maxRecords: 10, maxRecordsPerRelation: 3 },
      complete: false,
      records: [
        {
          sourceId: 'ds_projects',
          id: 'rec_project_1',
          values: { prop_project_title: 'Project one' },
        },
        {
          sourceId: 'ds_projects',
          id: 'rec_project_2',
          values: { prop_project_title: 'Project two' },
        },
        {
          sourceId: 'ds_people',
          id: 'rec_person_1',
          values: { prop_person_title: 'Ada', prop_person_email: 'ada@example.com' },
        },
      ],
      omitted: {
        depthLimit: 1,
        recordLimit: 0,
        fanOutLimit: 0,
        missingRecords: [{ sourceId: 'ds_projects', recordId: 'rec_missing' }],
        cycles: 1,
        deduplicatedRecords: 2,
      },
    });
    expect(pack.relationExpansion?.records).toHaveLength(3);
    expect(pack.relationRecords).toEqual([
      { id: 'rec_project_1', sourceId: 'ds_projects', title: 'Project one' },
      { id: 'rec_project_2', sourceId: 'ds_projects', title: 'Project two' },
    ]);
    expect(pack.relationExpansion?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromRecordId: 'rec_task_1',
          toRecordId: 'rec_project_1',
          depth: 1,
        }),
        expect.objectContaining({
          fromRecordId: 'rec_project_1',
          toRecordId: 'rec_person_1',
          depth: 2,
        }),
      ]),
    );
    const project = pack.relationExpansion?.records.find((record) => record.id === 'rec_project_1');
    expect(project?.values).not.toHaveProperty('prop_project_owner');
  });

  test('enforces total and per-relation caps and validates projection IDs', () => {
    const capped = createDatabaseContextPack(relationDependencies(), {
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      goal: 'Bound expansion',
      maxTokens: 20_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      relationExpansion: {
        maxDepth: 1,
        maxRecords: 1,
        maxRecordsPerRelation: 3,
      },
    });
    expect(capped.relationExpansion).toMatchObject({
      complete: false,
      records: [{ id: 'rec_project_1', values: { prop_project_title: 'Project one' } }],
      omitted: { recordLimit: 2, fanOutLimit: 0 },
    });

    const fanOut = createDatabaseContextPack(relationDependencies(), {
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      goal: 'Bound fan-out',
      maxTokens: 20_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      relationExpansion: {
        maxDepth: 1,
        maxRecords: 10,
        maxRecordsPerRelation: 1,
      },
    });
    expect(fanOut.relationExpansion?.omitted.fanOutLimit).toBe(2);

    expect(() =>
      createDatabaseContextPack(relationDependencies(), {
        databaseId: 'db_work',
        sourceId: 'ds_tasks',
        goal: 'Invalid projection',
        maxTokens: 20_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
        relationExpansion: {
          maxDepth: 1,
          maxRecords: 10,
          maxRecordsPerRelation: 10,
          projections: [{ sourceId: 'ds_people', propertyIds: ['prop_missing'] }],
        },
      }),
    ).toThrow(DatabaseContextPackError);
  });

  test('applies scoped relation reads and reports denied rows and projected properties', () => {
    const deps = relationDependencies();
    const read = deps.getRecord;
    deps.getRecord = (recordId) => {
      const access = read(recordId);
      if (recordId === 'rec_project_2') {
        return { record: null, deniedRecord: true, deniedPropertyIds: [] };
      }
      if (recordId === 'rec_person_1' && access.record) {
        const { prop_person_email: _email, ...values } = access.record.values;
        return {
          record: { ...access.record, values },
          deniedRecord: false,
          deniedPropertyIds: ['prop_person_email'],
        };
      }
      return access;
    };
    const pack = createDatabaseContextPack(deps, {
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      goal: 'Respect scoped related data',
      maxTokens: 20_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      relationExpansion: {
        maxDepth: 2,
        maxRecords: 10,
        maxRecordsPerRelation: 3,
        projections: [
          { sourceId: 'ds_projects', propertyIds: ['prop_project_title'] },
          {
            sourceId: 'ds_people',
            propertyIds: ['prop_person_title', 'prop_person_email'],
          },
        ],
      },
    });
    expect(pack.relationExpansion).toMatchObject({
      complete: false,
      records: [
        { id: 'rec_project_1' },
        { id: 'rec_person_1', values: { prop_person_title: 'Ada' } },
      ],
      omitted: { permissionRecords: 1, permissionProperties: 1 },
    });
    expect(pack.relationExpansion?.records.map((record) => record.id)).not.toContain(
      'rec_project_2',
    );
    const peopleSchema = pack.relationExpansion?.schemas.find(
      (schema) => schema.sourceId === 'ds_people',
    );
    expect(peopleSchema?.properties.map((property) => property.id)).toEqual(['prop_person_title']);
  });

  test('redacts sensitive relation projections without leaking values', () => {
    const pack = createDatabaseContextPack(relationDependencies(), {
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      goal: 'Understand task ownership without private contact details',
      propertyIds: ['prop_task_title', 'prop_task_projects'],
      maxTokens: 20_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      sensitivityPolicy: {
        maxSensitivity: 'internal',
        redactedPropertyIdsBySource: { ds_people: ['prop_person_email'] },
        allowBody: true,
      },
      relationExpansion: {
        maxDepth: 2,
        maxRecords: 10,
        maxRecordsPerRelation: 3,
        projections: [
          { sourceId: 'ds_projects', propertyIds: ['prop_project_title'] },
          {
            sourceId: 'ds_people',
            propertyIds: ['prop_person_title', 'prop_person_email'],
          },
        ],
      },
    });

    const person = pack.relationExpansion?.records.find(({ id }) => id === 'rec_person_1');
    expect(person?.values).toEqual({ prop_person_title: 'Ada' });
    expect(
      pack.relationExpansion?.schemas
        .find(({ sourceId }) => sourceId === 'ds_people')
        ?.properties.map(({ id }) => id),
    ).toEqual(['prop_person_title']);
    expect(pack.relationExpansion?.omitted.sensitivityProperties).toBe(1);
    expect(pack.snapshot.sensitivityRedactions).toMatchObject({
      relationProperties: 1,
      relationEdges: 0,
    });
    expect(JSON.stringify(pack)).not.toContain('ada@example.com');
  });

  test('does not traverse relations hidden by the sensitivity policy', () => {
    const pack = createDatabaseContextPack(relationDependencies(), {
      databaseId: 'db_work',
      sourceId: 'ds_tasks',
      goal: 'List task titles without following restricted relations',
      propertyIds: ['prop_task_title', 'prop_task_projects'],
      maxTokens: 20_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      sensitivityPolicy: {
        maxSensitivity: 'internal',
        redactedPropertyIdsBySource: { ds_tasks: ['prop_task_projects'] },
        allowBody: true,
      },
      relationExpansion: {
        maxDepth: 2,
        maxRecords: 10,
        maxRecordsPerRelation: 3,
      },
    });

    expect(pack.records).toEqual([
      expect.objectContaining({ values: { prop_task_title: 'First task' } }),
      expect.objectContaining({ values: { prop_task_title: 'Second task' } }),
    ]);
    expect(pack.relationExpansion?.records).toEqual([]);
    expect(pack.relationExpansion?.edges).toEqual([]);
    expect(pack.relationExpansion?.omitted.sensitivityEdges).toBe(5);
    expect(pack.snapshot.sensitivityRedactions).toMatchObject({
      rootProperties: 1,
      relationEdges: 5,
    });
    expect(JSON.stringify(pack)).not.toContain('ada@example.com');
  });

  test('applies sensitivity before evidence retrieval and columnar encoding', () => {
    const deps = dependencies(2);
    const searchText = deps.searchText;
    let searchScope: { propertyIds: readonly string[]; includeBody: boolean } | null = null;
    deps.searchText = (input) => {
      searchScope = { propertyIds: input.propertyIds, includeBody: input.includeBody };
      return searchText(input);
    };
    const sensitivityPolicy = {
      maxSensitivity: 'public' as const,
      redactedPropertyIdsBySource: { ds_tasks: ['prop_notes'] },
      allowBody: false,
    };
    const pack = createDatabaseContextPack(deps, {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      goal: 'Find tasks without internal notes or body text',
      propertyIds: ['prop_title', 'prop_notes'],
      maxTokens: 10_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'columnar_dictionary',
      disclosure: { level: 'evidence', searchText: 'task' },
      sensitivityPolicy,
    });

    expect(searchScope).toEqual({ propertyIds: ['prop_title'], includeBody: false });
    expect(pack.schema.properties.map(({ id }) => id)).toEqual(['prop_title']);
    expect(pack.snapshot.sensitivityRedactions).toMatchObject({
      rootProperties: 1,
      body: true,
    });
    expect(JSON.stringify(pack)).not.toContain('Owner @Alice');

    expect(() =>
      createDatabaseContextPack(deps, {
        ...baseInput,
        propertyIds: ['prop_title', 'prop_notes'],
        query: { sort: [{ propertyId: 'prop_notes', direction: 'asc' }] },
        sensitivityPolicy,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_pack_scope',
        details: { deniedPropertyIds: ['prop_notes'] },
      }),
    );
  });

  test('carries compact Verification evidence through object and columnar encodings', () => {
    const verificationDatabase = DatabaseDefinitionSchema.parse({
      ...database,
      sources: database.sources.map((source) => ({
        ...source,
        properties: [
          ...source.properties,
          {
            id: 'prop_verification',
            key: 'verification',
            name: 'Verification',
            type: 'verification',
          },
        ],
      })),
    });
    const hash = (value: string) => `sha256:${value.repeat(64)}`;
    const base = dependencies(1);
    const deps: DatabaseContextPackDependencies = {
      ...base,
      describe: () => ({
        manifestRevision: 'sha256:manifest',
        schemaRevision: 'sha256:schema',
        database: verificationDatabase,
        source: verificationDatabase.sources[0] ?? null,
      }),
      query: (input) => {
        const result = base.query(input);
        return {
          ...result,
          trace: { projection: { returnedPropertyIds: input.query.select ?? [] } },
          records: result.records.map((record) => ({
            ...record,
            revision: hash('b'),
            evidenceRevision: hash('b'),
            values: {
              ...record.values,
              prop_verification: {
                state: 'verified' as const,
                verifiedAt: '2026-07-20T00:00:00.000Z',
                verifiedBy: { kind: 'agent' as const, principal_id: 'agent:reviewer' },
                evidenceRevision: hash('a'),
              },
            },
            verificationProjections: {
              prop_verification: {
                storedState: 'verified' as const,
                status: 'stale' as const,
                isExpired: false,
                isStale: true,
                verifiedAt: '2026-07-20T00:00:00.000Z',
                verifiedBy: { kind: 'agent' as const, principal_id: 'agent:reviewer' },
                evidenceRevision: hash('a'),
                currentRevision: hash('b'),
                currentEvidenceRevision: hash('b'),
              },
            },
          })),
        };
      },
    };
    for (const encoding of ['object_rows', 'columnar_dictionary'] as const) {
      const pack = createDatabaseContextPack(deps, {
        ...baseInput,
        encoding,
        propertyIds: ['prop_title', 'prop_verification'],
      });
      const records =
        encoding === 'object_rows'
          ? pack.records
          : decodeColumnarDatabaseRecords(pack.records as never);
      expect(records[0]).toMatchObject({
        evidenceRevision: hash('b'),
        verification: {
          prop_verification: {
            status: 'stale',
            evidenceRevision: hash('a'),
            currentEvidenceRevision: hash('b'),
            verifiedBy: { kind: 'agent', principal_id: 'agent:reviewer' },
          },
        },
      });
    }
  });
});
