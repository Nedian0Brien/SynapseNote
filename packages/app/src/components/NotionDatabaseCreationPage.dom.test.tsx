import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
});
