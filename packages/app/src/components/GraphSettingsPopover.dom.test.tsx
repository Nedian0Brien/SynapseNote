/**
 * Wiring test for the graph settings popover: every control has to reach
 * `onSettingsChange` with a complete, clamped `GraphSettings`, because the panel
 * hands whatever comes out straight to the store and to the canvas.
 *
 * Sliders are driven by keyboard rather than by dragging — Radix's pointer path
 * needs real layout boxes that jsdom does not produce, while the thumb's
 * arrow-key handling is the same code path a user's keyboard takes.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { type GraphSettings, getDefaultGraphSettings } from '@/lib/graph-settings-store';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/core/macro', () => ({
  t: renderLinguiTemplate,
}));

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

async function openPopover(settings: GraphSettings = getDefaultGraphSettings('docked')) {
  const onSettingsChange = mock((_next: GraphSettings) => {});
  const { GraphSettingsPopover } = await import('./GraphSettingsPopover');
  render(
    <TooltipProvider>
      <GraphSettingsPopover
        scope="docked"
        settings={settings}
        isExpanded={false}
        onSettingsChange={onSettingsChange}
      />
    </TooltipProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Graph settings' }));
  return { onSettingsChange };
}

async function openSection(name: string) {
  await userEvent.click(screen.getByRole('button', { name }));
}

function lastCall(onSettingsChange: { mock: { calls: unknown[][] } }): GraphSettings {
  const calls = onSettingsChange.mock.calls;
  return calls[calls.length - 1][0] as GraphSettings;
}

describe('GraphSettingsPopover — filters', () => {
  afterEach(cleanup);

  test('the Filters section is open on mount so the search box needs no digging', async () => {
    await openPopover();
    expect(screen.getByRole('textbox', { name: 'Filter graph' })).toBeTruthy();
  });

  test('typing in the search box emits the query without disturbing other settings', async () => {
    const { onSettingsChange } = await openPopover();
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter graph' }), 'k');

    const next = lastCall(onSettingsChange);
    expect(next.filters.query).toBe('k');
    expect(next.display).toEqual(getDefaultGraphSettings('docked').display);
    expect(next.forces).toEqual(getDefaultGraphSettings('docked').forces);
  });

  test('each filter switch toggles exactly its own flag', async () => {
    const { onSettingsChange } = await openPopover();
    await userEvent.click(screen.getByRole('switch', { name: 'Orphans' }));

    const next = lastCall(onSettingsChange);
    expect(next.filters.showOrphans).toBe(false);
    expect(next.filters.showMissingNodes).toBe(true);
    expect(next.filters.showExternalNodes).toBe(false);
  });

  test('the tag switch reflects the current value rather than always reading off', async () => {
    const settings = getDefaultGraphSettings('docked');
    settings.filters.showTagNodes = true;
    await openPopover(settings);
    expect(screen.getByRole('switch', { name: 'Tags' }).getAttribute('aria-checked')).toBe('true');
  });

  test('edits folder-node exclusions without hiding files below them', async () => {
    const settings = getDefaultGraphSettings('fullscreen');
    const { onSettingsChange } = await openPopover(settings);
    fireEvent.change(screen.getByRole('textbox', { name: 'Excluded folder nodes' }), {
      target: { value: 'Archive' },
    });

    expect(lastCall(onSettingsChange).filters.folderNodeExclusions).toEqual(['Archive']);
    expect(lastCall(onSettingsChange).filters.showFolderNodes).toBe(true);
  });
});

describe('GraphSettingsPopover — display and forces', () => {
  afterEach(cleanup);

  test('a display slider emits a stepped value', async () => {
    const { onSettingsChange } = await openPopover();
    await openSection('Display');

    const slider = screen.getByRole('slider', { name: 'Node size' });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');

    // Default 1 with a 0.05 step.
    expect(lastCall(onSettingsChange).display.nodeSize).toBeCloseTo(1.05, 5);
  });

  test('the arrows switch lives under Display and toggles independently', async () => {
    const { onSettingsChange } = await openPopover();
    await openSection('Display');
    await userEvent.click(screen.getByRole('switch', { name: 'Arrows' }));

    // Arrowheads ship off, so the first click turns them on.
    const next = lastCall(onSettingsChange);
    expect(next.display.showArrows).toBe(true);
    expect(next.display.nodeSize).toBe(1);
  });

  test('the folder areas switch hides only the territory layer setting', async () => {
    const settings = getDefaultGraphSettings('docked');
    settings.filters.showFolderNodes = true;
    const { onSettingsChange } = await openPopover(settings);
    await openSection('Display');
    await userEvent.click(screen.getByRole('switch', { name: 'Folder areas' }));

    const next = lastCall(onSettingsChange);
    expect(next.display.showFolderAreas).toBe(false);
    expect(next.filters.showFolderNodes).toBe(true);
  });

  test('a force slider emits a stepped value', async () => {
    const { onSettingsChange } = await openPopover();
    await openSection('Forces');

    const slider = screen.getByRole('slider', { name: 'Repel force' });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');

    // Physical default 1000 with a step of 50.
    expect(lastCall(onSettingsChange).forces.repelStrength).toBe(1050);
  });

  test('sliders clamp at the bound instead of running past it', async () => {
    const settings = getDefaultGraphSettings('docked');
    settings.display.nodeSize = 3; // the documented maximum
    const { onSettingsChange } = await openPopover(settings);
    await openSection('Display');

    const slider = screen.getByRole('slider', { name: 'Node size' });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');

    // Radix refuses the move entirely at the bound, so nothing is emitted.
    expect(onSettingsChange).not.toHaveBeenCalled();
  });
});

describe('GraphSettingsPopover — groups', () => {
  afterEach(cleanup);

  test('shows an explanation instead of an empty list when no groups exist', async () => {
    await openPopover();
    await openSection('Groups');
    expect(screen.getByText(/first matching group in the list wins/i)).toBeTruthy();
  });

  test('adding a group creates one row with an empty query and a distinct color', async () => {
    const { onSettingsChange } = await openPopover();
    await openSection('Groups');
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));

    const groups = lastCall(onSettingsChange).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].query).toBe('');
    expect(groups[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('editing a row changes only that row', async () => {
    const settings = getDefaultGraphSettings('docked');
    settings.groups = [
      { id: 'a', query: 'first', color: '#60a5fa' },
      { id: 'b', query: 'second', color: '#f472b6' },
    ];
    const { onSettingsChange } = await openPopover(settings);
    await openSection('Groups');

    const [firstQuery] = screen.getAllByRole('textbox', { name: 'Group query' });
    await userEvent.type(firstQuery, '!');

    const groups = lastCall(onSettingsChange).groups;
    expect(groups[0].query).toBe('first!');
    expect(groups[1]).toEqual({ id: 'b', query: 'second', color: '#f472b6' });
  });

  test('removing a row drops it and keeps the rest in order', async () => {
    const settings = getDefaultGraphSettings('docked');
    settings.groups = [
      { id: 'a', query: 'first', color: '#60a5fa' },
      { id: 'b', query: 'second', color: '#f472b6' },
    ];
    const { onSettingsChange } = await openPopover(settings);
    await openSection('Groups');

    const [firstRemove] = screen.getAllByRole('button', { name: 'Remove group' });
    await userEvent.click(firstRemove);

    expect(lastCall(onSettingsChange).groups).toEqual([
      { id: 'b', query: 'second', color: '#f472b6' },
    ]);
  });

  test('picking a swatch recolors that group', async () => {
    const settings = getDefaultGraphSettings('docked');
    settings.groups = [{ id: 'a', query: 'first', color: '#60a5fa' }];
    const { onSettingsChange } = await openPopover(settings);
    await openSection('Groups');

    await userEvent.click(screen.getByRole('button', { name: 'Group color' }));
    // The swatch grid labels each chip with its own hex.
    const swatches = screen.getAllByRole('button', { name: /^#[0-9a-f]{6}$/i });
    const other = swatches.find(
      (button) => button.getAttribute('aria-label')?.toLowerCase() !== '#60a5fa',
    );
    if (!other) throw new Error('expected more than one swatch');
    await userEvent.click(other);

    expect(lastCall(onSettingsChange).groups[0].color).toBe(
      other.getAttribute('aria-label') as string,
    );
  });
});

describe('GraphSettingsPopover — restore defaults', () => {
  afterEach(cleanup);

  test('replaces the whole preset, including groups, with the scope defaults', async () => {
    const settings: GraphSettings = {
      filters: {
        query: 'kayak',
        showExternalNodes: true,
        showMissingNodes: false,
        showOrphans: false,
        showTagNodes: true,
      },
      display: {
        nodeSize: 2,
        linkThickness: 3,
        showArrows: false,
        showFolderAreas: false,
        textFadeThreshold: 0,
        maxLabels: 50,
      },
      forces: { centerStrength: 0, repelStrength: 200, linkStrength: 2, linkDistance: 90 },
      groups: [{ id: 'a', query: 'first', color: '#60a5fa' }],
    };
    const { onSettingsChange } = await openPopover(settings);
    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));

    expect(lastCall(onSettingsChange)).toEqual(getDefaultGraphSettings('docked'));
  });

  test('restores the docked label budget, not the fullscreen one', async () => {
    const { onSettingsChange } = await openPopover();
    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(lastCall(onSettingsChange).display.maxLabels).toBe(30);
  });
});

describe('GraphSettingsPopover — section structure', () => {
  afterEach(cleanup);

  test('collapses every section but Filters so the popover fits the docked rail', async () => {
    await openPopover();
    for (const section of ['Groups', 'Display', 'Forces']) {
      expect(screen.getByRole('button', { name: section }).getAttribute('aria-expanded')).toBe(
        'false',
      );
    }
    expect(screen.getByRole('button', { name: 'Filters' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  test('a collapsed section reveals its controls once opened', async () => {
    await openPopover();
    expect(screen.queryByRole('slider', { name: 'Link distance' })).toBeNull();
    await openSection('Forces');
    const forces = screen.getByRole('slider', { name: 'Link distance' });
    expect(within(forces.closest('div') as HTMLElement).queryByRole('slider')).toBeTruthy();
  });
});
