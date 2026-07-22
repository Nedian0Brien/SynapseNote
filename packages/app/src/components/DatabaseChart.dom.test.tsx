import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseChart } from './DatabaseChart';

const hash = `sha256:${'b'.repeat(64)}`;
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
      ],
    },
  ],
};
const view: DatabaseView = {
  id: 'view_chart',
  key: 'chart',
  name: 'Task chart',
  sourceId: source.id,
  layout: {
    type: 'chart',
    configuration: {
      chartType: 'vertical_bar',
      dimension: { propertyId: 'prop_status', arrayMode: 'each' },
      measure: { type: 'count' },
      showLegend: true,
      showLabels: true,
      showAxisNames: true,
      groupLimit: 200,
      loadLimit: 500,
    },
  },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' },
};
const todoKey = [{ propertyId: 'prop_status', value: 'opt_todo' as const }];
const doneKey = [{ propertyId: 'prop_status', value: 'opt_done' as const }];
const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: hash,
  matched: 3,
  returned: 3,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records: [
    {
      id: 'rec_a',
      path: 'tasks/a.md',
      revision: hash,
      values: { prop_title: 'A', prop_status: 'opt_todo' },
    },
    {
      id: 'rec_b',
      path: 'tasks/b.md',
      revision: hash,
      values: { prop_title: 'B', prop_status: 'opt_todo' },
    },
    {
      id: 'rec_c',
      path: 'tasks/c.md',
      revision: hash,
      values: { prop_title: 'C', prop_status: 'opt_done' },
    },
  ],
  aggregation: {
    matched: 3,
    groupBy: [
      {
        propertyId: 'prop_status',
        direction: 'asc',
        arrayMode: 'each',
        includeEmpty: true,
      },
    ],
    calculations: [
      { id: 'chart_measure', function: 'count_all', propertyId: null, value: 3, unit: 'count' },
    ],
    totalGroups: 2,
    returnedGroups: 2,
    groupsComplete: true,
    truncatedBy: null,
    groups: [
      {
        level: 1,
        key: todoKey,
        matched: 2,
        calculations: [
          { id: 'chart_measure', function: 'count_all', propertyId: null, value: 2, unit: 'count' },
        ],
      },
      {
        level: 1,
        key: doneKey,
        matched: 1,
        calculations: [
          { id: 'chart_measure', function: 'count_all', propertyId: null, value: 1, unit: 'count' },
        ],
      },
    ],
  },
  groupMemberships: { rec_a: [todoKey], rec_b: [todoKey], rec_c: [doneKey] },
};

afterEach(cleanup);

describe('DatabaseChart', () => {
  test('renders labeled aggregate values and opens a bounded table drill-through', () => {
    const onOpen = mock(() => {});
    render(<DatabaseChart source={source} view={view} result={result} onOpen={onOpen} />);
    const chart = screen.getByRole('img', { name: 'Database chart' });
    expect(chart.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(chart.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Todo, Records: 2');
    expect(screen.getByText('Status')).toBeTruthy();
    const todoBar = screen.getByRole('button', { name: 'Todo, Records: 2' });
    fireEvent.click(todoBar);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Todo · 2 matched')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /A.*Open record/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_a' }));
  });

  test('renders an explicit empty state', () => {
    const aggregation = result.aggregation;
    if (!aggregation) throw new Error('Chart aggregation fixture is missing');
    render(
      <DatabaseChart
        source={source}
        view={view}
        result={{
          ...result,
          matched: 0,
          returned: 0,
          records: [],
          aggregation: { ...aggregation, matched: 0, groups: [] },
        }}
      />,
    );
    expect(screen.getByText('No data matches this Chart view.')).toBeTruthy();
  });

  test('offers record context inspection from chart drill-through', () => {
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseChart
        source={source}
        view={view}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Todo, Records: 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect context for record rec_a' }));
    expect(onOpenContextInspector).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_a' }));
  });
});
