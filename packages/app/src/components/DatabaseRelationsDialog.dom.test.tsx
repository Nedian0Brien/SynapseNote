import { afterEach, describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DatabaseRelationsDialog } from './DatabaseRelationsDialog';

afterEach(cleanup);

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
          id: 'prop_project',
          key: 'project',
          name: 'Project',
          type: 'relation',
          targetSourceId: 'ds_projects',
          cardinality: 'one',
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
  views: [],
});

const source = database.sources[0];
if (!source) throw new Error('Expected source');

describe('DatabaseRelationsDialog navigation', () => {
  test('opens related records through their canonical document route', async () => {
    render(
      <DatabaseRelationsDialog
        open
        onOpenChange={() => {}}
        database={database}
        source={source}
        record={{
          id: 'rec_task',
          path: 'tasks/one.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'One', prop_project: 'rec_project' },
        }}
        resolveRelations={async () => ({
          items: [
            {
              propertyId: 'prop_project',
              propertyName: 'Project',
              recordId: 'rec_project',
              sourceId: 'ds_projects',
              title: 'Roadmap',
              path: 'projects/roadmap.md',
            },
          ],
          unavailable: 0,
          truncated: false,
        })}
      />,
    );

    const link = await screen.findByRole('link', { name: 'Roadmap' });
    await waitFor(() => expect(link.getAttribute('href')).toBe('#/projects/roadmap'));
    expect(screen.getByText('Related records')).toBeDefined();
  });
});
