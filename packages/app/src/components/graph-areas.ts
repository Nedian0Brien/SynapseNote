import type { GraphNode } from './graph-view-utils';

/**
 * Folders, drawn as named regions behind the nodes that live in them.
 *
 * The graph payload has no folder in it — but every document node carries a
 * path, and the path prefix IS the folder. So the regions are derived on the
 * client from `docName` alone: no directory nodes, no directory edges, nothing
 * new from the server.
 *
 * A region is an axis-aligned ellipse around its members' centroid rather than
 * a convex hull. A hull traces the exact membership and therefore writhes on
 * every simulation tick; an ellipse is a stable shape that says "roughly here",
 * which is all a background territory needs to say.
 */
export interface GraphAreaMember {
  x: number;
  y: number;
}

export interface GraphArea {
  /** Folder path, e.g. `docs/rfcs`. Unique per area. */
  path: string;
  /** Trailing segment, which is what gets drawn. */
  label: string;
  /** Nesting depth; `docs` is 0, `docs/rfcs` is 1. */
  depth: number;
  /** Node ids inside this folder, at any depth below it. */
  memberIds: string[];
}

export interface GraphAreaBounds {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

/** Below this a folder is not a territory, it is a couple of loose pages. */
const MIN_AREA_MEMBERS = 3;
/**
 * Deep folders produce many tiny overlapping regions that read as noise rather
 * than structure, so only the top levels are drawn.
 */
const MAX_AREA_DEPTH = 1;
/** Guards a pathological tree from filling the canvas with washes of color. */
const MAX_AREAS = 12;

function folderPathOf(node: GraphNode): string | null {
  if (node.kind !== 'doc') return null;
  const lastSlash = node.docName.lastIndexOf('/');
  return lastSlash > 0 ? node.docName.slice(0, lastSlash) : null;
}

/** Every ancestor folder of a path, shallowest first: `a/b/c` → `a`, `a/b`, `a/b/c`. */
function ancestorFolders(folderPath: string): string[] {
  const segments = folderPath.split('/').filter(Boolean);
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

/**
 * Group nodes into drawable folder regions.
 *
 * A node counts toward every ancestor folder, not just its own — otherwise
 * `docs` would look empty in a project whose pages all sit in `docs/rfcs`.
 * Regions therefore nest, and the caller draws shallow before deep so the inner
 * ones read as sitting inside the outer.
 */
export function buildGraphAreas(nodes: readonly GraphNode[]): GraphArea[] {
  const membersByFolder = new Map<string, string[]>();

  for (const node of nodes) {
    const folderPath = folderPathOf(node);
    if (folderPath === null) continue;
    for (const ancestor of ancestorFolders(folderPath)) {
      const depth = ancestor.split('/').length - 1;
      if (depth > MAX_AREA_DEPTH) break;
      const existing = membersByFolder.get(ancestor);
      if (existing) {
        existing.push(node.id);
        continue;
      }
      membersByFolder.set(ancestor, [node.id]);
    }
  }

  return (
    [...membersByFolder.entries()]
      .filter(([, memberIds]) => memberIds.length >= MIN_AREA_MEMBERS)
      .map(([path, memberIds]) => ({
        path,
        label: path.split('/').at(-1) ?? path,
        depth: path.split('/').length - 1,
        memberIds,
      }))
      // Shallow first so the caller's draw order nests correctly; largest first
      // within a depth so the cap keeps the regions that carry the most pages.
      .sort((a, b) => a.depth - b.depth || b.memberIds.length - a.memberIds.length)
      .slice(0, MAX_AREAS)
  );
}

/**
 * The ellipse enclosing an area's members, in graph coordinates.
 *
 * Returns null when too few members have settled into positions to describe a
 * region — during the first ticks most nodes have no coordinates yet, and a
 * region drawn from two of them would jump across the canvas as the rest land.
 */
export function getGraphAreaBounds(
  area: GraphArea,
  positionById: ReadonlyMap<string, GraphAreaMember>,
  padding: number,
): GraphAreaBounds | null {
  const positions = area.memberIds.flatMap((id) => {
    const position = positionById.get(id);
    return position ? [position] : [];
  });
  if (positions.length < MIN_AREA_MEMBERS) return null;

  let sumX = 0;
  let sumY = 0;
  for (const position of positions) {
    sumX += position.x;
    sumY += position.y;
  }
  const centerX = sumX / positions.length;
  const centerY = sumY / positions.length;

  let maxDx = 0;
  let maxDy = 0;
  for (const position of positions) {
    maxDx = Math.max(maxDx, Math.abs(position.x - centerX));
    maxDy = Math.max(maxDy, Math.abs(position.y - centerY));
  }

  return {
    centerX,
    centerY,
    radiusX: maxDx + padding,
    radiusY: maxDy + padding,
  };
}

/**
 * Zoom at which an area's own label appears. Shallow folders are the coarse
 * landmarks, so they are named first — the same gradient the node label tiers
 * use, one level further out.
 */
export function getGraphAreaLabelZoomThreshold(depth: number, leafThreshold: number): number {
  return leafThreshold * (depth === 0 ? 0.22 : 0.38);
}

/**
 * Zoom past which areas stop being drawn at all. Close in, the region fills the
 * viewport and its tint reads as a background color change rather than as a
 * boundary, so it is retired in favor of the nodes themselves.
 */
export function isGraphAreaVisibleAtZoom(zoomScale: number, leafThreshold: number): boolean {
  return zoomScale < Math.max(leafThreshold * 1.6, 2.2);
}
