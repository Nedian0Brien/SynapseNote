import { describe, expect, test } from 'bun:test';
import { GRAPH_HUB_DEGREE, getGraphNodeStyle, getGraphNodeWorldRadius } from './graph-node-style';
import type { GraphDocDisplayState, GraphNode, GraphNodeVisualState } from './graph-view-utils';

function doc(docName = 'notes/A'): GraphNode {
  return {
    kind: 'doc',
    id: docName,
    docName,
    anchor: null,
    label: docName,
    cluster: null,
    category: null,
    tags: null,
  };
}

const FOLDER: GraphNode = {
  kind: 'folder',
  id: 'folder:notes',
  label: 'notes',
  path: 'notes',
  memberCount: 2,
};

function style({
  node = doc(),
  degree = 0,
  displayState = 'doc' as GraphDocDisplayState,
  visualState = 'default' as GraphNodeVisualState,
  isFocused = false,
} = {}) {
  return getGraphNodeStyle({ node, degree, displayState, visualState, isFocused });
}

describe('getGraphNodeStyle — the original’s three kinds', () => {
  test('an ordinary page is a small outlined disc with a document mark', () => {
    expect(style({ degree: 1 })).toMatchObject({
      kind: 'doc',
      radius: 7,
      strokeWidth: 1.2,
      glyph: 'article',
    });
  });

  test('a well-connected page becomes a hub showing its edge count', () => {
    expect(style({ degree: GRAPH_HUB_DEGREE })).toMatchObject({
      kind: 'hub',
      emphasis: 'strong',
      glyph: 'degree',
      strokeWidth: 1.8,
    });
    expect(style({ degree: GRAPH_HUB_DEGREE - 1 }).kind).toBe('doc');
  });

  test('four edges, not eight — the original’s cutoff', () => {
    expect(GRAPH_HUB_DEGREE).toBe(4);
  });

  test('a directory is solid, largest, and carries a folder mark', () => {
    expect(style({ node: FOLDER })).toMatchObject({
      kind: 'dir',
      glyph: 'folder',
      glyphSize: 13,
    });
    // Bigger than a page, and bigger than a hub of the same connectedness —
    // the two ceilings meet at 18, so the comparison is made below them.
    expect(style({ node: FOLDER }).radius).toBeGreaterThan(style({ degree: 1 }).radius);
    expect(style({ node: FOLDER, degree: 5 }).radius).toBeGreaterThan(style({ degree: 5 }).radius);
  });

  test('a folder target is a directory too — it is a structural anchor', () => {
    expect(style({ displayState: 'folder' }).kind).toBe('dir');
  });

  test('everything referenced but not a page recedes to the same faint ghost', () => {
    const ghosts = [
      style({ displayState: 'missing' }),
      style({ node: { kind: 'external', id: 'https://x', url: 'https://x', label: 'x' } }),
      style({ node: { kind: 'tag', id: 'tag:x', tag: 'x', label: 'x' } }),
    ];
    for (const ghost of ghosts) {
      expect(ghost).toMatchObject({ kind: 'ghost', emphasis: 'faint', glyph: null });
    }
  });

  test('a ghost never shows a degree, however connected it is', () => {
    expect(style({ displayState: 'missing', degree: 40 }).glyph).toBeNull();
  });
});

describe('getGraphNodeStyle — hue is spent only on state', () => {
  test('state changes the emphasis, never the kind', () => {
    for (const visualState of ['selected', 'active', 'active-selected'] as GraphNodeVisualState[]) {
      expect(style({ degree: 1, visualState }).kind).toBe('doc');
    }
    expect(style({ degree: 1, visualState: 'active' }).emphasis).toBe('accent');
    expect(style({ degree: 1, visualState: 'selected' }).emphasis).toBe('selected');
  });
});

describe('getGraphNodeWorldRadius', () => {
  test("is the original's formulas", () => {
    // dir: clamp(18 + degree * 0.8, 14, 26); hub: clamp(12 + degree * 0.6, 12, 18); doc: 7
    expect(getGraphNodeWorldRadius({ kind: 'dir', degree: 0 })).toBe(18);
    expect(getGraphNodeWorldRadius({ kind: 'dir', degree: 5 })).toBe(22);
    expect(getGraphNodeWorldRadius({ kind: 'hub', degree: 4 })).toBeCloseTo(14.4, 5);
    expect(getGraphNodeWorldRadius({ kind: 'doc', degree: 0 })).toBe(7);
  });

  test('grows with connectedness, then stops', () => {
    expect(getGraphNodeWorldRadius({ kind: 'hub', degree: 40 })).toBe(18);
    expect(getGraphNodeWorldRadius({ kind: 'dir', degree: 400 })).toBe(26);
  });

  test('linear below the ceiling — a 6-edge hub reads as bigger than a 4-edge one', () => {
    expect(getGraphNodeWorldRadius({ kind: 'hub', degree: 6 })).toBeGreaterThan(
      getGraphNodeWorldRadius({ kind: 'hub', degree: 4 }),
    );
  });

  test('a directory shrinks in a focused view, as the original had it', () => {
    expect(getGraphNodeWorldRadius({ kind: 'dir', degree: 10, isFocused: true })).toBeCloseTo(
      26 * 0.76,
      5,
    );
    // Only directories: the focus scale never applied to anything else.
    expect(getGraphNodeWorldRadius({ kind: 'doc', degree: 0, isFocused: true })).toBe(7);
  });
});
