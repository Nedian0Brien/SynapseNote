import { isGraphFolderLink } from './graph-folders';
import type { GraphLink, GraphNode } from './graph-view-utils';
import { resolveGraphLinkEndpointId } from './graph-view-utils';

/**
 * Folder territories: a soft tinted region behind everything a directory holds,
 * with the directory's name written across it.
 *
 * This is the thing the original SynapseNote graph was recognizable BY — you
 * read the map by its regions, not by squinting at node labels. It draws as a
 * blurred, low-alpha ellipse over the members' bounding box, plus a large
 * italic name at the centroid.
 *
 * An earlier attempt at this on this branch failed and was reverted, for a
 * reason worth recording: a region is only meaningful if its members are
 * already sitting together, and back then folders were not nodes, so nothing in
 * the layout put them there. The ellipses covered the whole canvas and meant
 * nothing. Directories are real nodes now (see `graph-folders.ts`), which is
 * what makes this honest.
 */

export interface GraphArea {
  id: string;
  /** The folder's own label — the region name. */
  name: string;
  /** Distance from the project root. Drives size, padding and tint depth. */
  depth: number;
  memberIds: Set<string>;
  /** Index into the caller's palette; areas cycle through it. */
  colorIndex: number;
}

export interface GraphAreaBounds {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Floors on the half-extent, so a one-member region is still a region. */
const MIN_HALF_WIDTH = 30;
const MIN_HALF_HEIGHT = 25;

/**
 * Regions for every directory that holds something, EXCEPT the ones with no
 * directory above them.
 *
 * The exclusion matters: the project root's region would be the whole graph, so
 * it would tint everything uniformly and name the map after itself. The
 * original made the same exclusion.
 */
export function buildGraphAreas(
  nodes: readonly GraphNode[],
  links: readonly GraphLink[],
): GraphArea[] {
  const childrenByParent = new Map<string, string[]>();
  const parentByChild = new Map<string, string>();

  for (const link of links) {
    if (!isGraphFolderLink(link)) continue;
    const parent = resolveGraphLinkEndpointId(link.source);
    const child = resolveGraphLinkEndpointId(link.target);
    if (parent === null || child === null) continue;
    const siblings = childrenByParent.get(parent);
    if (siblings) siblings.push(child);
    else childrenByParent.set(parent, [child]);
    parentByChild.set(child, parent);
  }

  const folders = nodes.filter((node) => node.kind === 'folder');
  const folderIds = new Set(folders.map((node) => node.id));

  // Breadth-first from the parentless folders, so depth is the number of
  // directories above this one.
  const depthById = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = folders
    .filter((node) => !parentByChild.has(node.id))
    .map((node) => ({ id: node.id, depth: 0 }));
  for (let index = 0; index < queue.length; index += 1) {
    const { id, depth } = queue[index];
    if (depthById.has(id)) continue;
    depthById.set(id, depth);
    for (const child of childrenByParent.get(id) ?? []) {
      if (folderIds.has(child)) queue.push({ id: child, depth: depth + 1 });
    }
  }

  const collectDescendants = (folderId: string): string[] => {
    const descendants: string[] = [];
    const stack = [...(childrenByParent.get(folderId) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      descendants.push(id);
      stack.push(...(childrenByParent.get(id) ?? []));
    }
    return descendants;
  };

  return (
    folders
      .filter(
        (node) => (childrenByParent.get(node.id) ?? []).length > 0 && parentByChild.has(node.id),
      )
      .map((node, index) => ({
        id: node.id,
        name: node.kind === 'folder' ? node.label : node.id,
        depth: depthById.get(node.id) ?? 0,
        memberIds: new Set([node.id, ...collectDescendants(node.id)]),
        colorIndex: index,
      }))
      // Shallow regions first, so a nested one paints on top of its parent.
      .sort((a, b) => a.depth - b.depth)
  );
}

/**
 * The ellipse to paint for an area, from wherever the simulation has currently
 * put its members. Returns `null` while none of them have coordinates yet.
 *
 * Padding shrinks with depth so a nested region sits visibly inside its parent
 * rather than tracing the same outline.
 */
export function getGraphAreaBounds(
  area: GraphArea,
  positionById: ReadonlyMap<string, { x?: number; y?: number }>,
): GraphAreaBounds | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id of area.memberIds) {
    const point = positionById.get(id);
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
    sumX += point.x;
    sumY += point.y;
    count += 1;
  }
  if (count === 0) return null;

  const cx = sumX / count;
  const cy = sumY / count;
  let halfWidth = MIN_HALF_WIDTH;
  let halfHeight = MIN_HALF_HEIGHT;
  for (const id of area.memberIds) {
    const point = positionById.get(id);
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
    halfWidth = Math.max(halfWidth, Math.abs(point.x - cx));
    halfHeight = Math.max(halfHeight, Math.abs(point.y - cy));
  }

  const padding = Math.max(20, 55 - area.depth * 12);
  return { cx, cy, rx: halfWidth + padding, ry: halfHeight + padding };
}

/**
 * Tint opacity — deliberately tiny.
 *
 * Alpha ACCUMULATES: a project with forty folders paints forty overlapping
 * ellipses, and at the 0.10 the original used (it had a handful of well-spread
 * regions) they composite into an opaque wash that swallows the graph. This is
 * the budget for the whole stack, not for one region.
 */
export function getGraphAreaFillAlpha(depth: number): number {
  return 0.035 + Math.min(depth, 3) * 0.008;
}

/** Region names are the map's legend: large when far out, smaller further in. */
export function getGraphAreaLabelSizePx(depth: number): number {
  return Math.max(28, 64 - depth * 14);
}
