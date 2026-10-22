import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps, StrictMode } from 'react';
import type { DatabaseViewLifecycleChange } from '@/lib/database-cell-mutation';
import { InlineDatabaseViewManagerPopover } from './InlineDatabaseViewManagerPopover';

afterEach(cleanup);

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
  defaultViewId: 'view_open',
};

const views: DatabaseView[] = [
  {
    id: 'view_open',
    key: 'open',
    name: 'Open tasks',
    sourceId: source.id,
    layout: { type: 'table', configuration: { rowHeight: 'compact' } },
    sort: [],
    groups: [],
    projection: { propertyIds: ['prop_title'], body: 'hidden' },
  },
  {
    id: 'view_done',
    key: 'done',
    name: 'Done tasks',
    sourceId: source.id,
    layout: { type: 'table', configuration: { rowHeight: 'compact' } },
    sort: [],
    groups: [],
    projection: { propertyIds: ['prop_title'], body: 'hidden' },
  },
];

function renderManager(
  overrides: Partial<ComponentProps<typeof InlineDatabaseViewManagerPopover>> = {},
) {
  const onChange = mock((_change: DatabaseViewLifecycleChange) => {});
  const onDefaultViewChange = mock((_viewId?: string) => {});
  const onSelectView = mock((_viewId: string) => {});
  const onOpenChange = mock((_open: boolean) => {});
  const rendered = render(
    <StrictMode>
      <InlineDatabaseViewManagerPopover
        open
        onOpenChange={onOpenChange}
        source={source}
        views={views}
        activeViewId="view_open"
        busy={false}
        onSelectView={onSelectView}
        onChange={onChange}
        onDefaultViewChange={onDefaultViewChange}
        {...overrides}
      />
    </StrictMode>,
  );
  return { onChange, onDefaultViewChange, onSelectView, onOpenChange, rerender: rendered.rerender };
}

describe('InlineDatabaseViewManagerPopover', () => {
  test('runs each lifecycle command once from the document-native manager', async () => {
    const callbacks = renderManager();
    const dialog = await screen.findByRole('dialog', { name: 'Manage saved views' });
    expect(dialog).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0] as HTMLElement);
    const rename = screen.getByRole('textbox', { name: 'Rename Open tasks' });
    fireEvent.change(rename, { target: { value: 'Renamed tasks' } });
    fireEvent.keyDown(rename, { key: 'Enter' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Favorite' })[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Move Open tasks down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear default' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1] as HTMLElement);

    await waitFor(() => expect(callbacks.onChange).toHaveBeenCalledTimes(5));
    expect(callbacks.onChange.mock.calls.map(([change]) => change.kind)).toEqual([
      'rename',
      'favorite',
      'reorder',
      'duplicate',
      'delete',
    ]);
    expect(callbacks.onDefaultViewChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onDefaultViewChange).toHaveBeenCalledWith();
  });

  test('consumes an initial action once across StrictMode and refresh-shaped rerenders', async () => {
    const callbacks = renderManager({
      initialAction: { kind: 'favorite', viewId: 'view_open', favorite: true },
    });
    await waitFor(() => expect(callbacks.onChange).toHaveBeenCalledTimes(1));

    // A catalog refresh creates new view-array identities. The action ID must
    // remain consumed rather than replaying the mutation.
    const refreshedViews = views.map((view) => ({ ...view }));
    // The test intentionally rerenders through the public open/initialAction
    // contract instead of reaching into local state.
    callbacks.rerender(
      <StrictMode>
        <InlineDatabaseViewManagerPopover
          open
          onOpenChange={callbacks.onOpenChange}
          source={source}
          views={refreshedViews}
          activeViewId="view_open"
          busy={false}
          initialAction={{ kind: 'favorite', viewId: 'view_open', favorite: true }}
          onSelectView={callbacks.onSelectView}
          onChange={callbacks.onChange}
          onDefaultViewChange={callbacks.onDefaultViewChange}
        />
      </StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callbacks.onChange).toHaveBeenCalledTimes(1);
  });

  test('restores trigger ownership when the manager closes', async () => {
    const callbacks = renderManager();
    const close = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(close);
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
