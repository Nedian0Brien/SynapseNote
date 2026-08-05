import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseTable } from './DatabaseTableDialog';

const revision = `sha256:${'e'.repeat(64)}`;
const baseProperties = [
  { id: 'title', key: 'title', name: 'Title', type: 'title' as const },
  {
    id: 'status',
    key: 'status',
    name: 'Status',
    type: 'select' as const,
    options: [{ id: 'active', key: 'active', name: 'Active' }],
  },
  {
    id: 'tags',
    key: 'tags',
    name: 'Tags',
    type: 'multi_select' as const,
    options: [{ id: 'bug', key: 'bug', name: 'Bug' }],
  },
  { id: 'notes', key: 'notes', name: 'Notes', type: 'text' as const },
  { id: 'score', key: 'score', name: 'Score', type: 'number' as const },
  { id: 'due', key: 'due', name: 'Due', type: 'date' as const },
  { id: 'done', key: 'done', name: 'Done', type: 'checkbox' as const },
];

const source = {
  id: 'source_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: baseProperties,
};

function result(values: Record<string, unknown> = {}) {
  return {
    sourceId: source.id,
    snapshotRevision: revision,
    matched: 1,
    returned: 1,
    isComplete: true,
    nextCursor: null,
    truncatedBy: null,
    indexFreshness: 'snapshot',
    records: [
      {
        id: 'record_first',
        path: 'tasks/first.md',
        revision,
        values: { title: 'First task', ...values },
      },
    ],
    aggregation: null,
  };
}

afterEach(cleanup);

describe('database empty-cell editor matrix', () => {
  test('renders empty property values as blank click targets instead of em dashes', () => {
    const view = render(
      <DatabaseTable
        source={source as never}
        result={result() as never}
        notionSurface
        onEdit={() => {}}
      />,
    );

    for (const label of [
      'Edit Status for page First task: empty',
      'Edit Tags for page First task: empty',
      'Edit Notes for page First task',
      'Edit Score for page First task',
      'Edit Due for page First task',
    ]) {
      const target = screen.getByLabelText(label);
      expect(target.textContent).not.toContain('—');
      expect(target.querySelector('[data-database-empty-cell]')).toBeTruthy();
    }
    expect(view.container.textContent).not.toContain('—');
  });

  test('keeps the saved value visible while the parent optimistic update catches up', () => {
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={source as never}
        result={result({ notes: 'Old note' }) as never}
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit Notes for page First task'));
    fireEvent.change(screen.getByLabelText('Edit Notes'), { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const savedCell = screen.getByLabelText('Edit Notes for page First task');
    expect(savedCell.textContent).toContain('New note');
    expect(savedCell.textContent).not.toContain('Old note');
    expect(edits).toEqual(['New note']);
  });

  test('dismisses an unchanged Select picker without emitting an edit', async () => {
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={source as never}
        result={result({ status: 'active' }) as never}
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit Status for page First task: Active'));
    expect(screen.getByRole('combobox', { name: 'Edit Status' })).toBeTruthy();
    await userEvent.click(document.body);

    expect(edits).toEqual([]);
    expect(screen.queryByRole('combobox', { name: 'Edit Status' })).toBeNull();
  });

  test('opens, saves, and reopens empty text and number cells', () => {
    const edits: unknown[] = [];
    const view = render(
      <DatabaseTable
        source={source as never}
        result={result() as never}
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit Notes for page First task'));
    fireEvent.change(screen.getByLabelText('Edit Notes'), { target: { value: 'Draft note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    fireEvent.click(screen.getByLabelText('Edit Score for page First task'));
    fireEvent.change(screen.getByLabelText('Edit Score'), { target: { value: '42' } });
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(edits).toEqual(['Draft note', 42]);

    view.rerender(
      <DatabaseTable
        source={source as never}
        result={result({ notes: 'Draft note', score: 42 }) as never}
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByLabelText('Edit Notes for page First task').textContent).toContain(
      'Draft note',
    );
    expect(screen.getByLabelText('Edit Score for page First task').textContent).toContain('42');
  });

  test('opens, saves, and reopens empty date, select, multi-select, and checkbox cells', async () => {
    const edits: unknown[] = [];
    const view = render(
      <DatabaseTable
        source={source as never}
        result={result() as never}
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit Due for page First task'));
    fireEvent.click(screen.getByLabelText('Include time for Due'));
    fireEvent.change(screen.getByLabelText('Start Due'), {
      target: { value: '2026-07-26T09:00' },
    });
    fireEvent.click(screen.getByLabelText('Save cell edit'));

    fireEvent.click(screen.getByLabelText('Edit Status for page First task: empty'));
    fireEvent.click(screen.getByRole('option', { name: 'Active' }));

    fireEvent.click(screen.getByLabelText('Edit Tags for page First task: empty'));
    fireEvent.click(screen.getByRole('option', { name: 'Bug' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit Tags' }), { key: 'Tab' });

    fireEvent.click(screen.getByLabelText('Toggle Done for page First task'));

    expect(edits[0]).toMatchObject({ start: expect.stringContaining('2026-07-26') });
    expect(edits.slice(1)).toEqual(['active', ['bug'], true]);

    view.rerender(
      <DatabaseTable
        source={source as never}
        result={
          result({
            due: edits[0],
            status: 'active',
            tags: ['bug'],
            done: true,
          }) as never
        }
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByLabelText('Edit Due for page First task').textContent).not.toContain('—');
    expect(screen.getByLabelText('Edit Status for page First task: Active').textContent).toContain(
      'Active',
    );
    expect(screen.getByLabelText('Edit Tags for page First task: Bug').textContent).toContain(
      'Bug',
    );
    expect(
      screen.getByLabelText('Toggle Done for page First task').getAttribute('aria-checked'),
    ).toBe('true');
  });

  test('creates and assigns a typed Multi-select option through the table mutation callback', () => {
    const creations: unknown[] = [];
    render(
      <DatabaseTable
        source={source as never}
        result={result() as never}
        notionSurface
        onEdit={() => {}}
        onCreateSelectOption={(record, property, name, selectedOptionIds) => {
          creations.push([record.id, property.id, name, selectedOptionIds]);
          return true;
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit Tags for page First task: empty'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Edit Tags' }), {
      target: { value: 'Blocked' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Create Blocked' }));

    expect(creations).toEqual([['record_first', 'tags', 'Blocked', []]]);
    expect(screen.queryByRole('dialog', { name: 'Edit Tags' })).toBeNull();
  });
});
