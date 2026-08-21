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
  /**
   * Index into the caller's palette; areas cycle through it.
   *
   * One slot per region, NOT inherited from an ancestor. Inheriting it was an
   * answer to the map repainting itself when one level handed over to the
   * next, back when levels were mutually exclusive — but the ground weight
   * (see `GRAPH_AREA_GROUND_WEIGHT`) answers that better, by keeping the
   * parent's colour underneath instead of restating it on top. With both in
   * place the inheritance only cost legibility: at this layer's alpha the
   * shade variation that kept siblings apart was far too fine to survive, and
   * a screenful of regions came out as one wash of the same pink.
   */
  colorIndex: number;
}

export interface GraphAreaBounds {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Radians to rotate the ellipse by, so it lies along the cluster. */
  rotation: number;
}

/** Floors on the half-extent, so a one-member region is still a region. */
const MIN_HALF_WIDTH = 30;
const MIN_HALF_HEIGHT = 25;

/**
 * How deep in the folder tree a directory can be and still be a place.
 *
 * The original was written for note vaults, which are two or three levels
 * deep, and drew a territory for every directory it found. Run the same rule
 * over a codebase and you get storeys nobody thinks in: this repo yields 57
 * regions, 40 of them at depth 3 or below, and every one of the ten at depth 5
 * holds exactly two files. A folder with two files in it is not somewhere you
 * navigate to, and having to descend past four levels of them to reach the
 * pages is what made the map confusing rather than legible.
 *
 * Deeper folders do not lose their pages — a region's members already include
 * all its descendants, so those pages simply belong to the deepest ANCESTOR
 * that is still a place.
 *
 * Two levels, not three: three still left this repo with fourteen depth-3
 * regions to descend through, and the storeys a reader actually holds in their
 * head are "which top-level area" and "which part of it".
 */
export const GRAPH_AREA_MAX_DEPTH = 2;

/**
 * Regions for every directory that holds something. Top-level folders remain
 * regions even though the synthetic project-root node is hidden; otherwise
 * removing that physics-only root would also erase the map's largest places.
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
        (node) =>
          (childrenByParent.get(node.id) ?? []).length > 0 &&
          (depthById.get(node.id) ?? 0) <= GRAPH_AREA_MAX_DEPTH,
      )
      // Shallow regions first, so a nested one paints on top of its parent.
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

  // Lay the ellipse along the cluster rather than along the screen axes.
  //
  // A folder's pages are pulled into whatever shape their links want, and that
  // is rarely axis-aligned. Measured on this repo, an axis-aligned fit left 22%
  // of all nodes outside the territory of their OWN folder — a fifth of the
  // graph sitting on bare canvas next to the colour that was supposed to
  // contain it. Rotating to the cluster's principal axis fixes that without
  // touching the percentile below, which is there to keep outliers from
  // inflating the region and should stay strict.
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const id of area.memberIds) {
    const point = positionById.get(id);
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
    const dx = point.x - cx;
    const dy = point.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const rotation = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // A high percentile of the members' distances, NOT the maximum.
  //
  // The maximum is decided by whichever single member has wandered furthest,
  // and in a link graph something always has: one page in `packages` that is
  // cited from the other end of the vault dragged that region's territory to
  // one and a half times the width of the whole canvas, while the graph it was
  // supposed to be a part of fitted inside it. The tint then covered empty
  // space, and every large region overlapped every other one. A percentile
  // asks where the members actually ARE and lets the strays fall outside,
  // which is what a region on a map means anyway.
  const dxs: number[] = [];
  const dys: number[] = [];
  for (const id of area.memberIds) {
    const point = positionById.get(id);
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') continue;
    const dx = point.x - cx;
    const dy = point.y - cy;
    // Distances along the cluster's own axes, not the screen's.
    dxs.push(Math.abs(dx * cos + dy * sin));
    dys.push(Math.abs(dy * cos - dx * sin));
  }
  dxs.sort((a, b) => a - b);
  dys.sort((a, b) => a - b);
  const at = (sorted: number[]) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * GRAPH_AREA_EXTENT_PERCENTILE))] ??
    0;

  const padding = Math.max(20, 55 - area.depth * 12);
  return {
    cx,
    cy,
    rx: Math.max(MIN_HALF_WIDTH, at(dxs)) + padding,
    ry: Math.max(MIN_HALF_HEIGHT, at(dys)) + padding,
    rotation,
  };
}

/**
 * Share of a region's members the territory is drawn to cover. The rest are
 * outliers whose job is to be linked from elsewhere, not to define a place.
 */
