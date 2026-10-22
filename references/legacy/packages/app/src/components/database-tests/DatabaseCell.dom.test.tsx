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
      '[data-database-cell-row="0"][data-property-id="prop_status"]',
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
      '[data-database-cell-row="0"][data-property-id="prop_status"]',
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
            records: [{ ...fixture.record, values: { prop_title: 'First task' } }],
          } as never
        }
        notionSurface
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit Status for page First task: empty'));
    expect(screen.getByRole('combobox', { name: 'Edit Status' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Active' }));
    expect(edits).toEqual(['opt_active']);
  });

  test('renders a number editor as the inline cell surface instead of a nested field', () => {
    const fixture = createDatabaseTestFixture();
    const numberProperty = {
      id: 'prop_estimate',
      key: 'estimate',
      name: 'Estimate',
      type: 'number' as const,
    };
    render(
      <div contentEditable suppressContentEditableWarning>
        <DatabaseTable
          source={
            {
              ...fixture.source,
              properties: [...fixture.source.properties, numberProperty],
            } as never
          }
          result={
            {
              ...fixture.result,
              records: [
                {
                  ...fixture.record,
                  values: { ...fixture.record.values, prop_estimate: 123 },
                },
              ],
            } as never
          }
          notionSurface
          onEdit={() => {}}
        />
      </div>,
    );
    const numberCell = document.querySelector<HTMLElement>(
      '[data-database-cell-row="0"][data-property-id="prop_estimate"]',
    );
    if (!numberCell) throw new Error('number cell was not rendered');

    fireEvent.click(numberCell);

    const editor = screen.getByRole('spinbutton', { name: 'Edit Estimate' });
    expect(numberCell.getAttribute('data-database-cell-editing')).toBe('true');
    expect(editor.getAttribute('data-database-cell-editor-control')).toBe('true');
    expect(editor.className).toContain('rounded-none');
    expect(editor.className).toContain('border-0');
    expect(editor.className).toContain('focus-visible:ring-0');
    expect(screen.getByLabelText('Save cell edit').className).toContain('sr-only');
    expect(screen.getByLabelText('Cancel cell edit').className).toContain('sr-only');
  });
});
