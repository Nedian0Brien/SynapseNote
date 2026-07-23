import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseViewManagerDialog } from './DatabaseViewManagerDialog';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  defaultViewId: 'view_open',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  ],
};

const views: DatabaseView[] = [
  {
    id: 'view_open',
    key: 'open',
    name: 'Open',
    sourceId: source.id,
    layout: { type: 'table', configuration: {} },
    sort: [],
    groups: [],
    projection: { propertyIds: ['prop_title'], body: 'hidden' },
  },
  {
    id: 'view_recent',
    key: 'recent',
    name: 'Recent',
    sourceId: source.id,
    layout: { type: 'table', configuration: { rowHeight: 'compact' } },
    sort: [{ propertyId: 'prop_status', direction: 'asc' }],
    groups: [],
    projection: { propertyIds: ['prop_title', 'prop_status'], body: 'preview' },
  },
];

afterEach(cleanup);

describe('DatabaseViewManagerDialog', () => {
  test('creates a chronological Feed from stable metadata properties', async () => {
    const onChange = mock(() => {});
    const feedSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_edited', key: 'edited', name: 'Edited', type: 'last_edited_time' },
        { id: 'prop_editor', key: 'editor', name: 'Editor', type: 'last_edited_by' },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={feedSource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Updates' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Feed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: 'create',
      view: {
        layout: {
          type: 'feed',
          configuration: {
            chronologyPropertyId: 'prop_edited',
            authorPropertyId: 'prop_editor',
            loadLimit: 50,
          },
        },
        sort: [{ propertyId: 'prop_edited', direction: 'desc' }],
      },
    });
  });

  test('creates a bounded Dashboard from an ordinary saved view', async () => {
    const onChange = mock(() => {});
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={views}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Overview' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'dashboard',
            configuration: expect.objectContaining({
              rows: [
                expect.objectContaining({
                  widgets: expect.arrayContaining([
                    expect.objectContaining({ viewId: 'view_open', width: 2 }),
                  ]),
                }),
              ],
            }),
          }),
        }),
      }),
    );
  });

  test('creates a private bounded Map from the canonical Place property', async () => {
    const onChange = mock(() => {});
    const mapSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_place', key: 'place', name: 'Place', type: 'place' },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={mapSource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Locations' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'map',
            configuration: expect.objectContaining({
              placePropertyId: 'prop_place',
              basemap: 'local',
              loadLimit: 100,
            }),
          }),
        }),
      }),
    );
  });

  test('creates a typed internal Form with stable property questions', async () => {
    const onChange = mock(() => {});
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Intake' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Form' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: {
            type: 'form',
            configuration: expect.objectContaining({
              access: 'internal',
              title: 'Intake',
              questions: expect.arrayContaining([
                expect.objectContaining({ propertyId: 'prop_title', required: true }),
              ]),
            }),
          },
        }),
      }),
    );
  });

  test('creates a Chart with the canonical categorical dimension', async () => {
    const onChange = mock(() => {});
    const chartSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_priority',
          key: 'priority',
          name: 'Priority',
          type: 'select',
          options: [{ id: 'opt_high', key: 'high', name: 'High' }],
        },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={chartSource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Overview' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'chart',
            configuration: expect.objectContaining({
              dimension: { propertyId: 'prop_priority', arrayMode: 'each' },
              measure: { type: 'count' },
            }),
          }),
        }),
      }),
    );
  });

  test('creates a Gallery with the canonical Files preview', async () => {
    const onChange = mock(() => {});
    const gallerySource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_media', key: 'media', name: 'Media', type: 'files' },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={gallerySource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Assets' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Gallery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'gallery',
            configuration: expect.objectContaining({
              cardPreview: { type: 'files', propertyId: 'prop_media' },
            }),
          }),
        }),
      }),
    );
  });

  test('creates a compact List layout', async () => {
    const onChange = mock(() => {});
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Notes' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'list',
            configuration: expect.objectContaining({ density: 'compact' }),
          }),
        }),
      }),
    );
  });

  test('creates a Calendar layout with the canonical Date mapping', async () => {
    const onChange = mock(() => {});
    const calendarSource: DatabaseSource = {
      ...source,
      defaultViewId: undefined,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={calendarSource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Calendar' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'calendar',
            configuration: expect.objectContaining({ datePropertyId: 'prop_schedule' }),
          }),
        }),
      }),
    );
  });

  test('creates a Timeline layout with the canonical Date mapping', async () => {
    const onChange = mock(() => {});
    const timelineSource: DatabaseSource = {
      ...source,
      defaultViewId: undefined,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={timelineSource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Schedule' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Timeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({
            type: 'timeline',
            configuration: expect.objectContaining({
              dateMapping: { type: 'range', propertyId: 'prop_schedule' },
            }),
          }),
        }),
      }),
    );
  });

  test('creates a Board layout with a canonical default group', async () => {
    const onChange = mock(() => {});
    const boardSource: DatabaseSource = {
      ...source,
      defaultViewId: undefined,
      properties: [
        source.properties[0] as DatabaseSource['properties'][number],
        {
          id: 'prop_workflow',
          key: 'workflow',
          name: 'Workflow',
          type: 'select',
          options: [{ id: 'opt_todo', key: 'todo', name: 'Todo' }],
        },
      ],
    };
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={boardSource}
        views={[]}
        busy={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'Workflow board' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'New saved view layout' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Board' }));
    expect(screen.getByTestId('new-view-layout-suggestion').textContent).toContain('Workflow');
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        view: expect.objectContaining({
          layout: expect.objectContaining({ type: 'board' }),
          groups: [expect.objectContaining({ propertyId: 'prop_workflow' })],
        }),
      }),
    );
  });

  test('emits stable reviewed create, rename, favorite, duplicate, reorder, and delete changes', () => {
    const onChange = mock(() => {});
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={views}
        busy={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'New saved view name' }), {
      target: { value: 'My view' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review create' }));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: 'create',
      view: {
        id: expect.stringMatching(/^view_[a-f0-9]+$/),
        key: 'my-view',
        name: 'My view',
        projection: { propertyIds: ['prop_title', 'prop_status'] },
      },
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Name for Recent' }), {
      target: { value: 'Newest' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review rename Recent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Recent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Recent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Recent up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Recent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Recent' }));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'rename',
      viewId: 'view_recent',
      name: 'Newest',
    });
    expect(onChange).toHaveBeenCalledWith({
      kind: 'favorite',
      viewId: 'view_recent',
      favorite: true,
    });
    expect(onChange.mock.calls.some(([change]) => change.kind === 'duplicate')).toBe(true);
    expect(onChange).toHaveBeenCalledWith({
      kind: 'reorder',
      viewId: 'view_recent',
      direction: -1,
    });
    expect(onChange).toHaveBeenCalledWith({ kind: 'delete', viewId: 'view_recent' });
    expect(
      screen
        .getByRole('button', { name: 'Cannot delete default view Open' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  test('disables deletion when the source has only one saved view', () => {
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={{ ...source, defaultViewId: undefined }}
        views={[views[0] as DatabaseView]}
        busy={false}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Cannot delete last view Open' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  test('starts a reviewed duplicate when an inline block requests the current view copy', async () => {
    const onChange = mock(() => {});
    const rendered = render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={views}
        busy={false}
        initialAction={{ kind: 'duplicate', viewId: 'view_open' }}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: 'duplicate',
      view: {
        sourceId: source.id,
        layout: views[0]?.layout,
        projection: views[0]?.projection,
      },
    });
    expect((onChange.mock.calls[0]?.[0] as { view: DatabaseView }).view.id).not.toBe('view_open');

    const duplicate = (onChange.mock.calls[0]?.[0] as { view: DatabaseView }).view;
    rendered.rerender(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={[...views, duplicate]}
        busy={false}
        initialAction={{ kind: 'duplicate', viewId: 'view_open' }}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  test('starts reviewed favorite, reorder, and delete changes from inline tab actions', async () => {
    const actions = [
      {
        initialAction: { kind: 'favorite' as const, viewId: 'view_recent', favorite: true },
        expected: { kind: 'favorite', viewId: 'view_recent', favorite: true },
      },
      {
        initialAction: { kind: 'reorder' as const, viewId: 'view_recent', direction: -1 as const },
        expected: { kind: 'reorder', viewId: 'view_recent', direction: -1 },
      },
      {
        initialAction: { kind: 'delete' as const, viewId: 'view_recent' },
        expected: { kind: 'delete', viewId: 'view_recent' },
      },
    ];

    for (const action of actions) {
      const onChange = mock(() => {});
      render(
        <DatabaseViewManagerDialog
          open
          onOpenChange={() => {}}
          source={source}
          views={views}
          busy={false}
          initialAction={action.initialAction}
          onChange={onChange}
        />,
      );
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
      expect(onChange.mock.calls[0]?.[0]).toEqual(action.expected);
      cleanup();
    }
  });

  test('does not treat an inline rename handoff as a lifecycle mutation', async () => {
    const onChange = mock(() => {});
    render(
      <DatabaseViewManagerDialog
        open
        onOpenChange={() => {}}
        source={source}
        views={views}
        busy={false}
        initialAction={{ kind: 'rename', viewId: 'view_recent' }}
        onChange={onChange}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();
  });
});
