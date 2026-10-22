import { describe, expect, test } from 'bun:test';
import type { GraphGroup } from '@/lib/graph-settings-store';
import { GRAPH_COLOR_PAIRS } from './graph-colors';
import {
  GRAPH_GROUP_SWATCHES,
  matchGraphGroup,
  nextGraphGroupColor,
  resolveGraphGroupColor,
} from './graph-groups';
import type { GraphNode } from './graph-view-utils';

function doc(docName: string, tags: string[] | null = null): GraphNode {
  return {
    kind: 'doc',
    id: docName,
    docName,
    anchor: null,
    label: docName,
    cluster: null,
    category: null,
    tags,
  };
}

describe('GRAPH_GROUP_SWATCHES', () => {
  test('offers no two swatches that collapse to the same light-theme color', () => {
    // A user picks in dark mode and may read the graph in light mode; two chips
    // that look distinct in one theme and identical in the other read as a bug.
    const lightColors = GRAPH_GROUP_SWATCHES.map((color) => resolveGraphGroupColor(color, false));
    expect(new Set(lightColors).size).toBe(GRAPH_GROUP_SWATCHES.length);
  });

  test('every swatch is a hex color the settings store will accept', () => {
    for (const color of GRAPH_GROUP_SWATCHES) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('has enough swatches to color a full group list without repeating', () => {
    expect(GRAPH_GROUP_SWATCHES.length).toBeGreaterThanOrEqual(12);
  });
});

describe('resolveGraphGroupColor', () => {
  test('returns the stored color unchanged in dark mode', () => {
    const swatch = GRAPH_GROUP_SWATCHES[0];
    expect(resolveGraphGroupColor(swatch, true)).toBe(swatch);
  });

  test('translates a swatch to its light-theme counterpart', () => {
    const pair = GRAPH_COLOR_PAIRS[0];
    expect(resolveGraphGroupColor(pair.dark, false)).toBe(pair.light);
  });

  test('matches a swatch regardless of hex casing', () => {
    const pair = GRAPH_COLOR_PAIRS[0];
    expect(resolveGraphGroupColor(pair.dark.toUpperCase(), false)).toBe(pair.light);
  });

  test('honors an unrecognized color as authored instead of snapping it', () => {
    expect(resolveGraphGroupColor('#123456', false)).toBe('#123456');
  });
});

describe('matchGraphGroup', () => {
  const groups: GraphGroup[] = [
    { id: 'a', query: 'tag:draft', color: '#60a5fa' },
    { id: 'b', query: 'notes/', color: '#f472b6' },
  ];

  test('returns the first group in list order that matches', () => {
    // The draft page matches both rules; list order is the tiebreak, which is
    // what makes reordering the list a usable way to resolve an overlap.
    expect(matchGraphGroup(doc('notes/Draft', ['draft']), groups)?.id).toBe('a');
    expect(matchGraphGroup(doc('notes/Plain'), groups)?.id).toBe('b');
  });

  test('returns null when nothing matches', () => {
    expect(matchGraphGroup(doc('other/Page'), groups)).toBeNull();
  });

  test('returns null for an empty group list', () => {
    expect(matchGraphGroup(doc('notes/Page'), [])).toBeNull();
  });

  test('ignores a group whose query is empty or whitespace', () => {
    // An empty query would otherwise match every node and paint the whole graph
    // the moment a user adds a row and has not typed into it yet.
    expect(
      matchGraphGroup(doc('notes/Page'), [{ id: 'x', query: '', color: '#60a5fa' }]),
    ).toBeNull();
    expect(
      matchGraphGroup(doc('notes/Page'), [{ id: 'x', query: '   ', color: '#60a5fa' }]),
    ).toBeNull();
  });
});

describe('nextGraphGroupColor', () => {
  test('starts at the first swatch for an empty list', () => {
    expect(nextGraphGroupColor([])).toBe(GRAPH_GROUP_SWATCHES[0]);
  });

  test('skips colors already in use', () => {
    const existing: GraphGroup[] = [{ id: 'a', query: 'x', color: GRAPH_GROUP_SWATCHES[0] }];
    expect(nextGraphGroupColor(existing)).toBe(GRAPH_GROUP_SWATCHES[1]);
  });

  test('ignores casing when deciding what is already used', () => {
    const existing: GraphGroup[] = [
      { id: 'a', query: 'x', color: GRAPH_GROUP_SWATCHES[0].toUpperCase() },
    ];
    expect(nextGraphGroupColor(existing)).toBe(GRAPH_GROUP_SWATCHES[1]);
  });

  test('wraps around once every swatch is taken', () => {
    const existing: GraphGroup[] = GRAPH_GROUP_SWATCHES.map((color, index) => ({
      id: `g${index}`,
      query: 'x',
      color,
    }));
    expect(GRAPH_GROUP_SWATCHES).toContain(nextGraphGroupColor(existing));
  });
});
