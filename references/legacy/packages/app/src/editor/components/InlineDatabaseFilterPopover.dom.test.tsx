import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { InlineDatabaseFilterPopover } from './InlineDatabaseFilterPopover';

afterEach(cleanup);

describe('InlineDatabaseFilterPopover', () => {
  test('applies and clears a view filter without mounting the workspace', async () => {
    const saves: unknown[] = [];
    const onSave = mock((where: unknown) => saves.push(where));
    const source = {
      id: 'source_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'tasks',
      properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const }],
    };
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <InlineDatabaseFilterPopover
          open={open}
          onOpenChange={setOpen}
          trigger={<button type="button">Filters</button>}
          source={source}
          onSave={onSave}
          onOpenAdvanced={() => {}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByRole('heading', { name: 'Filters' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter value for Title' }), {
      target: { value: 'urgent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave).toHaveBeenLastCalledWith({
      propertyId: 'prop_title',
      operator: 'eq',
      value: 'urgent',
    });
    expect(document.querySelector('[data-database-workspace]')).toBeNull();
    expect(saves).toHaveLength(1);
  });
});
