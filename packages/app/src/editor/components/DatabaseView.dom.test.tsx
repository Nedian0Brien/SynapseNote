import { afterEach, describe, expect, jest, mock, test } from 'bun:test';
import {
  act,
  cleanup,
  fireEvent as rawFireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { resetDatabaseLinkedViewCacheForTests } from '@/lib/database-linked-view-cache';
import { DatabaseView, databaseViewTabActionToInitialAction } from './DatabaseView';
import { JsxComponentHostProvider } from './jsx-host-context';

const originalFetch = globalThis.fetch;
const originalHash = window.location.hash;
const hash = `sha256:${'a'.repeat(64)}`;

// This file deliberately exercises many document-native controls in one
// journey. Keep every synthetic event inside React's act boundary so the
// suite reports real interaction failures instead of asynchronous test noise.
const fireEvent = {
  ...rawFireEvent,
  click: (...args: Parameters<typeof rawFireEvent.click>) => act(() => rawFireEvent.click(...args)),
  pointerDown: (...args: Parameters<typeof rawFireEvent.pointerDown>) =>
    act(() => rawFireEvent.pointerDown(...args)),
  pointerOver: (...args: Parameters<typeof rawFireEvent.pointerOver>) =>
    act(() => rawFireEvent.pointerOver(...args)),
  keyDown: (...args: Parameters<typeof rawFireEvent.keyDown>) =>
    act(() => rawFireEvent.keyDown(...args)),
  change: (...args: Parameters<typeof rawFireEvent.change>) =>
    act(() => rawFireEvent.change(...args)),
  dragStart: (...args: Parameters<typeof rawFireEvent.dragStart>) =>
    act(() => rawFireEvent.dragStart(...args)),
  dragOver: (...args: Parameters<typeof rawFireEvent.dragOver>) =>
    act(() => rawFireEvent.dragOver(...args)),
  drop: (...args: Parameters<typeof rawFireEvent.drop>) => act(() => rawFireEvent.drop(...args)),
  contextMenu: (...args: Parameters<typeof rawFireEvent.contextMenu>) =>
    act(() => rawFireEvent.contextMenu(...args)),
  paste: (...args: Parameters<typeof rawFireEvent.paste>) => act(() => rawFireEvent.paste(...args)),
};

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

function inlineActionsTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-database-inline-actions-trigger]');
  if (!trigger) throw new Error('Inline database actions trigger is missing');
  return trigger;
}

