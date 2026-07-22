import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { resolveDatabaseRelationNavigation } from './database-relation-navigation';

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_work',
  key: 'work',
  name: 'Work',
  contract: {
    purpose: 'Track work',
    canonicality: 'canonical',
    vocabulary: ['work'],
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
          id: 'prop_project',
          key: 'project',
          name: 'Project',
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
      properties: [{ id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
});
const source = database.sources[0];
if (!source) throw new Error('expected source');

describe('relation navigation', () => {
  test('resolves permission-visible stable IDs to canonical page paths without generating Markdown', async () => {
    const result = await resolveDatabaseRelationNavigation({
      database,
      source,
      record: {
        id: 'rec_task',
        path: 'tasks/task.md',
        revision: `sha256:${'a'.repeat(64)}`,
        values: { prop_title: 'Task', prop_project: ['rec_visible', 'rec_denied'] },
      },
      fetchRecord: async ({ recordId }) => {
        if (recordId === 'rec_denied') throw new Error('not permitted');
        return {
          databaseId: database.id,
          sourceId: 'ds_projects',
          manifestRevision: 'manifest',
          indexRevision: `sha256:${'b'.repeat(64)}`,
          record: {
            id: recordId,
            path: 'projects/alpha.md',
            revision: `sha256:${'c'.repeat(64)}`,
            values: { prop_project_title: 'Alpha' },
          },
        };
      },
    });
    expect(result).toEqual({
      items: [
        {
          propertyId: 'prop_project',
          propertyName: 'Project',
          recordId: 'rec_visible',
          sourceId: 'ds_projects',
          title: 'Alpha',
          path: 'projects/alpha.md',
        },
      ],
      unavailable: 1,
      truncated: false,
    });
    expect(JSON.stringify(result)).not.toContain('[[');
    expect(JSON.stringify(result)).not.toContain('](');
  });
});
