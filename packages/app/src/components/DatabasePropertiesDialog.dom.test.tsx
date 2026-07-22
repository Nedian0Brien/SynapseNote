import { afterEach, describe, expect, mock, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { DatabaseSource } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabasePropertiesDialog } from './DatabasePropertiesDialog';

i18n.load('en', {});
i18n.activate('en');

afterEach(cleanup);

const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'select', options: [] },
    { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
  ],
} as DatabaseSource;

function renderDialog(overrides: Partial<Parameters<typeof DatabasePropertiesDialog>[0]> = {}) {
  const onAddProperty = mock(() => {});
  const onRemoveProperty = mock(() => {});
  const onReorderProperties = mock(() => {});
  render(
    <I18nProvider i18n={i18n}>
      <DatabasePropertiesDialog
        open
        onOpenChange={() => {}}
        source={source}
        mutationLocked={false}
        error={null}
        onAddProperty={onAddProperty}
        onRemoveProperty={onRemoveProperty}
        onReorderProperties={onReorderProperties}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onAddProperty, onRemoveProperty, onReorderProperties };
}

describe('DatabasePropertiesDialog', () => {
  test('lists every property and keeps the Title row frozen from move and delete', () => {
    renderDialog();
    expect(
      document.querySelector('[data-database-property-row="prop_title"]')?.textContent,
    ).toContain('Title');
    expect(
      document.querySelector('[data-database-property-row="prop_status"]')?.textContent,
    ).toContain('Status');
    expect(
      document.querySelector('[data-database-property-row="prop_notes"]')?.textContent,
    ).toContain('Notes');
    expect((screen.getByLabelText('Move Title up') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Move Title down') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Rename Title') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Delete Title') as HTMLButtonElement).disabled).toBe(true);
  });

  test('adds a property with an entered name and the selected type, then clears the input', () => {
    const { onAddProperty } = renderDialog();
    const addButton = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    expect(screen.getByText('Short notes or descriptions')).toBeTruthy();
    const nameInput = screen.getByPlaceholderText('Property name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Due date' } });
    expect(addButton.disabled).toBe(false);
    fireEvent.click(addButton);
    expect(onAddProperty).toHaveBeenCalledWith({ name: 'Due date', type: 'text' });
    expect(nameInput.value).toBe('');
  });

  test('uses friendly type labels in the property picker', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('combobox', { name: 'New property type' }));
    expect(screen.getByRole('option', { name: 'Multi-select' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'multi_select' })).toBeNull();
  });

  test('deletes a non-Title property immediately', () => {
    const { onRemoveProperty } = renderDialog();
    fireEvent.click(screen.getByLabelText('Delete Status'));
    expect(onRemoveProperty).toHaveBeenCalledWith(source.properties[1]);
  });

  test('renames a non-Title property inline and submits the trimmed stable-property change', () => {
    const onRenameProperty = mock(() => {});
    renderDialog({ onRenameProperty });

    fireEvent.click(screen.getByLabelText('Rename Status'));
    const input = screen.getByLabelText('Rename Status') as HTMLInputElement;
    expect(input.value).toBe('Status');
    fireEvent.change(input, { target: { value: '  State  ' } });
    fireEvent.click(screen.getByLabelText('Save rename for Status'));

    expect(onRenameProperty).toHaveBeenCalledWith(source.properties[1], 'State');
    expect(screen.queryByLabelText('Rename Status')).toBeTruthy();
  });

  test('opens the requested property in rename mode and supports Escape cancellation', () => {
    const onRenameProperty = mock(() => {});
    renderDialog({ initialRenamePropertyId: 'prop_notes', onRenameProperty });
    const input = screen.getByLabelText('Rename Notes') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Body' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRenameProperty).not.toHaveBeenCalled();
    expect(screen.getByText('Notes')).toBeTruthy();
  });

  test('reorders non-Title properties locally and commits only on Save order', () => {
    const { onReorderProperties } = renderDialog();
    const saveButton = screen.getByRole('button', { name: 'Save order' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Move Notes up'));
    expect(onReorderProperties).not.toHaveBeenCalled();
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);
    expect(onReorderProperties).toHaveBeenCalledWith(['prop_title', 'prop_notes', 'prop_status']);
  });

  test('disables every action while a mutation is in flight and surfaces a passed error', () => {
    renderDialog({ mutationLocked: true, error: 'Unable to add the property' });
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Delete Status') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Unable to add the property');
  });
});
