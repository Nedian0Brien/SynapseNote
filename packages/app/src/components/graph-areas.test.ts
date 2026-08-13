import { describe, expect, test } from 'bun:test';
import {
  buildGraphAreas,
  GRAPH_AREA_PHASE1_START,
  GRAPH_AREA_PHASE2_FADE_END,
  getGraphAreaBounds,
  getGraphAreaFillAlpha,
  getGraphAreaNameAlpha,
  getGraphAreaNameSizePx,
  getGraphAreaNameWorldSize,
  getGraphAreaPadding,
  getGraphAreaPhases,
  getGraphAreaTintAlpha,
  getGraphAreaWorldScale,
  getGraphAreaZoom,
  isGraphAreaPhase2,
} from './graph-areas';
import { buildGraphFolderNodes } from './graph-folders';
import type { GraphNode } from './graph-view-utils';

function doc(docName: string): GraphNode {
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

/** Areas are derived from a real folder synthesis, not a hand-built tree. */
function areasFor(docNames: string[]) {
  const nodes = docNames.map(doc);
  const folders = buildGraphFolderNodes(nodes, []);
  return buildGraphAreas([...nodes, ...folders.nodes], folders.links);
}

function names(docNames: string[]): string[] {
  return areasFor(docNames)
    .map((area) => area.name)
    .sort();
}

describe('buildGraphAreas', () => {
  test('gives every directory that holds pages a territory', () => {
    expect(names(['docs/A', 'notes/B'])).toEqual(['docs', 'notes']);
  });

  test('leaves the project root without one — it would tint the whole map', () => {
    // The root's region is by definition everything, so it would name the map
    // after itself and colour every pixel. The original excluded it too.
    expect(names(['docs/A', 'notes/B'])).not.toContain('/');
  });

  test('nests, and a child territory is deeper than its parent', () => {
    const areas = areasFor(['docs/Intro', 'docs/api/A', 'docs/api/B', 'notes/N']);
    const byName = new Map(areas.map((area) => [area.name, area]));
    expect(byName.get('api')?.depth).toBeGreaterThan(byName.get('docs')?.depth ?? 0);
  });

  test('a parent territory contains its child’s members, so it encloses it', () => {
    const areas = areasFor(['docs/Intro', 'docs/api/A', 'notes/N']);
    const docsArea = areas.find((area) => area.name === 'docs');
    expect(docsArea?.memberIds.has('docs/api/A')).toBe(true);
    expect(docsArea?.memberIds.has('notes/N')).toBe(false);
  });

  test('is ordered shallowest first, so a nested region paints over its parent', () => {
    const depths = areasFor(['docs/Intro', 'docs/api/A', 'notes/N']).map((area) => area.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  test('has no territories at all when folders are switched off', () => {
    expect(buildGraphAreas([doc('docs/A')], [])).toEqual([]);
  });
});

describe('buildGraphAreas — colour', () => {
  test('gives every region its own palette slot, so neighbours are told apart', () => {
    // Colour was briefly inherited from the topmost ancestor, to stop the map
    // repainting when one level handed over to the next. It only cost
    // legibility: at this layer's alpha the variation that kept siblings apart
    // was too fine to survive and a screenful of regions came out as one wash.
    const areas = areasFor([
      'packages/app/A',
      'packages/app/B',
      'packages/core/C',
      'packages/core/D',
      'packages/server/E',
      'packages/server/F',
      'docs/X',
      'docs/Y',
    ]);
    expect(new Set(areas.map((area) => area.colorIndex)).size).toBe(areas.length);
  });
});

describe('buildGraphAreas — depth', () => {
  test('keeps regions past depth 2 rather than capping the tree', () => {
    // A cap was added on this branch, on the theory that a codebase is deeper
    // than a note vault. The original has none: depth is handled by PHASE, and
    // everything at depth 2 and below shares one.
    const areas = areasFor([
      'a/b/c/1',
      'a/b/c/2',
      'a/b/d/1',
      'a/b/d/2',
      'a/e/1',
      'a/e/2',
      'z/1',
      'z/2',
    ]);
    expect(areas.map((area) => `${area.name}@${area.depth}`)).toContain('c@3');
  });
});

describe('getGraphAreaPadding', () => {
  test("reproduces the original's two steps", () => {
    // `depth >= 2 ? 35 + (2 - depth) * 10 : 55 + (2 - depth) * 15`
    expect(getGraphAreaPadding(1)).toBe(70);
    expect(getGraphAreaPadding(2)).toBe(35);
    expect(getGraphAreaPadding(3)).toBe(25);
  });

  test('shrinks with depth, so a nested region sits inside its parent', () => {
    expect(getGraphAreaPadding(2)).toBeLessThan(getGraphAreaPadding(1));
    expect(getGraphAreaPadding(3)).toBeLessThan(getGraphAreaPadding(2));
  });
});

describe('getGraphAreaWorldScale / getGraphAreaZoom', () => {
  const viewport = { width: 1400, height: 900 };

  test('a framed graph sits exactly where the original framed to', () => {
    // `fitAll` put the graph into 62% of the width; the phases were written
    // against the zoom that produced. Whatever this graph's world size, being
    // framed must land on the same point of that scale.
    const spanX = 4000;
    const fitScale = (viewport.width * 0.62) / spanX;
    const worldScale = getGraphAreaWorldScale({ ...viewport, spanX, spanY: 1 });
    expect(getGraphAreaZoom(fitScale, worldScale)).toBeCloseTo(0.27, 10);
  });

  test('and lands there again for a graph ten times the size', () => {
    // This is the whole point of measuring instead of hard-coding: pasting the
    // original's numbers onto a graph six times its node count put fit three
    // times further out than it ever ran.
    const spanX = 40_000;
    const fitScale = (viewport.width * 0.62) / spanX;
    const worldScale = getGraphAreaWorldScale({ ...viewport, spanX, spanY: 1 });
    expect(getGraphAreaZoom(fitScale, worldScale)).toBeCloseTo(0.27, 10);
  });

  test('zooming in past the frame moves up the original’s scale', () => {
    const spanX = 4000;
    const fitScale = (viewport.width * 0.62) / spanX;
    const worldScale = getGraphAreaWorldScale({ ...viewport, spanX, spanY: 1 });
    expect(getGraphAreaZoom(fitScale * 2, worldScale)).toBeCloseTo(0.54, 10);
  });

  test('frames on whichever axis runs out first, as the original did', () => {
    const tall = getGraphAreaWorldScale({ ...viewport, spanX: 1, spanY: 40_000 });
    expect(tall).toBeCloseTo(0.27 / ((viewport.height * 0.72) / 40_000), 5);
  });

  test('falls back to the original’s own scale on a degenerate extent', () => {
    expect(getGraphAreaWorldScale({ spanX: 0, spanY: 0, width: 0, height: 0 })).toBe(1);
    expect(getGraphAreaWorldScale({ ...viewport, spanX: 0, spanY: 100 })).toBe(1);
  });
});

describe('isGraphAreaPhase2', () => {
  test('splits the tree in two at depth 2, not once per level', () => {
    expect(isGraphAreaPhase2(1)).toBe(false);
    expect(isGraphAreaPhase2(2)).toBe(true);
    expect(isGraphAreaPhase2(5)).toBe(true);
  });
});

describe('getGraphAreaPhases', () => {
  const area1 = { id: 'a', name: 'a', depth: 1, memberIds: new Set<string>(), colorIndex: 0 };
  const area2 = { id: 'b', name: 'b', depth: 2, memberIds: new Set<string>(), colorIndex: 1 };

  test('zoomed out it is phase 1 alone', () => {
    const phases = getGraphAreaPhases(0.2);
    expect(phases.phase1Tint).toBe(1);
    expect(phases.phase2Visible).toBe(false);
    expect(getGraphAreaTintAlpha(area2, phases)).toBe(0);
    expect(getGraphAreaNameAlpha(area2, phases)).toBe(0);
  });

  test('a level you have passed stays as ground rather than going dark', () => {
    // The original floored phase 1 at 0.4 and never took it away. Without that
    // the map empties out from the top as you descend.
    const phases = getGraphAreaPhases(1.5);
    expect(phases.phase1Tint).toBeCloseTo(0.4, 10);
    expect(getGraphAreaTintAlpha(area1, phases)).toBeGreaterThan(0);
  });

  test('phase 2 is fully inked before phase 1 has finished receding', () => {
    // `fadeT / 0.6`: the child regions arrive over the first 60% of the
    // handover, so the two overlap instead of trading places.
    const midway = getGraphAreaPhases(GRAPH_AREA_PHASE1_START + 0.03);
    expect(midway.phase2Tint).toBe(1);
    expect(midway.phase1Tint).toBeGreaterThan(0.4);
  });

  test('every name is gone once you are close enough to read the pages', () => {
    const phases = getGraphAreaPhases(GRAPH_AREA_PHASE2_FADE_END + 0.09);
    expect(getGraphAreaNameAlpha(area1, phases)).toBeCloseTo(0, 10);
    expect(getGraphAreaNameAlpha(area2, phases)).toBeCloseTo(0, 10);
    // ...while the tint holds, because a name competes with the page labels
    // for the same pixels and a tint does not.
    expect(getGraphAreaTintAlpha(area1, phases)).toBeGreaterThan(0);
  });

  test('crossfades rather than cutting', () => {
    const before = getGraphAreaPhases(GRAPH_AREA_PHASE1_START - 0.04);
    const after = getGraphAreaPhases(GRAPH_AREA_PHASE1_START + 0.04);
    for (const phases of [before, after]) {
      expect(phases.phase1Name).toBeGreaterThan(0);
      expect(phases.phase2Name).toBeGreaterThan(0);
    }
  });
});

describe('getGraphAreaFillAlpha', () => {
  test("is the original's 0.10 + depth * 0.02", () => {
    expect(getGraphAreaFillAlpha(1)).toBeCloseTo(0.12, 10);
    expect(getGraphAreaFillAlpha(2)).toBeCloseTo(0.14, 10);
    expect(getGraphAreaFillAlpha(3)).toBeCloseTo(0.16, 10);
  });

  test('nesting reads as ink, so a child is denser than its parent', () => {
    expect(getGraphAreaFillAlpha(3)).toBeGreaterThan(getGraphAreaFillAlpha(2));
  });
});

describe('getGraphAreaNameSizePx', () => {
  test("reproduces the original's per-depth sizes", () => {
    expect(getGraphAreaNameWorldSize(1)).toBe(56);
    expect(getGraphAreaNameWorldSize(2)).toBe(40);
    expect(getGraphAreaNameWorldSize(3)).toBe(28);
  });

  test('floors, so a deep folder is still legible', () => {
    expect(getGraphAreaNameWorldSize(9)).toBe(24);
    expect(getGraphAreaNameWorldSize(0)).toBe(72);
  });

  test('depth decides the size, not how wide the region happens to be', () => {
    // Two folders on the same storey letter the same, whatever the simulation
    // has done to their members this second.
    expect(getGraphAreaNameSizePx(2, 0.5)).toBe(getGraphAreaNameSizePx(2, 0.5));
    expect(getGraphAreaNameSizePx(1, 0.5)).toBeGreaterThan(getGraphAreaNameSizePx(2, 0.5));
  });

  test('scales with the zoom, as it did inside the original’s viewport', () => {
    expect(getGraphAreaNameSizePx(1, 0.5)).toBe(28);
    expect(getGraphAreaNameSizePx(1, 1)).toBe(56);
  });
});

describe('getGraphAreaBounds', () => {
  const [area] = areasFor(['docs/A', 'docs/B', 'notes/N']).filter((a) => a.name === 'docs');

  test('is null while the simulation has not placed anything yet', () => {
    expect(getGraphAreaBounds(area, new Map())).toBeNull();
  });

  test('centres on the members and pads out past the furthest one', () => {
    const bounds = getGraphAreaBounds(
      area,
      new Map([
        ['docs/A', { x: -100, y: 0 }],
        ['docs/B', { x: 100, y: 0 }],
      ]),
    );
    expect(bounds?.cx).toBeCloseTo(0, 5);
    expect(bounds?.rx).toBeCloseTo(100 + getGraphAreaPadding(area.depth), 5);
  });

  test('ignores members the simulation has not positioned', () => {
    const bounds = getGraphAreaBounds(area, new Map([['docs/A', { x: 40, y: 40 }]]));
    expect(bounds?.cx).toBe(40);
  });

  test('reaches the furthest member rather than a percentile of them', () => {
    // An 82nd percentile stood here, to stop one distant member inflating the
    // region. It leaves members visibly stranded outside the colour that is
    // supposed to contain them, which reads as a mistake rather than as a
    // tighter fit. The original took the maximum and so does this.
    const bounds = getGraphAreaBounds(
      area,
      new Map([
        ['docs/A', { x: 0, y: 0 }],
        ['docs/B', { x: 900, y: 0 }],
      ]),
    );
    const centre = 450;
    expect(bounds?.rx).toBeCloseTo(centre + getGraphAreaPadding(area.depth), 5);
  });

  test('floors, so a region holding one placed page is still a region', () => {
    const bounds = getGraphAreaBounds(area, new Map([['docs/A', { x: 0, y: 0 }]]));
    expect(bounds?.rx).toBeCloseTo(30 + getGraphAreaPadding(area.depth), 5);
    expect(bounds?.ry).toBeCloseTo(25 + getGraphAreaPadding(area.depth), 5);
  });

  test('converts the original’s world lengths when the spring is shorter', () => {
    const positions = new Map([['docs/A', { x: 0, y: 0 }]]);
    const full = getGraphAreaBounds(area, positions, 1);
    const half = getGraphAreaBounds(area, positions, 0.5);
    expect(half?.rx).toBeCloseTo((full?.rx ?? 0) / 2, 5);
  });
});
