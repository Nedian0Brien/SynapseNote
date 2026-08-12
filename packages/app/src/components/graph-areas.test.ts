import { describe, expect, test } from 'bun:test';
import {
  buildGraphAreas,
  getGraphAreaBounds,
  getGraphAreaDepthDensity,
  getGraphAreaDepthWeight,
  getGraphAreaFocusDepth,
  getGraphAreaLabelSizePx,
  getGraphAreaLodAlpha,
  getGraphAreaNameFade,
  getGraphAreaTintWeight,
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
  // Two top-level folders, so the project root exists and `docs` is itself a
  // region rather than the outermost thing; `api` then nests inside it.
  const nested = ['docs/api/A', 'docs/api/B', 'docs/Intro', 'notes/N', 'notes/M'];

  test('a nested region takes its colour from the region it sits inside', () => {
    // Only one storey is drawn at a time, so an index per folder repainted the
    // whole map every time you descended a level. A province is a shade of its
    // country.
    const byName = new Map(areasFor(nested).map((area) => [area.name, area]));
    expect(byName.get('api')?.depth).toBe(2);
    expect(byName.get('api')?.colorIndex).toBe(byName.get('docs')?.colorIndex);
  });

  test('siblings of a family get different shades, so a region divides visibly', () => {
    // Same colour slot keeps them in the family; the shade is what stops the
    // parent's territory reading as one flat block once you zoom into it.
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
    const children = areas.filter((area) => area.depth === 2);
    expect(children.length).toBeGreaterThanOrEqual(3);
    expect(new Set(children.map((area) => area.colorIndex)).size).toBe(1);
    expect(new Set(children.map((area) => area.shadeIndex)).size).toBe(children.length);
  });

  test('unrelated top-level regions still get different colours', () => {
    const byName = new Map(areasFor(nested).map((area) => [area.name, area]));
    expect(byName.get('docs')?.colorIndex).not.toBe(byName.get('notes')?.colorIndex);
  });

  test('the whole of a deep chain shares one colour', () => {
    const indices = new Set(
      areasFor(['a/b/c/One', 'a/b/c/Two', 'a/b/Other', 'a/Top']).map((area) => area.colorIndex),
    );
    expect(indices.size).toBe(1);
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
    expect(bounds?.rx).toBeGreaterThan(100);
  });

  test('ignores members the simulation has not positioned', () => {
    const bounds = getGraphAreaBounds(area, new Map([['docs/A', { x: 40, y: 40 }]]));
    expect(bounds?.cx).toBe(40);
  });

  test('keeps a floor, so a single-member territory is still a territory', () => {
    const bounds = getGraphAreaBounds(area, new Map([['docs/A', { x: 0, y: 0 }]]));
    expect(bounds?.rx).toBeGreaterThan(0);
    expect(bounds?.ry).toBeGreaterThan(0);
  });
});

describe('getGraphAreaLodAlpha', () => {
  const VIEWPORT = 1000;

  test('says nothing about a region that is a handful of pixels wide', () => {
    // Drawing every folder at every zoom is what made a deep vault a wash: at
    // the zoom that fits the map, two hundred nested folders all paint.
    expect(getGraphAreaLodAlpha(40, VIEWPORT)).toBe(0);
  });

  test('gives full presence to a region that is a comfortable size on screen', () => {
    expect(getGraphAreaLodAlpha(300, VIEWPORT)).toBe(1);
  });

  test('does NOT fade a region back out once it fills the screen', () => {
    // Leaving is the level's business, not the region's — see the focus depth.
    // Fading for both reasons at once left a blank trough mid-handover.
    expect(getGraphAreaLodAlpha(1000, VIEWPORT)).toBe(1);
    expect(getGraphAreaLodAlpha(1600, VIEWPORT)).toBe(1);
  });

  test('rises monotonically through the fade-in band', () => {
    expect(getGraphAreaLodAlpha(120, VIEWPORT)).toBeLessThan(getGraphAreaLodAlpha(160, VIEWPORT));
  });

  test('is scale-free — the same share of the viewport reads the same', () => {
    expect(getGraphAreaLodAlpha(300, 1000)).toBe(getGraphAreaLodAlpha(150, 500));
  });

  test('survives a zero-width canvas rather than dividing by it', () => {
    expect(getGraphAreaLodAlpha(300, 0)).toBe(0);
  });
});

