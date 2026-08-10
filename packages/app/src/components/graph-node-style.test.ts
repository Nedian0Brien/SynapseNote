import { describe, expect, test } from 'bun:test';
import { GRAPH_HUB_DEGREE, getGraphNodeStyle } from './graph-node-style';
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

function style({
  node = doc(),
  degree = 0,
  displayState = 'doc' as GraphDocDisplayState,
  visualState = 'default' as GraphNodeVisualState,
} = {}) {
  return getGraphNodeStyle({ node, degree, displayState, visualState });
}

describe('getGraphNodeStyle — weight carries the hierarchy', () => {
  test('an ordinary page is a plain dot', () => {
    expect(style({ degree: 1 })).toMatchObject({ shape: 'dot', showDegree: false, scale: 1 });
  });

  test('a well-connected page becomes a ring that shows its edge count', () => {
    expect(style({ degree: GRAPH_HUB_DEGREE })).toMatchObject({
      shape: 'ring',
      emphasis: 'strong',
      showDegree: true,
    });
    expect(style({ degree: GRAPH_HUB_DEGREE - 1 }).shape).toBe('dot');
  });

  test('a folder target is solid — it is a structural anchor', () => {
    expect(style({ displayState: 'folder' })).toMatchObject({
      shape: 'filled',
      emphasis: 'strong',
    });
  });

  test('everything referenced but not a page recedes to the same faint ghost', () => {
    // This is the change that matters: unresolved links used to be alarm red
    // and outnumbered real pages several to one.
    const missing = style({ displayState: 'missing' });
    const external: GraphNode = {
      kind: 'external',
      id: 'external:https://x.test',
      url: 'https://x.test',
      label: 'x',
    };
    const tag: GraphNode = { kind: 'tag', id: 'tag:idea', label: '#idea', tag: 'idea' };

    for (const result of [missing, style({ node: external }), style({ node: tag })]) {
      expect(result).toMatchObject({ shape: 'ghost', emphasis: 'faint' });
      expect(result.scale).toBeLessThan(1);
    }
  });

  test('a ghost never shows a degree, however connected it is', () => {
    expect(style({ displayState: 'missing', degree: 50 }).showDegree).toBe(false);
  });
});

describe('getGraphNodeStyle — hue is spent only on state', () => {
  test('the active document is the one accent in the graph', () => {
    expect(style({ visualState: 'active' }).emphasis).toBe('accent');
    expect(style({ visualState: 'active-selected' }).emphasis).toBe('accent');
  });

  test('selection outranks the weight a node would get from its role', () => {
    expect(style({ visualState: 'selected', degree: 1 }).emphasis).toBe('selected');
    expect(
      style({
        visualState: 'tag-selected',
        node: { kind: 'tag', id: 'tag:x', label: '#x', tag: 'x' },
      }).emphasis,
    ).toBe('selected');
  });

  test('state does not change the SHAPE, only the emphasis', () => {
    // A selected hub is still a hub — otherwise clicking a node makes it
    // impossible to see what kind of thing you selected.
    expect(style({ degree: 10, visualState: 'selected' }).shape).toBe('ring');
    expect(style({ displayState: 'missing', visualState: 'selected' }).shape).toBe('ghost');
  });
});

describe('getGraphNodeStyle — hub scaling', () => {
  test('grows with connectedness', () => {
    expect(style({ degree: 30 }).scale).toBeGreaterThan(style({ degree: 5 }).scale);
  });

  test('grows logarithmically, so one giant hub cannot dwarf the graph', () => {
    // A 400-edge hub is roughly twice a 4-edge one, not a hundred times.
    expect(style({ degree: 400 }).scale).toBeLessThanOrEqual(2);
    expect(style({ degree: 4000 }).scale).toBeLessThanOrEqual(2);
  });
});
