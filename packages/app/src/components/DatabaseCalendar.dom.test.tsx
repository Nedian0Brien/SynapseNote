import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseCalendar, moveDatabaseCalendarDateValue } from './DatabaseCalendar';

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
    { id: 'prop_note', key: 'note', name: 'Note', type: 'text' },
  ],
};

function shift(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function fixture(display: 'month' | 'week' = 'month') {
  const today = new Date().toISOString().slice(0, 10);
  const view: DatabaseView = {
    id: 'view_calendar',
    key: 'calendar',
    name: 'Delivery calendar',
    sourceId: source.id,
    layout: {
      type: 'calendar',
      configuration: {
        datePropertyId: 'prop_schedule',
        display,
        weekStartsOn: 'monday',
        timeZone: 'UTC',
        showWeekends: true,
        cardLimitPerDay: 10,
      },
    },
    sort: [],
    groups: [],
    projection: { propertyIds: ['prop_title', 'prop_note'], body: 'hidden' },
  };
  const result: DatabaseQueryResult = {
    sourceId: source.id,
    snapshotRevision: hash,
    matched: 2,
    returned: 2,
    isComplete: true,
    nextCursor: null,
    truncatedBy: null,
    indexFreshness: 'snapshot',
    records: [
      {
        id: 'rec_span',
        path: 'tasks/span.md',
        revision: hash,
        values: {
          prop_title: 'Multi-day launch',
          prop_schedule: { start: today, end: shift(today, 2) },
          prop_note: 'Projected detail',
        },
      },
      {
        id: 'rec_later',
        path: 'tasks/later.md',
        revision: hash,
        values: { prop_title: 'Later' },
      },
    ],
    aggregation: null,
    conditionalColors: {
      rules: [
        {
          id: 'ccr_launch',
          key: 'launch',
          name: 'Launch',
          color: 'green',
          applyTo: { type: 'page' },
        },
      ],
      records: { rec_span: { pageRuleId: 'ccr_launch' } },
    },
  };
  return { today, view, result };
}

afterEach(cleanup);

describe('DatabaseCalendar', () => {
  test('renders month and week grids, multi-day cards, projection, colors, and no-date status', () => {
    const month = fixture();
    const rendered = render(
      <DatabaseCalendar source={source} view={month.view} result={month.result} />,
    );
    expect(screen.getByRole('region', { name: 'Delivery calendar Calendar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeTruthy();
    expect(document.querySelectorAll('[data-calendar-day]').length).toBe(42);
    expect(document.querySelectorAll('[data-calendar-card="rec_span"]').length).toBe(3);
    expect(document.querySelector('[data-calendar-card="rec_span"]')?.textContent).toContain(
      'Projected detail',
    );
    expect(
      document
        .querySelector('[data-calendar-card="rec_span"]')
        ?.getAttribute('data-conditional-color'),
    ).toBe('green');
    expect(screen.getByRole('status').textContent).toContain('1 records have no Schedule date');

    const week = fixture('week');
    rendered.rerender(<DatabaseCalendar source={source} view={week.view} result={week.result} />);
    expect(document.querySelectorAll('[data-calendar-day]').length).toBe(7);
  });

  test('opens the canonical record from a calendar title', () => {
    const { view, result } = fixture();
    const onOpen = mock(() => {});
    render(<DatabaseCalendar source={source} view={view} result={result} onOpen={onOpen} />);
    const title = document.querySelector<HTMLButtonElement>('[data-record-title-link="rec_span"]');
    expect(title?.textContent).toBe('Multi-day launch');
    if (!title) throw new Error('Calendar title link is missing');
    fireEvent.click(title);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_span' }));
  });

  test('emits one atomic date change for drag rescheduling and range resizing', () => {
    const { today, view, result } = fixture();
    const onChange = mock(() => {});
    render(<DatabaseCalendar source={source} view={view} result={result} onChange={onChange} />);
    const card = document.querySelector('[data-calendar-card="rec_span"]');
    const target = document.querySelector(`[data-calendar-day="${shift(today, 5)}"]`);
    expect(card).toBeTruthy();
    expect(target).toBeTruthy();
    fireEvent.dragStart(card as Element);
    fireEvent.drop(target as Element);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ id: 'rec_span' }),
        changes: [
          expect.objectContaining({
            property: expect.objectContaining({ id: 'prop_schedule' }),
            value: { start: shift(today, 5), end: shift(today, 7) },
          }),
        ],
      }),
    );

    const resizeEnd = screen.getAllByRole('button', { name: 'Resize end for rec_span' })[0];
    if (!resizeEnd) throw new Error('Calendar end resize control is missing');
    fireEvent.click(resizeEnd);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        changes: [expect.objectContaining({ value: { start: today, end: shift(today, 3) } })],
      }),
    );
  });

  test('offers record context inspection from a calendar card', () => {
    const { view, result } = fixture();
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseCalendar
        source={source}
        view={view}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    const inspectButtons = screen.getAllByRole('button', {
      name: 'Inspect context for record rec_span',
    });
    const inspectButton = inspectButtons[0];
    if (!inspectButton) throw new Error('Calendar context inspector control is missing');
    fireEvent.click(inspectButton);
    expect(onOpenContextInspector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec_span' }),
    );
  });

  test('preserves timezone wall-clock time and duration across a DST boundary', () => {
    expect(
      moveDatabaseCalendarDateValue(
        {
          start: '2026-03-07T14:30:00.000Z',
          end: '2026-03-07T16:00:00.000Z',
          timeZone: 'America/New_York',
        },
        '2026-03-08',
        'America/New_York',
      ),
    ).toEqual({
      start: '2026-03-08T13:30:00.000Z',
      end: '2026-03-08T15:00:00.000Z',
      timeZone: 'America/New_York',
    });
  });
});
