import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseQueryResult, DatabaseSource } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { DatabaseTable } from './DatabaseTableDialog';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  ],
};

const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: `sha256:${'a'.repeat(64)}`,
  matched: 2,
  returned: 2,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records: [
    {
      id: 'rec_one',
      path: 'tasks/one.md',
      revision: `sha256:${'b'.repeat(64)}`,
      values: { prop_title: 'One', prop_status: 'Open' },
    },
    {
      id: 'rec_two',
      path: 'tasks/two.md',
      revision: `sha256:${'c'.repeat(64)}`,
      values: { prop_title: 'Two', prop_status: 'Done' },
    },
  ],
  aggregation: null,
};

afterEach(cleanup);

describe('DatabaseTable view state', () => {
  test('restores per-view scroll and focused cell and reports later changes', async () => {
    const onViewStateChange = mock(() => {});
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        initialViewState={{
          scrollTop: 48,
          focusedCell: { recordId: 'rec_two', propertyId: 'prop_title' },
        }}
        onViewStateChange={onViewStateChange}
      />,
    );
    const scrollContainer = rendered.container.querySelector(
      '[data-slot="table-container"]',
    ) as HTMLDivElement;
    await waitFor(() => expect(scrollContainer.scrollTop).toBe(48));
    expect(document.activeElement?.getAttribute('data-database-cell-row')).toBe('1');
    expect(document.activeElement?.getAttribute('data-property-id')).toBe('prop_title');

    const secondStatusCell = rendered.container.querySelector(
      '[data-database-cell-row="1"][data-database-cell-column="1"]',
    ) as HTMLElement;
    fireEvent.focus(secondStatusCell);
    scrollContainer.scrollTop = 96;
    fireEvent.scroll(scrollContainer);
    expect(onViewStateChange).toHaveBeenLastCalledWith({
      scrollTop: 96,
      focusedCell: { recordId: 'rec_two', propertyId: 'prop_status' },
    });
  });
});
