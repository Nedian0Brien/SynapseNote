import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DatabaseSelectCellEditor } from './DatabaseSelectCellEditor';

afterEach(cleanup);

const selectProperty = {
  id: 'prop_status',
  key: 'status',
  name: 'Status',
  type: 'select' as const,
  options: [
    { id: 'opt_ready', key: 'ready', name: 'Ready', color: 'green' },
    { id: 'opt_review', key: 'review', name: 'In review', color: 'yellow' },
    { id: 'opt_done', key: 'done', name: 'Done', color: 'blue' },
  ],
};

const multiSelectProperty = {
  ...selectProperty,
  id: 'prop_tags',
  key: 'tags',
  name: 'Tags',
  type: 'multi_select' as const,
};

function SelectHarness({ onCommit }: { onCommit: (draft: string) => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <DatabaseSelectCellEditor
      property={selectProperty}
      draft=""
      onDraftChange={() => {}}
      onCommit={(draft) => {
        onCommit(draft);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  ) : null;
}

function MultiSelectHarness({
  onCommit,
  onCancel,
  onCreateOption,
  onReorderOptions,
}: {
  onCommit: (draft: string) => void;
  onCancel: () => void;
  onCreateOption?: (name: string, selectedOptionIds: readonly string[]) => boolean;
  onReorderOptions?: (optionIds: readonly string[]) => boolean;
}) {
  const [draft, setDraft] = useState(JSON.stringify(['opt_ready']));
  const [open, setOpen] = useState(true);
  return open ? (
    <DatabaseSelectCellEditor
      property={multiSelectProperty}
      draft={draft}
      onDraftChange={setDraft}
      onCreateOption={onCreateOption}
      onReorderOptions={onReorderOptions}
      onCommit={(nextDraft) => {
        onCommit(nextDraft);
        setOpen(false);
      }}
      onCancel={() => {
        onCancel();
        setOpen(false);
      }}
    />
  ) : null;
}

describe('DatabaseSelectCellEditor', () => {
  test('cancels an unchanged picker when it is dismissed outside', async () => {
    const onCommit = mock(() => {});
    const onCancel = mock(() => {});
    render(
      <DatabaseSelectCellEditor
        property={selectProperty}
        draft="opt_ready"
        onDraftChange={() => {}}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(document.body);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  test('filters options from the input and commits a single selection immediately', () => {
    const onCommit = mock(() => {});
    render(<SelectHarness onCommit={onCommit} />);

    const input = screen.getByRole('combobox', { name: 'Edit Status' });
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.getByText('No matching options.')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'review' } });

    expect(screen.getByRole('option', { name: 'In review' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Ready' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'In review' }));
    expect(onCommit).toHaveBeenCalledWith('opt_review');
  });

  test('navigates options with Arrow keys and commits with Enter', () => {
    const onCommit = mock(() => {});
    render(<SelectHarness onCommit={onCommit} />);

    const input = screen.getByRole('combobox', { name: 'Edit Status' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('opt_review');
  });

  test('renders selected chips, toggles multiple values, and commits with Tab', () => {
    const onCommit = mock(() => {});
    const onCancel = mock(() => {});
    render(<MultiSelectHarness onCommit={onCommit} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: 'Remove Ready from Tags' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'In review' }));
    expect(screen.getByRole('option', { name: 'In review' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit Tags' }), { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith(JSON.stringify(['opt_ready', 'opt_review']));
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('removes the last selected chip with Backspace and cancels with Escape', () => {
    const onCommit = mock(() => {});
    const onCancel = mock(() => {});
    render(<MultiSelectHarness onCommit={onCommit} onCancel={onCancel} />);

    const input = screen.getByRole('combobox', { name: 'Edit Tags' });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.queryByRole('button', { name: 'Remove Ready from Tags' })).toBeNull();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  test('creates a typed option with the current Multi-select values', () => {
    const onCommit = mock(() => {});
    const onCancel = mock(() => {});
    const onCreateOption = mock(() => true);
    const { unmount } = render(
      <MultiSelectHarness
        onCommit={onCommit}
        onCancel={onCancel}
        onCreateOption={onCreateOption}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Edit Tags' });
    fireEvent.change(input, { target: { value: 'Blocked' } });
    expect(screen.getByText('Select or create an option')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Create Blocked' }));

    expect(onCreateOption).toHaveBeenCalledWith('Blocked', ['opt_ready']);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    act(() => unmount());
  });

  test('reorders options from the drag handle with the keyboard', () => {
    const onCommit = mock(() => {});
    const onCancel = mock(() => {});
    const onReorderOptions = mock(() => true);
    const { unmount } = render(
      <MultiSelectHarness
        onCommit={onCommit}
        onCancel={onCancel}
        onReorderOptions={onReorderOptions}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Ready' }), {
      key: 'ArrowDown',
    });
    expect(onReorderOptions).toHaveBeenCalledWith(['opt_review', 'opt_ready', 'opt_done']);
    act(() => unmount());
  });
});
