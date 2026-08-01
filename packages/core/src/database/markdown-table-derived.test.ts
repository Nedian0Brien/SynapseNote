import { describe, expect, test } from 'bun:test';
import { materializeDatabaseDerivedRecords } from './derived-records.ts';
import type { DatabaseRecord } from './record.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

const definition = DatabaseDefinitionSchema.parse({
  version: 2,
  id: 'db_v2_derived',
  key: 'v2_derived',
  name: 'V2 derived values',
  contract: {
    purpose: 'Verify derived values are rebuilt from v2 rows',
    canonicality: 'canonical',
    vocabulary: ['order'],
    freshness: { expectation: 'realtime' },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_orders',
      key: 'orders',
      name: 'Orders',
      recordMeaning: 'One order',
      folder: '.',
      storage: {
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
        titlePropertyId: 'prop_order_title',
        storedPropertyIds: ['prop_order_title', 'prop_amount', 'prop_projects'],
      },
      properties: [
        { id: 'prop_order_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_amount', key: 'amount', name: 'Amount', type: 'number' },
        {
          id: 'prop_projects',
          key: 'projects',
          name: 'Projects',
          type: 'relation',
          targetSourceId: 'ds_projects',
          cardinality: 'many',
        },
        {
          id: 'prop_double_amount',
          key: 'double_amount',
          name: 'Double amount',
          type: 'formula',
          source: 'prop("amount") * 2',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'number',
            expression: {
              type: 'binary',
              operator: 'multiply',
              left: { type: 'property', propertyId: 'prop_amount' },
              right: { type: 'literal', valueType: 'number', value: 2 },
            },
          },
        },
        {
          id: 'prop_project_total',
          key: 'project_total',
          name: 'Project total',
          type: 'rollup',
          relationPropertyId: 'prop_projects',
          targetPropertyId: 'prop_budget',
          function: 'sum',
          targetValueType: 'number',
        },
      ],
    },
    {
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: '.',
      storage: {
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: 'projects.md', blockId: 'dbb_projects_primary' },
        titlePropertyId: 'prop_project_title',
        storedPropertyIds: ['prop_project_title', 'prop_budget'],
      },
      properties: [
        { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' },
      ],
    },
  ],
});

function record(id: string, sourceId: string, values: DatabaseRecord['values']): DatabaseRecord {
  return {
    id,
    databaseId: definition.id,
    sourceId,
    path: `${sourceId}/${id}.md`,
    revision: `sha256:${'a'.repeat(64)}`,
    values,
    body: '',
  };
}

describe('v2 Markdown owner-table derived projection', () => {
  test('computes Formula and Rollup from storage-neutral records without persisting derived cells', () => {
    const canonical = [
      record('rec_order', 'ds_orders', {
        prop_order_title: 'Order A',
        prop_amount: 4,
        prop_projects: ['rec_project'],
      }),
      record('rec_project', 'ds_projects', {
        prop_project_title: 'Project A',
        prop_budget: 10,
      }),
    ];
    const derived = materializeDatabaseDerivedRecords({
      definition,
      records: canonical,
      context: { now: '2026-07-27T00:00:00.000Z', timeZone: 'UTC', locale: 'en' },
      permissionRevision: `sha256:${'b'.repeat(64)}`,
    });
    const order = derived.find((candidate) => candidate.id === 'rec_order');
    expect(canonical[0]?.values).not.toHaveProperty('prop_double_amount');
    expect(canonical[0]?.values).not.toHaveProperty('prop_project_total');
    expect(order?.values).toMatchObject({ prop_double_amount: 8, prop_project_total: 10 });
    expect(order?.computedResults?.prop_double_amount).toMatchObject({
      kind: 'value',
      value: 8,
    });
    expect(order?.computedResults?.prop_project_total).toMatchObject({
      kind: 'value',
      value: 10,
    });
  });
});
