import { describe, expect, it } from 'bun:test';
import { buildShiftKeyframes, computeFreezeRange, TOOLBAR_HEIGHT } from './frozen-table-headers.ts';

describe('computeFreezeRange (scroll-driven animation ranges)', () => {
  // The scroll-driven animation maps scrollTop ∈ [startOffset, endOffset]
  // linearly onto shift ∈ [0, maxShift] with fill: both clamping. So for any
  // scroll position S: shift(S) = clamp(S - startOffset, 0, maxShift). All
  // tests below import the production functions — no local reimplementation
  // that could silently diverge.

  it('returns null for a single-row table (header is the whole table)', () => {
    expect(computeFreezeRange(0, 0, 100, 40, 40)).toBeNull();
  });

  it('places startOffset where the table top meets the toolbar boundary', () => {
    // At scrollTop 0 the table top sits TOOLBAR_HEIGHT + 100 down the document,
    // so the freeze begins 100px into the scroll. Derived from the exported
    // constant rather than a literal: the toolbar's height is a product
    // decision (it changed when the Markdown tools were inlined into the
    // identity row) and this geometry must follow it, not restate it.
    const tableDocTop = TOOLBAR_HEIGHT + 100;
    const range = computeFreezeRange(0, 0, tableDocTop, 1000, 40);
    expect(range).toEqual({ startOffset: 100, endOffset: 1060, maxShift: 960 });
  });

  it('is invariant to the scroll position at which geometry is measured', () => {
    // Same table measured at scrollTop 0 and after scrolling 300px (its
    // viewport-space top is 300px higher) must produce identical ranges.
    const tableDocTop = TOOLBAR_HEIGHT + 100;
    const atTop = computeFreezeRange(0, 0, tableDocTop, 1000, 40);
    const scrolled = computeFreezeRange(300, 0, tableDocTop - 300, 1000, 40);
    expect(scrolled).toEqual(atTop);
  });

  it('agrees with the per-frame shift formula across the whole scroll range', () => {
    const containerTop = 0;
    const tableDocTop = TOOLBAR_HEIGHT + 100; // table top in document space (scrollTop 0 measurement)
    const tableHeight = 1000;
    const headerHeight = 40;
    const range = computeFreezeRange(0, containerTop, tableDocTop, tableHeight, headerHeight);
    if (!range) throw new Error('expected a range');
    for (const scrollTop of [0, 50, 100, 101, 500, 1060, 1500]) {
      const animShift = Math.max(0, Math.min(scrollTop - range.startOffset, range.maxShift));
      // computeShift semantics at this scroll position (viewport-space table top).
      const tableTop = tableDocTop - scrollTop;
      const expected = Math.max(
        0,
        Math.min(containerTop + TOOLBAR_HEIGHT - tableTop, tableHeight - headerHeight),
      );
      expect(animShift).toBe(expected);
    }
  });

  it('yields a negative startOffset for a table starting under the toolbar', () => {
    // Table top 54px above the toolbar boundary: the header is already
    // partially frozen at scrollTop 0 (progress > 0 via fill: both).
    const range = computeFreezeRange(0, 0, TOOLBAR_HEIGHT - 54, 400, 40);
    expect(range?.startOffset).toBe(-54);
  });
});

describe('buildShiftKeyframes', () => {
  const ty = (k: Keyframe): number =>
    Number(/translateY\((-?[\d.]+)px\)/.exec(String(k.transform))?.[1]);

  it('emits plateau-ramp-plateau keyframes for a mid-document table', () => {
    // startOffset 100, maxShift 900, scrollMax 2000.
    const frames = buildShiftKeyframes({ startOffset: 100, endOffset: 1000, maxShift: 900 }, 2000);
    expect(frames.map((f) => f.offset)).toEqual([0, 0.05, 0.5, 1]);
    expect(frames.map(ty)).toEqual([0, 0, 900, 900]);
  });

  it('clamps a negative startOffset (table already under the toolbar at scroll 0)', () => {
    const frames = buildShiftKeyframes({ startOffset: -50, endOffset: 150, maxShift: 200 }, 1000);
    expect(frames[0]?.offset).toBe(0);
    // At scroll 0 the header is already shifted by 50.
    expect(ty(frames[0] as Keyframe)).toBe(50);
    expect(frames.map((f) => f.offset)).toEqual([0, 0.15, 1]);
    expect(frames.map(ty)).toEqual([50, 200, 200]);
  });

  it('keeps offsets non-decreasing and within [0, 1] when the freeze window exceeds scroll range', () => {
    // endOffset beyond scrollMax: ramp continues to the end of the range.
    const frames = buildShiftKeyframes({ startOffset: 500, endOffset: 3000, maxShift: 2500 }, 1000);
    expect(frames.map((f) => f.offset)).toEqual([0, 0.5, 1]);
    expect(frames.map(ty)).toEqual([0, 0, 500]);
  });
});
