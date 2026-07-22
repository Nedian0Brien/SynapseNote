import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseViewTabMenu } from './DatabaseViewTabMenu';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  defaultViewId: 'view_active',
  properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
};

const view: DatabaseView = {
  id: 'view_active',
  key: 'active',
  name: 'Active',
  sourceId: source.id,
  layout: { type: 'table', configuration: {} },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title'], body: 'hidden' },
};

afterEach(cleanup);

describe('DatabaseViewTabMenu', () => {
  test('exposes the full active-view lifecycle menu with safe default deletion', async () => {
    const user = userEvent.setup();
    const onAction = mock(() => {});
    render(
      <DatabaseViewTabMenu
        source={source}
        view={view}
        index={0}
        count={2}
        busy={false}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View options for Active' }));

    for (const label of [
      'Filters',
      'View settings',
      'Rename',
      'Duplicate',
      'Favorite',
      'Move right',
      'Clear default',
      'Cannot delete default',
      'Manage views',
    ]) {
      expect(screen.getByRole('menuitem', { name: label })).not.toBeNull();
    }
    expect(
      screen.getByRole('menuitem', { name: 'Move left' }).getAttribute('data-disabled'),
    ).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Cannot delete default' }).getAttribute('data-disabled'),
    ).not.toBeNull();

    await user.click(screen.getByRole('menuitem', { name: 'Favorite' }));
    expect(onAction).toHaveBeenCalledWith('favorite');
  });

  test('routes safe non-default actions and honors busy state', async () => {
    const user = userEvent.setup();
    const onAction = mock(() => {});
    const nonDefaultView = { ...view, id: 'view_other', name: 'Other' };
    render(
      <DatabaseViewTabMenu
        source={{ ...source, defaultViewId: undefined }}
        view={nonDefaultView}
        index={1}
        count={2}
        busy
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View options for Other' }));
    expect(screen.getByRole('menuitem', { name: 'Make default' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Move left' }).getAttribute('data-disabled'),
    ).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Move right' }).getAttribute('data-disabled'),
    ).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Delete' }).getAttribute('data-disabled'),
    ).not.toBeNull();
  });

  test('disables deletion when the active source would lose its last view', async () => {
    const user = userEvent.setup();
    render(
      <DatabaseViewTabMenu
        source={{ ...source, defaultViewId: undefined }}
        view={{ ...view, id: 'view_only', name: 'Only view' }}
        index={0}
        count={1}
        busy={false}
        onAction={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View options for Only view' }));
    const deleteItem = screen.getByRole('menuitem', { name: 'Cannot delete last view' });
    expect(deleteItem.getAttribute('data-disabled')).not.toBeNull();
  });
});
