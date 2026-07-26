import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { DatabasePropertyInsertPopover } from '@/components/DatabasePropertyInsertPopover';

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('database focused property suite', () => {
  test('selects a typed property and submits its name through the popover', async () => {
    const submitted: unknown[] = [];
    function Harness() {
      const [open, setOpen] = useState(true);
      const [name, setName] = useState('Priority');
      const [type, setType] = useState<'text' | 'number'>('text');
      return (
        <DatabasePropertyInsertPopover
          open={open}
          setOpen={setOpen}
          mutationLocked={false}
          propertyInsertTarget={null}
          setPropertyInsertTarget={() => {}}
          newPropertyName={name}
          setNewPropertyName={setName}
          newPropertyType={type}
          setNewPropertyType={setType}
          submitAddProperty={() => submitted.push({ name, type })}
          showLabel
        />
      );
    }
    render(<Harness />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Number' }));
    });
    expect(document.querySelector('[data-database-property-type-icon="number"]')).toBeTruthy();
    act(() => {
      const submit = screen.getAllByRole('button', { name: 'Add property' }).at(-1);
      if (!submit) throw new Error('property submit button was not rendered');
      fireEvent.click(submit);
    });
    expect(submitted).toEqual([{ name: 'Priority', type: 'number' }]);
  });
});
