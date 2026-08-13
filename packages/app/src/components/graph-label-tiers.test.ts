import { describe, expect, test } from 'bun:test';
import {
  getGraphLabelTier,
  getGraphLabelZoomThreshold,
  isGraphLabelVisibleAtZoom,
  MIN_GRAPH_LABEL_ZOOM_FACTOR,
} from './graph-label-tiers';

describe('getGraphLabelTier', () => {
  test('ranks by edge count', () => {
    expect(getGraphLabelTier({ degree: 20, isActive: false })).toBe('hub');
    expect(getGraphLabelTier({ degree: 8, isActive: false })).toBe('hub');
    expect(getGraphLabelTier({ degree: 7, isActive: false })).toBe('prominent');
    expect(getGraphLabelTier({ degree: 3, isActive: false })).toBe('prominent');
    expect(getGraphLabelTier({ degree: 2, isActive: false })).toBe('leaf');
    expect(getGraphLabelTier({ degree: 0, isActive: false })).toBe('leaf');
  });

  test('the active document outranks its own edge count', () => {
    // It is the label that orients the rest of the screen, so an orphaned
    // active page still gets named.
    expect(getGraphLabelTier({ degree: 0, isActive: true })).toBe('active');
    expect(getGraphLabelTier({ degree: 99, isActive: true })).toBe('active');
  });
});

describe('getGraphLabelZoomThreshold', () => {
  test('the leaf tier is exactly the user setting', () => {
    // The slider is the authority; every other tier is stated relative to it.
    expect(getGraphLabelZoomThreshold('leaf', 1.8)).toBe(1.8);
    expect(getGraphLabelZoomThreshold('leaf', 0.5)).toBe(0.5);
  });

  test('more connected tiers appear further out', () => {
    const thresholds = (['active', 'hub', 'prominent', 'leaf'] as const).map((tier) =>
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
    expect(getGraphLabelZoomThreshold('hub', 1.8)).toBeCloseTo(0.9, 5);
    expect(getGraphLabelZoomThreshold('hub', 3.6)).toBeCloseTo(1.8, 5);
  });
});

describe('isGraphLabelVisibleAtZoom', () => {
  const at = (degree: number, zoomScale: number, isActive = false) =>
    isGraphLabelVisibleAtZoom({ degree, isActive, zoomScale, leafThreshold: 1.8 });

  test('thins down to the landmarks as the user zooms out', () => {
    // Close in: everything. Mid: hubs and mid-degree pages. Far: hubs only.
    expect([at(20, 1.8), at(4, 1.8), at(1, 1.8)]).toEqual([true, true, true]);
    expect([at(20, 1.4), at(4, 1.4), at(1, 1.4)]).toEqual([true, true, false]);
    expect([at(20, 1.0), at(4, 1.0), at(1, 1.0)]).toEqual([true, false, false]);
    expect([at(20, 0.4), at(4, 0.4), at(1, 0.4)]).toEqual([false, false, false]);
  });

  test('keeps the active document labelled at any zoom', () => {
    expect(at(0, 0.01, true)).toBe(true);
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
