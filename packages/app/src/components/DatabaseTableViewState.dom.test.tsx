import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseQueryResult, DatabaseSource } from '@nedian0brien/synapsenote-core';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
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
  test('uses native block controls outside Title and persists row-handle reordering', async () => {
    const onSelectionChange = mock(() => {});
    const onReorderRecords = mock(() => {});
    const onPaste = mock(() => {});
    const onDuplicate = mock(() => {});
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        notionSurface
        onCreateRecord={mock(() => {})}
        onSelectionChange={onSelectionChange}
        onReorderRecords={onReorderRecords}
        onPaste={onPaste}
        onDuplicate={onDuplicate}
      />,
    );
    expect(rendered.container.querySelector('[data-database-table-selector-track]')).toBeNull();
    expect(
      rendered.container
        .querySelector('tbody tr[data-record-id] > td[aria-colindex="1"]')
        ?.getAttribute('data-property-id'),
    ).toBe('prop_title');

    const firstRow = rendered.container.querySelector(
      'tbody tr[data-record-id="rec_one"]',
    ) as HTMLTableRowElement;
    fireEvent.pointerOver(firstRow);
    const firstHandle = rendered.getByRole('button', {
      name: 'Open page actions for One',
    }) as HTMLButtonElement;
    const firstSelection = rendered.getByRole('checkbox', {
      name: 'Select page checkbox rec_one',
    });
    expect(firstSelection.className).toContain('ok-row-selection-btn');
    expect(firstHandle.className).toContain('ok-drag-grip');
    expect(firstHandle.closest('[data-database-table-interaction-layer]')?.className).toContain(
      'ok-block-controls',
    );
    fireEvent.click(firstHandle);
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(rendered.getByRole('menu', { name: 'Page actions for One' })).toBeTruthy();
    fireEvent.click(rendered.getByRole('menuitem', { name: 'Duplicate page One' }));
    expect(onDuplicate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'rec_one' }));

    fireEvent.click(firstSelection);
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['rec_one']));

    const transferValues = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      get types() {
        return [...transferValues.keys()];
      },
      setData: mock((type: string, value: string) => transferValues.set(type, value)),
      getData: mock((type: string) => transferValues.get(type) ?? ''),
    } as unknown as DataTransfer;
    fireEvent.dragStart(firstHandle, { dataTransfer });
    const secondRow = rendered.container.querySelector(
      'tbody tr[data-record-id="rec_two"]',
    ) as HTMLTableRowElement;
    const secondTitleCell = secondRow.querySelector(
      '[data-property-id="prop_title"]',
    ) as HTMLTableCellElement;
    fireEvent.dragOver(secondTitleCell, { clientY: 1, dataTransfer });
    fireEvent.drop(secondTitleCell, { clientY: 1, dataTransfer });
    expect(onReorderRecords).toHaveBeenLastCalledWith(['rec_two', 'rec_one']);
    expect(onPaste).not.toHaveBeenCalled();
    expect(dataTransfer.getData('text/plain')).toBe('');

    fireEvent.click(rendered.getByRole('button', { name: 'Add page below' }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-testid')).toBe('database-new-row-title'),
    );
  });

  test('applies a changed linked-view projection without remounting the table', async () => {
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        notionSurface
        viewPropertyIds={['prop_title']}
      />,
    );
    const tableSurface = rendered.container.querySelector('[data-database-table-surface]');
    expect(rendered.container.querySelector('th[data-property-id="prop_status"]')).toBeNull();

    rendered.rerender(
      <DatabaseTable
        source={source}
        result={result}
        notionSurface
        viewPropertyIds={['prop_title', 'prop_status']}
      />,
    );

    await waitFor(() =>
      expect(rendered.container.querySelector('th[data-property-id="prop_status"]')).not.toBeNull(),
    );
    expect(rendered.container.querySelector('[data-database-table-surface]')).toBe(tableSurface);
  });

  test('reconciles a schema property addition without replacing the table or focused cell', async () => {
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        notionSurface
        viewPropertyIds={['prop_title']}
      />,
    );
    const tableSurface = rendered.container.querySelector('[data-database-table-surface]');
    const focusedCell = rendered.container.querySelector(
      '[data-database-cell-row="0"][data-property-id="prop_title"]',
    ) as HTMLElement;
    act(() => focusedCell.focus());

    const sourceWithProperty: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_owner', key: 'owner', name: 'Owner', type: 'text' },
      ],
    };
    act(() => {
      rendered.rerender(
        <DatabaseTable
          source={sourceWithProperty}
          result={result}
          notionSurface
          viewPropertyIds={['prop_title', 'prop_owner']}
        />,
      );
    });

    await waitFor(() =>
      expect(rendered.container.querySelector('th[data-property-id="prop_owner"]')).not.toBeNull(),
    );
    expect(rendered.container.querySelector('[data-database-table-surface]')).toBe(tableSurface);
    expect(document.activeElement).toBe(focusedCell);
  });

  test('restores per-view scroll and focused cell and reports later changes', async () => {
    const onViewStateChange = mock(() => {});
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        initialViewState={{
          scrollTop: 48,
          scrollLeft: 24,
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
    scrollContainer.scrollLeft = 72;
    fireEvent.scroll(scrollContainer);
    expect(onViewStateChange).toHaveBeenLastCalledWith({
      scrollTop: 96,
      scrollLeft: 72,
      focusedCell: { recordId: 'rec_two', propertyId: 'prop_status' },
    });
  });

  test('clamps both scroll axes to measured viewport geometry and keeps one scroll owner', async () => {
    const onViewStateChange = mock(() => {});
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        notionSurface
        initialViewState={{ scrollTop: 999, scrollLeft: 777 }}
        onViewStateChange={onViewStateChange}
        onOpen={mock(() => {})}
      />,
    );
    const scrollContainer = rendered.container.querySelector(
      '[data-slot="table-container"]',
    ) as HTMLDivElement;
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      clientWidth: { configurable: true, value: 120 },
      scrollWidth: { configurable: true, value: 620 },
    });
    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(400);
      expect(scrollContainer.scrollLeft).toBe(500);
    });
    expect(rendered.container.querySelectorAll('[data-slot="table-container"]')).toHaveLength(1);
    expect(rendered.container.querySelectorAll('[data-database-table-scroll-owner]')).toHaveLength(
      1,
    );
    const table = rendered.container.querySelector('[data-slot="table"]') as HTMLTableElement;
    const colGroup = table.querySelector('colgroup[data-database-table-colgroup]');
    expect(table.querySelectorAll('colgroup[data-database-table-colgroup]')).toHaveLength(1);
    expect(
      Array.from(colGroup?.children ?? []).map((column) => {
        if (column.hasAttribute('data-database-table-selector-track')) return 'selector';
        if (column.hasAttribute('data-database-table-filler-track')) return 'filler';
        if (column.hasAttribute('data-database-table-actions-track')) return 'actions';
        return `property:${column.getAttribute('data-property-id')}`;
      }),
    ).toEqual(['property:prop_title', 'property:prop_status', 'actions', 'filler']);
    const structuralRows = table.querySelectorAll(
      'thead tr:not([aria-hidden]), tbody tr[data-record-id], tbody tr[data-new-record-row], tfoot tr',
    ).length;
    expect(
      table.querySelectorAll('th[data-database-table-filler], td[data-database-table-filler]'),
    ).toHaveLength(structuralRows);
    expect(table.querySelectorAll('thead [data-database-table-filler]')).toHaveLength(1);
    expect(
      table.querySelectorAll('tbody [data-database-table-filler]').length,
    ).toBeGreaterThanOrEqual(2);
    expect(onViewStateChange).toHaveBeenLastCalledWith({ scrollTop: 400, scrollLeft: 500 });
    expect(
      rendered.container.querySelector('th[data-property-id="prop_title"]')?.getAttribute('style'),
    ).toContain('left: 0px');
    expect(table.querySelector('[data-database-table-selector-track]')).toBeNull();
    expect(
      table.querySelector('thead th[aria-colindex="1"]')?.getAttribute('data-property-id'),
    ).toBe('prop_title');
    expect(rendered.container.querySelector('[data-database-table-interaction-gutter]')).toBeNull();
    expect(
      rendered.container.querySelector('[data-database-table-interaction-layer]'),
    ).not.toBeNull();
    const tableClassName = rendered.container.querySelector('[data-slot="table"]')?.className;
    expect(tableClassName).toContain('table-fixed');
    expect(tableClassName).not.toContain('min-w-full');
    expect(
      (rendered.container.querySelector('[data-slot="table"]') as HTMLTableElement).style.width,
    ).toBe('100%');
    expect(
      (rendered.container.querySelector('[data-slot="table"]') as HTMLTableElement).style.minWidth,
    ).toBe('604px');
    expect(
      rendered.container.querySelector(
        'th[data-property-id="prop_title"] [data-database-property-name]',
      )?.className,
    ).toContain('truncate');
    expect(
      rendered.container.querySelector(
        'td[data-property-id="prop_title"] [data-title-cell-content]',
      )?.className,
    ).toContain('overflow-hidden');
  });

  test('restores legacy vertical-only state after a view remount without a horizontal loop', async () => {
    const onViewStateChange = mock(() => {});
    const rendered = render(
      <DatabaseTable
        source={source}
        result={result}
        initialViewState={{ scrollTop: 32 } as never}
        onViewStateChange={onViewStateChange}
      />,
    );
    const scrollContainer = rendered.container.querySelector(
      '[data-slot="table-container"]',
    ) as HTMLDivElement;
    await waitFor(() => expect(scrollContainer.scrollTop).toBe(32));
    expect(scrollContainer.scrollLeft).toBe(0);
    rendered.unmount();
    const remounted = render(
      <DatabaseTable
        source={source}
        result={result}
        initialViewState={{ scrollTop: 12, scrollLeft: 18 }}
        onViewStateChange={onViewStateChange}
      />,
    );
    const remountedContainer = remounted.container.querySelector(
      '[data-slot="table-container"]',
    ) as HTMLDivElement;
    await waitFor(() => expect(remountedContainer.scrollLeft).toBe(18));
    expect(onViewStateChange).toHaveBeenCalledTimes(2);
  });
});
