import { describe, expect, test } from 'bun:test';
import {
  getGraphLabelTier,
  getGraphLabelZoomThreshold,
  isGraphLabelVisibleAtZoom,
  MIN_GRAPH_LABEL_ZOOM_FACTOR,
} from './graph-label-tiers';

describe('getGraphLabelTier', () => {
  test('a folder is a folder whatever its edge count', () => {
    // The original keyed the earliest tier on the node's KIND, not on how
    // connected it happened to be: a directory is a place, and places are
    // named from further out than the pages inside them.
    expect(getGraphLabelTier({ degree: 0, isActive: false, isFolder: true })).toBe('folder');
    expect(getGraphLabelTier({ degree: 99, isActive: false, isFolder: true })).toBe('folder');
  });

  test("ranks pages by edge count, at the original's four", () => {
    expect(getGraphLabelTier({ degree: 20, isActive: false })).toBe('hub');
    expect(getGraphLabelTier({ degree: 4, isActive: false })).toBe('hub');
    expect(getGraphLabelTier({ degree: 3, isActive: false })).toBe('leaf');
    expect(getGraphLabelTier({ degree: 0, isActive: false })).toBe('leaf');
  });

  test('the active document outranks both', () => {
    // It is the label that orients the rest of the screen, so an orphaned
    // active page still gets named.
    expect(getGraphLabelTier({ degree: 0, isActive: true })).toBe('active');
    expect(getGraphLabelTier({ degree: 0, isActive: true, isFolder: true })).toBe('active');
  });
});

describe('getGraphLabelZoomThreshold', () => {
  test('the leaf tier is exactly the user setting', () => {
    // The slider is the authority; every other tier is stated relative to it.
    expect(getGraphLabelZoomThreshold('leaf', 1.8)).toBe(1.8);
    expect(getGraphLabelZoomThreshold('leaf', 0.5)).toBe(0.5);
  });

  test("holds the original's ratios between the tiers", () => {
    // It used 0.40 for directories, 0.55 for hubs and 0.78 for plain pages.
    expect(getGraphLabelZoomThreshold('folder', 0.78)).toBeCloseTo(0.4, 10);
    expect(getGraphLabelZoomThreshold('hub', 0.78)).toBeCloseTo(0.55, 10);
    expect(getGraphLabelZoomThreshold('leaf', 0.78)).toBeCloseTo(0.78, 10);
  });

  test('places name themselves first, then hubs, then everything else', () => {
    const thresholds = (['active', 'folder', 'hub', 'leaf'] as const).map((tier) =>
      getGraphLabelZoomThreshold(tier, 1.8),
    );
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(new Set(thresholds).size).toBe(4);
  });

  test('the active tier is never hidden', () => {
    expect(getGraphLabelZoomThreshold('active', 1.8)).toBe(0);
    expect(getGraphLabelZoomThreshold('active', 4)).toBe(0);
  });

  test('scales with the setting rather than being fixed', () => {
    // Someone who drops the slider to 0 wants every label always on.
    expect(getGraphLabelZoomThreshold('hub', 0)).toBe(0);
    expect(getGraphLabelZoomThreshold('hub', 3.6)).toBeCloseTo(
      getGraphLabelZoomThreshold('hub', 1.8) * 2,
      10,
    );
  });
});

describe('isGraphLabelVisibleAtZoom', () => {
  const at = (
    degree: number,
    zoomScale: number,
    extra: { isActive?: boolean; isFolder?: boolean } = {},
  ) =>
    isGraphLabelVisibleAtZoom({
      degree,
      isActive: extra.isActive ?? false,
      isFolder: extra.isFolder ?? false,
      zoomScale,
      leafThreshold: 1.8,
    });

  test('thins down to the landmarks as the user zooms out', () => {
    // Close in: everything. Then the leaves go, then the hubs, then the
    // folders — the reverse of the order they arrived in.
    expect([at(0, 1.8, { isFolder: true }), at(4, 1.8), at(1, 1.8)]).toEqual([true, true, true]);
    expect([at(0, 1.4, { isFolder: true }), at(4, 1.4), at(1, 1.4)]).toEqual([true, true, false]);
    expect([at(0, 1.0, { isFolder: true }), at(4, 1.0), at(1, 1.0)]).toEqual([true, false, false]);
    expect([at(0, 0.4, { isFolder: true }), at(4, 0.4), at(1, 0.4)]).toEqual([false, false, false]);
  });

  test('keeps the active document labelled at any zoom', () => {
    expect(at(0, 0.01, { isActive: true })).toBe(true);
  });

  test('shows every label when the threshold is zero', () => {
    expect(
      isGraphLabelVisibleAtZoom({ degree: 0, isActive: false, zoomScale: 0, leafThreshold: 0 }),
    ).toBe(true);
  });
});

describe('MIN_GRAPH_LABEL_ZOOM_FACTOR', () => {
  test('is the most permissive factor, so callers can gate all label work on it', () => {
    expect(MIN_GRAPH_LABEL_ZOOM_FACTOR).toBe(0);
  });
});
