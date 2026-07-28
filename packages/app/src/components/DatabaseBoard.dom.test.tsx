import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseBoard } from './DatabaseBoard';

afterEach(cleanup);

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'opt_todo', key: 'todo', name: 'Todo' },
        { id: 'opt_done', key: 'done', name: 'Done' },
        { id: 'opt_blocked', key: 'blocked', name: 'Blocked' },
      ],
    },
    {
      id: 'prop_area',
      key: 'area',
      name: 'Area',
      type: 'multi_select',
      options: [
        { id: 'opt_frontend', key: 'frontend', name: 'Frontend' },
        { id: 'opt_backend', key: 'backend', name: 'Backend' },
      ],
    },
    { id: 'prop_cover', key: 'cover', name: 'Cover', type: 'files' },
  ],
};

const view = {
  id: 'view_board',
  key: 'board',
  name: 'Board',
  sourceId: source.id,
  layout: {
    type: 'board' as const,
    configuration: {
      cardSize: 'medium' as const,
      cardPreview: { type: 'files' as const, propertyId: 'prop_cover' },
      fitImage: false,
      colorColumns: true,
      groupLimit: 20,
      cardLimitPerGroup: 1,
    },
  },
  conditionalColors: [],
  sort: [],
  groups: [
    { propertyId: 'prop_status', direction: 'asc' as const, hideEmpty: false },
    { propertyId: 'prop_area', direction: 'asc' as const, hideEmpty: false },
  ],
  projection: {
    propertyIds: ['prop_title', 'prop_status', 'prop_area', 'prop_cover'],
    body: 'hidden' as const,
  },
} satisfies DatabaseView;

const result = {
  sourceId: source.id,
  snapshotRevision: 'sha256:snapshot',
  matched: 2,
  returned: 2,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot' as const,
  records: [
    {
      id: 'rec_first',
      path: 'tasks/first.md',
      revision: 'sha256:first',
      values: {
        prop_title: 'First task',
        prop_status: 'opt_todo',
        prop_area: ['opt_frontend'],
        prop_cover: [{ kind: 'local' as const, path: 'assets/cover.png' }],
      },
    },
    {
      id: 'rec_second',
      path: 'tasks/second.md',
      revision: 'sha256:second',
      values: {
        prop_title: 'Second task',
        prop_status: 'opt_todo',
        prop_area: ['opt_frontend'],
      },
    },
  ],
  aggregation: {
    matched: 2,
    groupBy: [
      {
        propertyId: 'prop_status',
        direction: 'asc' as const,
        arrayMode: 'each' as const,
        includeEmpty: true,
      },
      {
        propertyId: 'prop_area',
        direction: 'asc' as const,
        arrayMode: 'each' as const,
        includeEmpty: true,
      },
    ],
    calculations: [],
    totalGroups: 2,
    returnedGroups: 2,
    groupsComplete: true,
    truncatedBy: null,
    groups: [
      {
        level: 1 as const,
        key: [{ propertyId: 'prop_status', value: 'opt_todo' }],
        matched: 2,
        calculations: [],
      },
      {
        level: 2 as const,
        key: [
          { propertyId: 'prop_status', value: 'opt_todo' },
          { propertyId: 'prop_area', value: 'opt_frontend' },
        ],
        matched: 2,
        calculations: [],
      },
    ],
  },
  groupMemberships: {
    rec_first: [
      [
        { propertyId: 'prop_status', value: 'opt_todo' },
        { propertyId: 'prop_area', value: 'opt_frontend' },
      ],
    ],
    rec_second: [
      [
        { propertyId: 'prop_status', value: 'opt_todo' },
        { propertyId: 'prop_area', value: 'opt_frontend' },
      ],
    ],
  },
  conditionalColors: {
    rules: [
      {
        id: 'ccr_first',
        key: 'first',
        name: 'First',
        color: 'red' as const,
        applyTo: { type: 'page' as const },
      },
    ],
    records: { rec_first: { pageRuleId: 'ccr_first' } },
  },
};

describe('DatabaseBoard', () => {
  const boardElementByValue = (
    attribute: 'data-board-swimlane' | 'data-board-group',
    value: string,
  ) =>
    [...document.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(
      (element) => element.getAttribute(attribute) === JSON.stringify(value),
    );

  test('renders swimlanes, empty groups, projected card properties, covers, colors, and limits', () => {
    const onOpen = mock(() => {});
    render(<DatabaseBoard source={source} view={view} result={result} onOpen={onOpen} />);
    expect(screen.getByRole('region', { name: 'Board Board' })).toBeTruthy();
    expect(screen.getAllByRole('list', { name: 'Todo records' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'First task' })).toBeTruthy();
    expect(boardElementByValue('data-board-swimlane', 'opt_frontend')).toBeTruthy();
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('First task')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'First task' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_first' }));
    expect(screen.queryByText('Second task')).toBeNull();
    expect(screen.getByText('Showing 1 of 2')).toBeTruthy();
    expect(document.querySelector('img[src*="assets%2Fcover.png"]')).toBeTruthy();
    expect(
      document
        .querySelector('[data-board-card="rec_first"]')
        ?.getAttribute('data-conditional-color'),
    ).toBe('red');
    expect(
      document.querySelector('[data-board-card="rec_first"]')?.getAttribute('aria-posinset'),
    ).toBe('1');
  });

  test('offers keyboard and drag transitions as one typed multi-property change', async () => {
    const onTransition = mock(() => {});
    render(
      <DatabaseBoard
        source={source}
        view={{
          ...view,
          layout: {
            ...view.layout,
            configuration: { ...view.layout.configuration, cardLimitPerGroup: 10 },
          },
        }}
        result={result}
        onTransition={onTransition}
      />,
    );
    const groupSelector = screen.getAllByRole('combobox', {
      name: 'Move record First task to group',
    })[0];
    if (!groupSelector) throw new Error('Board group selector is missing');
    fireEvent.click(groupSelector);
    fireEvent.click(await screen.findByRole('option', { name: 'Done' }));
    expect(onTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ id: 'rec_first' }),
        changes: [
          expect.objectContaining({
            property: expect.objectContaining({ id: 'prop_status' }),
            value: 'opt_done',
          }),
        ],
      }),
    );
    // The live region announces the record title, not its id, so a screen
    // reader hears the page the user moved.
    expect(screen.getByRole('status').textContent).toContain(
      'Moved record First task to Status: Done',
    );

    onTransition.mockClear();
    const card = document.querySelector('[data-board-card="rec_first"]');
    const backendLane = boardElementByValue('data-board-swimlane', 'opt_backend');
    const doneColumn = [
      ...(backendLane?.querySelectorAll<HTMLElement>('[data-board-group]') ?? []),
    ].find((element) => element.getAttribute('data-board-group') === JSON.stringify('opt_done'));
    if (!card || !doneColumn) throw new Error('Board drag fixture is missing');
    fireEvent.dragStart(card);
    fireEvent.dragOver(doneColumn);
    fireEvent.drop(doneColumn);
    expect(onTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ property: expect.objectContaining({ id: 'prop_status' }) }),
          expect.objectContaining({ property: expect.objectContaining({ id: 'prop_area' }) }),
        ]),
      }),
    );
  });

  test('offers record context inspection from a board card', () => {
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseBoard
        source={source}
        view={view}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inspect context for record First task' }));
    expect(onOpenContextInspector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec_first' }),
    );
  });
});
