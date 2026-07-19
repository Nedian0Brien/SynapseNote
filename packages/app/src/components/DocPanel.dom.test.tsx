/**
 * Behavioral tests for DocPanel's single-file tab gating.
 *
 * Single-file `ok <file>` keeps only the Outline tab — Links/Graph need a
 * multi-doc knowledge base and Timeline is git history, all empty/inert for a
 * lone git-off file. Asserts the rendered tab set (by `role="tab"` count, so the
 * test doesn't depend on localized label text) and that a persisted
 * links/graph/timeline selection coerces back to Outline.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

// Radix ToggleGroup/Tooltip reach for ResizeObserver/NodeFilter in jsdom.
type WindowGlobals = { NodeFilter?: typeof NodeFilter };
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & { window?: WindowGlobals; ResizeObserver?: unknown };
const g = globalThis as GlobalWithDomShims;
if (g.NodeFilter === undefined && g.window?.NodeFilter !== undefined) {
  g.NodeFilter = g.window.NodeFilter;
}
if (g.ResizeObserver === undefined) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  g.ResizeObserver = NoopResizeObserver;
}

mock.module('@lingui/core/macro', () => ({ t: renderLinguiTemplate }));
mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

// Single-file signal — flipped per test.
let singleFileValue = false;
mock.module('@/lib/single-file-mode', () => ({ useSingleFileMode: () => singleFileValue }));

// Stub the heavy panel children so the test stays focused on tab visibility.
mock.module('@/components/OutlinePanel', () => ({
  OutlinePanel: () => <div data-testid="outline-panel" />,
}));
mock.module('@/components/LinksPanel', () => ({
  LinksPanel: () => <div data-testid="links-panel" />,
}));
mock.module('@/components/MemoPanel', () => ({
  MemoPanel: () => <div data-testid="memo-panel" />,
}));
mock.module('@/components/TimelinePanel', () => ({
  TimelineContent: () => <div data-testid="timeline-panel" />,
}));

const { DocPanel } = await import('./DocPanel');
type PanelTab = import('./DocPanel').PanelTab;

function renderPanel(
  activeTab: PanelTab,
  options: { showChatTab?: boolean; docName?: string | null } = {},
) {
  return render(
    <TooltipProvider>
      <DocPanel
        docName={options.docName === undefined ? 'notes' : options.docName}
        isSourceMode={false}
        activeTab={activeTab}
        onActiveTabChange={() => {}}
        mode="doc"
        showChatTab={options.showChatTab}
        chatContent={<div data-testid="chat-panel" />}
      />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
  singleFileValue = false;
});

describe('DocPanel — single-file tab gating', () => {
  test('project mode renders the full tab strip (outline + memo + links + graph + timeline)', () => {
    singleFileValue = false;
    renderPanel('outline');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByTestId('outline-panel')).toBeTruthy();
  });

  test('single-file mode keeps Outline and Memo while dropping project-only tabs', () => {
    singleFileValue = true;
    // Persisted selection is 'graph' — it must coerce back to Outline rather
    // than render a now-hidden panel.
    renderPanel('graph');
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Outline',
      'Memo',
    ]);
    expect(screen.getByTestId('outline-panel')).toBeTruthy();
  });

  test('renders the active document memo panel', () => {
    renderPanel('memo');
    expect(screen.getByTestId('memo-panel')).toBeTruthy();
  });

  test('desktop project mode places Chat before the document tabs', () => {
    renderPanel('outline', { showChatTab: true });
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Chat',
      'Outline',
      'Memo',
      'Links',
      'Graph',
      'Timeline',
    ]);
  });

  test('viewer-only surfaces render the icon-only Chat tab without unavailable document tabs', () => {
    renderPanel('chat', { showChatTab: true, docName: null });
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    expect(chatTab).toBeTruthy();
    expect(chatTab.textContent).toBe('');
    expect(screen.getByTestId('chat-panel')).toBeTruthy();
    expect(screen.queryByTestId('outline-panel')).toBeNull();
  });

  test('PDF surfaces order Chat, Pages, Annotations, Outline, and Links', () => {
    render(
      <TooltipProvider>
        <DocPanel
          docName={null}
          isSourceMode={false}
          activeTab="pages"
          onActiveTabChange={() => {}}
          mode="doc"
          surface="pdf"
          showChatTab
          pdfContent={<div data-testid="pdf-panel-content" />}
        />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Chat',
      'Pages',
      'Annotations',
      'Outline',
      'Links',
    ]);
    expect(screen.getByTestId('pdf-panel-content')).toBeTruthy();
  });

  test('does not reserve an empty row or add a divider around the rail tabs', () => {
    renderPanel('outline', { showChatTab: true });
    expect(screen.queryByTestId('document-right-rail-header')).toBeNull();
    expect(screen.getByRole('tablist').parentElement?.classList.contains('border-b')).toBe(false);
  });
});