export const GRAPH_AREA_EXTENT_PERCENTILE = 0.82;

/**
 * Opacity of the FINISHED territory layer, applied once at composite time.
 *
 * There is deliberately no per-region alpha any more. Painting the ellipses
 * straight onto the canvas made alpha accumulate, so a patch covered by four
 * folders came out four times as dark — depth information that is not there,
 * and the muddy wash that made the whole thing unreadable. The regions are
 * partitioned first (see `paintGraphAreaPartition`) so every pixel carries
 * exactly one region's colour, and then the whole layer gets this one value.
 */
export const GRAPH_AREA_TINT_ALPHA = 0.16;

/**
 * Softness of the territory edges, applied to the assembled layer rather than
 * to each region. Blurring them individually would feather the boundaries back
 * into one another and undo the partition.
 */
export const GRAPH_AREA_BLUR_PX = 30;

/**
 * Resolution the territory layer is rasterized at, as a fraction of the canvas.
 *
 * The layer exists only to be soft, so there is no reason to draw it sharp and
 * then spend a full-resolution blur destroying that sharpness. Rasterizing it
 * small and scaling back up IS a smoothing pass — bilinear interpolation across
 * a 4-5x upscale rounds every boundary on its own — and it costs a fraction of
 * what blurring the full canvas each frame does. The blur on top finishes the
 * job.
 */
export const GRAPH_AREA_LAYER_SCALE = 0.22;

/**
 * Whether a region is big enough on screen to be worth drawing at all.
 *
 * Only the fade IN. A region below a tenth of the viewport is a handful of
 * dots and its parent already says where you are; past that it ramps up and
 * stays up.
 *
 * There used to be a fade OUT here as well, for a region grown larger than the
 * screen. That was the right idea at the wrong level: "you have zoomed past
 * this" is a fact about the LEVEL you are on, not about one region, and
 * `getGraphAreaFocusDepth` now owns it. Keeping both meant a region was fading
 * for two reasons at once during a handover, and the product of the two left a
 * trough in the middle of every transition where the map went blank.
 */
export function getGraphAreaLodAlpha(regionWidthPx: number, viewportPx: number): number {
  if (viewportPx <= 0) return 0;
  const share = regionWidthPx / viewportPx;
  if (share < 0.1) return 0;
  if (share < 0.18) return (share - 0.1) / 0.08;
  return 1;
}

/**
 * The on-screen share a region wants to occupy to be the level you are reading.
 * Sits in the middle of the band `getGraphAreaLodAlpha` calls fully present.
 */
export const GRAPH_AREA_FOCUS_SHARE = 0.5;

/**
 * Which storey of the folder tree the map is showing, as a continuous number.
 *
 * Regions shrink as you go deeper and grow as you zoom in, so "how big is a
 * typical depth-2 region right now" is a monotone read-out of where you are in
 * the tree. This finds the depth whose regions are currently closest to the
 * size a region wants to be to be read, interpolating between the two it falls
 * between — so the answer slides continuously from 0 toward 1 toward 2 as you
 * descend, rather than jumping.
 *
 * Interpolated in log space because share scales multiplicatively with zoom:
 * a constant zoom gesture should move this by a constant amount.
 */
