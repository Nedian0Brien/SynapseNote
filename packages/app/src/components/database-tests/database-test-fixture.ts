export function createDatabaseTestFixture() {
  const revision = `sha256:${'f'.repeat(64)}`;
  const source = {
    id: 'source_tasks',
    key: 'tasks',
    name: 'Tasks',
    recordMeaning: 'One task',
    folder: 'tasks',
    properties: [
      { id: 'title', key: 'title', name: 'Title', type: 'title' as const },
      {
        id: 'status',
        key: 'status',
        name: 'Status',
        type: 'select' as const,
        options: [{ id: 'active', key: 'active', name: 'Active' }],
      },
    ],
  };
  const database = {
    version: 1 as const,
    id: 'database_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track tasks',
      canonicality: 'canonical' as const,
      vocabulary: ['task'],
      freshness: { expectation: 'realtime' as const },
      sensitivity: 'internal' as const,
    },
    sources: [source],
    views: [
      {
        id: 'view_table',
        key: 'table',
        sourceId: source.id,
        name: 'Table',
        layout: { type: 'table' as const },
        projection: {
          propertyIds: source.properties.map((property) => property.id),
          body: 'preview' as const,
        },
        sort: [],
      },
    ],
  };
  const record = {
    id: 'record_first',
    path: 'tasks/first.md',
    revision,
    values: { title: 'First task', status: 'active' },
  };
  const result = {
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
  return { database, source, view: database.views[0], record, result };
}
