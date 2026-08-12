import { isGraphLabelVisibleAtZoom } from './graph-label-tiers';
import { type GraphLabelDescriptor, pickGraphLabelText } from './graph-label-utils';
import { buildGraphDegreeMap, type GraphNode } from './graph-view-utils';

export type GraphLabelLayoutNode = GraphNode & {
  x?: number;
  y?: number;
};

interface GraphLabelLayoutLinkRef {
  id?: string | number | null;
}

export interface GraphLabelLayoutLink {
  source: string | GraphLabelLayoutLinkRef;
  target: string | GraphLabelLayoutLinkRef;
}

interface GraphViewport {
  width: number;
  height: number;
}

/**
 * A name always sits under its node. There used to be three fallbacks (top,
 * right, left), tried in turn when the space below was taken — which meant the
 * same page's name jumped from under the dot to beside it as you zoomed, and
 * you could not tell at a glance which node a name belonged to because the
 * relationship changed from label to label. One position, always, is worth more
 * than a few extra names: a label that does not fit is now simply not drawn.
 */
type GraphLabelAnchor = 'bottom';

export interface GraphLabelPlacement {
  nodeId: string;
  text: string;
  anchor: GraphLabelAnchor;
  /** How many steps below its node this name ended up. Feed back in as
   * `previousOffsetStepByNodeId` so the next frame can reproduce it. */
  offsetStep: number;
  priority: number;
  isActive: boolean;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  textX: number;
  textY: number;
}

interface PlanGraphLabelsInput {
  nodes: GraphLabelLayoutNode[];
  links: GraphLabelLayoutLink[];
  activeDocName: string;
  viewport: GraphViewport;
  maxLabels: number;
  maxLabelWidthPx: number;
  /** Current canvas zoom, against which each candidate's tier threshold is read. */
  zoomScale: number;
  /** The user's "Text fade threshold" — the LEAF tier's cutoff. */
  leafLabelThreshold: number;
  labelDescriptors: Map<string, GraphLabelDescriptor>;
  measureTextWidthPx: (text: string) => number;
  projectToScreen: (x: number, y: number) => { x: number; y: number };
  getNodeRadiusPx: (node: GraphLabelLayoutNode) => number;
  /**
   * What the last frame decided: node id → the offset step its name was drawn
   * at. Supplying it is what makes labels hold still while the view moves.
   *
   * This plan is recomputed every frame, and two of its inputs change
   * continuously during a zoom: a candidate's distance from the centre of the
   * screen (the second sort key) and, through the node radius, where its name
   * wants to sit. So the priority order reshuffled on every frame, the greedy
   * accept below took a different set each time, and names flickered on and
   * off and traded places — a mess exactly while you were moving, which is
   * when you are trying to read them.
   *
   * Carrying the previous decision forward fixes both halves: a name that was
   * showing sorts ahead of one that was not, so the set stops churning, and it
   * is retried at the offset it already had, so it stops hopping.
   */
  previousOffsetStepByNodeId?: ReadonlyMap<string, number>;
  /**
   * Whether the viewer has zoomed INTO the folder this node lives in, or `null`
   * if the node is not inside one (a top-level page, or territories switched
   * off — in which case the degree tiers below decide alone, as they always
   * did).
   *
   * This is what makes the reveal follow the folder tree rather than the link
   * count. Zoomed out you get region names and nothing else; zoom into a
   * region and its pages name themselves as it stops being a landmark; zoom
   * into one of ITS folders and the same thing happens a level down. Link
   * count still decides the order WITHIN a revealed folder — it is a good
   * answer to "which of these matters most", and a poor one to "where am I".
   */
  isRegionEnteredForNode?: (nodeId: string) => boolean | null;
}

interface LabelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PositionedNode {
  node: GraphLabelLayoutNode;
  screenX: number;
  screenY: number;
  radiusPx: number;
}

