import { describe, expect, test } from 'bun:test';
import {
  buildGraphAreas,
  getGraphAreaBounds,
  getGraphAreaLabelSizePx,
  getGraphAreaLodAlpha,
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

  test('fades a region out once it is larger than the screen', () => {
    // At that point you are inside it — it is the ground, not a landmark.
    expect(getGraphAreaLodAlpha(1000, VIEWPORT)).toBeLessThan(1);
    expect(getGraphAreaLodAlpha(1600, VIEWPORT)).toBe(0);
  });

  test('hands over: a parent is leaving while its child is arriving', () => {
    // The moment a child becomes readable the parent should be on its way out,
    // so one name replaces another rather than both shouting.
    const parentLeaving = getGraphAreaLodAlpha(1100, VIEWPORT);
    const childArriving = getGraphAreaLodAlpha(170, VIEWPORT);
    expect(parentLeaving).toBeGreaterThan(0);
    expect(parentLeaving).toBeLessThan(1);
    expect(childArriving).toBeGreaterThan(0);
    expect(childArriving).toBeLessThan(1);
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
