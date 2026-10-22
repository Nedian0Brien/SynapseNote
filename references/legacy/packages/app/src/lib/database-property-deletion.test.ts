import { describe, expect, test } from 'bun:test';
import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { createDatabasePropertyDeletionPreview } from './database-property-deletion';

const property = (input: Record<string, unknown>) => input as DatabaseProperty;

const source = {
  id: 'ds_tasks',
  name: 'Tasks',
  properties: [
    property({ id: 'prop_title', key: 'title', name: 'Name', type: 'title' }),
    property({ id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' }),
    property({
      id: 'prop_total',
      key: 'total',
      name: 'Total',
      type: 'formula',
      ast: {
        language: 'synapse-formula-1',
        version: 1,
        resultType: 'number',
        expression: { type: 'property', propertyId: 'prop_budget' },
      },
    }),
    property({
      id: 'prop_rollup',
      key: 'rollup',
      name: 'Rollup',
      type: 'rollup',
      relationPropertyId: 'prop_relation',
      targetPropertyId: 'prop_budget',
      function: 'sum',
      targetValueType: 'number',
    }),
    property({
      id: 'prop_relation',
      key: 'relation',
      name: 'Project',
      type: 'relation',
      targetSourceId: 'ds_projects',
      pairedPropertyId: 'prop_budget',
      cardinality: 'many',
    }),
  ],
} as unknown as DatabaseSource;

const database = {
  id: 'db_workspace',
  sources: [source],
  views: [
    {
      id: 'view_budget',
      name: 'Budget view',
      sourceId: source.id,
      projection: { propertyIds: ['prop_title', 'prop_budget'] },
    },
  ],
} as unknown as DatabaseDefinition;

const records = [
  {
    id: 'rec_one',
    path: 'tasks/one.md',
    revision: 'sha256:one',
    values: { prop_budget: 100 },
  },
  {
    id: 'rec_two',
    path: 'tasks/two.md',
    revision: 'sha256:two',
    values: { prop_budget: '' },
  },
  {
    id: 'rec_three',
    path: 'tasks/three.md',
    revision: 'sha256:three',
    values: {},
  },
] as unknown as readonly ProjectedDatabaseRecord[];

describe('createDatabasePropertyDeletionPreview', () => {
  test('counts stored values and reports formula, rollup, relation, and view dependencies', () => {
    const preview = createDatabasePropertyDeletionPreview({
      database,
      source,
      property: source.properties[1] as DatabaseProperty,
      records,
      recordsComplete: true,
    });

    expect(preview.recordCount).toBe(3);
    expect(preview.valueCount).toBe(1);
    expect(preview.dependencies).toEqual([
      {
        id: 'prop_total',
        name: 'Tasks: Total',
        kind: 'property',
        reason: 'Formula reads this property',
      },
      {
        id: 'prop_rollup',
        name: 'Tasks: Rollup',
        kind: 'property',
        reason: 'Rollup reads this property',
      },
      {
        id: 'prop_relation',
        name: 'Tasks: Project',
        kind: 'property',
        reason: 'Paired relation uses this property',
      },
      {
        id: 'view_budget',
        name: 'Budget view',
        kind: 'view',
        reason: 'View configuration references this property',
      },
    ]);
  });

  test('rejects incomplete snapshots and attempts to delete the Title property', () => {
    expect(() =>
      createDatabasePropertyDeletionPreview({
        database,
        source,
        property: source.properties[1] as DatabaseProperty,
        records,
        recordsComplete: false,
      }),
    ).toThrow('complete source snapshot');
    expect(() =>
      createDatabasePropertyDeletionPreview({
        database,
        source,
        property: source.properties[0] as DatabaseProperty,
        records,
        recordsComplete: true,
      }),
    ).toThrow('Title property cannot be deleted');
  });
});
