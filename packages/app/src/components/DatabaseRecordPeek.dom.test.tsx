import { afterEach, describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DatabaseRecordPeek } from './DatabaseRecordPeek';

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  sessionStorage.removeItem('synapsenote:database-record-navigation-v1');
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
    expect(
      document.querySelector(
        '[data-database-record-page-surface][data-record-page-mode="center_peek"]',
      ),
    ).not.toBeNull();
    expect(screen.getByLabelText('Database breadcrumbs')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Work' }).getAttribute('href')).toBe(
      '#database/db_work/ds_tasks',
    );
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

  test('shows the originating view breadcrumb action when navigation context is available', () => {
    sessionStorage.setItem(
      'synapsenote:database-record-navigation-v1',
      JSON.stringify({
        databaseId: 'db_work',
        sourceId: 'ds_tasks',
        viewId: 'view_table',
        paths: ['tasks/first.md'],
        index: 0,
      }),
    );
    render(
      <DatabaseRecordPeek
        mode="side_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First' },
        }}
        onClose={() => {}}
        onOpenFull={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Back to database view' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Work' }).getAttribute('href')).toBe(
      '#database/db_work/ds_tasks/view_table',
    );
  });
});
