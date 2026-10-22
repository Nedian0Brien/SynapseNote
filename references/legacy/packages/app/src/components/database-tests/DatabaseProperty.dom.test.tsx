import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  DatabasePropertyInsertPopover,
  nextDatabasePropertyName,
} from '@/components/DatabasePropertyInsertPopover';

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('database focused property suite', () => {
  test('suggests the next type-specific numbered property name', () => {
    const properties = [{ name: 'Text 1' }, { name: 'Text 3' }, { name: 'Number 1' }];

    expect(nextDatabasePropertyName('text', properties)).toBe('Text 4');
    expect(nextDatabasePropertyName('number', properties)).toBe('Number 2');
    expect(nextDatabasePropertyName('multi_select', properties)).toBe('Multi-select 1');
  });

  test('fills and updates the automatic name when the property picker is used', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [name, setName] = useState('New property');
      const [type, setType] = useState<'text' | 'number' | 'multi_select'>('text');
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
          properties={[{ name: 'Text 1' }, { name: 'Text 3' }, { name: 'Number 1' }]}
          submitAddProperty={() => {}}
          showLabel
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
    const nameInput = await screen.findByRole('textbox', { name: 'New property name' });
    expect((nameInput as HTMLInputElement).value).toBe('Text 4');

    fireEvent.click(screen.getByRole('button', { name: 'Number' }));
    expect((nameInput as HTMLInputElement).value).toBe('Number 2');

    fireEvent.change(nameInput, { target: { value: 'Priority' } });
    fireEvent.click(screen.getByRole('button', { name: 'Multi-select' }));
    expect((nameInput as HTMLInputElement).value).toBe('Priority');
  });

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
