import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseViewQuerySummary, databaseFilterRuleCount } from './DatabaseViewQuerySummary';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
    { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
  ],
};

const view: DatabaseView = {
  id: 'view_active',
  key: 'active',
  name: 'Active',
  sourceId: source.id,
  layout: { type: 'table', configuration: {} },
  where: {
    and: [
      { propertyId: 'prop_status', operator: 'eq', value: 'In progress' },
      {
        or: [
          { propertyId: 'prop_score', operator: 'gte', value: 10 },
          { not: { propertyId: 'prop_title', operator: 'is_empty' } },
        ],
      },
    ],
  },
  sort: [
    { propertyId: 'prop_score', direction: 'desc' },
    { propertyId: 'prop_status', direction: 'asc' },
  ],
  groups: [],
  projection: { propertyIds: ['prop_title', 'prop_status', 'prop_score'], body: 'preview' },
};

afterEach(cleanup);

describe('DatabaseViewQuerySummary', () => {
  test('shows compact filter and sort explainers and routes them to the reviewed surfaces', () => {
    const onOpenFilters = mock(() => {});
    const onOpenSorts = mock(() => {});
    render(
      <DatabaseViewQuerySummary
        source={source}
        view={view}
        onOpenFilters={onOpenFilters}
        onOpenSorts={onOpenSorts}
      />,
    );

    expect(
      screen.getByTestId('database-query-summary').getAttribute('data-database-query-filter-count'),
    ).toBe('3');
    expect(
      screen.getByTestId('database-query-summary').getAttribute('data-database-query-sort-count'),
    ).toBe('2');
    expect(screen.getByRole('button', { name: /Filters: Status is In progress/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sort by Score descending' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sort by Status ascending' })).toBeTruthy();
    expect(databaseFilterRuleCount(view.where as NonNullable<DatabaseView['where']>)).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: /Filters: Status is In progress/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Score descending' }));
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
    expect(onOpenSorts).toHaveBeenCalledTimes(1);
  });

  test('does not add chrome when a view has no active filters or sorts', () => {
    const emptyView: DatabaseView = {
      ...view,
      where: undefined,
      sort: [],
    };
    const { container } = render(
      <DatabaseViewQuerySummary
        source={source}
        view={emptyView}
        onOpenFilters={() => {}}
        onOpenSorts={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