interface LabelCandidate extends PositionedNode {
  text: string;
  textWidthPx: number;
  isActive: boolean;
  degree: number;
  distanceToCenterPx: number;
  /** Whether the previous frame drew this name, and where. */
  wasShowing: boolean;
  previousOffsetStep: number;
}

const VIEWPORT_PADDING_PX = 8;
const LABEL_FONT_SIZE_PX = 10;
const LABEL_GAP_PX = 4;
const LABEL_PADDING_X_PX = 6;
const LABEL_PADDING_Y_PX = 4;
const LABEL_HEIGHT_PX = LABEL_FONT_SIZE_PX + LABEL_PADDING_Y_PX * 2;
const NODE_COLLISION_PADDING_PX = 2;
/**
 * How much bigger than a plain page a node must draw before a name will go
 * around it rather than across it.
 *
 * The rule used to be "clear EVERY node circle", which at a normal working
 * zoom threw away about 40% of the names that were otherwise ready — and threw
 * them away in the dense places where you most want them. It is also the wrong
 * instinct: an ordinary page is a small hollow dot, and a name passing near one
 * stays perfectly readable. What actually swallows text is a hub or a folder,
 * which draw as large filled discs.
 *
 * Measured against the smallest node on screen rather than in absolute pixels,
 * because every radius here scales with the zoom — an absolute threshold is
 * either every node or none of them depending on how far in you are. Plain
 * pages all share the base radius, so they never qualify; the sizes that come
 * from `getGraphNodeStyle`'s degree scaling do.
 */
const BULKY_NODE_RADIUS_FACTOR = 1.35;
const DISTANCE_EPSILON_PX = 0.001;
/**
 * How far below the node a blocked name may drop, and in what increments.
 *
 * Two, not four. Four rows is ~54px, and once node circles are capped at 11px
 * a name that far away has visibly stopped belonging to anything — the screen
 * fills with `views-50 / page-18`-style captions floating in space with no dot
 * above them. One row of slack recovers most of the names a strict rule would
 * drop; three rows just relocates the problem.
 */
const BOTTOM_OFFSET_STEPS = 2;
const BOTTOM_OFFSET_STEP_PX = LABEL_HEIGHT_PX;

