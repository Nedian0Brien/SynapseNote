import { describe, expect, test } from 'bun:test';
import {
  buildGraphAreas,
  getGraphAreaBounds,
  getGraphAreaLabelZoomThreshold,
  isGraphAreaVisibleAtZoom,
} from './graph-areas';
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

function docs(...names: string[]): GraphNode[] {
  return names.map(doc);
}

describe('buildGraphAreas', () => {
  test('derives folders from the docName path, with no server input', () => {
    const areas = buildGraphAreas(docs('docs/a', 'docs/b', 'docs/c'));
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ path: 'docs', label: 'docs', depth: 0 });
    expect(areas[0].memberIds.sort()).toEqual(['docs/a', 'docs/b', 'docs/c']);
  });

  test('counts a node toward every ancestor folder, not just its own', () => {
    // Otherwise `docs` reads as empty in a project whose pages all sit deeper.
    const areas = buildGraphAreas(docs('docs/rfcs/a', 'docs/rfcs/b', 'docs/rfcs/c'));
    expect(areas.map((area) => area.path).sort()).toEqual(['docs', 'docs/rfcs']);
    expect(areas.every((area) => area.memberIds.length === 3)).toBe(true);
  });

  test('orders shallow before deep so nested regions draw inside their parent', () => {
    const areas = buildGraphAreas(docs('docs/rfcs/a', 'docs/rfcs/b', 'docs/rfcs/c'));
    expect(areas.map((area) => area.depth)).toEqual([0, 1]);
  });

  test('ignores folders too small to read as a territory', () => {
    expect(buildGraphAreas(docs('docs/a', 'docs/b'))).toEqual([]);
  });

  test('ignores root-level pages, which belong to no folder', () => {
    expect(buildGraphAreas(docs('README', 'LICENSE', 'AGENTS'))).toEqual([]);
  });

  test('stops descending past the top levels, where regions become noise', () => {
    const areas = buildGraphAreas(docs('a/b/c/one', 'a/b/c/two', 'a/b/c/three'));
    expect(areas.map((area) => area.path)).toEqual(['a', 'a/b']);
  });

  test('skips non-document nodes, which have no path', () => {
    const nodes: GraphNode[] = [
      ...docs('docs/a', 'docs/b', 'docs/c'),
      { kind: 'external', id: 'external:https://x.test', url: 'https://x.test', label: 'x' },
      { kind: 'tag', id: 'tag:idea', label: '#idea', tag: 'idea' },
    ];
    expect(buildGraphAreas(nodes)[0].memberIds).toHaveLength(3);
  });

  test('caps the region count, keeping the folders that carry the most pages', () => {
    const nodes = Array.from({ length: 20 }, (_, folder) =>
      docs(...Array.from({ length: folder + 3 }, (_, page) => `f${folder}/p${page}`)),
    ).flat();
    const areas = buildGraphAreas(nodes);
    expect(areas).toHaveLength(12);
    // Largest first within a depth, so the cap drops the smallest folders.
    expect(areas[0].memberIds.length).toBeGreaterThan(areas.at(-1)?.memberIds.length ?? 0);
  });
});

describe('getGraphAreaBounds', () => {
  const area = buildGraphAreas(docs('docs/a', 'docs/b', 'docs/c'))[0];

  test('centers on the members and pads out to the furthest one', () => {
    const bounds = getGraphAreaBounds(
      area,
      new Map([
        ['docs/a', { x: -10, y: 0 }],
        ['docs/b', { x: 10, y: 0 }],
        ['docs/c', { x: 0, y: 4 }],
      ]),
      5,
    );
    expect(bounds?.centerX).toBe(0);
    expect(bounds?.centerY).toBeCloseTo(4 / 3, 10);
    expect(bounds?.radiusX).toBe(15);
    expect(bounds?.radiusY).toBeCloseTo(5 + 8 / 3, 10);
  });

  test('returns null until enough members have landed', () => {
    // During the first ticks most nodes have no coordinates; a region drawn
    // from two of them would jump across the canvas as the rest arrive.
    expect(getGraphAreaBounds(area, new Map(), 5)).toBeNull();
    expect(getGraphAreaBounds(area, new Map([['docs/a', { x: 0, y: 0 }]]), 5)).toBeNull();
  });
});

describe('area zoom gating', () => {
  test('names the coarsest folders first', () => {
    expect(getGraphAreaLabelZoomThreshold(0, 1.8)).toBeLessThan(
      getGraphAreaLabelZoomThreshold(1, 1.8),
    );
  });

  test('names folders before it names their pages', () => {
    // Regions are the landmarks the node labels are read against.
    expect(getGraphAreaLabelZoomThreshold(1, 1.8)).toBeLessThan(1.8);
  });

  test('retires the regions once they fill the viewport', () => {
    expect(isGraphAreaVisibleAtZoom(1, 1.8)).toBe(true);
    expect(isGraphAreaVisibleAtZoom(4, 1.8)).toBe(false);
  });

  test('keeps a floor so a zero threshold does not hide regions immediately', () => {
    expect(isGraphAreaVisibleAtZoom(1, 0)).toBe(true);
  });
});
