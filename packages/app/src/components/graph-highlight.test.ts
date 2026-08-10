import { describe, expect, test } from 'bun:test';
import {
  buildGraphAdjacency,
  getGraphHighlightSet,
  isGraphLinkHighlighted,
  isStructuralGraphLink,
} from './graph-highlight';

const LINKS = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'a' },
  { source: 'd', target: 'a' },
];

describe('buildGraphAdjacency', () => {
  test('records both directions of every link', () => {
    const adjacency = buildGraphAdjacency([{ source: 'a', target: 'b' }]);
    expect([...(adjacency.get('a') ?? [])]).toEqual(['b']);
    expect([...(adjacency.get('b') ?? [])]).toEqual(['a']);
  });

  test('accepts endpoints that force-graph has replaced with node objects', () => {
    // The simulation mutates links in place, swapping string ids for the node
    // objects themselves, so adjacency must read both shapes.
    const adjacency = buildGraphAdjacency([{ source: { id: 'a' }, target: 'b' }]);
    expect(adjacency.get('a')?.has('b')).toBe(true);
    expect(adjacency.get('b')?.has('a')).toBe(true);
  });

  test('accepts numeric endpoint ids', () => {
    const adjacency = buildGraphAdjacency([{ source: { id: 7 }, target: { id: 8 } }]);
    expect(adjacency.get('7')?.has('8')).toBe(true);
  });

  test('skips a link with an unresolvable endpoint instead of keying on a bogus id', () => {
    const adjacency = buildGraphAdjacency([
      { source: 'a', target: null },
      { source: undefined, target: 'b' },
      { source: { id: null }, target: 'c' },
    ]);
    expect(adjacency.size).toBe(0);
  });

  test('collapses duplicate links into a single neighbor entry', () => {
    const adjacency = buildGraphAdjacency([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
    ]);
    expect(adjacency.get('a')?.size).toBe(1);
  });

  test('ignores a self-link rather than listing a node as its own neighbor twice', () => {
    const adjacency = buildGraphAdjacency([{ source: 'a', target: 'a' }]);
    expect([...(adjacency.get('a') ?? [])]).toEqual(['a']);
  });
});

describe('getGraphHighlightSet', () => {
  const adjacency = buildGraphAdjacency(LINKS);

  test('returns null when nothing is hovered', () => {
    // null means "dim nothing" — an empty Set would dim the entire canvas.
    expect(getGraphHighlightSet(null, adjacency)).toBeNull();
  });

  test('includes the hovered node and its direct neighbors only', () => {
    const highlighted = getGraphHighlightSet('a', adjacency);
    expect([...(highlighted ?? [])].sort()).toEqual(['a', 'b', 'c', 'd']);

    // b reaches d in two hops; one hop is the boundary, matching Obsidian.
    expect([...(getGraphHighlightSet('b', adjacency) ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });

  test('returns just the node itself when it has no edges', () => {
    expect([...(getGraphHighlightSet('lonely', adjacency) ?? [])]).toEqual(['lonely']);
  });
});

describe('isGraphLinkHighlighted', () => {
  test('is false when nothing is hovered', () => {
    expect(isGraphLinkHighlighted({ source: 'a', target: 'b' }, null)).toBe(false);
  });

  test('is true for the hovered node’s own edges, from either end', () => {
    expect(isGraphLinkHighlighted({ source: 'a', target: 'b' }, 'a')).toBe(true);
    expect(isGraphLinkHighlighted({ source: 'b', target: 'a' }, 'a')).toBe(true);
  });

  test('is false for an edge between two neighbors of the hovered node', () => {
    // b and c are both highlighted when hovering a, but the b–c edge is context,
    // not part of what the hover points at.
    expect(isGraphLinkHighlighted({ source: 'b', target: 'c' }, 'a')).toBe(false);
  });

  test('reads endpoints that the simulation replaced with node objects', () => {
    expect(isGraphLinkHighlighted({ source: { id: 'a' }, target: { id: 'b' } }, 'a')).toBe(true);
  });
});

describe('isStructuralGraphLink', () => {
  test('is true only when both ends are real pages', () => {
    expect(isStructuralGraphLink({ source: 'notes/A', target: 'notes/B' })).toBe(true);
  });

  test('is false for the annotation kinds, from either end', () => {
    // Tags and external URLs hang off the structure; drawn at the same weight
    // they bury it, because a tagged project has more of them than of pages.
    expect(isStructuralGraphLink({ source: 'notes/A', target: 'tag:idea' })).toBe(false);
    expect(isStructuralGraphLink({ source: 'tag:idea', target: 'notes/A' })).toBe(false);
    expect(isStructuralGraphLink({ source: 'notes/A', target: 'external:https://x.test' })).toBe(
      false,
    );
  });

  test('is false when an endpoint cannot be resolved', () => {
    expect(isStructuralGraphLink({ source: 'notes/A', target: null })).toBe(false);
  });

  test('reads endpoints the simulation replaced with node objects', () => {
    expect(isStructuralGraphLink({ source: { id: 'notes/A' }, target: { id: 'notes/B' } })).toBe(
      true,
    );
    expect(isStructuralGraphLink({ source: { id: 'notes/A' }, target: { id: 'tag:x' } })).toBe(
      false,
    );
  });
});
