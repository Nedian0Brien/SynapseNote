import { isGraphFolderLink } from './graph-folders';
import type { GraphLink, GraphNode } from './graph-view-utils';
import { resolveGraphLinkEndpointId } from './graph-view-utils';

/**
 * Folder territories: a soft tinted region behind everything a directory holds,
 * with the directory's name written across it.
 *
 * This is a faithful port of the original SynapseNote graph — the Flask +
 * PixiJS one on `archive/synapsenote-before-appflowy`, whose area system lived
 * in `services/web/frontend/src/features/workspace/GraphView.jsx`. Everything
 * here (the bounds, the two phases, the fade ranges, the ink, the name sizes)
 * reproduces that file's numbers rather than reinventing them.
 *
 * An earlier pass on this branch tried to improve on it — percentile bounds, a
 * rotated ellipse, a continuous per-depth crossfade — and the result read as
 * awkward next to the thing it was replacing. The original's choices are
 * cruder and they work, so they are restored verbatim and the reasoning is
 * recorded next to each one.
 */

export interface GraphArea {
  id: string;
  /** The folder's own label — the region name. */
  name: string;
  /** Distance from the project root. Drives padding, ink, phase and name size. */
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

/**
 * Regions for every directory that holds something, EXCEPT the ones with no
 * directory above them.
 *
 * The exclusion matters: the project root's region would be the whole graph, so
 * it would tint everything uniformly and name the map after itself. The
 * original made exactly this exclusion (`!rootIds.has(dir.id)`), and it is why
 * the shallowest region is a top-level folder at depth 1 rather than the root
 * at depth 0.
 *
 * There is deliberately no maximum depth. One was added on this branch, on the
 * theory that a codebase is deeper than a note vault and the deep regions were
 * storeys nobody thinks in. But the original handles depth by PHASE, not by
 * exclusion — everything at depth 2 and below shares one phase and appears
 * together — so capping it removed regions the phase system was already
 * accounting for.
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
      // Shallow regions first, exactly as the original sorted them.
      .sort((a, b) => (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0))
      .map((node, index) => ({
        id: node.id,
        name: node.kind === 'folder' ? node.label : node.id,
        depth: depthById.get(node.id) ?? 0,
        memberIds: new Set([node.id, ...collectDescendants(node.id)]),
        colorIndex: index,
      }))
  );
}

/**
 * How the original's numbers are carried over to a graph of a different size.
 *
 * Every world-space constant below — the extent floors, the padding, the name
 * sizes — was written against a layout running `forceLink().distance(95)` over
 * a note vault, and every zoom threshold was written against the scale factor
 * THAT graph produced. Neither survives being pasted into a 1,248-node
 * codebase: this layout runs a shorter spring and holds six times the nodes,
 * so at zoom-to-fit it sits three times further out on the original's scale
 * than the original ever did, and the whole phase system would be off the end
 * of its own range before the user touched anything.
 *
 * So the constants are kept verbatim and converted through one measured
 * factor. The measurement is the original's own `fitAll`:
 *
 *     scale = min(width * 0.62 / spanX, height * 0.72 / spanY)
 *
 * — it framed the graph into 62% of the viewport, and the phase thresholds
 * were chosen against whatever zoom that produced for a vault. Anchoring OUR
 * fit to the same point on its scale reproduces the relationship it actually
 * had (fit shows you the top-level regions; the first zoom-in subdivides them)
 * on a graph of any size, which pasting its raw numbers would not.
 */
const GRAPH_AREA_FIT_WIDTH_SHARE = 0.62;
const GRAPH_AREA_FIT_HEIGHT_SHARE = 0.72;

/**
 * Where zoom-to-fit lands on the original's zoom scale.
 *
 * `GRAPH_AREA_PHASE1_START - GRAPH_AREA_FADE_RANGE` — the exact point its own
 * `bgVisible` gate let the phase-2 regions in. So the framed graph is the
 * top-level regions and their names, and the very first zoom-in starts
 * dividing them into their parts. Not a number picked to look right: it is the
 * boundary the original already had, put where the original already framed to.
 */
const GRAPH_AREA_FIT_ZOOM = 0.27;

export interface GraphAreaExtent {
  spanX: number;
  spanY: number;
  width: number;
  height: number;
}

/**
 * World units here per world unit in the original, measured from how much of
 * the viewport this graph currently spans. Returns 1 — the identity, i.e.
 * "assume the original's own scale" — for a degenerate extent.
 */
export function getGraphAreaWorldScale(extent: GraphAreaExtent): number {
  const { spanX, spanY, width, height } = extent;
  if (!(spanX > 0) || !(spanY > 0) || !(width > 0) || !(height > 0)) return 1;
  const fitScale = Math.min(
    (width * GRAPH_AREA_FIT_WIDTH_SHARE) / spanX,
    (height * GRAPH_AREA_FIT_HEIGHT_SHARE) / spanY,
  );
  if (!(fitScale > 0)) return 1;
  return GRAPH_AREA_FIT_ZOOM / fitScale;
}

/**
 * The original's zoom scale, recovered from ours: screen pixels per ORIGINAL
 * world unit. Every threshold in this file reads against this, never against
 * `globalScale` directly.
 */
export function getGraphAreaZoom(globalScale: number, worldScale: number): number {
  return globalScale * worldScale;
}

/** Floors on the half-extent, so a one-member region is still a region. */
const MIN_HALF_WIDTH = 30;
const MIN_HALF_HEIGHT = 25;

/**
 * How far a region's ellipse reaches past its outermost member.
 *
 * The original: `depth >= 2 ? 35 + (2 - depth) * 10 : 55 + (2 - depth) * 15`.
 * Padding shrinks with depth so a nested region sits visibly inside its parent
 * instead of tracing the same outline, and it shrinks in two different steps
 * because the two phases are read at different zooms — a phase-1 region is
 * looked at from far enough out that it needs the generous 70 to register as a
 * shape at all, while a phase-2 region is read up close where 35 already
 * separates it from its neighbours.
 */
export function getGraphAreaPadding(depth: number): number {
  return depth >= GRAPH_AREA_PHASE2_DEPTH ? 35 + (2 - depth) * 10 : 55 + (2 - depth) * 15;
}

/**
 * The ellipse to paint for an area, from wherever the simulation has currently
 * put its members. Returns `null` while none of them have coordinates yet.
 *
 * Centroid, then the MAXIMUM absolute offset on each axis, then padding —
 * axis-aligned, exactly as the original's `updateAreaBounds`.
 *
 * This branch previously replaced the maximum with an 82nd percentile and
 * rotated the ellipse onto the cluster's principal axis. Both were answers to
 * real measurements (one distant member inflating a region; 22% of nodes
 * landing outside their own folder's ellipse) and both made the map worse to
 * look at: the percentile leaves members visibly stranded outside the colour
 * that is supposed to contain them, and the rotation makes every region tilt
 * at its own angle and wobble as the simulation settles. A territory that
 * always contains its members and never tilts reads as ground; a tighter one
 * that does neither reads as a mistake.
 */
export function getGraphAreaBounds(
  area: GraphArea,
  positionById: ReadonlyMap<string, { x?: number; y?: number }>,
  worldScale = 1,
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

  let maxDx = MIN_HALF_WIDTH * worldScale;
  let maxDy = MIN_HALF_HEIGHT * worldScale;
  for (const id of area.memberIds) {
    const point = positionById.get(id);
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
    const dx = Math.abs(point.x - cx);
    const dy = Math.abs(point.y - cy);
    if (dx > maxDx) maxDx = dx;
    if (dy > maxDy) maxDy = dy;
  }

  const padding = getGraphAreaPadding(area.depth) * worldScale;
  return { cx, cy, rx: maxDx + padding, ry: maxDy + padding };
}

/**
 * The depth at which a region stops belonging to the first phase.
 *
 * The whole level-of-detail system is two phases, not one per depth. Depth 1 —
 * the top-level folders — is phase 1, the map you read when zoomed out.
 * Everything at depth 2 and below is phase 2, the map you read once you are
 * inside one. There is no third phase; a depth-5 folder is simply a small
 * phase-2 region.
 */
export const GRAPH_AREA_PHASE2_DEPTH = 2;

/** Where phase 2 starts arriving and phase 1 starts leaving. */
export const GRAPH_AREA_PHASE1_START = 0.35;

/** Where phase 2 has finished leaving, having handed the map to the pages. */
export const GRAPH_AREA_PHASE2_FADE_END = 0.6;

/** Half-width of every crossfade, in zoom scale. */
export const GRAPH_AREA_FADE_RANGE = 0.08;

/** The ink a region name is written with at full presence. */
export const GRAPH_AREA_NAME_ALPHA = 0.82;

/** A region is a place only once it holds something besides itself. */
export const GRAPH_AREA_MIN_MEMBERS = 2;

export function isGraphAreaPhase2(depth: number): boolean {
  return depth >= GRAPH_AREA_PHASE2_DEPTH;
}

export interface GraphAreaPhases {
  /** Multiplier on a phase-1 region's own fill alpha. */
  phase1Tint: number;
  /** Multiplier on a phase-2 region's own fill alpha. */
  phase2Tint: number;
  /** Absolute alpha for a phase-1 region's name. */
  phase1Name: number;
  /** Absolute alpha for a phase-2 region's name. */
  phase2Name: number;
  /** Whether phase-2 regions are drawn at all yet. */
  phase2Visible: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * How present each phase is at this zoom — the original's frame-loop block,
 * unchanged.
 *
 * Three things are worth naming, because they are what the rebuilt version got
 * wrong:
 *
 * 1. `phase1Tint` bottoms out at 0.4, never 0. A top-level region you have
 *    zoomed inside of stays as ground under the smaller regions rather than
 *    going dark, so descending never empties the map.
 * 2. Phase 2's tint arrives over the FIRST 60% of the handover
 *    (`fadeT / 0.6`), so the child regions are fully inked well before the
 *    parent has finished receding. The overlap is the point.
 * 3. Names and tint are on different clocks. Both phases' names are gone by
 *    `phase2FadeEnd`, while phase 1's tint stays forever — because a name
 *    competes with the page labels for the same pixels and a tint does not.
 */
export function getGraphAreaPhases(zoom: number): GraphAreaPhases {
  const fadeT = clamp01(
    (zoom - (GRAPH_AREA_PHASE1_START - GRAPH_AREA_FADE_RANGE)) / (2 * GRAPH_AREA_FADE_RANGE),
  );
  const phase2UpperFade = clamp01(
    1 - (zoom - (GRAPH_AREA_PHASE2_FADE_END - GRAPH_AREA_FADE_RANGE)) / (2 * GRAPH_AREA_FADE_RANGE),
  );

  return {
    phase1Tint: 1 - fadeT * 0.6,
    phase2Tint: clamp01(fadeT / 0.6),
    phase1Name: GRAPH_AREA_NAME_ALPHA * (1 - fadeT),
    phase2Name: GRAPH_AREA_NAME_ALPHA * fadeT * phase2UpperFade,
    phase2Visible: zoom > GRAPH_AREA_PHASE1_START - GRAPH_AREA_FADE_RANGE,
  };
}

/**
 * Ink for one region at this nesting depth: the original's
 * `0.10 + depth * 0.02`.
 *
 * Depth is legible as density, not only as position, so a nested region reads
 * as sitting INSIDE its parent rather than merely next to it. This is an
 * ABSOLUTE alpha for the shape, not a multiplier on a layer opacity — the
 * layer is composited at 1 and these values are the whole of the tint.
 */
export function getGraphAreaFillAlpha(depth: number): number {
  return 0.1 + depth * 0.02;
}

/** The fill alpha a region should actually be painted at right now. */
export function getGraphAreaTintAlpha(area: GraphArea, phases: GraphAreaPhases): number {
  if (isGraphAreaPhase2(area.depth)) {
    if (!phases.phase2Visible) return 0;
    return getGraphAreaFillAlpha(area.depth) * phases.phase2Tint;
  }
  return getGraphAreaFillAlpha(area.depth) * phases.phase1Tint;
}

/** The alpha a region's NAME should be written at right now. */
export function getGraphAreaNameAlpha(area: GraphArea, phases: GraphAreaPhases): number {
  if (isGraphAreaPhase2(area.depth)) {
    if (!phases.phase2Visible) return 0;
    return phases.phase2Name;
  }
  return phases.phase1Name;
}

/**
 * How big a region's name is drawn, in the original's world units.
 *
 * Phase 1 starts at 72 and loses 16 a level; phase 2 starts at 40 and loses 12
 * a level, with floors at 30 and 24. Size is a function of DEPTH, not of how
 * many pixels the region currently occupies — which is what makes the name a
 * statement about where you are in the tree rather than about the shape it
 * happens to be sitting on.
 *
 * (This branch had sized names to the measured on-screen width of their own
 * region. That is why they came out ragged: two folders on the same storey
 * would be lettered at different sizes because the simulation had spread one
 * of them wider that second, and the size churned as the layout settled.)
 */
export function getGraphAreaNameWorldSize(depth: number): number {
  return isGraphAreaPhase2(depth)
    ? Math.max(24, 40 - (depth - GRAPH_AREA_PHASE2_DEPTH) * 12)
    : Math.max(30, 72 - depth * 16);
}

/**
 * That size on screen. The original's labels lived inside the zoomed container,
 * so they grew and shrank with the map; ours are drawn in screen space, so the
 * zoom has to be applied by hand to get the same behaviour.
 */
export function getGraphAreaNameSizePx(depth: number, zoom: number): number {
  return getGraphAreaNameWorldSize(depth) * zoom;
}

/**
 * Softness of the territory edges — the original's `BlurFilter({ strength: 16 })`,
 * which Pixi applies in screen space after the zoom transform, so it is 16
 * screen pixels at any zoom just as this is.
 */
export const GRAPH_AREA_BLUR_PX = 16;

/**
 * Resolution the territory layer is rasterized at, as a fraction of the canvas.
 *
 * Not from the original — Pixi did this on the GPU and could afford full
 * resolution. The layer exists only to be soft, so there is no reason to draw
 * it sharp and then spend a full-resolution blur destroying that sharpness.
 * Rasterizing small and scaling back up IS a smoothing pass, and it costs a
 * fraction of blurring the full canvas every frame.
 */
export const GRAPH_AREA_LAYER_SCALE = 0.22;