export function planGraphLabels(input: PlanGraphLabelsInput): GraphLabelPlacement[] {
  const {
    nodes,
    links,
    activeDocName,
    viewport,
    maxLabels,
    maxLabelWidthPx,
    zoomScale,
    leafLabelThreshold,
    labelDescriptors,
    measureTextWidthPx,
    projectToScreen,
    getNodeRadiusPx,
    previousOffsetStepByNodeId,
    isRegionEnteredForNode,
  } = input;

  if (maxLabels <= 0 || viewport.width <= 0 || viewport.height <= 0 || nodes.length === 0) {
    return [];
  }

  const degreeByNodeId = buildGraphDegreeMap(links);
  const viewportCenterX = viewport.width / 2;
  const viewportCenterY = viewport.height / 2;

  const positionedNodes = nodes.flatMap<PositionedNode>((node) => {
    if (typeof node.x !== 'number' || typeof node.y !== 'number') {
      return [];
    }
    const screen = projectToScreen(node.x, node.y);
    return [
      {
        node,
        screenX: screen.x,
        screenY: screen.y,
        radiusPx: getNodeRadiusPx(node),
      },
    ];
  });

  const candidates = positionedNodes
    .map<LabelCandidate | null>((positionedNode) => {
      const descriptor = labelDescriptors.get(positionedNode.node.id);
      const text = pickGraphLabelText(descriptor, maxLabelWidthPx, measureTextWidthPx);
      if (!text) return null;

      const textWidthPx = measureTextWidthPx(text);
      if (textWidthPx <= 0) return null;

      const previousOffsetStep = previousOffsetStepByNodeId?.get(positionedNode.node.id);
      return {
        ...positionedNode,
        text,
        textWidthPx,
        isActive: positionedNode.node.id === activeDocName,
        degree: degreeByNodeId.get(positionedNode.node.id) ?? 0,
        distanceToCenterPx: Math.hypot(
          positionedNode.screenX - viewportCenterX,
          positionedNode.screenY - viewportCenterY,
        ),
        wasShowing: previousOffsetStep !== undefined,
        previousOffsetStep: previousOffsetStep ?? 0,
      };
    })
    .filter((candidate): candidate is LabelCandidate => candidate !== null)
    // Hierarchy gate: a page inside a folder waits until you have zoomed into
    // that folder. Zoomed out you see region names and nothing else; each level
    // you descend hands the naming to its contents. The active document is
    // exempt — it is the one label that orients everything else.
    .filter((candidate) => {
      if (candidate.isActive) return true;
      const entered = isRegionEnteredForNode?.(candidate.node.id);
      return entered ?? true;
    })
    // Tier gate: a hub earns its label further out than a leaf does, so zooming
    // out thins the labels down to the landmarks instead of clearing them all.
    // This still governs pages that are in no folder, and orders the rest.
    // Applied before the budget so the surviving tiers get the whole budget.
    .filter((candidate) =>
      isGraphLabelVisibleAtZoom({
        degree: candidate.degree,
        isActive: candidate.isActive,
        zoomScale,
        leafThreshold: leafLabelThreshold,
      }),
    );

  candidates.sort(compareCandidates);

  const placements: GraphLabelPlacement[] = [];
  const acceptedRects: LabelRect[] = [];
  // Calibrated per frame off the smallest node actually on screen.
  const smallestRadiusPx = positionedNodes.reduce(
    (smallest, positionedNode) => Math.min(smallest, positionedNode.radiusPx),
    Number.POSITIVE_INFINITY,
  );
  const bulkyRadiusPx = Number.isFinite(smallestRadiusPx)
    ? smallestRadiusPx * BULKY_NODE_RADIUS_FACTOR
    : Number.POSITIVE_INFINITY;

  for (let index = 0; index < candidates.length; index += 1) {
    if (placements.length >= maxLabels) {
      break;
    }

    const candidate = candidates[index];
    const placement = placeCandidate(candidate, {
      priority: candidates.length - index,
      viewport,
      acceptedRects,
      positionedNodes,
      bulkyRadiusPx,
    });

    if (!placement) continue;

    placements.push(placement);
    acceptedRects.push(placement.rect);
  }

  return placements;
}

function compareCandidates(a: LabelCandidate, b: LabelCandidate): number {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }
  // A name already on screen outranks one that is not, whatever the keys below
  // would have said. Those keys decide which names are worth showing; re-running
  // them sixty times a second is what made the labels flicker. Decide once;
  // revisit only when a name can no longer be drawn at all.
  if (a.wasShowing !== b.wasShowing) {
    return a.wasShowing ? -1 : 1;
  }
  // Connectedness, and only then position.
  //
  // These two were the other way round, and it made the whole thing look
  // arbitrary. The tier gate above states a rule you can hold in your head —
  // hubs get named before mid-degree pages, which get named before leaves — but
  // the gate only decides who is ELIGIBLE. Eligible nodes always outnumber the
  // label budget, so what you actually see is whoever the budget reached, and
  // the budget was being spent nearest-to-the-middle-of-the-screen first. The
  // stated rule was real and simply never got to apply: pan slightly and a
  // different, equally unexplainable set of names appeared.
  if (a.degree !== b.degree) {
    return b.degree - a.degree;
  }
  // Off-screen candidates are rejected outright further down, so everything
  // still competing here is already in view; distance is a tiebreak between
  // equals, not a measure of importance.
  if (Math.abs(a.distanceToCenterPx - b.distanceToCenterPx) > DISTANCE_EPSILON_PX) {
    return a.distanceToCenterPx - b.distanceToCenterPx;
  }
  if (a.text.length !== b.text.length) {
    return a.text.length - b.text.length;
  }
  return a.node.id.localeCompare(b.node.id);
}

