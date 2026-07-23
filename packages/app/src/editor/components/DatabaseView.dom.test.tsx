import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseView } from './DatabaseView';
import { JsxComponentHostProvider } from './jsx-host-context';

const originalFetch = globalThis.fetch;
const originalHash = window.location.hash;
const hash = `sha256:${'a'.repeat(64)}`;

const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' as const },
  ],
};

const view = {
  id: 'view_open',
  key: 'open',
  name: 'Open tasks',
  sourceId: source.id,
  layout: { type: 'table' as const, configuration: { rowHeight: 'compact' as const } },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
};

const database = {
  version: 1 as const,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks database',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical' as const,
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
    sensitivity: 'internal' as const,
  },
  people: [],
  sources: [source],
  views: [view],
};

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.location.hash = originalHash;
});

describe('DatabaseView', () => {
  test('exposes an accessible loading state while the linked view is unresolved', async () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {})) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );

    expect(await screen.findByTestId('database-view-loading')).toBeTruthy();
    expect(document.querySelector('[data-database-view-state="loading"]')).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  test('keeps the inline view tab and new-view action visible for a single saved view', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 0,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 0,
          returned: 0,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );

    expect(await screen.findByRole('heading', { name: source.name })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Linked database view: Tasks · Open tasks' }),
    ).toBeTruthy();
    const titleButton = screen.getByRole('button', { name: source.name, exact: true });
    expect(titleButton.getAttribute('title')).toBe('Rename inline database');
    fireEvent.click(titleButton);
    expect(screen.getByRole('textbox', { name: 'Inline database title' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Refresh linked database view: Tasks · Open tasks',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Change database view: Tasks · Open tasks' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open full database: Tasks · Open tasks' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask agent about Tasks · Open tasks' })).toBeTruthy();

    expect(await screen.findByRole('button', { name: view.name })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'New database view for Tasks · Open tasks' }),
    ).toBeTruthy();
    expect(document.querySelector('[data-linked-database-view-tabs]')).toBeTruthy();
  });

  test('keeps linked blocks independent while querying the same canonical rows', async () => {
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_shared',
              path: 'tasks/shared.md',
              revision: hash,
              values: { prop_title: 'Shared canonical row', prop_status: 'Done' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <>
        <DatabaseView
          databaseId={database.id}
          sourceId={source.id}
          viewId={view.id}
          viewOverrides={{
            where: null,
            projection: { propertyIds: ['prop_title'], body: 'hidden' },
          }}
          mode="inline"
        />
        <DatabaseView
          databaseId={database.id}
          sourceId={source.id}
          viewId={view.id}
          viewOverrides={{
            where: { propertyId: 'prop_status', operator: 'eq', value: 'Done' },
            sort: [{ propertyId: 'prop_title', direction: 'desc' }],
            projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' },
          }}
          mode="inline"
        />
      </>,
    );

    expect((await screen.findAllByText('Shared canonical row')).length).toBe(2);
    expect(screen.getAllByLabelText('Open record Shared canonical row')).toHaveLength(2);
    expect(
      screen.getAllByLabelText('Inspect context for record Shared canonical row'),
    ).toHaveLength(2);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.map((request) => request.viewId)).toEqual([view.id, view.id]);
    expect(requests[0]?.viewOverrides).toMatchObject({
      where: null,
      projection: { propertyIds: ['prop_title'] },
    });
    expect(requests[1]?.viewOverrides).toMatchObject({
      where: { propertyId: 'prop_status', operator: 'eq', value: 'Done' },
      sort: [{ propertyId: 'prop_title', direction: 'desc' }],
    });
    const surfaces = [...document.querySelectorAll('[data-database-view-state="ready"]')];
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.querySelector('th[data-property-id="prop_status"]')).toBeNull();
    expect(surfaces[1]?.querySelector('th[data-property-id="prop_status"]')).toBeTruthy();
    expect(surfaces[0]?.querySelector('[data-record-id="rec_shared"]')).toBeTruthy();
    expect(surfaces[1]?.querySelector('[data-record-id="rec_shared"]')).toBeTruthy();
  });

  test('renders a linked Feed through its saved chronology and canonical source identity', async () => {
    const feedSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_edited', key: 'edited', name: 'Edited', type: 'last_edited_time' as const },
      ],
    };
    const feedView = {
      ...view,
      id: 'view_feed',
      key: 'feed',
      name: 'Task updates',
      layout: {
        type: 'feed' as const,
        configuration: {
          chronologyPropertyId: 'prop_edited',
          density: 'compact' as const,
          showProperties: true,
          readTracking: 'none' as const,
          loadLimit: 25,
        },
      },
      sort: [{ propertyId: 'prop_edited', direction: 'desc' as const }],
      projection: {
        propertyIds: ['prop_title', 'prop_status', 'prop_edited'],
        body: 'preview' as const,
      },
    };
    const feedDatabase = { ...database, sources: [feedSource], views: [feedView] };
    const fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe')
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: feedDatabase,
          source: feedSource,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      if (path === '/api/databases/query')
        return Response.json({
          sourceId: feedSource.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_feed',
              path: 'tasks/update.md',
              revision: hash,
              values: {
                prop_title: 'Linked feed update',
                prop_status: 'Published',
                prop_edited: '2026-07-21T03:00:00.000Z',
              },
            },
          ],
          aggregation: null,
        });
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    });
    globalThis.fetch = fetch as typeof globalThis.fetch;
    render(
      <DatabaseView
        databaseId={feedDatabase.id}
        sourceId={feedSource.id}
        viewId={feedView.id}
        mode="inline"
      />,
    );
    expect(await screen.findByText('Linked feed update')).toBeTruthy();
    expect(screen.getByText('Tasks · tasks/update.md')).toBeTruthy();
    expect(document.querySelector('[data-database-layout="feed"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View settings' })).toBeTruthy();
    expect(screen.getByLabelText('Inspect context for record rec_feed')).toBeTruthy();
  });

  test('renders a linked Dashboard by querying only its child saved views', async () => {
    const dashboardView = {
      ...view,
      id: 'view_dashboard',
      key: 'dashboard',
      name: 'Task dashboard',
      layout: {
        type: 'dashboard' as const,
        configuration: {
          rows: [
            {
              id: 'dshr_overview',
              height: 'small' as const,
              widgets: [{ id: 'dshw_open', viewId: view.id, width: 4 }],
            },
          ],
          globalFilters: [],
          interactions: [],
        },
      },
    };
    const dashboardDatabase = { ...database, views: [view, dashboardView] };
    const requestedViewIds: string[] = [];
    const fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: dashboardDatabase,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        const request = JSON.parse(String(init?.body)) as { viewId: string };
        requestedViewIds.push(request.viewId);
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_linked',
              path: 'tasks/linked.md',
              revision: hash,
              values: { prop_title: 'Linked dashboard task' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    });
    globalThis.fetch = fetch as typeof globalThis.fetch;
    render(
      <DatabaseView
        databaseId={dashboardDatabase.id}
        sourceId={source.id}
        viewId={dashboardView.id}
        mode="inline"
      />,
    );
    expect(await screen.findByText('Linked dashboard task')).toBeTruthy();
    expect(requestedViewIds).toEqual([view.id]);
    expect(requestedViewIds).not.toContain(dashboardView.id);
  });

  test('renders a linked Form without querying or exposing existing responses', async () => {
    const formView = {
      ...view,
      id: 'view_form',
      key: 'form',
      name: 'Task intake',
      layout: {
        type: 'form' as const,
        configuration: {
          access: 'internal' as const,
          title: 'Send a task',
          questions: [
            {
              id: 'frmq_001_title',
              propertyId: 'prop_title',
              label: 'Task title',
              required: true,
            },
          ],
          defaults: {},
          confirmation: {
            title: 'Response submitted',
            message: 'Your response has been saved.',
            allowAnotherResponse: true,
          },
          closedMessage: 'This form is no longer accepting responses.',
          fileUploads: { enabled: false, maxFilesPerQuestion: 5 },
          spamProtection: {
            honeypot: true,
            minimumCompletionSeconds: 2,
            rateLimit: { maxSubmissions: 10, windowSeconds: 60 },
          },
          duplicateSubmission: { type: 'allow' as const },
          retention: { type: 'workspace' as const },
        },
      },
    };
    const formDatabase = { ...database, views: [formView] };
    const fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path !== '/api/databases/describe') {
        return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
      }
      return Response.json({
        manifestRevision: hash,
        schemaRevision: hash,
        database: formDatabase,
        source,
        index: {
          state: 'idle',
          revision: hash,
          manifestRevision: hash,
          recordCount: 42,
          issueCount: 0,
          progress: null,
          lastRebuiltAt: '2026-07-20T00:00:00.000Z',
          lastIncrementalAt: null,
          lastError: null,
        },
        allowedOperations: ['describe'],
      });
    });
    globalThis.fetch = fetch as typeof globalThis.fetch;
    render(
      <DatabaseView
        databaseId={formDatabase.id}
        sourceId={source.id}
        viewId={formView.id}
        mode="inline"
      />,
    );
    expect(await screen.findByText('Send a task')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('42 records')).toBeNull();
  });

  test('renders a linked Gallery from its saved Files preview', async () => {
    const gallerySource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_media', key: 'media', name: 'Media', type: 'files' as const },
      ],
    };
    const galleryView = {
      ...view,
      id: 'view_gallery',
      key: 'gallery',
      name: 'Task gallery',
      layout: {
        type: 'gallery' as const,
        configuration: {
          cardSize: 'medium' as const,
          cardPreview: { type: 'files' as const, propertyId: 'prop_media' },
          fitImage: false,
          showTitle: true,
          fallbackStyle: 'color' as const,
          loadLimit: 100,
        },
      },
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const galleryDatabase = { ...database, sources: [gallerySource], views: [galleryView] };
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: galleryDatabase,
          source: gallerySource,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: {
                prop_title: 'First task',
                prop_media: [{ kind: 'local', path: 'media/first.png' }],
              },
            },
          ],
          aggregation: null,
          fileStates: { 'media/first.png': 'available' },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView
        databaseId={galleryDatabase.id}
        sourceId={source.id}
        viewId={galleryView.id}
        mode="inline"
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Task gallery' })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-gallery-card="rec_first"]')).toBeTruthy(),
    );
    expect(screen.getByRole('img', { name: 'First task' })).toBeTruthy();
    expect(screen.getByLabelText('Inspect context for record rec_first')).toBeTruthy();
  });

  test('renders a linked List from stable view references', async () => {
    const listView = {
      ...view,
      id: 'view_list',
      key: 'list',
      name: 'Task list',
      layout: {
        type: 'list' as const,
        configuration: {
          hierarchy: { type: 'flat' as const },
          density: 'compact' as const,
          showSections: true,
          collapsibleSections: true,
          showDividers: true,
          loadLimit: 100,
        },
      },
    };
    const listDatabase = { ...database, views: [listView] };
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: listDatabase,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView
        databaseId={listDatabase.id}
        sourceId={source.id}
        viewId={listView.id}
        mode="inline"
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Task list' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-list-row="rec_first"]')).toBeTruthy());
    expect(screen.getByLabelText('Inspect context for record rec_first')).toBeTruthy();
  });

  test('renders a linked Board from saved grouping and returned-page memberships', async () => {
    const boardView = {
      ...view,
      id: 'view_board',
      key: 'board',
      name: 'Task board',
      layout: {
        type: 'board' as const,
        configuration: {
          cardSize: 'medium' as const,
          cardPreview: { type: 'none' as const },
          fitImage: false,
          colorColumns: true,
          groupLimit: 100,
          cardLimitPerGroup: 100,
        },
      },
      groups: [{ propertyId: 'prop_status', direction: 'asc' as const, hideEmpty: false }],
      projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' as const },
    };
    const boardDatabase = { ...database, views: [boardView] };
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: boardDatabase,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task', prop_status: 'open' },
            },
          ],
          aggregation: null,
          groupMemberships: {
            rec_first: [[{ propertyId: 'prop_status', value: 'open' }]],
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView
        databaseId={boardDatabase.id}
        sourceId={source.id}
        viewId={boardView.id}
        mode="inline"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Task board' })).toBeTruthy();
    expect(await screen.findByText('First task')).toBeTruthy();
    expect(document.querySelector('[data-board-card="rec_first"]')).toBeTruthy();
    expect(screen.getByLabelText('Inspect context for record First task')).toBeTruthy();
  });

  test('applies a single inline Board transition through the direct-safe cell path', async () => {
    const boardSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select' as const,
          options: [
            { id: 'opt_open', key: 'open', name: 'Open' },
            { id: 'opt_done', key: 'done', name: 'Done' },
          ],
        },
      ],
    };
    const boardView = {
      ...view,
      id: 'view_board_inline',
      name: 'Task board',
      layout: {
        type: 'board' as const,
        configuration: {
          cardSize: 'medium' as const,
          cardPreview: { type: 'none' as const },
          fitImage: false,
          colorColumns: false,
          groupLimit: 20,
          cardLimitPerGroup: 20,
        },
      },
      groups: [{ propertyId: 'prop_status', direction: 'asc' as const, hideEmpty: false }],
      projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' as const },
    };
    const boardDatabase = { ...database, sources: [boardSource], views: [boardView] };
    let commitCalls = 0;
    let undoCalls = 0;
    let releaseCommit: (() => void) | undefined;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: boardDatabase,
          source: boardSource,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: boardSource.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task', prop_status: 'opt_open' },
            },
          ],
          aggregation: null,
          groupMemberships: {
            rec_first: [[{ propertyId: 'prop_status', value: 'opt_open' }]],
          },
        });
      }
      if (path === '/api/databases/plan') {
        if (body.action === 'create_draft') {
          return Response.json({
            action: body.action,
            draft: { id: 'draft_board', revision: hash },
          });
        }
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_board',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            postconditions: [],
            risk: { level: 'low', reasons: [] },
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return new Promise<Response>((resolve) => {
          releaseCommit = () =>
            resolve(
              Response.json({
                mutationId: 'mut_board',
                planId: 'plan_board',
                planHash: hash,
                idempotentReplay: false,
                actualDiff: [],
                verification: { status: 'passed' },
                undoToken: 'undo_board',
              }),
            );
        });
      }
      if (path === '/api/databases/undo') {
        undoCalls += 1;
        const action = String(body.action);
        return Response.json({
          action,
          undoId: 'undo_board',
          mutationId: 'mut_board',
          canApply: true,
          conflicts: [],
          ...(action === 'apply' ? { receipt: { status: 'applied' } } : {}),
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView
        databaseId={boardDatabase.id}
        sourceId={boardSource.id}
        viewId={boardView.id}
        mode="inline"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Task board' })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-board-card="rec_first"]')).toBeTruthy(),
    );
    fireEvent.click(
      screen.getAllByRole('combobox', {
        name: 'Move record First task to group',
      })[0] as HTMLElement,
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Done' }));
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(screen.getByText('Saving inline database change')).toBeTruthy();
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-board-group]')].some(
        (group) =>
          group.getAttribute('data-board-group') === JSON.stringify('opt_done') &&
          group.querySelector('[data-board-card="rec_first"]'),
      ),
    ).toBe(true);
    releaseCommit?.();
    await waitFor(() => expect(screen.getByTestId('inline-save-feedback')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo inline database change' }));
    await waitFor(() => expect(undoCalls).toBe(2));
    expect(screen.getByRole('button', { name: 'Redo inline database change' })).toBeTruthy();
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
  });

  test('applies an inline Calendar reschedule through the direct-safe path', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const calendarSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' as const },
      ],
    };
    const calendarView = {
      ...view,
      id: 'view_calendar',
      key: 'calendar',
      name: 'Task calendar',
      layout: {
        type: 'calendar' as const,
        configuration: {
          datePropertyId: 'prop_schedule',
          display: 'month' as const,
          weekStartsOn: 'monday' as const,
          timeZone: 'UTC',
          showWeekends: true,
          cardLimitPerDay: 10,
        },
      },
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const calendarDatabase = { ...database, sources: [calendarSource], views: [calendarView] };
    let commitCalls = 0;
    let undoCalls = 0;
    let releaseCommit: (() => void) | undefined;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: calendarDatabase,
          source: calendarSource,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task', prop_schedule: today },
            },
          ],
          aggregation: null,
        });
      }
      if (path === '/api/databases/plan') {
        if (body.action === 'create_draft') {
          return Response.json({
            action: body.action,
            draft: { id: 'draft_calendar', revision: hash },
          });
        }
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_calendar',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            postconditions: [],
            risk: { level: 'low', reasons: [] },
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return new Promise<Response>((resolve) => {
          releaseCommit = () =>
            resolve(
              Response.json({
                mutationId: 'mut_calendar',
                planId: 'plan_calendar',
                planHash: hash,
                idempotentReplay: false,
                actualDiff: [],
                verification: { status: 'passed' },
                undoToken: 'undo_calendar',
              }),
            );
        });
      }
      if (path === '/api/databases/undo') {
        undoCalls += 1;
        const action = String(body.action);
        return Response.json({
          action,
          undoId: 'undo_calendar',
          mutationId: 'mut_calendar',
          canApply: true,
          conflicts: [],
          ...(action === 'apply' ? { receipt: { status: 'applied' } } : {}),
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView
        databaseId={calendarDatabase.id}
        sourceId={source.id}
        viewId={calendarView.id}
        mode="inline"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Task calendar' })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-calendar-card="rec_first"]')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Inspect context for record rec_first')).toBeTruthy();
    const card = document.querySelector<HTMLElement>('[data-calendar-card="rec_first"]');
    const currentDay = card?.closest<HTMLElement>('[data-calendar-day]')?.dataset.calendarDay;
    const targetDay = [...document.querySelectorAll<HTMLElement>('[data-calendar-day]')].find(
      (day) => day.dataset.calendarDay !== currentDay,
    );
    if (!card || !targetDay) throw new Error('Calendar drag fixture is missing');
    fireEvent.dragStart(card);
    fireEvent.dragOver(targetDay);
    fireEvent.drop(targetDay);
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(screen.getByText('Saving inline database change')).toBeTruthy();
    expect(targetDay.querySelector('[data-calendar-card="rec_first"]')).toBeTruthy();
    releaseCommit?.();
    await waitFor(() => expect(screen.getByTestId('inline-save-feedback')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo inline database change' }));
    await waitFor(() => expect(undoCalls).toBe(2));
    expect(screen.getByRole('button', { name: 'Redo inline database change' })).toBeTruthy();
  });

  test('applies an inline Timeline move through the direct-safe path', async () => {
    const timelineSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' as const },
      ],
    };
    const timelineView = {
      ...view,
      id: 'view_timeline',
      key: 'timeline',
      name: 'Task timeline',
      layout: {
        type: 'timeline' as const,
        configuration: {
          dateMapping: { type: 'range' as const, propertyId: 'prop_schedule' },
          scale: 'day' as const,
          showTable: true,
          showToday: true,
          showDependencies: true,
          noDateLane: true,
          loadLimit: 100,
        },
      },
      projection: { propertyIds: ['prop_title', 'prop_schedule'], body: 'hidden' as const },
    };
    const timelineDatabase = { ...database, sources: [timelineSource], views: [timelineView] };
    let commitCalls = 0;
    let undoCalls = 0;
    let releaseCommit: (() => void) | undefined;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: timelineDatabase,
          source: timelineSource,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: {
                prop_title: 'First task',
                prop_schedule: { start: '2026-07-20', end: '2026-07-22' },
              },
            },
          ],
          aggregation: null,
        });
      }
      if (path === '/api/databases/plan') {
        if (body.action === 'create_draft') {
          return Response.json({
            action: body.action,
            draft: { id: 'draft_timeline', revision: hash },
          });
        }
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_timeline',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            postconditions: [],
            risk: { level: 'low', reasons: [] },
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return new Promise<Response>((resolve) => {
          releaseCommit = () =>
            resolve(
              Response.json({
                mutationId: 'mut_timeline',
                planId: 'plan_timeline',
                planHash: hash,
                idempotentReplay: false,
                actualDiff: [],
                verification: { status: 'passed' },
                undoToken: 'undo_timeline',
              }),
            );
        });
      }
      if (path === '/api/databases/undo') {
        undoCalls += 1;
        const action = String(body.action);
        return Response.json({
          action,
          undoId: 'undo_timeline',
          mutationId: 'mut_timeline',
          canApply: true,
          conflicts: [],
          ...(action === 'apply' ? { receipt: { status: 'applied' } } : {}),
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView
        databaseId={timelineDatabase.id}
        sourceId={source.id}
        viewId={timelineView.id}
        mode="inline"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Task timeline' })).toBeTruthy();
    expect((await screen.findAllByText('First task')).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-timeline-bar="rec_first"]')).toBeTruthy();
    expect(screen.getAllByLabelText('Inspect context for record rec_first').length).toBeGreaterThan(
      0,
    );
    fireEvent.click(screen.getByLabelText('Move rec_first later'));
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(screen.getByText('Saving inline database change')).toBeTruthy();
    releaseCommit?.();
    await waitFor(() => expect(screen.getByTestId('inline-save-feedback')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo inline database change' }));
    await waitFor(() => expect(undoCalls).toBe(2));
    expect(screen.getByRole('button', { name: 'Redo inline database change' })).toBeTruthy();
  });

  test('renders a live projection from stable references without embedded records', async () => {
    const secondaryView = {
      ...view,
      id: 'view_done',
      key: 'done',
      name: 'Done tasks',
    };
    const linkedDatabase = { ...database, views: [view, secondaryView] };
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const inspectPaths: string[] = [];
    const dispatched: Array<Record<string, unknown>> = [];
    const node = {
      type: { name: 'jsxComponent' },
      attrs: { componentName: 'DatabaseView', props: {} },
    };
    const editor = {
      state: {
        doc: { nodeAt: () => node },
        tr: {
          setNodeMarkup: (_pos: number, _type: unknown, attrs: Record<string, unknown>) => {
            dispatched.push(attrs);
            return {};
          },
        },
      },
      view: { dispatch: () => {}, focus: () => {} },
    } as never;
    let commitCalls = 0;
    let undoCalls = 0;
    let undoBlocked = false;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith('/api/document?docName=tasks%2Ffirst')) {
        return Response.json({
          docName: 'tasks/first',
          content: '---\ntitle: First task\n---\nLinked canonical body.',
          lifecycle: null,
        });
      }
      if (path.startsWith('/api/databases/catalog')) {
        return Response.json({
          query: null,
          manifestRevision: hash,
          catalogRevision: hash,
          complete: true,
          candidates: [
            {
              id: linkedDatabase.id,
              key: linkedDatabase.key,
              name: linkedDatabase.name,
              purpose: linkedDatabase.contract.purpose,
              sources: [
                {
                  id: source.id,
                  key: source.key,
                  name: source.name,
                  recordMeaning: source.recordMeaning,
                  propertyCount: source.properties.length,
                },
              ],
              viewCount: linkedDatabase.views.length,
              relationCount: 0,
              score: 0,
              matchedBy: [],
            },
          ],
        });
      }
      if (path.startsWith('/api/databases/inspect')) {
        inspectPaths.push(path);
        return Response.json({ kind: 'list', inspections: [] });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ path, body });
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: linkedDatabase,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 2,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        const includeArchived =
          (body.query as { includeArchived?: boolean } | undefined)?.includeArchived === true;
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 2,
          returned: 2,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task', prop_status: 'open' },
              ...(includeArchived ? { archivedAt: '2026-07-20T00:00:00.000Z' } : {}),
            },
            {
              id: 'rec_second',
              path: 'tasks/second.md',
              revision: hash,
              values: { prop_title: 'Second task', prop_status: 'open' },
              ...(includeArchived ? { archivedAt: '2026-07-20T00:00:00.000Z' } : {}),
            },
          ],
          aggregation: null,
        });
      }
      if (path === '/api/databases/plan') {
        const action = (body as { action?: string }).action;
        if (action === 'create_draft') {
          return Response.json({ action, draft: { id: 'draft_inline_edit', revision: hash } });
        }
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_inline_edit',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            postconditions: [],
            risk: { level: 'low', reasons: [] },
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return Response.json({
          mutationId: 'mut_inline_edit',
          planId: 'plan_inline_edit',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          undoToken: 'undo_inline_edit',
        });
      }
      if (path === '/api/databases/undo') {
        undoCalls += 1;
        const action = (body as { action?: string }).action;
        return Response.json({
          action,
          undoId: 'undo_inline_preview',
          mutationId: 'mut_inline_edit',
          canApply: !(undoBlocked && action === 'preview'),
          conflicts:
            undoBlocked && action === 'preview' ? [{ reason: 'record revision changed' }] : [],
          ...(action === 'apply' || action === 'redo_apply'
            ? { receipt: { status: 'applied' } }
            : {}),
        });
      }
      return Response.json({ detail: 'unexpected request' }, { status: 500 });
    }) as typeof fetch;

    const { rerender } = render(
      <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
        <DatabaseView
          databaseId={database.id}
          sourceId={source.id}
          viewId={view.id}
          mode="inline"
        />
      </JsxComponentHostProvider>,
    );

    expect(await screen.findByRole('heading', { name: source.name })).toBeTruthy();
    expect(screen.getByRole('button', { name: source.name, exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open tasks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done tasks' })).toBeTruthy();
    const titleCommitCount = commitCalls;
    fireEvent.click(screen.getByRole('button', { name: source.name, exact: true }));
    const inlineTitleInput = screen.getByRole('textbox', { name: 'Inline database title' });
    fireEvent.change(inlineTitleInput, { target: { value: 'Project tasks' } });
    fireEvent.keyDown(inlineTitleInput, { key: 'Enter' });
    await waitFor(() => expect(commitCalls).toBeGreaterThan(titleCommitCount));
    expect(screen.queryByRole('textbox', { name: 'Inline database title' })).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'View options for Open tasks' }));
    expect(screen.getByRole('menuitem', { name: 'Filters' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'View settings' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Manage views' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Filters' }));
    expect(await screen.findByRole('heading', { name: 'Advanced saved filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Advanced saved filters' })).toBeNull(),
    );
    expect(
      document.querySelector('[data-linked-database-view-tabs] [aria-current="page"]'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'New database view for Tasks · Open tasks' }),
    );
    expect(await screen.findByRole('heading', { name: 'Manage saved views' })).toBeTruthy();
    fireEvent.click(
      screen
        .getByRole('heading', { name: 'Manage saved views' })
        .closest('[role="dialog"]')
        ?.querySelector('[data-slot="dialog-close"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage saved views' })).toBeNull(),
    );
    fireEvent.click(
      document.querySelector('[data-database-workspace] [data-slot="dialog-close"]') as HTMLElement,
    );
    await waitFor(() => expect(document.querySelector('[data-database-workspace]')).toBeNull());
    expect(await screen.findByText('First task')).toBeTruthy();
    expect(document.querySelector('th[data-property-id="prop_status"]')).toBeNull();
    expect(requests.find((request) => request.path === '/api/databases/query')?.body).toMatchObject(
      {
        databaseId: database.id,
        sourceId: source.id,
        viewId: view.id,
        query: { page: { limit: 25 } },
      },
    );
    expect(document.querySelector('[data-view-mode="inline"]')).toBeTruthy();
    const inlineSurface = document.querySelector('[data-database-view-state="ready"]');
    expect(inlineSurface?.getAttribute('data-database-id')).toBe(database.id);
    expect(inlineSurface?.getAttribute('data-source-id')).toBe(source.id);
    expect(inlineSurface?.getAttribute('data-view-id')).toBe(view.id);
    expect(document.querySelector('[data-record-id="rec_first"]')).toBeTruthy();
    expect(screen.getByLabelText('Edit Title for record rec_first')).toBeTruthy();
    expect(screen.getByTestId('database-new-row-title')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Inspect context for record First task'));
    expect(await screen.findByText('What the agent saw')).toBeTruthy();
    expect(
      inspectPaths.some((path) =>
        path.includes(
          `/api/databases/inspect?databaseId=${database.id}&sourceId=${source.id}&viewId=${view.id}&recordId=rec_first`,
        ),
      ),
    ).toBe(true);
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('What the agent saw')).toBeNull());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Property options for Title' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Inspect property context' }));
    expect(await screen.findByText('What the agent saw')).toBeTruthy();
    expect(
      inspectPaths.some((path) =>
        path.includes(
          `/api/databases/inspect?databaseId=${database.id}&sourceId=${source.id}&viewId=${view.id}&propertyIds=prop_title`,
        ),
      ),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-testid="database-context-inspector-scope"] [data-machine-id-kind="property-selection"] [data-machine-id-value="prop_title"]',
      ),
    ).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('What the agent saw')).toBeNull());
    fireEvent.click(screen.getByLabelText('Select record rec_first'));
    fireEvent.click(screen.getByLabelText('Select record rec_second'));
    expect(await screen.findByTestId('inline-selection-toolbar')).toBeTruthy();
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect selected context' }));
    expect(await screen.findByText('What the agent saw')).toBeTruthy();
    expect(
      inspectPaths.some((path) =>
        path.includes(
          `/api/databases/inspect?databaseId=${database.id}&sourceId=${source.id}&viewId=${view.id}&recordIds=rec_first%2Crec_second`,
        ),
      ),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-testid="database-context-inspector-scope"] [data-machine-id-kind="record-selection"] [data-machine-id-value="rec_first"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '[data-testid="database-context-inspector-scope"] [data-machine-id-kind="record-selection"] [data-machine-id-value="rec_second"]',
      ),
    ).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('What the agent saw')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open bulk actions' }));
    expect(await screen.findByTestId('database-bulk-toolbar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.querySelector('[data-database-workspace]')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(screen.queryByTestId('inline-selection-toolbar')).toBeNull());
    fireEvent.click(screen.getByLabelText('Edit Title for record rec_first'));
    const titleInput = screen.getByLabelText('Edit Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Renamed task' } });
    fireEvent.keyDown(titleInput, { key: 'Enter' });
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(await screen.findByTestId('inline-save-feedback')).toBeTruthy();
    const textInput = await screen.findByTestId('database-new-row-title');
    fireEvent.keyDown(textInput, { key: 'z', ctrlKey: true });
    expect(undoCalls).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo inline database change' }));
    await waitFor(() => expect(undoCalls).toBe(2));
    expect(await screen.findByRole('button', { name: 'Redo inline database change' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redo inline database change' }));
    await waitFor(() => expect(undoCalls).toBe(4));
    expect(await screen.findByRole('button', { name: 'Undo inline database change' })).toBeTruthy();
    const inlineRoot = document.querySelector('[data-database-view-state="ready"]');
    expect(inlineRoot).toBeTruthy();
    fireEvent.keyDown(inlineRoot as HTMLElement, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(undoCalls).toBe(6));
    fireEvent.keyDown(inlineRoot as HTMLElement, { key: 'z', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(undoCalls).toBe(8));
    const newRowTitle = await screen.findByTestId('database-new-row-title');
    fireEvent.change(newRowTitle, { target: { value: 'Inline page' } });
    fireEvent.keyDown(newRowTitle, { key: 'Enter' });
    await waitFor(() => expect(commitCalls).toBe(2));
    undoBlocked = true;
    fireEvent.click(screen.getByRole('button', { name: 'Undo inline database change' }));
    await waitFor(() => expect(undoCalls).toBe(9));
    expect((await screen.findByRole('alert')).textContent).toContain('record revision changed');
    expect(screen.getByTestId('inline-save-feedback')).toBeTruthy();
    undoBlocked = false;
    const titleCell = document.querySelector(
      '[data-database-cell-row="0"][data-database-cell-column="0"]',
    );
    expect(titleCell).toBeTruthy();
    fireEvent.paste(titleCell as HTMLElement, {
      clipboardData: { getData: () => 'Pasted task' },
    });
    await waitFor(() => expect(commitCalls).toBe(3));
    const reviewTitleCell = document.querySelector(
      '[data-database-cell-row="0"][data-database-cell-column="0"]',
    );
    expect(reviewTitleCell).toBeTruthy();
    fireEvent.paste(reviewTitleCell as HTMLElement, {
      clipboardData: { getData: () => 'Reviewed first\nReviewed second' },
    });
    expect(await screen.findByTestId('database-ghost-review')).toBeTruthy();
    expect(commitCalls).toBe(3);
    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.queryByTestId('database-ghost-review')).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0] as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-database-workspace]')).toBeNull());
    expect(screen.getByLabelText('Duplicate record First task')).toBeTruthy();
    expect(screen.getByLabelText('Archive record First task')).toBeTruthy();
    expect(screen.getByLabelText('Move record First task')).toBeTruthy();
    expect(screen.getByLabelText('Delete record First task')).toBeTruthy();
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Convert to full page' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Choose another view' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Duplicate view configuration' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Manage properties' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Inspect agent context' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'View settings' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove linked view' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Convert to full page' }));
    expect(dispatched.at(-1)?.props).toMatchObject({
      databaseId: database.id,
      sourceId: source.id,
      viewId: view.id,
      mode: 'full-page',
    });
    expect((dispatched.at(-1)?.props as Record<string, unknown>).records).toBeUndefined();
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage properties' }));
    expect(await screen.findByRole('heading', { name: 'Manage properties' })).toBeTruthy();
    fireEvent.click(
      screen
        .getByRole('heading', { name: 'Manage properties' })
        .closest('[role="dialog"]')
        ?.querySelector('[data-slot="dialog-close"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage properties' })).toBeNull(),
    );
    fireEvent.click(
      document.querySelector('[data-database-workspace] [data-slot="dialog-close"]') as HTMLElement,
    );
    await waitFor(() => expect(document.querySelector('[data-database-workspace]')).toBeNull());
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inspect agent context' }));
    expect(await screen.findByText('What the agent saw')).toBeTruthy();
    expect(inspectPaths[0]).toContain(
      `/api/databases/inspect?databaseId=${database.id}&sourceId=${source.id}&viewId=${view.id}`,
    );
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('What the agent saw')).toBeNull());
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'View settings' }));
    expect(await screen.findByRole('heading', { name: 'Saved view settings' })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Saved view settings' })).toBeNull(),
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Manage views' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage views' }));
    expect(await screen.findByRole('heading', { name: 'Manage saved views' })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage saved views' })).toBeNull(),
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Filters' }));
    expect(await screen.findByRole('heading', { name: 'Advanced saved filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Advanced saved filters' })).toBeNull(),
    );
    const workspaceClose = document.querySelector(
      '[data-database-workspace] [data-slot="dialog-close"]',
    );
    if (workspaceClose) fireEvent.click(workspaceClose);
    await waitFor(() => expect(document.querySelector('[data-database-workspace]')).toBeNull());
    fireEvent.click(screen.getByLabelText('Open record First task'));
    expect(await screen.findByText('Linked canonical body.')).toBeTruthy();
    expect(window.location.hash).toBe(originalHash);
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(window.location.hash).not.toBe(originalHash);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show archived' }));
    expect(await screen.findByLabelText('Restore record First task')).toBeTruthy();
    await waitFor(() =>
      expect(
        requests.filter((request) => request.path === '/api/databases/query').at(-1)?.body,
      ).toMatchObject({ query: { includeArchived: true } }),
    );

    rerender(
      <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
        <DatabaseView
          databaseId={database.id}
          sourceId={source.id}
          viewId={view.id}
          mode="full-page"
        />
      </JsxComponentHostProvider>,
    );
    await waitFor(() =>
      expect(
        requests.filter((request) => request.path === '/api/databases/query').at(-1)?.body,
      ).toMatchObject({ query: { page: { limit: 100 } } }),
    );
    expect(document.querySelector('[data-view-mode="full-page"]')).toBeTruthy();
    const fullPageSurface = document.querySelector('[data-database-view-state="ready"]');
    expect(fullPageSurface?.getAttribute('data-database-id')).toBe(database.id);
    expect(fullPageSurface?.getAttribute('data-source-id')).toBe(source.id);
    expect(fullPageSurface?.getAttribute('data-view-id')).toBe(view.id);
    expect(document.querySelectorAll('[data-record-id="rec_first"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done tasks' }));
    expect(dispatched.at(-1)?.props).toMatchObject({
      databaseId: database.id,
      sourceId: source.id,
      viewId: secondaryView.id,
      mode: 'full-page',
    });
  });

  test('keeps the last verified linked snapshot visible when a refresh goes offline', async () => {
    let offline = false;
    const fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (offline) throw new TypeError('Failed to fetch: offline');
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_offline',
              path: 'tasks/offline.md',
              revision: hash,
              values: { prop_title: 'Cached task' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    });
    globalThis.fetch = fetch as typeof globalThis.fetch;
    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );
    expect(await screen.findByText('Cached task')).toBeTruthy();
    expect(screen.getByText(/Shared records/)).toBeTruthy();

    offline = true;
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Refresh linked database view: Tasks · Open tasks',
      }),
    );
    expect(await screen.findByTestId('database-view-stale')).toBeTruthy();
    expect(screen.getByText('Cached task')).toBeTruthy();
  });

  test('does not show a cached inline snapshot after permission denial', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json(
          {
            code: 'permission_denied',
            detail: 'Read access denied for this database.',
            recovery: { action: 'request_access' },
          },
          { status: 403 },
        );
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );

    const error = await screen.findByTestId('database-view-error');
    expect(error.getAttribute('data-database-view-error-kind')).toBe('permission');
    expect(error.getAttribute('data-database-view-retryable')).toBe('false');
    expect(error.textContent).toContain('Read access denied for this database.');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose replacement' })).toBeNull();
    expect(screen.queryByText(/showing the last verified snapshot/i)).toBeNull();
    expect(screen.queryByText('Cached task')).toBeNull();
  });

  test('keeps an empty inline source actionable with a focused new-row affordance', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 0,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 0,
          returned: 0,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );

    expect(await screen.findByTestId('database-new-row-title')).toBeTruthy();
    expect(document.querySelector('[data-database-state="empty"]')).toBeTruthy();
    expect(screen.getByText('No records in this source.')).toBeTruthy();
    expect(screen.getByText('Use the row below to add a page.')).toBeTruthy();
  });

  test('starts record creation from a linked view in the canonical review dialog', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      if (path.startsWith('/api/databases/catalog')) {
        return Response.json({
          query: null,
          manifestRevision: hash,
          catalogRevision: hash,
          complete: true,
          candidates: [
            {
              id: database.id,
              key: database.key,
              name: database.name,
              purpose: database.contract.purpose,
              sources: [
                {
                  id: source.id,
                  key: source.key,
                  name: source.name,
                  recordMeaning: source.recordMeaning,
                  propertyCount: source.properties.length,
                },
              ],
              viewCount: 1,
              relationCount: 0,
              score: 0,
              matchedBy: [],
            },
          ],
        });
      }
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 1,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: '2026-07-20T00:00:00.000Z',
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: source.id,
          snapshotRevision: hash,
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task', prop_status: 'open' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}`, body }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New page' }));
    expect(await screen.findByLabelText('New page title')).toBeTruthy();
  });

  test('offers a guided database/source/view picker when stable references are invalid', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes('/api/databases/catalog')) {
        return Response.json({
          query: null,
          manifestRevision: 'manifest-1',
          catalogRevision: hash,
          complete: true,
          candidates: [
            {
              id: database.id,
              key: 'tasks',
              name: database.name,
              purpose: 'Track work',
              sources: [
                {
                  id: source.id,
                  key: 'tasks',
                  name: source.name,
                  recordMeaning: source.recordMeaning,
                  propertyCount: source.properties.length,
                },
              ],
              viewCount: 1,
              relationCount: 0,
              score: 1,
              matchedBy: ['name'],
            },
          ],
        });
      }
      if (path.includes('/api/databases/describe')) {
        return Response.json({
          manifestRevision: 'manifest-1',
          schemaRevision: hash,
          database,
          source,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: 'manifest-1',
            recordCount: 0,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: null,
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe'],
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    render(<DatabaseView databaseId="tasks" sourceId="source" viewId="open" />);
    expect(await screen.findByText('Choose a database view')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: source.name }));
    expect(await screen.findByText(view.name)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/databases/describe')),
    ).toBe(true);
  });

  test('creates a blank database inline and writes stable references back to the host block', async () => {
    const dispatched: Array<Record<string, unknown>> = [];
    const node = {
      type: { name: 'jsxComponent' },
      attrs: { componentName: 'DatabaseView', props: {} },
    };
    const editor = {
      state: {
        doc: { nodeAt: () => node },
        tr: {
          setNodeMarkup: (_pos: number, _type: unknown, attrs: Record<string, unknown>) => {
            dispatched.push(attrs);
            return {};
          },
        },
      },
      view: { dispatch: () => {}, focus: () => {} },
    } as never;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes('/api/databases/catalog')) {
        return Response.json({
          query: null,
          manifestRevision: hash,
          catalogRevision: hash,
          complete: true,
          candidates: [],
        });
      }
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: {
            id: 'draft_inline',
            revision: hash,
            normalized: {
              definition: {
                id: 'db_inline',
                sources: [{ id: 'ds_inline' }],
                views: [{ id: 'view_inline', sourceId: 'ds_inline' }],
              },
            },
          },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_inline',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        return Response.json({
          mutationId: 'mut_inline',
          planId: 'plan_inline',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          undoToken: 'undo_inline',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
        <DatabaseView databaseId="" sourceId="" viewId="" mode="inline" />
      </JsxComponentHostProvider>,
    );
    expect(await screen.findByText('Choose a database view')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create new database' }));
    const name = await screen.findByLabelText('Database name');
    fireEvent.change(name, { target: { value: 'Inline tasks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create database' }));
    await waitFor(() =>
      expect(dispatched[0]?.props).toMatchObject({
        databaseId: 'db_inline',
        sourceId: 'ds_inline',
        viewId: 'view_inline',
        mode: 'inline',
      }),
    );
    expect(screen.queryByTestId('inline-database-create-dialog')).toBeNull();
  });

  test('supports a Notion-style blank inline intent without showing the database picker', async () => {
    const dispatched: Array<Record<string, unknown>> = [];
    const node = {
      type: { name: 'jsxComponent' },
      attrs: { componentName: 'DatabaseView', props: { create: 'blank', mode: 'inline' } },
    };
    const editor = {
      state: {
        doc: { nodeAt: () => node },
        tr: {
          setNodeMarkup: (_pos: number, _type: unknown, attrs: Record<string, unknown>) => {
            dispatched.push(attrs);
            return {};
          },
        },
      },
      view: { dispatch: () => {}, focus: () => {} },
    } as never;
    const inlineSource = { ...source, id: 'ds_notion_inline', name: 'Untitled database' };
    const inlineView = { ...view, id: 'view_notion_inline', sourceId: inlineSource.id };
    const inlineDatabase = {
      ...database,
      id: 'db_notion_inline',
      sources: [inlineSource],
      views: [inlineView],
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: {
            id: 'draft_notion_inline',
            revision: hash,
            normalized: {
              definition: {
                id: inlineDatabase.id,
                sources: [{ id: inlineSource.id }],
                views: [{ id: inlineView.id, sourceId: inlineSource.id }],
              },
            },
          },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_notion_inline',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        return Response.json({
          mutationId: 'mut_notion_inline',
          planId: 'plan_notion_inline',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          undoToken: 'undo_notion_inline',
        });
      }
      if (path === '/api/databases/describe') {
        return Response.json({
          manifestRevision: hash,
          schemaRevision: hash,
          database: inlineDatabase,
          source: inlineSource,
          index: {
            state: 'idle',
            revision: hash,
            manifestRevision: hash,
            recordCount: 0,
            issueCount: 0,
            progress: null,
            lastRebuiltAt: null,
            lastIncrementalAt: null,
            lastError: null,
          },
          allowedOperations: ['describe', 'query'],
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          sourceId: inlineSource.id,
          snapshotRevision: hash,
          matched: 0,
          returned: 0,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          indexFreshness: 'snapshot',
          records: [],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
        <DatabaseView create="blank" mode="inline" />
      </JsxComponentHostProvider>,
    );

    expect(screen.queryByText('Choose a database view')).toBeNull();
    expect(await screen.findByTestId('inline-database-create-dialog')).toBeTruthy();
    expect(document.querySelector('[data-notion-inline-database-creation]')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Add database view' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Add property' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText('New page title')).toBeTruthy();
    await waitFor(() =>
      expect(dispatched[0]?.props).toMatchObject({
        databaseId: inlineDatabase.id,
        sourceId: inlineSource.id,
        viewId: inlineView.id,
        mode: 'inline',
      }),
    );
    expect(dispatched[0]?.props.create).toBeUndefined();
  });
});