function clickInlineHistoryAction(name: 'Undo change' | 'Redo change'): void {
  fireEvent.click(inlineActionsTrigger());
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

function expectInlineHistoryAction(name: 'Undo change' | 'Redo change'): void {
  fireEvent.click(inlineActionsTrigger());
  expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
}

afterEach(() => {
  cleanup();
  // The linked-view cache is module state that useDatabaseReadModel seeds from
  // on mount, so one test's snapshot otherwise arrives as the next test's
  // initial state. DatabaseTableDialog and database-read-model reset it too.
  resetDatabaseLinkedViewCacheForTests();
  globalThis.fetch = originalFetch;
  window.location.hash = originalHash;
});

describe('DatabaseView', () => {
  test('maps inline saved-view tab actions to reviewed manager intents', () => {
    const candidate = { id: 'view_open', favorite: false };
    expect(databaseViewTabActionToInitialAction(candidate, 'duplicate')).toEqual({
      kind: 'duplicate',
      viewId: 'view_open',
    });
    expect(databaseViewTabActionToInitialAction(candidate, 'favorite')).toEqual({
      kind: 'favorite',
      viewId: 'view_open',
      favorite: true,
    });
    expect(databaseViewTabActionToInitialAction(candidate, 'move-right')).toEqual({
      kind: 'reorder',
      viewId: 'view_open',
      direction: 1,
    });
    expect(databaseViewTabActionToInitialAction(candidate, 'delete')).toEqual({
      kind: 'delete',
      viewId: 'view_open',
    });
    expect(databaseViewTabActionToInitialAction(candidate, 'rename')).toEqual({
      kind: 'rename',
      viewId: 'view_open',
    });
    expect(databaseViewTabActionToInitialAction(candidate, 'make-default')).toEqual({
      kind: 'make-default',
      viewId: 'view_open',
    });
    expect(databaseViewTabActionToInitialAction(candidate, 'clear-default')).toEqual({
      kind: 'clear-default',
      viewId: 'view_open',
    });
  });

  test('keeps an inert stable slot instead of showing a linked-view loading screen', async () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {})) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );

    expect(await screen.findByTestId('database-view-pending')).toBeTruthy();
    expect(document.querySelector('[data-database-view-state="loading"]')).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Loading linked view/i)).toBeNull();
  });

  test('keeps a single table view compact and exposes view management from settings', async () => {
    const queryBodies: Array<Record<string, unknown>> = [];
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
        queryBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
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
    const inlineRegion = screen.getByRole('region', {
      name: 'Linked database view: Tasks · Open tasks',
    });
    await screen.findByRole('grid', { name: 'Tasks database pages' });
    expect(inlineRegion.querySelectorAll('[data-slot="table-container"]')).toHaveLength(1);
    expect(inlineRegion.querySelector('[data-database-inline-content]')?.className).not.toContain(
      'overflow-auto',
    );
    const titleButton = screen.getByRole('button', { name: source.name, exact: true });
    expect(titleButton.getAttribute('title')).toBe('Rename inline database');
    fireEvent.click(titleButton);
    expect(screen.getByRole('textbox', { name: 'Inline database title' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Refresh linked database view: Tasks · Open tasks',
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeTruthy();
    fireEvent.keyDown(
      screen.getByRole('menu', { name: 'Database view actions for Tasks · Open tasks' }),
      {
        key: 'Escape',
      },
    );
    expect(screen.getByRole('button', { name: 'Search pages in Tasks · Open tasks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Search pages in Tasks · Open tasks' }));
    const pageSearch = screen.getByRole('textbox', { name: 'Search pages' });
    expect(pageSearch).toBeTruthy();
    fireEvent.change(pageSearch, { target: { value: 'missing' } });
    expect(screen.getByText('No pages match “missing”.')).toBeTruthy();
    await waitFor(() =>
      expect(
        queryBodies.some(
          (body) =>
            body.query &&
            typeof body.query === 'object' &&
            (body.query as Record<string, unknown>).search === 'missing',
        ),
      ).toBe(true),
    );
    expect(
      screen.getByRole('button', { name: 'Open full database: Tasks · Open tasks' }),
    ).toBeTruthy();
    const agentButton = screen.getByTestId('open-in-agent-trigger');
    expect(agentButton).toBeTruthy();
    expect(agentButton.className).toContain('sr-only');
    expect(agentButton.getAttribute('aria-hidden')).toBe('true');
    expect(agentButton.getAttribute('tabindex')).toBe('-1');
    expect(screen.queryByRole('button', { name: 'Ask agent about Tasks · Open tasks' })).toBeNull();

    expect(screen.queryByRole('button', { name: view.name })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'New database view for Tasks · Open tasks' }),
    ).toBeNull();
    expect(document.querySelector('[data-linked-database-view-tabs]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage saved views' })).toBeTruthy();

    const stableTable = inlineRegion.querySelector('[data-database-inline-table]');
    fireEvent.click(screen.getByRole('button', { name: 'View settings' }));
    expect(await screen.findByRole('dialog', { name: 'View settings' })).toBeTruthy();
    expect(inlineRegion.querySelector('[data-database-inline-table]')).toBe(stableTable);
    fireEvent.click(screen.getByRole('button', { name: 'Close view settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'View settings' })).toBeNull());
  });

  test('applies toolbar filters, sort, and properties in place exactly once', async () => {
    const dispatched: Array<Record<string, unknown>> = [];
    const node = {
      type: { name: 'jsxComponent' },
      attrs: {
        componentName: 'DatabaseView',
        props: {
          databaseId: database.id,
          sourceId: source.id,
          viewId: view.id,
          mode: 'inline',
        },
      },
    };
    const focusEditor = mock(() => {});
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
      view: { dispatch: () => {}, focus: focusEditor },
    } as never;

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
      <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
        <DatabaseView
          databaseId={database.id}
          sourceId={source.id}
          viewId={view.id}
          mode="inline"
        />
      </JsxComponentHostProvider>,
    );

    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Open tasks' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByRole('heading', { name: 'Filters' })).toBeTruthy();
    const filtersTrigger = screen.getByRole('button', { name: 'Filters' });
    const filterInput = screen.getByRole('textbox', { name: 'Filter value for Title' });
    filterInput.focus();
    expect(document.activeElement).toBe(filterInput);
    fireEvent.change(filterInput, {
      target: { value: 'urgent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(dispatched).toHaveLength(1));
    expect(dispatched[0]?.props).toMatchObject({
      viewOverrides: { where: { propertyId: 'prop_title', operator: 'eq', value: 'urgent' } },
    });
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
    fireEvent.click(filtersTrigger);
    const reopenedFilterInput = screen.getByRole('textbox', { name: 'Filter value for Title' });
    reopenedFilterInput.focus();
    fireEvent.keyDown(reopenedFilterInput, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Filters' })).toBeNull());
    expect(document.activeElement).toBe(filtersTrigger);

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    expect(await screen.findByRole('heading', { name: 'Sort' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add sort rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(dispatched).toHaveLength(2));
    expect(dispatched[1]?.props).toMatchObject({
      viewOverrides: { sort: [{ propertyId: 'prop_title', direction: 'asc' }] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Properties' }));
    expect(await screen.findByRole('heading', { name: 'Properties' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Status' }));
    await waitFor(() => expect(dispatched).toHaveLength(3));
    expect(dispatched[2]?.props).toMatchObject({
      viewOverrides: { projection: { propertyIds: ['prop_title', 'prop_status'] } },
    });
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeTruthy();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
  });

  test('debounces search and ignores a late response for an older query', async () => {
    const searchRequests: string[] = [];
    let releaseFirstSearch: (() => void) | undefined;
    const responseFor = (search: string) => ({
      sourceId: source.id,
      snapshotRevision: hash,
      matched: 1,
      returned: 1,
      isComplete: true,
      nextCursor: null,
      truncatedBy: null,
      indexFreshness: 'snapshot' as const,
      records: [
        {
          id: search === 'first' ? 'rec_first_search' : 'rec_second_search',
          path: `tasks/${search || 'initial'}.md`,
          revision: hash,
          values: {
            prop_title:
              search === 'first'
                ? 'First match'
                : search === 'second'
                  ? 'Second match'
                  : 'Initial row',
          },
        },
      ],
      aggregation: null,
    });
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
        const body = JSON.parse(String(init?.body)) as {
          query?: { search?: string };
        };
        const search = body.query?.search ?? '';
        searchRequests.push(search);
        if (search === 'first') {
          return new Promise<Response>((resolve) => {
            releaseFirstSearch = () => resolve(Response.json(responseFor(search)));
          });
        }
        return Response.json(responseFor(search));
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );
    expect(await screen.findByText('Initial row')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Search pages in Tasks · Open tasks' }));
    const search = screen.getByRole('textbox', { name: 'Search pages' });
    fireEvent.change(search, { target: { value: 'first' } });
    await waitFor(() => expect(searchRequests).toContain('first'), { timeout: 1_500 });
    fireEvent.change(search, { target: { value: 'second' } });
    await waitFor(() => expect(searchRequests).toContain('second'), { timeout: 1_500 });
    expect(await screen.findByText('Second match')).toBeTruthy();
    act(() => releaseFirstSearch?.());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('Second match')).toBeTruthy();
    expect(screen.queryByText('First match')).toBeNull();
  });

  test('paginates complete server search results and restores the unsearched snapshot', async () => {
    const queryBodies: Array<Record<string, unknown>> = [];
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
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        queryBodies.push(body);
        const query = body.query as { search?: string; page?: { cursor?: string } } | undefined;
        if (query?.search === 'needle') {
          if (query.page?.cursor === 'search-cursor-1') {
            return Response.json({
              sourceId: source.id,
              snapshotRevision: hash,
              matched: 2,
              returned: 1,
              isComplete: true,
              nextCursor: null,
              truncatedBy: null,
              indexFreshness: 'snapshot',
              records: [
                {
                  id: 'rec_search_second',
                  path: 'tasks/second.md',
                  revision: hash,
                  values: { prop_title: 'Second server match' },
                },
              ],
              aggregation: null,
            });
          }
          return Response.json({
            sourceId: source.id,
            snapshotRevision: hash,
            matched: 2,
            returned: 1,
            isComplete: false,
            nextCursor: 'search-cursor-1',
            truncatedBy: 'page_limit',
            indexFreshness: 'snapshot',
            records: [
              {
                id: 'rec_search_first',
                path: 'tasks/first.md',
                revision: hash,
                values: { prop_title: 'First server match' },
              },
            ],
            aggregation: null,
          });
        }
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
              id: 'rec_initial_search',
              path: 'tasks/initial.md',
              revision: hash,
              values: { prop_title: 'Initial row' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );
    expect(await screen.findByText('Initial row')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Search pages in Tasks · Open tasks' }));
    const search = screen.getByRole('textbox', { name: 'Search pages' });
    fireEvent.change(search, { target: { value: 'needle' } });
    expect(await screen.findByText('First server match')).toBeTruthy();
    expect(screen.getByText('2 pages in this view')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second server match')).toBeTruthy();
    expect(screen.getByText('2 pages in this view')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect(await screen.findByText('Initial row')).toBeTruthy();
    expect(
      queryBodies.some(
        (body) => (body.query as { search?: string } | undefined)?.search === 'needle',
      ),
    ).toBe(true);
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
    expect(screen.getAllByLabelText('Open page Shared canonical row')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'More actions for page Shared canonical row' }),
    ).toBeNull();
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

  test('persists inline property order in the linked block projection', async () => {
    const priorityProperty = {
      id: 'prop_priority',
      key: 'priority',
      name: 'Priority',
      type: 'text' as const,
    };
    const inlineSource = {
      ...source,
      properties: [...source.properties, priorityProperty],
    };
    const inlineView = {
      ...view,
      projection: {
        propertyIds: ['prop_title', 'prop_status', 'prop_priority'],
        body: 'hidden' as const,
      },
    };
    const inlineDatabase = {
      ...database,
      sources: [inlineSource],
      views: [inlineView],
    };
    const dispatched: Array<Record<string, unknown>> = [];
    const node = {
      type: { name: 'jsxComponent' },
      attrs: {
        componentName: 'DatabaseView',
        props: {
          databaseId: inlineDatabase.id,
          sourceId: inlineSource.id,
          viewId: inlineView.id,
          mode: 'inline',
        },
      },
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

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
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
          sourceId: inlineSource.id,
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
              values: {
                prop_title: 'Shared canonical row',
                prop_status: 'Open',
                prop_priority: 'High',
              },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
        <DatabaseView
          databaseId={inlineDatabase.id}
          sourceId={inlineSource.id}
          viewId={inlineView.id}
          mode="inline"
        />
      </JsxComponentHostProvider>,
    );

    expect(await screen.findByText('Shared canonical row')).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Property options for Status' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move right' }));

    await waitFor(() =>
      expect(dispatched.at(-1)?.props).toMatchObject({
        viewOverrides: {
          projection: {
            propertyIds: ['prop_title', 'prop_priority', 'prop_status'],
            body: 'hidden',
          },
        },
      }),
    );
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
    expect(screen.getByRole('button', { name: 'Sort' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Properties' })).toBeTruthy();
    expect(screen.getByLabelText('Inspect context for page Linked feed update')).toBeTruthy();
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
    expect(screen.queryByText('42 pages')).toBeNull();
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
    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Task gallery' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Task gallery' })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-gallery-card="rec_first"]')).toBeTruthy(),
    );
    expect(screen.getByRole('img', { name: 'First task' })).toBeTruthy();
    expect(screen.getByLabelText('Inspect context for page First task')).toBeTruthy();
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
    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Task list' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Task list' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-list-row="rec_first"]')).toBeTruthy());
    expect(screen.getByLabelText('Inspect context for page First task')).toBeTruthy();
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

    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Task board' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Task board' })).toBeTruthy();
    expect(await screen.findByText('First task')).toBeTruthy();
    expect(document.querySelector('[data-board-card="rec_first"]')).toBeTruthy();
    expect(screen.getByLabelText('Inspect context for page First task')).toBeTruthy();
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

    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Task board' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Task board' })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-board-card="rec_first"]')).toBeTruthy(),
    );
    fireEvent.click(
      screen.getAllByRole('combobox', {
        name: 'Move page First task to group',
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
    jest.useFakeTimers();
    try {
      releaseCommit?.();
      await waitFor(() => expect(screen.getByTestId('inline-save-feedback')).toBeTruthy());
      act(() => {
        jest.advanceTimersByTime(3_000);
      });
      expect(screen.queryByTestId('inline-save-feedback')).toBeNull();
      expect(screen.queryByText('One database change can be undone')).toBeNull();
      expectInlineHistoryAction('Undo change');
    } finally {
      jest.useRealTimers();
    }
    clickInlineHistoryAction('Undo change');
    await waitFor(() => expect(undoCalls).toBe(2));
    expectInlineHistoryAction('Redo change');
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

    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Task calendar' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Task calendar' })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[data-calendar-card="rec_first"]')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Inspect context for page First task')).toBeTruthy();
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
    clickInlineHistoryAction('Undo change');
    await waitFor(() => expect(undoCalls).toBe(2));
    expectInlineHistoryAction('Redo change');
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

    expect(
      await screen.findByRole('region', { name: 'Linked database view: Tasks · Task timeline' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Task timeline' })).toBeTruthy();
    expect((await screen.findAllByText('First task')).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-timeline-bar="rec_first"]')).toBeTruthy();
    expect(screen.getAllByLabelText('Inspect context for page First task').length).toBeGreaterThan(
      0,
    );
    fireEvent.click(screen.getByLabelText('Move page First task later'));
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(screen.getByText('Saving inline database change')).toBeTruthy();
    releaseCommit?.();
    await waitFor(() => expect(screen.getByTestId('inline-save-feedback')).toBeTruthy());
    clickInlineHistoryAction('Undo change');
    await waitFor(() => expect(undoCalls).toBe(2));
    expectInlineHistoryAction('Redo change');
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
    let draftCalls = 0;
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
          draftCalls += 1;
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
    const titleDraftCount = draftCalls;
    const titleCommitCount = commitCalls;
    fireEvent.click(screen.getByRole('button', { name: source.name, exact: true }));
    const inlineTitleInput = screen.getByRole('textbox', { name: 'Inline database title' });
    fireEvent.change(inlineTitleInput, { target: { value: 'Project tasks' } });
    act(() => {
      rawFireEvent.keyDown(inlineTitleInput, { key: 'Enter' });
      rawFireEvent.keyDown(inlineTitleInput, { key: 'Enter' });
    });
    await waitFor(() => expect(commitCalls).toBeGreaterThan(titleCommitCount));
    expect(draftCalls - titleDraftCount).toBe(1);
    expect(commitCalls - titleCommitCount).toBe(1);
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
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
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
    expect(screen.getByLabelText('Open page First task')).toBeTruthy();
    expect(screen.getByTestId('database-new-row-title')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More actions for page First task' })).toBeNull();
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
    fireEvent.pointerOver(document.querySelector('[data-record-id="rec_first"]') as HTMLElement);
    fireEvent.click(screen.getByLabelText('Select page checkbox rec_first'));
    fireEvent.pointerOver(document.querySelector('[data-record-id="rec_second"]') as HTMLElement);
    fireEvent.click(screen.getByLabelText('Select page checkbox rec_second'));
    const inlineSelectionToolbar = await screen.findByTestId('inline-selection-toolbar');
    expect(inlineSelectionToolbar.closest('[data-database-inline-header]')).toBeTruthy();
    expect(inlineSelectionToolbar.closest('[data-database-inline-primary-slot]')).toBeTruthy();
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
    const editTitleCell = document.querySelector(
      '[data-database-cell-row="0"][data-database-cell-column="0"]',
    );
    expect(editTitleCell).toBeTruthy();
    fireEvent.contextMenu(editTitleCell as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Title for page First task' }));
    const titleInput = screen.getByLabelText('Edit Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Renamed task' } });
    fireEvent.keyDown(titleInput, { key: 'Enter' });
    await waitFor(() => expect(commitCalls).toBe(2));
    expect(await screen.findByTestId('inline-save-feedback')).toBeTruthy();
    const inlineSurfaceAfterSave = document.querySelector<HTMLElement>(
      '[data-database-inline-surface]',
    );
    const heightBeforeFeedbackExpiry = inlineSurfaceAfterSave?.getBoundingClientRect().height;
    await new Promise((resolve) => setTimeout(resolve, 3_050));
    expect(screen.queryByTestId('inline-save-feedback')).toBeNull();
    expect(screen.queryByText('One database change can be undone')).toBeNull();
    expectInlineHistoryAction('Undo change');
    expect(inlineSurfaceAfterSave?.getBoundingClientRect().height).toBe(heightBeforeFeedbackExpiry);
    const textInput = await screen.findByTestId('database-new-row-title');
    fireEvent.keyDown(textInput, { key: 'z', ctrlKey: true });
    expect(undoCalls).toBe(0);
    clickInlineHistoryAction('Undo change');
    await waitFor(() => expect(undoCalls).toBe(2));
    expectInlineHistoryAction('Redo change');
    clickInlineHistoryAction('Redo change');
    await waitFor(() => expect(undoCalls).toBe(4));
    expectInlineHistoryAction('Undo change');
    const inlineRoot = document.querySelector('[data-database-view-state="ready"]');
    expect(inlineRoot).toBeTruthy();
    fireEvent.keyDown(inlineRoot as HTMLElement, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(undoCalls).toBe(6));
    fireEvent.keyDown(inlineRoot as HTMLElement, { key: 'z', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(undoCalls).toBe(8));
    const newRowTitle = await screen.findByTestId('database-new-row-title');
    fireEvent.change(newRowTitle, { target: { value: 'Inline page' } });
    fireEvent.keyDown(newRowTitle, { key: 'Enter' });
    await waitFor(() => expect(commitCalls).toBe(3));
    undoBlocked = true;
    clickInlineHistoryAction('Undo change');
    await waitFor(() => expect(undoCalls).toBe(9));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The database changed while this action was in progress. Reload the latest state.',
    );
    expect(screen.getByTestId('inline-save-feedback')).toBeTruthy();
    undoBlocked = false;
    const titleCell = document.querySelector(
      '[data-database-cell-row="0"][data-database-cell-column="0"]',
    );
    expect(titleCell).toBeTruthy();
    fireEvent.paste(titleCell as HTMLElement, {
      clipboardData: { getData: () => 'Pasted task' },
    });
    await waitFor(() => expect(commitCalls).toBe(4));
    const reviewTitleCell = document.querySelector(
      '[data-database-cell-row="0"][data-database-cell-column="0"]',
    );
    expect(reviewTitleCell).toBeTruthy();
    fireEvent.paste(reviewTitleCell as HTMLElement, {
      clipboardData: { getData: () => 'Reviewed first\nReviewed second' },
    });
    expect(await screen.findByTestId('database-ghost-review')).toBeTruthy();
    expect(commitCalls).toBe(4);
    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.queryByTestId('database-ghost-review')).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0] as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-database-workspace]')).toBeNull());
    expect(screen.queryByLabelText('More actions for page First task')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Convert to full page' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Choose another view' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Ask agent' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Duplicate view configuration' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Manage properties' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Inspect agent context' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'View settings' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove linked view' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Convert to full page' }));
    await waitFor(() =>
      expect(dispatched.at(-1)?.props).toMatchObject({
        databaseId: database.id,
        sourceId: source.id,
        viewId: view.id,
        mode: 'full-page',
      }),
    );
    expect((dispatched.at(-1)?.props as Record<string, unknown>).records).toBeUndefined();
    fireEvent.click(
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inspect agent context' }));
    expect(await screen.findByText('What the agent saw')).toBeTruthy();
    expect(inspectPaths[0]).toContain(
      `/api/databases/inspect?databaseId=${database.id}&sourceId=${source.id}&viewId=${view.id}`,
    );
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('What the agent saw')).toBeNull());
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'View settings' }));
    expect(await screen.findByRole('heading', { name: 'Saved view settings' })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Saved view settings' })).toBeNull(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Manage views' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage views' }));
    expect(await screen.findByRole('heading', { name: 'Manage saved views' })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Manage saved views' })).toBeNull(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Advanced filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Advanced filters' }));
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
    fireEvent.click(screen.getByLabelText('Open page First task'));
    expect(await screen.findByText('Linked canonical body.')).toBeTruthy();
    expect(window.location.hash).toBe(originalHash);
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(window.location.hash).not.toBe(originalHash);

    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show archived' }));
    expect(screen.queryByLabelText('More actions for page First task')).toBeNull();
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
    expect(screen.getByText(/Shared pages/)).toBeTruthy();

    offline = true;
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }));
    expect(await screen.findByTestId('database-view-stale')).toBeTruthy();
    expect(screen.getByText('Cached task')).toBeTruthy();
  });

  test('keeps the same inline grid mounted when a refresh returns HTTP 409', async () => {
    let conflict = false;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        if (conflict) {
          return Response.json(
            {
              type: 'https://synapsenote.local/problems/stale-target',
              title: 'Database changed',
              status: 409,
              detail: 'The database changed while refreshing',
            },
            { status: 409 },
          );
        }
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
              id: 'rec_conflict',
              path: 'tasks/conflict.md',
              revision: hash,
              values: { prop_title: 'Still visible task' },
            },
          ],
          aggregation: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );
    expect(await screen.findByText('Still visible task')).toBeTruthy();
    const grid = screen.getByRole('grid');
    grid.setAttribute('data-render-continuity-probe', 'preserved');

    conflict = true;
    fireEvent.click(
      screen.getByRole('button', { name: 'Database view actions for Tasks · Open tasks' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }));

    expect(await screen.findByTestId('database-view-refresh-problem')).toBeTruthy();
    expect(screen.getByRole('grid')).toBe(grid);
    expect(grid.getAttribute('data-render-continuity-probe')).toBe('preserved');
    expect(screen.getByText('Still visible task')).toBeTruthy();
    expect(screen.queryByTestId('database-view-error')).toBeNull();
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
    expect(error.textContent).toContain('You do not have access to this database operation.');
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
    expect(screen.getByText('No pages in this source.')).toBeTruthy();
    expect(screen.getByText('Use the row below to add a page.')).toBeTruthy();
  });

  test('creates a blank record immediately from the inline New page control', async () => {
    let plannedTitle: unknown = Symbol('not planned');
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
      if (path === '/api/databases/plan' && body?.action === 'create_draft') {
        plannedTitle = (
          body.desiredState as {
            sampleRecords?: Array<{ values?: Record<string, unknown> }>;
          }
        ).sampleRecords?.[0]?.values?.title;
        return Response.json(
          { detail: 'Stop after observing the create request' },
          { status: 503 },
        );
      }
      return Response.json({ detail: `unexpected request: ${path}`, body }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseView databaseId={database.id} sourceId={source.id} viewId={view.id} mode="inline" />,
    );
    const newPageButton = await screen.findByRole('button', { name: 'New page' });
    const newPageTitle = await screen.findByLabelText('New page title');
    fireEvent.click(newPageButton);
    await waitFor(() => expect(plannedTitle).toBe(''));
    expect(document.activeElement).not.toBe(newPageTitle);
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
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
    const createDraftBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        createDraftBodies.push(body);
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
            requiresCommit: false,
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
      <StrictMode>
        <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
          <DatabaseView create="blank" mode="inline" />
        </JsxComponentHostProvider>
      </StrictMode>,
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
    expect(
      (createDraftBodies[0]?.desiredState as { database?: { key?: string } } | undefined)?.database
        ?.key,
    ).toMatch(/^untitled_database_[a-z0-9_]+$/);
    expect(dispatched[0]?.props.create).toBeUndefined();
  });

  test('offers an in-place retry when Notion-style inline creation fails', async () => {
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
    const inlineSource = { ...source, id: 'ds_notion_retry', name: 'Untitled database' };
    const inlineView = { ...view, id: 'view_notion_retry', sourceId: inlineSource.id };
    const inlineDatabase = {
      ...database,
      id: 'db_notion_retry',
      sources: [inlineSource],
      views: [inlineView],
    };
    let createDraftCount = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        createDraftCount += 1;
        if (createDraftCount === 1) {
          return Response.json({ detail: 'offline' }, { status: 503 });
        }
        return Response.json({
          action: 'create_draft',
          draft: {
            id: 'draft_notion_retry',
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
            id: 'plan_notion_retry',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: false,
            conflicts: [],
            approvals: [],
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
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
      <StrictMode>
        <JsxComponentHostProvider value={{ editor, getPos: () => 0, addChild: null }}>
          <DatabaseView create="blank" mode="inline" />
        </JsxComponentHostProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('offline'));
    expect(screen.getByTestId('inline-database-create-dialog').getAttribute('aria-busy')).toBe(
      'false',
    );
    fireEvent.click(screen.getByTestId('inline-database-create-retry'));

    await waitFor(() =>
      expect(dispatched[0]?.props).toMatchObject({
        databaseId: inlineDatabase.id,
        sourceId: inlineSource.id,
        viewId: inlineView.id,
        mode: 'inline',
      }),
    );
    expect(createDraftCount).toBe(2);
  });
});