function placeCandidate(
  candidate: LabelCandidate,
  {
    priority,
    viewport,
    acceptedRects,
    positionedNodes,
    bulkyRadiusPx,
  }: {
    priority: number;
    viewport: GraphViewport;
    acceptedRects: LabelRect[];
    positionedNodes: PositionedNode[];
    bulkyRadiusPx: number;
  },
): GraphLabelPlacement | null {
  // Always below — but not always at the same distance. In a dense patch the
  // slot directly under a node is usually covered by its neighbour, and
  // refusing outright cost most of the names in exactly the places you most
  // need them. Stepping further down keeps the one relationship that matters
  // (the name hangs beneath its node, never beside it) while letting the label
  // clear what is in the way.
  // Searched outward from the row it already had, so a name that is still fine
  // where it is never moves, and one that is forced to move goes to the
  // adjacent row rather than snapping back to the top of the list. Falling
  // straight back to row 0 was a jump of the node's whole diameter, and at a
  // zoom where several labels are jostling it happened often enough to look
  // like the labels were swimming.
  const previous = candidate.previousOffsetStep;
  const order: number[] = [previous];
  for (let distance = 1; distance < BOTTOM_OFFSET_STEPS; distance += 1) {
    order.push(previous + distance, previous - distance);
  }

  for (const step of order) {
    if (step < 0 || step >= BOTTOM_OFFSET_STEPS) continue;
    const placement = buildPlacement(candidate, 'bottom', priority, step);
    if (!isRectWithinViewport(placement.rect, viewport)) continue;
    if (acceptedRects.some((acceptedRect) => rectsIntersect(acceptedRect, placement.rect))) {
      continue;
    }
    if (
      positionedNodes.some(
        (positionedNode) =>
          positionedNode.node.id !== candidate.node.id &&
          positionedNode.radiusPx >= bulkyRadiusPx &&
          rectIntersectsCircle(placement.rect, {
            x: positionedNode.screenX,
            y: positionedNode.screenY,
            radius: positionedNode.radiusPx + NODE_COLLISION_PADDING_PX,
          }),
      )
    ) {
      continue;
    }
    return placement;
  }

  return null;
}

function buildPlacement(
  candidate: LabelCandidate,
  anchor: GraphLabelAnchor,
  priority: number,
  offsetStep = 0,
): GraphLabelPlacement {
  const labelWidthPx = candidate.textWidthPx + LABEL_PADDING_X_PX * 2;
  const halfWidthPx = labelWidthPx / 2;
  const left = candidate.screenX - halfWidthPx;
  const top =
    candidate.screenY + candidate.radiusPx + LABEL_GAP_PX + offsetStep * BOTTOM_OFFSET_STEP_PX;

  return {
    nodeId: candidate.node.id,
    text: candidate.text,
    anchor,
    offsetStep,
    priority,
    isActive: candidate.isActive,
    rect: {
      left,
      top,
      right: left + labelWidthPx,
      bottom: top + LABEL_HEIGHT_PX,
    },
    textX: left + halfWidthPx,
    textY: top + LABEL_PADDING_Y_PX,
  };
}

function isRectWithinViewport(rect: LabelRect, viewport: GraphViewport): boolean {
  return (
    rect.left >= VIEWPORT_PADDING_PX &&
    rect.top >= VIEWPORT_PADDING_PX &&
    rect.right <= viewport.width - VIEWPORT_PADDING_PX &&
    rect.bottom <= viewport.height - VIEWPORT_PADDING_PX
  );
}

function rectsIntersect(a: LabelRect, b: LabelRect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function rectIntersectsCircle(
  rect: LabelRect,
  circle: { x: number; y: number; radius: number },
): boolean {
  const nearestX = clamp(circle.x, rect.left, rect.right);
  const nearestY = clamp(circle.y, rect.top, rect.bottom);
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
