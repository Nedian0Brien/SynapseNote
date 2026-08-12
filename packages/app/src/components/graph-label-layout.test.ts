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
  previousOffsetStepByNodeId,
  isRegionEnteredForNode,
  getNodeRadiusPx = () => 6,
}: {
  nodes: GraphLabelLayoutNode[];
  links?: GraphLabelLayoutLink[];
  activeDocName?: string;
  viewport?: { width: number; height: number };
  maxLabels?: number;
  maxLabelWidthPx?: number;
  zoomScale?: number;
  leafLabelThreshold?: number;
  previousOffsetStepByNodeId?: ReadonlyMap<string, number>;
  isRegionEnteredForNode?: (nodeId: string) => boolean | null;
  getNodeRadiusPx?: (node: GraphLabelLayoutNode) => number;
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
    previousOffsetStepByNodeId,
    isRegionEnteredForNode,
    labelDescriptors: buildGraphLabelDescriptors(nodes),
    measureTextWidthPx: (text) => text.length * 6,
    projectToScreen: (x, y) => ({ x, y }),
    getNodeRadiusPx,
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

  test('holds a page’s name back until you have zoomed into its folder', () => {
    // Zoomed out you should get region names and nothing else; the pages name
    // themselves only once the folder they live in is the place you are in.
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'docs/Intro', label: 'Intro', x: 200, y: 100 },
      { id: 'docs/Api', label: 'Api', x: 200, y: 200 },
    ];
    const viewport = { width: 500, height: 400 };

    expect(
      plan({ nodes, viewport, isRegionEnteredForNode: () => false }).map((p) => p.nodeId),
    ).toEqual([]);
    expect(
      plan({ nodes, viewport, isRegionEnteredForNode: () => true })
        .map((p) => p.nodeId)
        .sort(),
    ).toEqual(['docs/Api', 'docs/Intro']);
  });

  test('a page in no folder is left to the degree tiers, as before', () => {
    const nodes: GraphLabelLayoutNode[] = [{ id: 'README', label: 'Readme', x: 200, y: 100 }];
    const placements = plan({
      nodes,
      viewport: { width: 500, height: 400 },
      // null means "not inside a region" — the hierarchy gate must not swallow it.
      isRegionEnteredForNode: () => null,
    });
    expect(placements.map((placement) => placement.nodeId)).toEqual(['README']);
  });

  test('the active document is named even from outside its folder', () => {
    // It is the one label that says where you came from; hiding it because you
    // have not zoomed into its folder yet defeats the point.
    const nodes: GraphLabelLayoutNode[] = [{ id: 'docs/Intro', label: 'Intro', x: 200, y: 100 }];
    const placements = plan({
      nodes,
      activeDocName: 'docs/Intro',
      viewport: { width: 500, height: 400 },
      isRegionEnteredForNode: () => false,
    });
    expect(placements.map((placement) => placement.nodeId)).toEqual(['docs/Intro']);
  });

  test('spends a tight budget on the better-connected node, not the nearer one', () => {
    // The tier gate promises hubs are named before leaves. It only decides who
    // is ELIGIBLE though, and eligible nodes always outnumber the budget — so
    // if the budget is spent nearest-the-middle-first, the promise never
    // actually applies and which names you see looks like nothing at all.
    const viewport = { width: 400, height: 300 };
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'near-leaf', label: 'Near Leaf', x: 200, y: 140 },
      { id: 'far-hub', label: 'Far Hub', x: 340, y: 40 },
    ];
    const links: GraphLabelLayoutLink[] = Array.from({ length: 6 }, (_, index) => ({
      source: 'far-hub',
      target: `other-${index}`,
    }));

    const placements = plan({ nodes, links, viewport, maxLabels: 1 });

    expect(placements.map((placement) => placement.nodeId)).toEqual(['far-hub']);
  });

  test('keeps showing the names it was already showing when the budget is tight', () => {
    // The flicker: `distanceToCenterPx` outranks degree, and it changes on
    // every frame of a zoom, so the greedy accept below kept picking a
    // different set and names blinked on and off while the view moved.
    const viewport = { width: 400, height: 300 };
    // Centre of the viewport is (200, 150). 'a' sits on that vertical, 'b' well
    // off to the side, so 'a' is unambiguously the nearer.
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'a', label: 'Alpha', x: 200, y: 60 },
      { id: 'b', label: 'Beta', x: 350, y: 60 },
    ];

    // On a cold plan with room for one, the nearer node wins.
    const cold = plan({ nodes, viewport, maxLabels: 1 });
    expect(cold.map((placement) => placement.nodeId)).toEqual(['a']);

    // Now the view moves so 'b' is the nearer one. Without a memory the label
    // would jump from 'a' to 'b'; with one, 'a' keeps it.
    const moved: GraphLabelLayoutNode[] = [
      { id: 'a', label: 'Alpha', x: 60, y: 60 },
      { id: 'b', label: 'Beta', x: 210, y: 60 },
    ];
    expect(plan({ nodes: moved, viewport, maxLabels: 1 })[0]?.nodeId).toBe('b');
    const warm = plan({
      nodes: moved,
      viewport,
      maxLabels: 1,
      previousOffsetStepByNodeId: new Map([['a', 0]]),
    });
    expect(warm.map((placement) => placement.nodeId)).toEqual(['a']);
  });

  test('reports the offset it used, so the next frame can reproduce it', () => {
    const nodes: GraphLabelLayoutNode[] = [{ id: 'solo', label: 'Solo', x: 200, y: 100 }];
    const placements = plan({ nodes, viewport: { width: 500, height: 400 } });
    expect(placements[0]?.offsetStep).toBe(0);
  });

  test('retries a name at the offset it already had before trying others', () => {
    // Nothing is in the way here, so a cold plan would use step 0. Told the
    // name was at step 2 last frame, it stays at step 2 rather than snapping up.
    const nodes: GraphLabelLayoutNode[] = [{ id: 'solo', label: 'Solo', x: 200, y: 100 }];
    const placements = plan({
      nodes,
      viewport: { width: 500, height: 400 },
      previousOffsetStepByNodeId: new Map([['solo', 2]]),
    });
    expect(placements[0]?.offsetStep).toBe(2);
  });

  test('still places a name whose remembered offset no longer fits', () => {
    // Close enough to the bottom edge that step 0 fits and step 3 does not.
    const nodes: GraphLabelLayoutNode[] = [{ id: 'solo', label: 'Solo', x: 200, y: 340 }];
    const placements = plan({
      nodes,
      viewport: { width: 500, height: 400 },
      // Step 3 would run off the bottom edge; it should fall back to one that fits.
      previousOffsetStepByNodeId: new Map([['solo', 3]]),
    });
    expect(placements).toHaveLength(1);
    expect(placements[0]?.offsetStep).toBe(0);
  });

  test('lets a name pass over an ordinary dot, and only goes around a big one', () => {
    // Clearing EVERY node circle threw away ~40% of the names that were
    // otherwise ready, in the dense places where they are worth most. An
    // ordinary page is a small hollow dot and a name near one still reads;
    // a hub or a folder is a large filled disc and would swallow it.
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'subject', label: 'Subject', x: 200, y: 100 },
      { id: 'neighbour', label: 'Neighbour', x: 200, y: 118 },
    ];
    const viewport = { width: 500, height: 400 };

    const overDot = plan({ nodes, activeDocName: 'subject', viewport, maxLabels: 1 });
    expect(overDot[0]?.offsetStep).toBe(0);

    const aroundDisc = plan({
      nodes,
      activeDocName: 'subject',
      viewport,
      maxLabels: 1,
      getNodeRadiusPx: (node) => (node.id === 'neighbour' ? 20 : 6),
    });
    expect(aroundDisc[0]?.offsetStep).toBeGreaterThan(0);
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
      // Only a node that draws much larger than a plain page pushes a name
      // around; a dot of the same size as everything else does not.
      getNodeRadiusPx: (node) => (node.id === 'blocker' ? 20 : 6),
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
      getNodeRadiusPx: (node) => (node.id === 'active' ? 6 : 20),
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
