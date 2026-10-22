import { describe, expect, test } from 'bun:test';
import { compileDatabaseFind } from './find.ts';
import { DatabaseQueryResultSchema, queryDatabaseRecords } from './query.ts';
import { materializeDatabaseRecord } from './record.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_people',
    key: 'people',
    name: 'People',
    people: [
      {
        id: 'person_local',
        key: 'minjae',
        name: 'Minjae',
        kind: 'local',
        subjectId: 'principal-local',
      },
      {
        id: 'person_guest',
        key: 'former_guest',
        name: 'Former Guest',
        kind: 'guest',
        active: false,
      },
      {
        id: 'person_agent',
        key: 'codex',
        name: 'Codex',
        kind: 'agent',
        subjectId: 'agent:codex',
      },
    ],
    contract: {
      purpose: 'Track owners',
      canonicality: 'canonical',
      vocabulary: ['owner'],
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
            id: 'prop_owner',
            key: 'owner',
            name: 'Owner',
            type: 'person',
            multiple: false,
          },
          {
            id: 'prop_watchers',
            key: 'watchers',
            name: 'Watchers',
            type: 'person',
          },
        ],
      },
    ],
  });
}

function markdown(owner = 'former_guest') {
  return `---
_sn:
  database_id: db_people
  source_id: ds_tasks
  record_id: rec_task
title: Ship
owner:
  - ${owner}
watchers:
  - minjae
  - codex
---
Body`;
}

