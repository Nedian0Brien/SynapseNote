import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { TooltipProvider } from '@/components/ui/tooltip';

if (typeof globalThis.DOMRect === 'undefined') {
  Object.defineProperty(globalThis, 'DOMRect', {
    configurable: true,
    value: class DOMRect {
      x = 0;
      y = 0;
      width = 0;
      height = 0;
      top = 0;
      right = 0;
      bottom = 0;
      left = 0;
    },
  });
}

type CurrentMarkInfo = {
  id: string;
  markType: string;
  attrs: { href: string };
  from: number;
  to: number;
};

let currentMarkInfo: CurrentMarkInfo | null = {
  id: 'm1',
  markType: 'link',
  attrs: { href: '' },
  from: 0,
  to: 4,
};

mock.module('../../components/PageListContext', () => ({
  usePageList: () => ({
    addPage: () => {},
    folderPaths: new Set<string>(),
    loading: false,
    pages: new Set<string>(),
  }),
}));

mock.module('./mark-interaction-bridge', () => ({
  getCurrentMarkInfo: () => currentMarkInfo,
}));

mock.module('./use-headings', () => ({
  useHeadings: () => [],
}));

const { InternalLinkPropPanel } = await import('./InternalLinkPropPanel');
const { _resetPendingLinkEditForTest, setPendingLinkEdit } = await import('./link-edit-autoopen');

function makeEditor(
  options: {
    onDeleteRange?: (range: { from: number; to: number }) => void;
    onUpdateAttributes?: (markType: string, attrs: Record<string, unknown>) => void;
  } = {},
): Editor {
  const chain = {
    focus: () => chain,
    setTextSelection: () => chain,
    extendMarkRange: () => chain,
    deleteRange: (range: { from: number; to: number }) => {
      options.onDeleteRange?.(range);
      return chain;
    },
    updateAttributes: (markType: string, attrs: Record<string, unknown>) => {
      options.onUpdateAttributes?.(markType, attrs);
      return chain;
    },
    run: () => true,
  };

  return {
    state: {
      doc: {
        textBetween: () => 'link',
      },
    },
    chain: () => chain,
    view: {
      dom: document.createElement('div'),
    },
  } as unknown as Editor;
}

afterEach(() => {
  cleanup();
  _resetPendingLinkEditForTest();
  currentMarkInfo = {
    id: 'm1',
    markType: 'link',
    attrs: { href: '' },
    from: 0,
    to: 4,
  };
});

describe('InternalLinkPropPanel', () => {
  test('renders nothing for empty-href link with no pending edit', () => {
    const { container } = render(
      <InternalLinkPropPanel
        editor={makeEditor()}
        nodeId="m1"
        sourceDocName="notes/source"
        onClose={() => {}}
        onNavigate={() => false}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  test('auto-opens edit dialog when panel mounts for a pending empty-href link', async () => {
    setPendingLinkEdit('m1');

    render(
      <InternalLinkPropPanel
        editor={makeEditor()}
        nodeId="m1"
        sourceDocName="notes/source"
        onClose={() => {}}
        onNavigate={() => false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByText('Edit markdown link')).toBeDefined();
  });

  test('deletes the pending empty-href placeholder when the edit dialog is canceled', async () => {
    const deleteRange = mock((_range: { from: number; to: number }) => {});
    const onClose = mock(() => {});
    setPendingLinkEdit('m1');

    render(
      <InternalLinkPropPanel
        editor={makeEditor({ onDeleteRange: deleteRange })}
        nodeId="m1"
        sourceDocName="notes/source"
        onClose={onClose}
        onNavigate={() => false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(deleteRange).toHaveBeenCalledWith({ from: 0, to: 4 });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('does not delete the pending mark when the edit dialog saves a URL', async () => {
    const deleteRange = mock((_range: { from: number; to: number }) => {});
    const onClose = mock(() => {});
    const updateAttributes = mock((_markType: string, attrs: Record<string, unknown>) => {
      if (!currentMarkInfo) return;
      currentMarkInfo = {
        ...currentMarkInfo,
        attrs: { href: typeof attrs.href === 'string' ? attrs.href : '' },
      };
    });
    setPendingLinkEdit('m1');

    render(
      <TooltipProvider>
        <InternalLinkPropPanel
          editor={makeEditor({ onDeleteRange: deleteRange, onUpdateAttributes: updateAttributes })}
          nodeId="m1"
          sourceDocName="notes/source"
          onClose={onClose}
          onNavigate={() => false}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Link target' }), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateAttributes).toHaveBeenCalledWith('link', { href: 'https://example.com' });
    });
    expect(deleteRange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('closes without deleting when the pending mark was already removed remotely', async () => {
    const deleteRange = mock((_range: { from: number; to: number }) => {});
    const onClose = mock(() => {});
    setPendingLinkEdit('m1');

    render(
      <InternalLinkPropPanel
        editor={makeEditor({ onDeleteRange: deleteRange })}
        nodeId="m1"
        sourceDocName="notes/source"
        onClose={onClose}
        onNavigate={() => false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    currentMarkInfo = null;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(deleteRange).not.toHaveBeenCalled();
  });
});
