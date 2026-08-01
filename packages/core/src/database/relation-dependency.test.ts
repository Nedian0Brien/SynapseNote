import { describe, expect, test } from 'bun:test';
import type { DatabaseRecord } from './record.ts';
import {
  buildDatabaseReverseRelationIndex,
  createDatabaseDerivedRevision,
  databaseReverseRelationDependents,
} from './relation-dependency.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

const definition = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_graph',
  key: 'graph',
  name: 'Graph',
  contract: {
    purpose: 'Graph',
    canonicality: 'canonical',
    vocabulary: ['graph'],
    freshness: { expectation: 'manual' },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'Task',
      folder: 'tasks',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_related',
          key: 'related',
          name: 'Related',
          type: 'relation',
          targetSourceId: 'ds_tasks',
          cardinality: 'many',
        },
      ],
    },
  ],
});

const record = (id: string, related: string[]): DatabaseRecord => ({
  id,
  databaseId: 'db_graph',
  sourceId: 'ds_tasks',
  path: `${id}.md`,
  revision: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
  values: { prop_title: id, prop_related: related },
  body: '',
  issues: [],
  invalidValues: {},
  archivedAt: null,
});

describe('reverse relation index and derived revision', () => {
  test('indexes incoming edges deterministically and exposes exact dependents', () => {
    const index = buildDatabaseReverseRelationIndex(definition, [
      record('rec_a', ['rec_b']),
      record('rec_c', ['rec_b']),
    ]);
    expect(databaseReverseRelationDependents(index, 'rec_b').map((edge) => edge.recordId)).toEqual([
      'rec_a',
      'rec_c',
    ]);
    expect(index.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('derived revision changes for dependency, permission, or evaluation context', () => {
    const base = {
      manifestRevision: 'sha256:a',
      tableRevisions: { owner: 'sha256:b' },
      dependencyRevision: 'sha256:c',
      permissionRevision: 'sha256:d',
      evaluationRevision: 'sha256:e',
    };
    expect(createDatabaseDerivedRevision(base)).toBe(createDatabaseDerivedRevision({ ...base }));
    expect(createDatabaseDerivedRevision({ ...base, permissionRevision: 'sha256:x' })).not.toBe(
      createDatabaseDerivedRevision(base),
    );
  });
});
