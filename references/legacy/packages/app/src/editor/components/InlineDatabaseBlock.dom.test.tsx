import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { DatabaseReadModelState } from '@/lib/database-read-model';
import { InlineDatabaseBlock } from './InlineDatabaseBlock';

const revision = `sha256:${'a'.repeat(64)}`;
const source = {
  id: 'source_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'title', key: 'title', name: 'Title', type: 'title' as const },
    { id: 'notes', key: 'notes', name: 'Notes', type: 'text' as const },
  ],
};
const view = {
  id: 'view_tasks',
  key: 'tasks',
  name: 'Tasks',
  sourceId: source.id,
  layout: { type: 'table' as const },
  projection: { propertyIds: ['title', 'notes'] },
  where: undefined,
  sort: [],
  groups: [],
  conditionalColors: [],
};
const result = {
  sourceId: source.id,
  snapshotRevision: revision,
  matched: 1,
  returned: 1,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records: [
    {
      id: 'record_first',
      path: 'tasks/first.md',
      revision,
      values: { title: 'First task' },
    },
  ],
  aggregation: null,
};
const state = {
  status: 'ready',
  description: {
    database: { id: 'database_tasks', name: 'Tasks', people: [], sources: [source], views: [view] },
    source,
  },
  result,
  stale: false,
  refreshing: false,
} as unknown as DatabaseReadModelState;

afterEach(cleanup);

describe('InlineDatabaseBlock property actions', () => {
  test('hands an inline property deletion off to advanced schema management', async () => {
    const onOpenInlineDatabaseSurface = mock(() => {});
    const user = userEvent.setup();
    render(
      <InlineDatabaseBlock
        {...({
          state,
          reference: {
            data: {
              databaseId: 'database_tasks',
              sourceId: source.id,
              viewId: view.id,
              mode: 'inline',
            },
          },
          linkedSource: source,
          activeLinkedView: view,
          renderedResult: result,
          inlineOptimisticCellValues: new Map(),
          searchNeedle: '',
          inlineMutationLocked: false,
          focusInlineNewRecordRequest: null,
          inlineSelectedRecordIds: new Set(),
          inlineTableViewStatesRef: createRef(),
          inlineTableViewStates: new Map(),
          setInlineTableViewStates: () => {},
          localViewOverrides: undefined,
          onOpenRecord: () => {},
          onApplyViewChanges: () => {},
          onSetInitialRecordAction: () => {},
          onSetFullDatabaseOpen: () => {},
          onSetContextInspectorScope: () => {},
          onSetInlineSelectedRecordIds: () => {},
          onPersistLinkedViewOverrides: () => {},
          onEditInlineCell: () => {},
          onCreateInlineSelectOption: () => false,
          onReorderInlineSelectOptions: () => false,
          onCreateInlineRecord: () => {},
          onPasteInlineCells: () => {},
          onOpenInlineAgentScope: () => {},
          onAddInlineProperty: () => {},
          onOpenInlineDatabaseSurface,
          onSetReplacementPickerOpen: () => {},
          onRefresh: () => {},
        } as never)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Property options for Notes' }));
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete property' });
    expect(deleteItem.getAttribute('data-disabled')).toBeNull();
    await user.click(deleteItem);

    expect(onOpenInlineDatabaseSurface).toHaveBeenCalledWith('properties', undefined, {
      advanced: true,
    });
  });
});
