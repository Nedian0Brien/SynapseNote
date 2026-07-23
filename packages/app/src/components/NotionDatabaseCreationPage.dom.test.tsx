import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { NotionDatabaseCreationPage } from './NotionDatabaseCreationPage';

const createMutation = mock(async () => ({
  status: 'committed' as const,
  draft: {
    normalized: {
      definition: {
        id: 'db_notion_blank',
        name: 'Untitled database',
        sources: [{ id: 'ds_notion_blank', name: 'Untitled database' }],
        views: [{ id: 'view_notion_blank', sourceId: 'ds_notion_blank' }],
      },
    },
  },
}));

mock.module('@/lib/database-mutation-client', () => ({
  executeDatabaseUiMutation: createMutation,
}));

afterEach(() => {
  cleanup();
  createMutation.mockClear();
});

describe('NotionDatabaseCreationPage', () => {
  test('shows the table before the blank creation request settles', async () => {
    const onCreated = mock(() => {});
    render(<NotionDatabaseCreationPage open onCreated={onCreated} onCancel={() => {}} />);

    expect(screen.getByRole('main', { name: 'New database page' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Untitled database' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Table' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Add database view' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Add property' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('textbox', { name: 'New page title' })).toBeTruthy();

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        databaseId: 'db_notion_blank',
        sourceId: 'ds_notion_blank',
        viewId: 'view_notion_blank',
      }),
    );
    expect(createMutation).toHaveBeenCalledTimes(1);
  });

  test('keeps an in-flight creation alive when the navigation callback changes', async () => {
    let resolveMutation: (value: unknown) => void = () => {};
    createMutation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const firstOnCreated = mock(() => {});
    const latestOnCreated = mock(() => {});
    const view = render(
      <NotionDatabaseCreationPage open onCreated={firstOnCreated} onCancel={() => {}} />,
    );

    view.rerender(
      <NotionDatabaseCreationPage open onCreated={latestOnCreated} onCancel={() => {}} />,
    );
    await act(async () => {
      resolveMutation({
        status: 'committed',
        draft: {
          normalized: {
            definition: {
              id: 'db_notion_callback',
              sources: [{ id: 'ds_notion_callback' }],
              views: [{ id: 'view_notion_callback', sourceId: 'ds_notion_callback' }],
            },
          },
        },
      });
    });

    await waitFor(() =>
      expect(latestOnCreated).toHaveBeenCalledWith({
        databaseId: 'db_notion_callback',
        sourceId: 'ds_notion_callback',
        viewId: 'view_notion_callback',
      }),
    );
    expect(firstOnCreated).not.toHaveBeenCalled();
    expect(createMutation).toHaveBeenCalledTimes(1);
  });

  test('does not duplicate the page mutation during a StrictMode effect probe', async () => {
    const onCreated = mock(() => {});
    render(
      <StrictMode>
        <NotionDatabaseCreationPage open onCreated={onCreated} onCancel={() => {}} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        databaseId: 'db_notion_blank',
        sourceId: 'ds_notion_blank',
        viewId: 'view_notion_blank',
      }),
    );
    expect(createMutation).toHaveBeenCalledTimes(1);
  });
});
