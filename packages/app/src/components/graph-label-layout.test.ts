import { describe, expect, test } from 'bun:test';
import {
  type GraphLabelLayoutLink,
  type GraphLabelLayoutNode,
  planGraphLabels,
} from './graph-label-layout';
import { buildGraphLabelDescriptors } from './graph-label-utils';

function plan({
  nodes,
  links = [],
  activeDocName = '',
  viewport = { width: 200, height: 120 },
  maxLabels = 8,
  maxLabelWidthPx = 120,
  // These cases are about PLACEMENT, so the tier gate is held open by default:
  // a zoom above the leaf threshold admits every candidate. The gate itself is
  // covered in graph-label-tiers.test.ts, and by the case below.
  zoomScale = 10,
  leafLabelThreshold = 1.8,
}: {
  nodes: GraphLabelLayoutNode[];
  links?: GraphLabelLayoutLink[];
  activeDocName?: string;
  viewport?: { width: number; height: number };
  maxLabels?: number;
  maxLabelWidthPx?: number;
  zoomScale?: number;
  leafLabelThreshold?: number;
}) {
  return planGraphLabels({
    nodes,
    links,
    activeDocName,
    viewport,
    maxLabels,
    maxLabelWidthPx,
    zoomScale,
    leafLabelThreshold,
    labelDescriptors: buildGraphLabelDescriptors(nodes),
    measureTextWidthPx: (text) => text.length * 6,
    projectToScreen: (x, y) => ({ x, y }),
    getNodeRadiusPx: () => 6,
  });
}

describe('planGraphLabels — label tiers', () => {
  // Placed clear of the viewport edges: these cases are about the tier gate,
  // and a name is only ever drawn below its node, so a node hard against an
  // edge has nowhere to put one and would fail for the wrong reason.
  const nodes: GraphLabelLayoutNode[] = [
    { kind: 'doc', id: 'hub', docName: 'hub', anchor: null, label: 'hub', x: 40, y: 20 },
    { kind: 'doc', id: 'leaf', docName: 'leaf', anchor: null, label: 'leaf', x: 150, y: 60 },
  ];
  // `hub` gets 8 edges (the hub cutoff); `leaf` gets one of them.
  const links: GraphLabelLayoutLink[] = [
    { source: 'hub', target: 'leaf' },
    ...Array.from({ length: 7 }, (_, index) => ({ source: 'hub', target: `other-${index}` })),
  ];

  test('drops the leaf but keeps the hub at an intermediate zoom', () => {
    // This is the whole point: zooming out thins labels down to the landmarks
    // instead of clearing the canvas of names entirely.
    const placements = plan({ nodes, links, zoomScale: 1.0, leafLabelThreshold: 1.8 });
    expect(placements.map((placement) => placement.nodeId)).toEqual(['hub']);
  });

  test('keeps both once the zoom passes the leaf threshold', () => {
    const placements = plan({ nodes, links, zoomScale: 1.8, leafLabelThreshold: 1.8 });
    expect(placements.map((placement) => placement.nodeId).sort()).toEqual(['hub', 'leaf']);
  });

  test('drops both when even the hub tier has not been reached', () => {
    expect(plan({ nodes, links, zoomScale: 0.3, leafLabelThreshold: 1.8 })).toEqual([]);
  });

  test('keeps the active document at a zoom that hides everything else', () => {
    const placements = plan({
      nodes,
      links,
      activeDocName: 'leaf',
      zoomScale: 0.3,
      leafLabelThreshold: 1.8,
    });
    expect(placements.map((placement) => placement.nodeId)).toEqual(['leaf']);
  });

  test('spends the whole label budget on the tiers that survive the gate', () => {
    // The gate runs before the cap, so a budget of 1 at low zoom goes to the
    // hub rather than being consumed by a leaf that then gets filtered out.
    const placements = plan({
      nodes,
      links,
      maxLabels: 1,
      zoomScale: 1.0,
      leafLabelThreshold: 1.8,
    });
    expect(placements.map((placement) => placement.nodeId)).toEqual(['hub']);
  });
});