describe('getGraphAreaFocusDepth', () => {
  // Shallow folders are the big ones, so share falls as depth rises. Zooming in
  // multiplies every share at once.
  const tree = (zoom: number) => [
    { depth: 0, share: 0.25 * zoom },
    { depth: 1, share: 0.1 * zoom },
    { depth: 2, share: 0.04 * zoom },
  ];

  test('descends as you zoom in, one storey at a time', () => {
    const shallow = getGraphAreaFocusDepth(tree(1)) ?? 0;
    const middle = getGraphAreaFocusDepth(tree(5)) ?? 0;
    const deep = getGraphAreaFocusDepth(tree(12)) ?? 0;
    expect(shallow).toBeLessThan(middle);
    expect(middle).toBeLessThan(deep);
  });

  test('moves continuously, so the handover has no cut in it', () => {
    // A hair more zoom must never jump the focus by a whole level.
    let previous = getGraphAreaFocusDepth(tree(1)) ?? 0;
    for (let zoom = 1.1; zoom <= 14; zoom += 0.1) {
      const next = getGraphAreaFocusDepth(tree(zoom)) ?? 0;
      expect(next - previous).toBeLessThan(0.25);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  test('stays at the shallowest level while everything is still too small', () => {
    expect(getGraphAreaFocusDepth(tree(0.2))).toBe(0);
  });

  test('keeps counting past the deepest level, so "how far inside" stays readable', () => {
    // There is no storey below the last one, but the region names need to know
    // you have gone inside it — once you are reading pages, the names of the
    // places holding them are noise.
    const inside = getGraphAreaFocusDepth(tree(100)) ?? 0;
    expect(inside).toBeGreaterThan(2);
    expect(getGraphAreaFocusDepth(tree(400)) ?? 0).toBeGreaterThan(inside);
  });

  test('is null when nothing is on screen', () => {
    expect(getGraphAreaFocusDepth([])).toBeNull();
    expect(getGraphAreaFocusDepth([{ depth: 0, share: 0 }])).toBeNull();
  });
});

describe('getGraphAreaDepthWeight', () => {
  test('gives the map to one level when the focus is squarely on it', () => {
    expect(getGraphAreaDepthWeight(2, 2)).toBe(1);
    expect(getGraphAreaDepthWeight(1, 2)).toBe(0);
    expect(getGraphAreaDepthWeight(3, 2)).toBe(0);
  });

  test('splits it between two adjacent levels mid-handover', () => {
    expect(getGraphAreaDepthWeight(1, 1.5)).toBeCloseTo(0.5, 5);
    expect(getGraphAreaDepthWeight(2, 1.5)).toBeCloseTo(0.5, 5);
  });

  test('never lights three levels at once', () => {
    for (const focus of [0, 0.3, 1, 1.7, 2, 2.4]) {
      const lit = [0, 1, 2, 3, 4].filter((depth) => getGraphAreaDepthWeight(depth, focus) > 0);
      expect(lit.length).toBeLessThanOrEqual(2);
    }
  });

  test('draws nothing when there is no focus', () => {
    expect(getGraphAreaDepthWeight(0, null)).toBe(0);
  });
});

describe('getGraphAreaDepthDensity', () => {
  test('a top-level region is the reference', () => {
    expect(getGraphAreaDepthDensity(1)).toBe(1);
  });

  test("reproduces the original's ratios for the first three depths", () => {
    // It filled at 0.10 + depth * 0.02, so 0.12 / 0.14 / 0.16 — 1 : 1.17 : 1.33.
    expect(getGraphAreaDepthDensity(2)).toBeCloseTo(0.14 / 0.12, 2);
    expect(getGraphAreaDepthDensity(3)).toBeCloseTo(0.16 / 0.12, 2);
  });

  test('nesting reads as ink, so a child is denser than its parent', () => {
    expect(getGraphAreaDepthDensity(4)).toBeGreaterThan(getGraphAreaDepthDensity(3));
  });

  test('caps, so a pathologically deep tree cannot reach full opacity', () => {
    expect(getGraphAreaDepthDensity(40)).toBeLessThanOrEqual(1.67);
  });
});

describe('getGraphAreaNameFade', () => {
  test('writes a name in full while you are still navigating between places', () => {
    expect(getGraphAreaNameFade(2, 1.4)).toBe(1);
    expect(getGraphAreaNameFade(2, 2)).toBe(1);
  });

  test('retires it as the map goes inside, the way the original did', () => {
    // Once you are reading pages, the place names compete with the page names
    // for the same pixels and you already know where you are.
    expect(getGraphAreaNameFade(2, 2.5)).toBeLessThan(1);
    expect(getGraphAreaNameFade(2, 2.5)).toBeGreaterThan(0);
    expect(getGraphAreaNameFade(2, 3.2)).toBe(0);
  });

  test('falls monotonically, so there is no flick on the way out', () => {
    let previous = 1;
    for (let focus = 2; focus <= 4; focus += 0.05) {
      const fade = getGraphAreaNameFade(2, focus);
      expect(fade).toBeLessThanOrEqual(previous + 1e-9);
      previous = fade;
    }
  });

  test('writes nothing when there is no focus', () => {
    expect(getGraphAreaNameFade(1, null)).toBe(0);
  });
});

describe('getGraphAreaTintWeight', () => {
  test('keeps a level you have passed on as ground instead of going dark', () => {
    // The original's shallow tint bottomed out at 0.4 and never left. Making
    // the tint exclusive too dimmed the map to nothing mid-handover.
    expect(getGraphAreaDepthWeight(0, 2)).toBe(0);
    expect(getGraphAreaTintWeight(0, 2)).toBeGreaterThan(0);
  });

  test('still gives the level you are on the most', () => {
    expect(getGraphAreaTintWeight(2, 2)).toBe(1);
    expect(getGraphAreaTintWeight(2, 2)).toBeGreaterThan(getGraphAreaTintWeight(1, 2));
  });

  test('leaves levels you have not reached dark', () => {
    // Showing them early is the clutter the depth stepping exists to remove.
    expect(getGraphAreaTintWeight(4, 2)).toBe(0);
  });

  test('never dips below the ground during a handover', () => {
    // Sweep the whole descent: the shallowest level must always be painting
    // something, which is what stops the map going blank between storeys.
    for (let focus = 0; focus <= 4; focus += 0.1) {
      expect(getGraphAreaTintWeight(0, focus)).toBeGreaterThan(0);
    }
  });

  test('draws nothing when there is no focus at all', () => {
    expect(getGraphAreaTintWeight(0, null)).toBe(0);
  });
});

describe('getGraphAreaLabelSizePx', () => {
  test('writes a wide region larger than a narrow one, as an atlas does', () => {
    expect(getGraphAreaLabelSizePx(400)).toBeGreaterThan(getGraphAreaLabelSizePx(120));
  });

  test('stops shrinking, so a small region is still legible if it is named', () => {
    expect(getGraphAreaLabelSizePx(1)).toBeGreaterThanOrEqual(11);
  });

  test('stops growing, so one huge region cannot write across the canvas', () => {
    // The bug this replaced: a flat 64px name on a 40px-wide territory sprawled
    // over every neighbour it had.
    expect(getGraphAreaLabelSizePx(100_000)).toBeLessThanOrEqual(40);
  });
});
