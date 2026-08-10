/**
 * Integration of the settings store with the graph panel: what the user changes
 * has to reach the canvas, survive a reload, and stay scoped to the surface it
 * was changed on.
 *
 * The force-graph canvas cannot render in jsdom, so `GraphView` is replaced by a
 * probe that records the `settings` prop it is handed — that prop is the whole
 * contract between the panel and the renderer.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { GraphSettings } from '@/lib/graph-settings-store';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/core/macro', () => ({
  t: renderLinguiTemplate,
}));

mock.module('@lingui/react/macro', () => ({
  Plural: ({ one }: { one: string }) => <>{one}</>,
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

const PAGE_LIST = {
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
};

mock.module('@/components/PageListContext', () => ({
  usePageList: () => PAGE_LIST,
  useOptionalPageList: () => PAGE_LIST,
}));

const probe: { settings?: GraphSettings } = {};

mock.module('@/components/GraphView', () => ({
  GraphView: ({ settings }: { settings: GraphSettings }) => {
    probe.settings = settings;
    return <div data-testid="graph-view" />;
  },
}));

const DOCKED_KEY = 'ok-graph-settings-docked-v1';
const FULLSCREEN_KEY = 'ok-graph-settings-fullscreen-v1';

async function renderPanel() {
  const { GraphPanel } = await import('./GraphPanel');
  return render(
    <TooltipProvider>
      <GraphPanel activeDocName="docs/Active" />
    </TooltipProvider>,
  );
}

function storedSettings(key: string): GraphSettings | null {
  const raw = window.localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as GraphSettings);
}

describe('GraphPanel graph settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    probe.settings = undefined;
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  test('hands the renderer a complete preset before the user touches anything', async () => {
    await renderPanel();
    expect(probe.settings?.display.maxLabels).toBe(18);
    expect(probe.settings?.filters.showExternalNodes).toBe(false);
    // Reading a preset must not write one — an untouched install stays clean.
    expect(window.localStorage.getItem(DOCKED_KEY)).toBeNull();
  });

  test('the header globe writes through to storage and to the renderer', async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Show external URL nodes' }));

    expect(probe.settings?.filters.showExternalNodes).toBe(true);
    expect(storedSettings(DOCKED_KEY)?.filters.showExternalNodes).toBe(true);
  });

  test('a change made while docked is restored on the next mount', async () => {
    const first = await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Show external URL nodes' }));
    first.unmount();
    probe.settings = undefined;

    await renderPanel();
    expect(probe.settings?.filters.showExternalNodes).toBe(true);
  });

  test('the popover reaches the renderer, not just the store', async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Graph settings' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Orphans' }));

    expect(probe.settings?.filters.showOrphans).toBe(false);
    expect(storedSettings(DOCKED_KEY)?.filters.showOrphans).toBe(false);
  });

  test('docked and fullscreen keep independent presets', async () => {
    await renderPanel();
    // Change the docked preset, then expand: the fullscreen surface must still
    // be at its own defaults rather than inheriting the docked choice.
    await userEvent.click(screen.getByRole('button', { name: 'Show external URL nodes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand graph' }));

    expect(probe.settings?.filters.showExternalNodes).toBe(false);
    expect(probe.settings?.display.maxLabels).toBe(10);

    // And a fullscreen change writes only the fullscreen key.
    await userEvent.click(screen.getByRole('button', { name: 'Show external URL nodes' }));
    expect(storedSettings(FULLSCREEN_KEY)?.filters.showExternalNodes).toBe(true);
    expect(storedSettings(DOCKED_KEY)?.filters.showExternalNodes).toBe(true);

    // Collapsing returns the docked preset, unchanged by the fullscreen edit.
    await userEvent.click(screen.getByRole('button', { name: 'Collapse graph' }));
    expect(probe.settings?.display.maxLabels).toBe(18);
  });

  test('adopts the legacy external-URL toggle from the pre-settings build', async () => {
    window.localStorage.setItem('ok-graph-docked-url-nodes-v1', 'true');
    await renderPanel();
    expect(probe.settings?.filters.showExternalNodes).toBe(true);
  });

  test('falls back to defaults when the stored preset is corrupt', async () => {
    window.localStorage.setItem(DOCKED_KEY, 'not json');
    await renderPanel();
    expect(probe.settings?.display.maxLabels).toBe(18);
    expect(screen.getByTestId('graph-view')).toBeTruthy();
  });
});
