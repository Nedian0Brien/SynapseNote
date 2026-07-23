import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { CC1_CHANNEL_DATABASE_CHANGED, CC1_CONTRACT_VERSION } from '@nedian0brien/synapsenote-core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DATABASE_NAVIGATION_CHANGE_EVENT } from '@/lib/database-navigation';
import { emitDatabaseChanged } from '@/lib/documents-events';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

let catalogImpl = async (_options?: { signal?: AbortSignal }) => ({
  query: null,
  manifestRevision: 'rev-1',
  catalogRevision: `sha256:${'a'.repeat(64)}`,
  complete: true as const,
  candidates: [
    {
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      purpose: 'Track tasks',
      sources: [
        {
          id: 'ds_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          propertyCount: 3,
        },
      ],
      viewCount: 1,
      relationCount: 0,
      score: 1,
      matchedBy: [],
    },
  ],
});
const fetchCalls: unknown[] = [];

function PassThrough({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return <div {...props}>{children}</div>;
}

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  // Return a fresh translator function on each render. This mirrors locale
  // context updates closely enough to catch request effects that accidentally
  // treat translator identity as a network dependency.
  useLingui: () => ({
    t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
      renderLinguiTemplate(strings, ...values),
  }),
}));

mock.module('@/components/ui/sidebar', () => ({
  SidebarGroup: PassThrough,
  SidebarGroupLabel: PassThrough,
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/lib/database-catalog-client', () => ({
  fetchDatabaseCatalog: (...args: unknown[]) => {
    fetchCalls.push(args);
    return catalogImpl(args[0] as { signal?: AbortSignal });
  },
}));

describe('DatabaseSidebarSection', () => {
  beforeEach(() => {
    cleanup();
    fetchCalls.length = 0;
    catalogImpl = async (_options?: { signal?: AbortSignal }) => ({
      query: null,
      manifestRevision: 'rev-1',
      catalogRevision: `sha256:${'a'.repeat(64)}`,
      complete: true as const,
      candidates: [
        {
          id: 'db_tasks',
          key: 'tasks',
          name: 'Tasks',
          purpose: 'Track tasks',
          sources: [
            {
              id: 'ds_tasks',
              key: 'tasks',
              name: 'Tasks',
              recordMeaning: 'One task',
              propertyCount: 3,
            },
          ],
          viewCount: 1,
          relationCount: 0,
          score: 1,
          matchedBy: [],
        },
      ],
    });
    window.location.hash = '';
  });

  afterEach(cleanup);

  test('keeps the catalog request alive while the loading state is rendered', async () => {
    let resolveCatalog: ((value: Awaited<ReturnType<typeof catalogImpl>>) => void) | undefined;
    let rejectCatalog: ((reason: unknown) => void) | undefined;
    catalogImpl = ({ signal } = {}) =>
      new Promise<Awaited<ReturnType<typeof catalogImpl>>>((resolve, reject) => {
        resolveCatalog = resolve;
        rejectCatalog = reject;
        signal?.addEventListener(
          'abort',
          () => rejectCatalog?.(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });

    const { DatabaseSidebarSection } = await import('./DatabaseSidebarSection');
    render(<DatabaseSidebarSection />);
    fireEvent.click(screen.getByTestId('database-sidebar-trigger'));

    expect(screen.getByRole('status').textContent).toBe('Loading databases');
    expect(fetchCalls).toHaveLength(1);

    await act(async () => {
      resolveCatalog?.({
        query: null,
        manifestRevision: 'rev-1',
        catalogRevision: `sha256:${'a'.repeat(64)}`,
        complete: true,
        candidates: [
          {
            id: 'db_tasks',
            key: 'tasks',
            name: 'Tasks',
            purpose: 'Track tasks',
            sources: [
              {
                id: 'ds_tasks',
                key: 'tasks',
                name: 'Tasks',
                recordMeaning: 'One task',
                propertyCount: 3,
              },
            ],
            viewCount: 1,
            relationCount: 0,
            score: 1,
            matchedBy: [],
          },
        ],
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId('database-sidebar-source-ds_tasks')).toBeTruthy(),
    );
  });

  test('loads sources only when expanded and navigates to the stable database route', async () => {
    const { DatabaseSidebarSection } = await import('./DatabaseSidebarSection');
    render(<DatabaseSidebarSection />);

    expect(fetchCalls).toHaveLength(0);
    fireEvent.click(screen.getByTestId('database-sidebar-trigger'));
    await waitFor(() =>
      expect(screen.getByTestId('database-sidebar-source-ds_tasks')).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId('database-sidebar-source-ds_tasks'));
    expect(window.location.hash).toBe('#database/db_tasks/ds_tasks');
    expect(fetchCalls).toHaveLength(1);
  });

  test('opens and selects a source when the current hash already targets a database page', async () => {
    window.location.hash = '#database/db_tasks/ds_tasks';
    const { DatabaseSidebarSection } = await import('./DatabaseSidebarSection');
    render(<DatabaseSidebarSection />);

    await waitFor(() => {
      expect(
        screen.getByTestId('database-sidebar-source-ds_tasks').getAttribute('aria-current'),
      ).toBe('page');
    });
  });

  test('refreshes the active target after a canonical route is replaced without hashchange', async () => {
    const { DatabaseSidebarSection } = await import('./DatabaseSidebarSection');
    render(<DatabaseSidebarSection />);
    fireEvent.click(screen.getByTestId('database-sidebar-trigger'));
    await waitFor(() =>
      expect(screen.getByTestId('database-sidebar-source-ds_tasks')).toBeTruthy(),
    );

    await act(async () => {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}#database/db_tasks/ds_tasks`,
      );
      window.dispatchEvent(new Event(DATABASE_NAVIGATION_CHANGE_EVENT));
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('database-sidebar-source-ds_tasks').getAttribute('aria-current'),
      ).toBe('page'),
    );
  });

  test('refreshes catalog labels after a database schema change event', async () => {
    let databaseName = 'Tasks';
    catalogImpl = async () => ({
      query: null,
      manifestRevision: databaseName,
      catalogRevision: `sha256:${'a'.repeat(64)}`,
      complete: true as const,
      candidates: [
        {
          id: 'db_tasks',
          key: 'tasks',
          name: databaseName,
          purpose: `Track ${databaseName}`,
          sources: [
            {
              id: 'ds_tasks',
              key: 'tasks',
              name: databaseName,
              recordMeaning: `One ${databaseName} record`,
              propertyCount: 3,
            },
          ],
          viewCount: 1,
          relationCount: 0,
          score: 1,
          matchedBy: [],
        },
      ],
    });

    const { DatabaseSidebarSection } = await import('./DatabaseSidebarSection');
    render(<DatabaseSidebarSection />);
    fireEvent.click(screen.getByTestId('database-sidebar-trigger'));
    await waitFor(() => expect(screen.getAllByText('Tasks')).toHaveLength(2));

    databaseName = 'Roadmap';
    await act(async () => {
      emitDatabaseChanged({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_DATABASE_CHANGED,
        seq: 2,
        scope: 'workspace',
        reasons: ['schema-change'],
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        recordIds: [],
        affectedIdsComplete: true,
        index: {
          state: 'idle',
          revision: `sha256:${'b'.repeat(64)}`,
          manifestRevision: `sha256:${'c'.repeat(64)}`,
          recordCount: 0,
          issueCount: 0,
          progress: null,
        },
      });
    });

    await waitFor(() => expect(screen.getAllByText('Roadmap')).toHaveLength(2));
    expect(fetchCalls).toHaveLength(2);
  });
});
