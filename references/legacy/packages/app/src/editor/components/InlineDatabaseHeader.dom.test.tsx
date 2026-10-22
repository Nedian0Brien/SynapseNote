import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { DatabaseReadModelState } from '@/lib/database-read-model';
import { InlineDatabaseHeader, type InlineDatabaseHeaderProps } from './InlineDatabaseHeader';

afterEach(cleanup);

const readyState = {
  status: 'ready',
  description: {
    database: { name: 'Tasks' },
    source: { name: 'Tasks' },
  },
  result: null,
  stale: false,
  refreshing: false,
} as unknown as DatabaseReadModelState;

const headerProps: InlineDatabaseHeaderProps = {
  state: readyState,
  reference: {
    data: { databaseId: 'db_tasks', sourceId: 'ds_tasks', viewId: 'view_tasks', mode: 'inline' },
  },
  linkedDatabase: null,
  linkedSource: null,
  linkedSourceViews: [],
  activeLinkedView: undefined,
  inlineNewViewLabel: 'New view',
  inlineTitleEditing: false,
  inlineTitleDraft: 'Tasks',
  inlineMutationStatus: 'idle',
  inlineUndoStatus: 'idle',
  inlineRedoStatus: 'idle',
  setInlineTitleDraft: () => {},
  setInlineTitleEditing: () => {},
  commitInlineTitle: () => {},
  applyReference: () => {},
  handleInlineViewTabAction: () => {},
  openInlineDatabaseSurface: () => {},
  toolbar: <div data-testid="database-actions">Database actions</div>,
};

describe('InlineDatabaseHeader', () => {
  test('swaps selection actions into the fixed title slot without adding a header row', () => {
    const { rerender } = render(
      <InlineDatabaseHeader
        {...headerProps}
        selectionToolbar={<div data-testid="selection-actions">2 selected</div>}
      />,
    );

    const selectionActions = screen.getByTestId('selection-actions');
    const primarySlot = selectionActions.closest('[data-database-inline-primary-slot]');
    expect(primarySlot).toBeTruthy();
    expect(primarySlot?.classList.contains('h-9')).toBe(true);
    expect(selectionActions.closest('[data-database-inline-header]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tasks' }).classList.contains('sr-only')).toBe(true);
    expect(screen.getByTestId('database-actions')).toBeTruthy();

    rerender(<InlineDatabaseHeader {...headerProps} />);

    expect(screen.queryByTestId('selection-actions')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy();
    expect(
      document.querySelector('[data-database-inline-primary-slot]')?.classList.contains('h-9'),
    ).toBe(true);
  });
});