describe('database Person contract', () => {
  test('links local identities, guests, and agents without exposing subject IDs in projections', () => {
    const database = definition();
    const materialized = materializeDatabaseRecord({
      definition: database,
      sourceId: 'ds_tasks',
      path: 'tasks/ship.md',
      markdown: markdown(),
      revision: 'sha256:record',
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const source = database.sources[0];
    if (!source) throw new Error('expected Person source');
    expect(materialized.record.values).toEqual({
      prop_title: 'Ship',
      prop_owner: ['person_guest'],
      prop_watchers: ['person_local', 'person_agent'],
    });

    const result = queryDatabaseRecords({
      source,
      records: [materialized.record],
      people: database.people,
      snapshotRevision: 'sha256:snapshot',
      query: { select: ['prop_owner'] },
    });
    expect(result.people).toEqual([
      {
        id: 'person_guest',
        key: 'former_guest',
        name: 'Former Guest',
        kind: 'guest',
        active: false,
      },
    ]);
    expect(JSON.stringify(result.people)).not.toContain('subjectId');
    expect(DatabaseQueryResultSchema.parse(result).people).toEqual(result.people);
  });

  test('keeps inactive people readable but rejects unknown, duplicate, and over-cardinality values', () => {
    const database = definition();
    expect(
      materializeDatabaseRecord({
        definition: database,
        sourceId: 'ds_tasks',
        path: 'tasks/inactive.md',
        markdown: markdown(),
      }).ok,
    ).toBe(true);

    for (const [owner, code] of [
      ['missing', 'unknown_person'],
      ['minjae\n  - codex', 'invalid_property_value'],
    ] as const) {
      const result = materializeDatabaseRecord({
        definition: database,
        sourceId: 'ds_tasks',
        path: `tasks/${code}.md`,
        markdown: markdown(owner),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues?.[0]?.code).toBe(code);
    }
    const duplicate = materializeDatabaseRecord({
      definition: database,
      sourceId: 'ds_tasks',
      path: 'tasks/duplicate.md',
      markdown: markdown().replace('  - codex', '  - minjae'),
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issues?.[0]?.code).toBe('duplicate_array_value');
  });

  test('enforces unique identity links and active declared defaults', () => {
    const base = definition();
    const source = base.sources[0];
    if (!source) throw new Error('expected Person source');
    expect(
      DatabaseDefinitionSchema.safeParse({
        ...base,
        people: [...base.people, { ...base.people[2], id: 'person_duplicate', key: 'other' }],
      }).success,
    ).toBe(false);
    expect(
      DatabaseDefinitionSchema.safeParse({
        ...base,
        sources: [
          {
            ...source,
            properties: source.properties.map((property) =>
              property.id === 'prop_owner'
                ? {
                    ...property,
                    semantics: { ...property.semantics, defaultValue: ['former_guest'] },
                  }
                : property,
            ),
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('filters Person collections by stable ID', () => {
    const database = definition();
    const source = database.sources[0];
    if (!source) throw new Error('expected Person source');
    const materialized = materializeDatabaseRecord({
      definition: database,
      sourceId: 'ds_tasks',
      path: 'tasks/query.md',
      markdown: markdown(),
    });
    if (!materialized.ok) throw new Error(materialized.message);
    const result = queryDatabaseRecords({
      source,
      records: [materialized.record],
      snapshotRevision: 'sha256:snapshot',
      query: {
        where: {
          propertyId: 'prop_watchers',
          operator: 'contains',
          value: 'person_agent',
        },
      },
    });
    expect(result.matched).toBe(1);
    expect(() =>
      queryDatabaseRecords({
        source,
        records: [materialized.record],
        people: database.people,
        snapshotRevision: 'sha256:snapshot',
        query: {
          where: {
            propertyId: 'prop_watchers',
            operator: 'contains',
            value: 'person_missing',
          },
        },
      }),
    ).toThrow(/incompatible/);
  });

  test('projects Person cards referenced only by aggregate groups', () => {
    const database = definition();
    const source = database.sources[0];
    if (!source) throw new Error('expected Person source');
    const materialized = materializeDatabaseRecord({
      definition: database,
      sourceId: source.id,
      path: 'tasks/group.md',
      markdown: markdown(),
    });
    if (!materialized.ok) throw new Error(materialized.message);
    const result = queryDatabaseRecords({
      source,
      records: [materialized.record],
      people: database.people,
      snapshotRevision: 'sha256:snapshot',
      query: {
        select: ['prop_title'],
        aggregate: {
          groupBy: [{ propertyId: 'prop_watchers', arrayMode: 'each' }],
          calculations: [],
        },
      },
    });
    expect(result.people?.map((person) => person.id)).toEqual(['person_local', 'person_agent']);
  });

  test('compiles an unambiguous Person name to a stable-ID filter', () => {
    const database = definition();
    const source = database.sources[0];
    if (!source) throw new Error('expected Person source');
    const plan = compileDatabaseFind(source, { text: 'watchers is Codex' }, database.people);
    expect(plan.query?.where).toEqual({
      propertyId: 'prop_watchers',
      operator: 'eq',
      value: ['person_agent'],
    });
    expect(plan.interpretation.requiresResolution).toBe(false);
    expect(() =>
      queryDatabaseRecords({
        source,
        records: [],
        snapshotRevision: 'sha256:snapshot',
        query: plan.query,
      }),
    ).not.toThrow();
  });

  test('sorts Person values by display identity with stable IDs as tie-breakers', () => {
    const database = definition();
    const source = database.sources[0];
    if (!source) throw new Error('expected Person source');
    const people = [
      {
        id: 'person_z',
        key: 'alpha',
        name: 'Alpha',
        kind: 'collaborator' as const,
        active: true,
      },
      {
        id: 'person_a',
        key: 'zulu',
        name: 'Zulu',
        kind: 'collaborator' as const,
        active: true,
      },
    ];
    const result = queryDatabaseRecords({
      source,
      people,
      snapshotRevision: 'sha256:snapshot',
      records: [
        {
          id: 'rec_zulu',
          databaseId: database.id,
          sourceId: source.id,
          path: 'tasks/zulu.md',
          revision: null,
          values: { prop_title: 'Zulu', prop_owner: ['person_a'] },
          body: '',
        },
        {
          id: 'rec_alpha',
          databaseId: database.id,
          sourceId: source.id,
          path: 'tasks/alpha.md',
          revision: null,
          values: { prop_title: 'Alpha', prop_owner: ['person_z'] },
          body: '',
        },
      ],
      query: { sort: [{ propertyId: 'prop_owner', direction: 'asc' }] },
    });
    expect(result.records.map((record) => record.id)).toEqual(['rec_alpha', 'rec_zulu']);
  });
});