export function getGraphAreaFocusDepth(
  entries: ReadonlyArray<{ depth: number; share: number }>,
): number | null {
  const totals = new Map<number, { sum: number; count: number }>();
  for (const entry of entries) {
    if (!(entry.share > 0)) continue;
    const bucket = totals.get(entry.depth) ?? { sum: 0, count: 0 };
    bucket.sum += entry.share;
    bucket.count += 1;
    totals.set(entry.depth, bucket);
  }
  if (totals.size === 0) return null;

  const levels = [...totals]
    .map(([depth, bucket]) => ({ depth, share: bucket.sum / bucket.count }))
    .sort((a, b) => a.depth - b.depth);
  if (levels.length === 1) return levels[0].depth;

  const target = Math.log(GRAPH_AREA_FOCUS_SHARE);
  // Shallow regions are the big ones, so share falls as depth rises; walk out
  // until the target is bracketed.
  for (let index = 0; index < levels.length - 1; index += 1) {
    const near = levels[index];
    const far = levels[index + 1];
    const nearLog = Math.log(near.share);
    const farLog = Math.log(far.share);
    const between = (target - nearLog) / (farLog - nearLog);
    if (between >= 0 && between <= 1) {
      return near.depth + between * (far.depth - near.depth);
    }
  }
  // Everything still too small: stay at the shallowest level.
  if (levels[0].share < GRAPH_AREA_FOCUS_SHARE) return levels[0].depth;

  // Past the deepest level, keep counting rather than saturating. There is no
  // storey below this one, but "how far INSIDE the last one am I" is still a
  // real question and the region names need it: once you are reading pages,
  // the names of the places holding them are noise, and the original dropped
  // them entirely at that point. Extrapolated at the spacing of the last two
  // levels so a zoom keeps moving this at the same rate it did on the way down.
  // Counted in doublings of the deepest region's on-screen size, NOT in
  // multiples of the gap between the last two levels.
  //
  // The gap version divided by a number that is routinely near zero: two
  // adjacent levels are often almost the same size on screen — here `packages`
  // covers 0.59 of the viewport and `app/tests` inside it covers 0.58 — so the
  // divisor was 0.017 and the first pixel of zoom past the deepest level sent
  // this from 2 to about 10. Everything keyed off it vanished at once.
  //
  // A doubling is a fixed, honest unit: one more level of "inside" per 2x zoom,
  // whatever the tree happens to look like.
  const deepest = levels[levels.length - 1];
  return deepest.depth + Math.max(0, Math.log2(deepest.share / GRAPH_AREA_FOCUS_SHARE));
}

/**
 * How much of the map each depth gets, given where between the storeys you are.
 *
 * A triangular kernel one level wide: at exactly depth 2 that level has the map
 * to itself, and halfway between 1 and 2 they hold half each. Never more than
 * two levels at once, and every weight moves continuously with the zoom, so
 * descending is a crossfade rather than a cut.
 *
 * The alternative — pick the best-fitting depth and give the runner-up a share
 * proportional to how close it is — reads the same while nothing changes but
 * jumps the moment the runner-up's IDENTITY changes, which is exactly at the
 * handover.
 */
export function getGraphAreaDepthWeight(depth: number, focusDepth: number | null): number {
  if (focusDepth === null) return 0;
  return Math.max(0, 1 - Math.abs(depth - focusDepth));
}

/**
 * How much denser a region draws for each level of nesting.
 *
 * The original filled each territory at `0.10 + depth * 0.02` — depth was
 * legible as ink, not just as position, so a nested region read as sitting
 * INSIDE its parent rather than merely next to it. Our regions all drew at one
 * alpha, which threw that cue away.
 *
 * Expressed as a multiplier rather than an absolute alpha because our layer
 * carries its opacity once at composite time (see `GRAPH_AREA_TINT_ALPHA`)
 * instead of per shape. 0.167 per level reproduces the original's ratios:
 * its 0.12 / 0.14 / 0.16 for the first three depths are 1 : 1.17 : 1.33.
 */
const GRAPH_AREA_DEPTH_DENSITY_STEP = 0.167;

