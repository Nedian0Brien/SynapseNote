import { describe, expect, test } from 'bun:test';
import { getDefaultGraphSettings } from '@/lib/graph-settings-store';
import {
  GRAPH_ZOOM_CARD_IN,
  GRAPH_ZOOM_FOCUS_IN,
  getGraphAlphaDecay,
  getGraphInteractionMode,
  getGraphPhysicsProfile,
  isGraphFocusMode,
} from './graph-interaction-mode';

const FORCES = getDefaultGraphSettings('fullscreen').forces;

function mode(overrides: Partial<Parameters<typeof getGraphInteractionMode>[0]> = {}) {
  return getGraphInteractionMode({
    selectedNodeId: 'notes/A',
    zoomScale: 1,
    canSelect: true,
    ...overrides,
  });
}

describe('getGraphInteractionMode', () => {
  test('is browse with nothing selected, however far in the user zooms', () => {
    expect(mode({ selectedNodeId: null, zoomScale: 5 })).toBe('browse');
  });

  test('is browse in a view that cannot hold a selection', () => {
    // The docked rail navigates on click; a 2-hop neighborhood is already a
    // focused view, so it must not start pinning nodes when zoomed.
    expect(mode({ canSelect: false, zoomScale: 5 })).toBe('browse');
  });

  test('walks select → focus → card as the zoom climbs', () => {
    expect(mode({ zoomScale: 1 })).toBe('select');
    expect(mode({ zoomScale: GRAPH_ZOOM_FOCUS_IN })).toBe('focus');
    expect(mode({ zoomScale: GRAPH_ZOOM_CARD_IN })).toBe('card');
  });

  test('treats the thresholds as inclusive lower bounds', () => {
    expect(mode({ zoomScale: GRAPH_ZOOM_FOCUS_IN - 0.001 })).toBe('select');
    expect(mode({ zoomScale: GRAPH_ZOOM_CARD_IN - 0.001 })).toBe('focus');
  });

  test('holds a mode through a small dip below its entry point', () => {
    // A settling simulation drifts the zoom slightly; without hysteresis the
    // mode flickers while the user's hand is still.
    expect(mode({ zoomScale: GRAPH_ZOOM_FOCUS_IN - 0.1, previousMode: 'focus' })).toBe('focus');
    expect(mode({ zoomScale: GRAPH_ZOOM_CARD_IN - 0.1, previousMode: 'card' })).toBe('card');
  });

  test('still releases a mode on a real zoom-out', () => {
    expect(mode({ zoomScale: GRAPH_ZOOM_FOCUS_IN - 0.5, previousMode: 'focus' })).toBe('select');
    expect(mode({ zoomScale: GRAPH_ZOOM_CARD_IN - 0.5, previousMode: 'card' })).toBe('focus');
  });

  test('does not let hysteresis hold a mode after the selection clears', () => {
    expect(mode({ selectedNodeId: null, zoomScale: 5, previousMode: 'card' })).toBe('browse');
  });
});

describe('isGraphFocusMode', () => {
  test('covers focus and card, not the surveying modes', () => {
    expect(isGraphFocusMode('focus')).toBe(true);
    expect(isGraphFocusMode('card')).toBe(true);
    expect(isGraphFocusMode('select')).toBe(false);
    expect(isGraphFocusMode('browse')).toBe(false);
  });
});

describe('getGraphPhysicsProfile', () => {
  test('hands the user settings back untouched while browsing', () => {
    expect(getGraphPhysicsProfile('browse', FORCES)).toEqual({
      ...FORCES,
      pinSelectedNode: false,
    });
    expect(getGraphPhysicsProfile('select', FORCES)).toEqual({
      ...FORCES,
      pinSelectedNode: false,
    });
  });

  test('pins the selection and kills centering in focus', () => {
    const profile = getGraphPhysicsProfile('focus', FORCES);
    expect(profile.pinSelectedNode).toBe(true);
    // Any centering at all drags the neighborhood out from under the cursor.
    expect(profile.centerStrength).toBe(0);
  });

  test('shortens links relative to the user value rather than replacing it', () => {
    const wide = { ...FORCES, linkDistance: 200 };
    expect(getGraphPhysicsProfile('focus', wide).linkDistance).toBeCloseTo(172, 5);
    expect(getGraphPhysicsProfile('focus', FORCES).linkDistance).toBeCloseTo(
      FORCES.linkDistance * 0.86,
      5,
    );
  });

  test('leaves repel and link strength to the user in every mode', () => {
    const tuned = { ...FORCES, repelStrength: 120, linkStrength: 2 };
    const profile = getGraphPhysicsProfile('card', tuned);
    expect(profile.repelStrength).toBe(120);
    expect(profile.linkStrength).toBe(2);
  });
});

describe('getGraphAlphaDecay', () => {
  test('cools slowly in focus so the pinned neighborhood can settle', () => {
    expect(getGraphAlphaDecay('focus')).toBeLessThan(getGraphAlphaDecay('browse'));
    expect(getGraphAlphaDecay('card')).toBe(getGraphAlphaDecay('focus'));
    expect(getGraphAlphaDecay('select')).toBe(getGraphAlphaDecay('browse'));
  });
});
