/**
 * Wiring test: selecting an external URL node in the project graph and clicking
 * "Open link" routes through the desktop bridge (`okDesktop.shell.openExternal`)
 * on Electron, and through `window.open` on web — never opening a new in-app
 * window on desktop.
 *
 * This exercises the real `GraphSurface` "Open link" call site, complementing
 * the isolated `openExternalUrl` unit test in `lib/external-link.test.ts`.
 * The force-graph canvas can't be clicked in jsdom, so the graph selection
 * is driven through the captured `onSelectNode` handler instead.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/core/macro', () => ({
  t: renderLinguiTemplate,
}));

mock.module('@lingui/react/macro', () => ({
  Plural: ({ one }: { one: string }) => <>{one}</>,
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

// The graph surface fetches orphan/hub lists through react-query, but only in
// its non-explore modes. Explore (the default) needs no provider.
mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({
    assetPaths: new Set<string>(),
    error: null,
    folderPaths: new Set<string>(),
    loading: false,
    pages: new Set<string>(['docs/Active']),
    pagesBySlug: new Map<string, string>(),
    pageMeta: new Map(),
    pageTitles: new Map([['docs/Active', 'Active']]),
    refetch: () => {},
    addPage: () => {},
  }),
  // Nullable variant of the hook above — see the DocumentContext note; an
  // omitted re-export fails the whole file at load, not just this query.
  useOptionalPageList: () => ({
    assetPaths: new Set<string>(),
    error: null,
    folderPaths: new Set<string>(),
    loading: false,
    pages: new Set<string>(['docs/Active']),
    pagesBySlug: new Map<string, string>(),
    pageMeta: new Map(),
    pageTitles: new Map([['docs/Active', 'Active']]),
    refetch: () => {},
    addPage: () => {},
  }),
}));

type ExternalSelection = { kind: 'external'; id: string; label: string; url: string };

// Capture GraphView's `onSelectNode` so the test can simulate selecting an
// external node without rendering the real force-graph canvas.
const graphHarness: { select?: (sel: ExternalSelection) => void } = {};

mock.module('@/components/GraphView', () => ({
  GraphView: ({
    scope,
    onSelectNode,
  }: {
    scope: string;
    onSelectNode?: (sel: ExternalSelection) => void;
  }) => {
    graphHarness.select = onSelectNode;
    return <div data-testid="graph-view" data-scope={scope} />;
  },
}));

const EXTERNAL_URL = 'https://www.youtube.com/watch?v=abc123';

function setDesktopBridge(openExternal: (url: string) => Promise<void>) {
  (window as unknown as { okDesktop?: unknown }).okDesktop = { shell: { openExternal } };
}

describe('GraphSurface — external "Open link" routes to the OS browser', () => {
  let originalOpen: typeof window.open;

  beforeEach(() => {
    originalOpen = window.open;
  });

  afterEach(() => {
    cleanup();
    window.open = originalOpen;
    delete (window as unknown as { okDesktop?: unknown }).okDesktop;
    graphHarness.select = undefined;
  });

  async function selectExternal() {
    const { GraphSurface } = await import('./GraphSurface');
    render(
      <TooltipProvider>
        <GraphSurface activeDocName="docs/Active" />
      </TooltipProvider>,
    );
    // Drive an external-node selection through the captured handler; the
    // selected-node card with the "Open link" button then renders.
    act(() => {
      graphHarness.select?.({
        kind: 'external',
        id: 'ext-1',
        label: 'Kayak Fishing PNW',
        url: EXTERNAL_URL,
      });
    });
  }

  test('Electron host: "Open link" calls okDesktop.shell.openExternal and never window.open', async () => {
    const openExternal = mock(async () => {});
    setDesktopBridge(openExternal);
    const openSpy = mock(() => null);
    window.open = openSpy as unknown as typeof window.open;

    await selectExternal();
    await userEvent.click(screen.getByRole('button', { name: 'Open link' }));

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(EXTERNAL_URL);
    expect(openSpy).not.toHaveBeenCalled();
  });

  test('Web host (no bridge): "Open link" falls back to window.open in a new tab', async () => {
    const openSpy = mock(() => null);
    window.open = openSpy as unknown as typeof window.open;

    await selectExternal();
    await userEvent.click(screen.getByRole('button', { name: 'Open link' }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(EXTERNAL_URL, '_blank', 'noopener,noreferrer');
  });
});
