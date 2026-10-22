import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { InlineDatabaseSortPopover } from './InlineDatabaseSortPopover';

afterEach(cleanup);

describe('InlineDatabaseSortPopover', () => {
  test('adds and applies ordered sort rules without mounting the workspace', async () => {
    const onSave = mock(() => {});
    const source = {
      id: 'source_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'tasks',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const },
        { id: 'prop_status', key: 'status', name: 'Status', type: 'text' as const },
      ],
    };
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <InlineDatabaseSortPopover
          open={open}
          onOpenChange={setOpen}
          trigger={<button type="button">Sort</button>}
          source={source}
          initialSort={[]}
          onSave={onSave}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    expect(await screen.findByRole('heading', { name: 'Sort' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add sort rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave).toHaveBeenCalledWith([{ propertyId: 'prop_title', direction: 'asc' }]);
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
  });
});
