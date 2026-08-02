import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import { DatabaseTable } from '@/components/DatabaseTableDialog';
import { requestOpenDatabaseRecord } from '@/lib/database-record-open-command';
import { createDatabaseTestFixture } from './database-test-fixture';

afterEach(cleanup);

describe('database pointer and keyboard suite', () => {
  test('opens a record with Enter on the same trigger used by pointer input', async () => {
    const fixture = createDatabaseTestFixture();
    const user = userEvent.setup();
    let outcome: ReturnType<typeof requestOpenDatabaseRecord> | undefined;
    render(
      <>
        <button
          type="button"
          onClick={(event) => {
            outcome = requestOpenDatabaseRecord({
              ...fixture,
              recordPaths: [fixture.record.path],
              origin: 'inline',
              notionSurface: true,
              trigger: event.currentTarget,
            });
          }}
        >
          Open
        </button>
        <DatabaseOverlayHost />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(outcome?.status).toBe('peek');
    expect(await screen.findByRole('button', { name: 'Open full page' })).toBeTruthy();
  });

  test('opens an empty cell editor with Enter and submits Add Property with Enter', async () => {
    const fixture = createDatabaseTestFixture();
    const edits: unknown[] = [];
    const properties: unknown[] = [];
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
        onEdit={(_record, property, value) => edits.push([property.id, value])}
        onAddProperty={(input) => properties.push(input)}
      />,
    );
    const cell = document.querySelector<HTMLElement>(
      '[data-database-cell-row="0"][data-property-id="prop_status"]',
    );
    if (!cell) throw new Error('status cell was not rendered');
    act(() => {
      cell.focus();
      fireEvent.keyDown(cell, { key: 'Enter' });
    });
    expect(screen.getByRole('combobox', { name: 'Edit Status' })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit Status' }), { key: 'Escape' });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const name = screen.getByRole('textbox', { name: 'New property name' });
    act(() => {
      fireEvent.change(name, { target: { value: 'Priority' } });
      fireEvent.keyDown(name, { key: 'Enter' });
    });
    expect(edits).toEqual([]);
    expect(properties).toEqual([{ name: 'Priority', type: 'text' }]);
  });
});
