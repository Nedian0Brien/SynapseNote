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
    const onOpen = mock(() => {});
    render(<DatabaseTimeline source={source} view={view} result={result} onOpen={onOpen} />);
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
    const planTitle = document.querySelector<HTMLButtonElement>(
      '[data-record-title-link="rec_plan"]',
    );
    const laterTitle = document.querySelector<HTMLButtonElement>(
      '[data-record-title-link="rec_unscheduled"]',
    );
    if (!planTitle || !laterTitle) throw new Error('Timeline title links are missing');
    fireEvent.click(planTitle);
    fireEvent.click(laterTitle);
    expect(onOpen).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'rec_plan' }));
    expect(onOpen).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'rec_unscheduled' }));
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

  test('offers record context inspection from timeline table, bars, and no-date rows', () => {
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseTimeline
        source={source}
        view={view}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    const inspectButtons = screen.getAllByRole('button', {
      name: 'Inspect context for record rec_plan',
    });
    const inspectButton = inspectButtons[0];
    if (!inspectButton) throw new Error('Timeline context inspector control is missing');
    fireEvent.click(inspectButton);
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect context for record rec_unscheduled' }),
    );
    expect(onOpenContextInspector).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'rec_plan' }),
    );
    expect(onOpenContextInspector).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'rec_unscheduled' }),
    );

    const noTableView: DatabaseView = {
      ...view,
      layout: {
        ...view.layout,
        configuration: { ...view.layout.configuration, showTable: false },
      },
    };
    cleanup();
    render(
      <DatabaseTimeline
        source={source}
        view={noTableView}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inspect context for record rec_plan' }));
    expect(onOpenContextInspector).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'rec_plan' }),
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
