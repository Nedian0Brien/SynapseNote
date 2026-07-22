import { afterEach, describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DatabaseRecordPeek } from './DatabaseRecordPeek';

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
const originalFetch = globalThis.fetch;
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
});
const source = database.sources[0];
if (!source) throw new Error('expected source');

describe('DatabaseRecordPeek context parity', () => {
  test('uses canonical icon, cover, body, backlinks, comments, history, and relations', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/backlinks')) {
        return Response.json({
          docName: 'tasks/first',
          backlinks: [
            { source: 'notes/context', anchor: 'decision', title: 'Context', snippet: null },
          ],
        });
      }
      return Response.json({
        docName: 'tasks/first',
        lifecycle: null,
        content: '---\nicon: "📚"\ncover: assets/cover.png\n---\nCanonical body\n',
      });
    }) as typeof fetch;
    render(
      <DatabaseRecordPeek
        mode="center_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First', prop_project: 'rec_project' },
        }}
        onClose={() => {}}
        onOpenFull={() => {}}
      />,
    );
    await screen.findByText('Canonical body');
    expect(screen.getByText('📚')).toBeDefined();
    expect(document.querySelector('img[src*="cover.png"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Comments' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'History' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Relations' })).toBeDefined();
    await waitFor(() => expect(screen.getByText('notes/context')).toBeDefined());
    expect(screen.getByRole('link', { name: 'notes/context' }).getAttribute('href')).toBe(
      '#/notes/context#decision',
    );
  });
});