/**
 * Capped so a pathologically deep tree cannot drive one region to full
 * opacity. The original was uncapped but never met a vault deep enough to
 * matter; this bottoms out around the density it reached at depth 5.
 */
const GRAPH_AREA_MAX_DEPTH_DENSITY = 1.67;

/** Ink for a region at this nesting depth, relative to a top-level one. */
export function getGraphAreaDepthDensity(depth: number): number {
  return Math.min(
    GRAPH_AREA_MAX_DEPTH_DENSITY,
    1 + Math.max(0, depth - 1) * GRAPH_AREA_DEPTH_DENSITY_STEP,
  );
}

/**
 * What a level you have already descended past keeps, rather than going dark.
 *
 * Ported from the original, whose shallow tint bottomed out at 0.4 and never
 * left (`p1BgFade = 1 - fadeT * 0.6`). Its "one level at a time" only ever
 * applied to the NAMES — the tints stacked, with the shallow one staying as
 * ground under the deep one. Making the tint exclusive too, as this did at
 * first, is stricter than the original and costs two things: the map dims to
 * nothing halfway through every handover, and you lose the coarse colour
 * blocking that tells you which part of the vault you are in while the level
 * you are reading is still arriving.
 */
export const GRAPH_AREA_GROUND_WEIGHT = 0.35;

/**
 * How much of the tint a level gets — the same crossfade as the names, but a
 * level ABOVE the one you are on stays on as ground instead of leaving.
 *
 * Levels below the current one are still dark: they have not arrived yet, and
 * showing them early is the clutter the depth stepping exists to remove.
 */
export function getGraphAreaTintWeight(depth: number, focusDepth: number | null): number {
  const weight = getGraphAreaDepthWeight(depth, focusDepth);
  if (focusDepth === null || depth > focusDepth) return weight;
  return Math.max(weight, GRAPH_AREA_GROUND_WEIGHT);
}

/**
 * How far past the deepest level you get before its name stops being written.
 *
 * The original dropped every region name once you were close enough to read
 * pages (its `phase2UpperFade`, zoom 0.52 → 0.68) and kept only the tints. It
 * is right: at that distance the place names are competing with the page names
 * for the same pixels, and you already know where you are — you just came from
 * there.
 *
 * Two levels — with the overshoot counted in doublings, that is a 4x zoom from
 * the point where a region is half the screen to the point where its name is
 * gone. A gentle fade: the last level is the one you spend the most time in,
 * and having its name evaporate the moment you arrive is worse than carrying
 * it a little too long.
 */
const GRAPH_AREA_NAME_RETIRE_LEVELS = 2;

/**
 * How much of its name a region still writes, given how deep the map has gone.
 * Full while you are navigating between places, gone by the time you are
 * reading what is in them.
 */
export function getGraphAreaNameFade(depth: number, focusDepth: number | null): number {
  if (focusDepth === null) return 0;
  const past = focusDepth - depth;
  if (past <= 0) return 1;
  return Math.max(0, 1 - past / GRAPH_AREA_NAME_RETIRE_LEVELS);
}

/** Below this on-screen width a region has no room for a name at all. */
export const GRAPH_AREA_LABEL_MIN_REGION_PX = 56;

/**
 * A region's name is sized to the region, the way an atlas writes a continent
 * across the continent and a town in small type beside the town.
 *
 * This used to be a function of folder DEPTH alone (28–64px flat), which meant
 * a territory 40px wide on screen still got a 64px name: it sprawled over
 * everything around it, several collided into a smear, and a nested folder's
 * compressed path (`desktop/tests/smoke`) ran the full width of the canvas.
 * Depth was never the question — how much room the thing has is.
 *
 * @param regionWidthPx the territory's on-screen width, not its graph width.
 */
export function getGraphAreaLabelSizePx(regionWidthPx: number): number {
  return Math.max(11, Math.min(regionWidthPx * 0.2, 40));
}
