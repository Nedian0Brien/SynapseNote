import {
  DatabaseDefinitionSchema,
  type DatabaseQueryResult,
  type ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';

/**
 * Shared fixture for the focused database DOM suites.
 *
 * The definition is built through `DatabaseDefinitionSchema.parse` on purpose.
 * Parsing applies every `.default([])` array the manifest declares (`people`,
 * `templates`, `buttons`, `automations`, `aliases`) and runs the cross-reference
 * invariants, so a fixture can never drift into a shape the product would refuse
 * to load. A hand-written literal silently omitted `people` and crashed every
 * consumer that renders the record comments panel.
 */
export function createDatabaseTestFixture() {
  const revision = `sha256:${'f'.repeat(64)}`;
  const database = DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
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
            type: 'select',
            options: [{ id: 'opt_active', key: 'active', name: 'Active' }],
          },
        ],
      },
    ],
    views: [
      {
        id: 'view_table',
        key: 'table',
        sourceId: 'ds_tasks',
        name: 'Table',
        layout: { type: 'table' },
        projection: {
          propertyIds: ['prop_title', 'prop_status'],
          body: 'preview',
        },
        sort: [],
      },
    ],
  });
  const source = database.sources[0] as (typeof database.sources)[number];
  const view = database.views[0] as (typeof database.views)[number];
  const record: ProjectedDatabaseRecord = {
    id: 'rec_first',
    path: 'tasks/first.md',
    revision,
    // Projected select values reference the option id, not its key
    // (`packages/core/src/database/query.ts` option.id === value).
    values: { prop_title: 'First task', prop_status: 'opt_active' },
  };
  const result: DatabaseQueryResult = {
    sourceId: source.id,
    snapshotRevision: revision,
    matched: 1,
    returned: 1,
    isComplete: true,
    nextCursor: null,
    truncatedBy: null,
    indexFreshness: 'snapshot',
    records: [record],
    aggregation: null,
  };
  return { database, source, view, record, result };
}
