import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseMachineIdsDetails } from './DatabaseMachineIdsDetails';

afterEach(() => cleanup());

describe('DatabaseMachineIdsDetails', () => {
  test('keeps stable IDs collapsed while exposing a machine-readable details contract', async () => {
    const user = userEvent.setup();
    render(
      <DatabaseMachineIdsDetails
        entries={[
          { kind: 'database', label: 'Database', value: 'db_tasks' },
          { kind: 'source', label: 'Source', value: 'ds_tasks' },
          { kind: 'view', label: 'View', value: 'view_table' },
          { kind: 'record', label: 'Record', value: 'rec_first' },
        ]}
      />,
    );

    const details = screen.getByTestId('database-machine-ids') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.getAttribute('data-database-machine-ids')).toBe('stable');
    expect(details.querySelector('[data-machine-id-kind="record"]')?.textContent).toContain(
      'rec_first',
    );

    await user.click(screen.getByText('Advanced machine IDs'));
    expect(details.open).toBe(true);
    expect(screen.getByText(/Names and labels remain the primary interface/)).toBeTruthy();
  });

  test('omits empty identifiers instead of rendering misleading placeholders', () => {
    render(
      <DatabaseMachineIdsDetails
        entries={[
          { kind: 'database', label: 'Database', value: '' },
          { kind: 'source', label: 'Source', value: null },
        ]}
      />,
    );
    expect(screen.queryByTestId('database-machine-ids')).toBeNull();
  });
});