describe('planGraphLabels', () => {
  test('returns empty array for degenerate inputs', () => {
    expect(plan({ nodes: [] })).toEqual([]);
    expect(
      plan({
        nodes: [{ id: 'alpha', label: 'Alpha', x: 50, y: 50 }],
        maxLabels: 0,
      }),
    ).toEqual([]);
    expect(
      plan({
        nodes: [{ id: 'alpha', label: 'Alpha', x: 50, y: 50 }],
        viewport: { width: 0, height: 120 },
      }),
    ).toEqual([]);
  });

  test('active node wins when two labels would collide', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'active', label: 'Alpha', x: 92, y: 40 },
      { id: 'other', label: 'Bravo', x: 108, y: 40 },
    ];

    const placements = plan({ nodes, activeDocName: 'active', maxLabels: 1 });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('active');
  });

  test('higher-degree node wins a non-active collision', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'hub', label: 'Hub Node', x: 92, y: 40 },
      { id: 'leaf', label: 'Leaf Node', x: 108, y: 40 },
    ];

    const placements = plan({
      nodes,
      links: [
        { source: 'hub', target: 'doc-a' },
        { source: 'hub', target: 'doc-b' },
      ],
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('hub');
  });

  test('degree ranking handles numeric object ref ids by stringifying them', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: '42', label: 'Hub Node', x: 92, y: 40 },
      { id: 'leaf', label: 'Leaf Node', x: 108, y: 40 },
    ];

    const placements = plan({
      nodes,
      links: [
        { source: { id: 42 }, target: { id: 'doc-a' } },
        { source: { id: 42 }, target: { id: 'doc-b' } },
      ],
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('42');
  });

  test('degree ranking still works when links contain force-graph object refs', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'hub', label: 'Hub Node', x: 92, y: 40 },
      { id: 'leaf', label: 'Leaf Node', x: 108, y: 40 },
    ];

    const placements = plan({
      nodes,
      links: [
        { source: { id: 'hub' }, target: { id: 'doc-a' } },
        { source: { id: 'hub' }, target: { id: 'doc-b' } },
      ],
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('hub');
  });

  test('drops a blocked name further down rather than putting it beside the node', () => {
    // Two nodes stacked close together: the lower one sits exactly where the
    // upper one's name wants to go.
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'upper', label: 'Upper', x: 200, y: 100 },
      { id: 'blocker', label: 'Blocker', x: 200, y: 118 },
    ];

    const placements = plan({
      nodes,
      activeDocName: 'upper',
      viewport: { width: 500, height: 400 },
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('upper');
    // Still directly under its node, horizontally centred — just lower.
    expect(placements[0]?.textX).toBeCloseTo(200, 0);
    expect(placements[0]?.rect.top).toBeGreaterThan(118);
  });

  test('drops a name rather than moving it above the node to make it fit', () => {
    // There used to be top/right/left fallbacks. They meant the same page's
    // name sat under its dot at one zoom and beside it at the next, so you
    // could not learn to read the pairing. One position, or nothing.
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'bottom-edge', label: 'Near Bottom', x: 60, y: 92 },
    ];

    const placements = plan({
      nodes,
      activeDocName: 'bottom-edge',
      viewport: { width: 120, height: 120 },
      maxLabels: 1,
    });

    expect(placements).toHaveLength(0);
  });

  test('every name it does place sits below its node', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'a', label: 'Alpha', x: 60, y: 60 },
      { id: 'b', label: 'Beta', x: 200, y: 140 },
      { id: 'c', label: 'Gamma', x: 320, y: 220 },
    ];

    const placements = plan({
      nodes,
      activeDocName: 'a',
      viewport: { width: 500, height: 400 },
      maxLabels: 10,
    });

    expect(placements.length).toBeGreaterThan(0);
    for (const placement of placements) {
      const node = nodes.find((candidate) => candidate.id === placement.nodeId);
      expect(placement.anchor).toBe('bottom');
      expect(placement.rect.top).toBeGreaterThan(node?.y ?? 0);
    }
  });

  test('planner rejects a label when every slot below is covered by a node', () => {
    // A full column of blockers, one per step of the downward budget. Nothing
    // to the sides matters any more — a name is never put there — so the only
    // way to refuse one is to occupy the whole run beneath it.
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'active', label: 'Center', x: 100, y: 100 },
      { id: 'block-1', label: 'One', x: 100, y: 119 },
      { id: 'block-2', label: 'Two', x: 100, y: 137 },
      { id: 'block-3', label: 'Three', x: 100, y: 155 },
      { id: 'block-4', label: 'Four', x: 100, y: 173 },
    ];

    const placements = plan({
      nodes,
      activeDocName: 'active',
      viewport: { width: 200, height: 200 },
      maxLabels: 1,
    });

    expect(placements.some((placement) => placement.nodeId === 'active')).toBeFalse();
  });

  test('closer-to-center node wins when active state and degree are equal', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'far', label: 'Near', x: 20, y: 20 },
      { id: 'near', label: 'Near', x: 100, y: 60 },
    ];

    const placements = plan({
      nodes,
      viewport: { width: 200, height: 120 },
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('near');
  });

  test('planner honors maxLabels deterministically', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'a', label: 'Node', x: 60, y: 120 },
      { id: 'b', label: 'Node', x: 120, y: 60 },
      { id: 'c', label: 'Node', x: 180, y: 120 },
    ];

    const placements = plan({
      nodes,
      viewport: { width: 240, height: 240 },
      maxLabels: 2,
    });

    expect(placements.map((placement) => placement.nodeId)).toEqual(['a', 'b']);
  });
});
