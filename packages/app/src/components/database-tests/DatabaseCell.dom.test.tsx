import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseTable } from '@/components/DatabaseTableDialog';
import { createDatabaseTestFixture } from './database-test-fixture';

afterEach(cleanup);

describe('database focused cell suite', () => {
  test('opens the editor when the cell surface is clicked outside its value', () => {
    const fixture = createDatabaseTestFixture();
    render(
      <div contentEditable suppressContentEditableWarning>
        <DatabaseTable
          source={fixture.source as never}
          result={fixture.result as never}
          notionSurface
          onEdit={() => {}}
        />
      </div>,
    );
    const statusCell = document.querySelector<HTMLElement>(
      '[data-database-cell-row="0"][data-property-id="status"]',
    );
    if (!statusCell) throw new Error('status cell was not rendered');

    fireEvent.click(statusCell);

    expect(screen.getByRole('combobox', { name: 'Edit Status' })).toBeTruthy();
  });

  test('keeps shift-click reserved for extending the cell selection', () => {
    const fixture = createDatabaseTestFixture();
    render(
      <DatabaseTable
        source={fixture.source as never}
        result={fixture.result as never}
        notionSurface
        onEdit={() => {}}
      />,
    );
    const statusCell = document.querySelector<HTMLElement>(
      '[data-database-cell-row="0"][data-property-id="status"]',
    );
    if (!statusCell) throw new Error('status cell was not rendered');

    fireEvent.click(statusCell, { shiftKey: true });

    expect(screen.queryByRole('combobox', { name: 'Edit Status' })).toBeNull();
    expect(statusCell.getAttribute('data-database-cell-selected')).toBe('true');
  });

  test('opens an empty select editor from the document-native cell', () => {
    const fixture = createDatabaseTestFixture();
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={fixture.source as never}
        result={
          {
            ...fixture.result,
            records: [{ ...fixture.record, values: { title: 'First task' } }],
          } as never
        }
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit Status for page First task: empty'));
    expect(screen.getByRole('combobox', { name: 'Edit Status' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Active' }));
    expect(edits).toEqual(['active']);
  });
});
