import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { InlineDatabasePropertiesPopover } from './InlineDatabasePropertiesPopover';

afterEach(cleanup);

describe('InlineDatabasePropertiesPopover', () => {
  test('anchors to the toolbar trigger and persists projection and schema intents', async () => {
    const projectionChanges: readonly string[][] = [];
    const addedProperties: Array<{ name: string; type: string }> = [];
    const onProjectionChange = mock((propertyIds: readonly string[]) => {
      projectionChanges.push([...propertyIds]);
    });
    const onAddProperty = mock((input: { name: string; type: string }) => {
      addedProperties.push(input);
    });
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
        <InlineDatabasePropertiesPopover
          open={open}
          onOpenChange={setOpen}
          trigger={<button type="button">Properties</button>}
          source={source}
          visiblePropertyIds={['prop_title']}
          onVisiblePropertyIdsChange={onProjectionChange}
          onAddProperty={onAddProperty}
          onOpenAdvanced={() => {}}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Properties' }));
    expect(await screen.findByTestId('inline-database-properties')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Show Title' })).toBeTruthy();
    const statusCheckbox = screen.getByRole('checkbox', { name: 'Show Status' });
    fireEvent.click(statusCheckbox);
    expect(onProjectionChange).toHaveBeenLastCalledWith(['prop_title', 'prop_status']);

    fireEvent.change(screen.getByRole('textbox', { name: 'New property name' }), {
      target: { value: 'Priority' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddProperty).toHaveBeenCalledWith({ name: 'Priority', type: 'text' });
    expect(addedProperties).toEqual([{ name: 'Priority', type: 'text' }]);
  });
});
