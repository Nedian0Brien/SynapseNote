import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

const { EditorTabContextMenu, SortableTab } = await import('./EditorTabChrome');

afterEach(() => {
  cleanup();
});

describe('SortableTab callback refs', () => {
  const renderContextMenuTab = () => (
    <EditorTabContextMenu
      tabId="README"
      openTabs={['README']}
      closeTab={() => {}}
      closeTabs={() => {}}
      pinTab={() => {}}
      pinnedTabIds={[]}
      unpinTab={() => {}}
    >
      <SortableTab contextMenuTrigger tabId="README" />
    </EditorTabContextMenu>
  );

  test('keeps the context-menu trigger on the native sortable node across rerenders', () => {
    const view = render(renderContextMenuTab());
    const sortableNode = view.container.querySelector('[data-editor-tab-sortable]');

    expect(sortableNode?.getAttribute('data-slot')).toBe('context-menu-trigger');

    view.rerender(renderContextMenuTab());

    expect(view.container.querySelector('[data-editor-tab-sortable]')).toBe(sortableNode);
  });
});
