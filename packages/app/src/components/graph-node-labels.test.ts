import { describe, expect, test } from 'bun:test';
import {
  GRAPH_NODE_LABEL_GAP,
  type GraphNodeLabelInput,
  planGraphNodeLabels,
  truncateGraphNodeLabel,
} from './graph-node-labels';
import type { GraphNode } from './graph-view-utils';

function doc(id: string, x = 0, y = 0): GraphNode & { x: number; y: number } {
  return {
    kind: 'doc',
    id,
    docName: id,
    anchor: null,
    label: id,
    cluster: null,
    category: null,
    tags: null,
    x,
    y,
  };
}

function folder(id: string, x = 0, y = 0): GraphNode & { x: number; y: number } {
  return {
    kind: 'folder',
    id: `folder:${id}`,
    path: id,
    label: id,
    memberCount: 3,
    x,
    y,
  } as GraphNode & { x: number; y: number };
}

function candidate(
  overrides: Partial<GraphNodeLabelInput> & { node: GraphNodeLabelInput['node'] },
) {
  return {
    text: overrides.node.label ?? overrides.node.id,
    degree: 0,
    radius: 7,
    isActive: false,
    ...overrides,
  } satisfies GraphNodeLabelInput;
}

function plan(nodes: GraphNodeLabelInput[], zoomScale: number) {
  return planGraphNodeLabels({ nodes, zoomScale, leafLabelThreshold: 0.78 });
}

describe('truncateGraphNodeLabel', () => {
  test('cuts at fifteen characters and marks the cut', () => {
    expect(truncateGraphNodeLabel('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmno…');
  });

  test('leaves anything that fits alone, ellipsis included', () => {
    expect(truncateGraphNodeLabel('short')).toBe('short');
    // Sixteen characters is left whole: replacing the last one with an
    // ellipsis would cost a character to save nothing.
    expect(truncateGraphNodeLabel('abcdefghijklmnop')).toBe('abcdefghijklmnop');
  });

  test('counts characters rather than code units, so it cannot split a pair', () => {
    const emoji = '🍎'.repeat(20);
    expect([...truncateGraphNodeLabel(emoji)]).toHaveLength(16);
  });
});

describe('planGraphNodeLabels', () => {
  test('names a folder further out than a hub, and a hub further than a page', () => {
    const nodes = [
      candidate({ node: folder('docs') }),
      candidate({ node: doc('hub'), degree: 9 }),
      candidate({ node: doc('leaf'), degree: 1 }),
    ];
    const named = (zoom: number) => plan(nodes, zoom).map((placement) => placement.nodeId);

    expect(named(0.3)).toEqual([]);
    expect(named(0.45)).toEqual(['folder:docs']);
    expect(named(0.6)).toEqual(['folder:docs', 'hub']);
    expect(named(0.8)).toEqual(['folder:docs', 'hub', 'leaf']);
  });

  test('hangs the name below the node, clear of its own disc', () => {
    const [placement] = plan([candidate({ node: doc('page', 40, 100), radius: 18 })], 2);
    expect(placement.x).toBe(40);
    expect(placement.y).toBe(100 + 18 + GRAPH_NODE_LABEL_GAP);
  });

  test('sizes and weights the name by what the node is', () => {
    const [folderLabel] = plan([candidate({ node: folder('docs') })], 2);
    const [hubLabel] = plan([candidate({ node: doc('hub'), degree: 9 })], 2);
    const [leafLabel] = plan([candidate({ node: doc('leaf') })], 2);
    expect([folderLabel.sizePx, hubLabel.sizePx, leafLabel.sizePx]).toEqual([10.5, 9.5, 9]);
    expect([folderLabel.fontWeight, hubLabel.fontWeight, leafLabel.fontWeight]).toEqual([
      700, 600, 400,
    ]);
  });

  test('the active document is named at any zoom', () => {
    const named = plan([candidate({ node: doc('here'), isActive: true })], 0.01);
    expect(named.map((placement) => placement.nodeId)).toEqual(['here']);
  });

  test('so is one the caller has forced — a search hit, or the selection', () => {
    const named = plan([candidate({ node: doc('found'), isForced: true })], 0.01);
    expect(named.map((placement) => placement.nodeId)).toEqual(['found']);
  });

  test('names every node that clears its threshold, however crowded', () => {
    // No budget and no collision test: the original drew them all, and the
    // per-kind threshold is what keeps that from being a wall of text.
    const crowd = Array.from({ length: 200 }, (_, index) => candidate({ node: doc(`p${index}`) }));
    expect(plan(crowd, 1)).toHaveLength(200);
  });

  test('skips nodes the simulation has not placed, and nodes with no name', () => {
    const unplaced = { ...doc('nowhere'), x: undefined, y: undefined };
    expect(
      plan(
        [
          candidate({ node: unplaced as GraphNodeLabelInput['node'] }),
          candidate({ node: doc('unnamed'), text: '' }),
        ],
        2,
      ),
    ).toEqual([]);
  });

  test('truncates on the way out', () => {
    const [placement] = plan(
      [candidate({ node: doc('long'), text: 'a-really-long-document-title' })],
      2,
    );
    expect(placement.text).toBe('a-really-long-d…');
  });
});
