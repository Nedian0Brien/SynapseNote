import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseTimeline } from './DatabaseTimeline';

const hash = `sha256:${'a'.repeat(64)}`;
const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt_work', key: 'work', name: 'Work' }],
    },
    {
      id: 'prop_dependencies',
      key: 'dependencies',
      name: 'Dependencies',
      type: 'relation',
      targetSourceId: 'ds_tasks',
      cardinality: 'many',
    },
  ],
};
const view: DatabaseView = {
  id: 'view_timeline',
  key: 'timeline',
  name: 'Delivery timeline',
  sourceId: source.id,
  layout: {
    type: 'timeline',
    configuration: {
      dateMapping: { type: 'range', propertyId: 'prop_schedule' },
      scale: 'day',
      showTable: true,
      showToday: true,
      showDependencies: true,
      dependencyPropertyId: 'prop_dependencies',
      noDateLane: true,
      loadLimit: 100,
    },
  },
  sort: [],
  groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: false }],
  projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' },
};
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
      id: 'rec_plan',
      path: 'tasks/plan.md',
      revision: hash,
      values: {
        prop_title: 'Plan',
        prop_schedule: { start: '2026-07-20', end: '2026-07-22' },
        prop_status: 'opt_work',
        prop_dependencies: [],
      },
    },
    {
      id: 'rec_ship',
      path: 'tasks/ship.md',
      revision: hash,
      values: {
        prop_title: 'Ship',
        prop_schedule: { start: '2026-07-23', end: '2026-07-25' },
        prop_status: 'opt_work',
        prop_dependencies: ['rec_plan'],
      },
    },
    {
      id: 'rec_unscheduled',
      path: 'tasks/later.md',
      revision: hash,
      values: { prop_title: 'Later', prop_status: 'opt_work' },
    },
  ],
  aggregation: null,
  groupMemberships: {
    rec_plan: [[{ propertyId: 'prop_status', value: 'opt_work' }]],
    rec_ship: [[{ propertyId: 'prop_status', value: 'opt_work' }]],
    rec_unscheduled: [[{ propertyId: 'prop_status', value: 'opt_work' }]],
  },
  conditionalColors: {
    rules: [
      {
        id: 'ccr_ship',
        key: 'ship',
        name: 'Ship',
        color: 'green',
        applyTo: { type: 'page' },
      },
    ],
    records: { rec_ship: { pageRuleId: 'ccr_ship' } },
  },
};

afterEach(cleanup);

describe('DatabaseTimeline', () => {
  test('renders groups, ranges, dependencies, today, and the no-date lane', () => {
    render(<DatabaseTimeline source={source} view={view} result={result} />);
    expect(screen.getByRole('region', { name: 'Work' })).toBeTruthy();
    expect(document.querySelector('[data-timeline-bar="rec_plan"]')).toBeTruthy();
    expect(document.querySelector('[data-timeline-dependency="rec_plan:rec_ship"]')).toBeTruthy();
    expect(
      document
        .querySelector('[data-timeline-bar="rec_ship"]')
        ?.getAttribute('data-conditional-color'),
    ).toBe('green');
    expect(document.querySelector('[data-timeline-today]')).toBeTruthy();
    expect(document.querySelector('[data-timeline-no-date]')?.textContent).toContain('Later');
  });

  test('compiles keyboard, resize, drag, and no-date scheduling into typed changes', () => {
    const onChange = mock(() => {});
    render(<DatabaseTimeline source={source} view={view} result={result} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move rec_plan later' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ id: 'rec_plan' }),
        changes: [
          expect.objectContaining({
            property: expect.objectContaining({ id: 'prop_schedule' }),
            value: { start: '2026-07-21', end: '2026-07-23' },
          }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resize end for rec_plan' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        changes: [expect.objectContaining({ value: { start: '2026-07-20', end: '2026-07-23' } })],
      }),
    );

    const bar = document.querySelector('[data-timeline-bar="rec_plan"]');
    const target = screen.getByRole('button', {
      name: 'Move dragged timeline item to 2026-07-25T00:00:00.000Z',
    });
    if (!bar) throw new Error('Timeline bar is missing');
    fireEvent.dragStart(bar);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        changes: [expect.objectContaining({ value: { start: '2026-07-25', end: '2026-07-27' } })],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Schedule today' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ id: 'rec_unscheduled' }),
        changes: [expect.objectContaining({ value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })],
      }),
    );
  });

  test('moves separate start and end Date properties in one change', () => {
    const separateSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_start', key: 'start', name: 'Start', type: 'date' },
        { id: 'prop_end', key: 'end', name: 'End', type: 'date' },
      ],
    };
    const separateView: DatabaseView = {
      ...view,
      groups: [],
      layout: {
        type: 'timeline',
        configuration: {
          ...view.layout.configuration,
          dateMapping: {
            type: 'separate',
            startPropertyId: 'prop_start',
            endPropertyId: 'prop_end',
          },
        },
      },
    };
    const plan = result.records[0];
    if (!plan) throw new Error('Timeline fixture record is missing');
    const separateResult: DatabaseQueryResult = {
      ...result,
      matched: 1,
      returned: 1,
      records: [
        {
          ...plan,
          values: { prop_title: 'Plan', prop_start: '2026-07-20', prop_end: '2026-07-22' },
        },
      ],
      groupMemberships: undefined,
    };
    const onChange = mock(() => {});
    render(
      <DatabaseTimeline
        source={separateSource}
        view={separateView}
        result={separateResult}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move rec_plan later' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            property: expect.objectContaining({ id: 'prop_start' }),
            value: '2026-07-21',
          }),
          expect.objectContaining({
            property: expect.objectContaining({ id: 'prop_end' }),
            value: '2026-07-23',
          }),
        ],
      }),
    );
  });
});
