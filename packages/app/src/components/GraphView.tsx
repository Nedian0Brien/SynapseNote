import { Trans, useLingui } from '@lingui/react/macro';
import { LinkGraphSuccessSchema, ProblemDetailsSchema } from '@nedian0brien/synapsenote-core';
import { useTheme } from 'next-themes';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { usePageList } from '@/components/PageListContext';
import { hashFromDocName } from '@/lib/doc-hash';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { openExternalUrl } from '@/lib/external-link';
import { GRAPH_REPEL_RANGE_FACTOR, type GraphSettings } from '@/lib/graph-settings-store';
import { cn } from '@/lib/utils';
import { getGraphCardNeighbors } from './GraphCardDeck';
import {
  buildGraphAreas,
  GRAPH_AREA_BLUR_PX,
  GRAPH_AREA_LABEL_MIN_REGION_PX,
  GRAPH_AREA_LAYER_SCALE,
  GRAPH_AREA_TINT_ALPHA,
  type GraphArea,
  type GraphAreaBounds,
  getGraphAreaBounds,
  getGraphAreaDepthWeight,
  getGraphAreaFocusDepth,
  getGraphAreaLabelSizePx,
  getGraphAreaLodAlpha,
} from './graph-areas';
import { GRAPH_COLOR_PAIRS } from './graph-colors';
import { applyGraphFilters } from './graph-filter';
import {
  buildGraphFolderNodes,
  GRAPH_FOLDER_LINK_STRENGTH,
  isGraphFolderLink,
  isGraphRootFolderNode,
} from './graph-folders';
import { matchGraphGroup, resolveGraphGroupColor } from './graph-groups';
import {
  buildGraphAdjacency,
  isGraphLinkHighlighted,
  isStructuralGraphLink,
} from './graph-highlight';
import {
  type GraphInteractionMode,
  getGraphAlphaDecay,
  getGraphInteractionMode,
  getGraphPhysicsProfile,
  isGraphFocusMode,
} from './graph-interaction-mode';
import {
  type GraphLabelLayoutLink,
  type GraphLabelLayoutNode,
  type GraphLabelPlacement,
  planGraphLabels,
} from './graph-label-layout';
import { MIN_GRAPH_LABEL_ZOOM_FACTOR } from './graph-label-tiers';
import { buildGraphLabelDescriptors } from './graph-label-utils';
import { type GraphNodeEmphasis, getGraphNodeStyle } from './graph-node-style';
import {
  buildGraphDegreeMap,
  buildGraphLinkSignature,
  buildGraphNodeSignature,
  capGraphNodeRadius,
  type GraphData,
  type GraphDocClickBehavior,
  type GraphDocDisplayState,
  type GraphLink,
  type GraphNode,
  type GraphNodeSelection,
  type GraphNodeVisualState,
  type GraphScope,
  getGraphNodeCanvasRadius,
  getGraphNodePointerRadius,
  getGraphNodeTooltipLabel,
  getGraphNodeVisualState,
  reconcileGraphData,
  resolveGraphLinkEndpointId,
  resolveGraphNodeClickAction,
  screenOffsetInGraphUnits,
} from './graph-view-utils';
import { resolveTargetNavigationIntent } from './target-navigation-intent';

const FOCUS_ANIMATION_MS = 350;
const FOCUS_RETRY_INTERVAL_MS = 120;
const FOCUS_RETRY_DISTANCE_PX = 18;
const FINAL_SETTLE_DRIFT_PX = 28;
const BACKGROUND_CLICK_TOLERANCE_PX = 5;
const ZOOM_TO_FIT_PADDING_PX = 40;
const EMPTY_GRAPH_DATA: GraphData = { nodes: [], links: [] };
const EMPTY_GRAPH_AREAS: GraphArea[] = [];

interface FocusState {
  key: string;
  lastX: number | null;
  lastY: number | null;
  lastAt: number;
}

interface GraphNodeHitbox {
  x: number;
  y: number;
  radiusPx: number;
  state: GraphNodeVisualState;
}

interface BackgroundPointerState {
  pointerId: number;
  clientX: number;
  clientY: number;
  target: GraphPointerTarget;
}

type GraphPointerTarget =
  | { kind: 'background' }
  | { kind: 'link' }
  | { kind: 'node'; node: GraphNode };

function getGraphNodeDisplayState({
  node,
  navigationIntentByNodeId,
}: {
  node: GraphNode;
  navigationIntentByNodeId: Map<string, { displayState: GraphDocDisplayState }>;
}): GraphDocDisplayState {
  if (node.kind !== 'doc') return 'doc';
  return navigationIntentByNodeId.get(node.id)?.displayState ?? 'doc';
}

function getGraphNodeInteractiveRadius({
  state,
  displayState,
  globalScale,
}: {
  state: GraphNodeVisualState;
  displayState: GraphDocDisplayState;
  globalScale: number;
}): number {
  const pointerRadius = getGraphNodePointerRadius(state, globalScale);
  if (displayState !== 'missing') return pointerRadius;
  const baseRadius = getGraphNodeCanvasRadius(state);
  return Math.max(pointerRadius, baseRadius + screenOffsetInGraphUnits(2, globalScale, baseRadius));
}

function getActiveGraphNodeCoords({
  nodes,
  activeDocName,
}: {
  nodes: GraphNode[];
  activeDocName: string;
}): { x: number; y: number } | null {
  const activeNode = nodes.find((node) => node.kind === 'doc' && node.docName === activeDocName) as
    | NodeObject<GraphNode>
    | undefined;
  if (typeof activeNode?.x !== 'number' || typeof activeNode?.y !== 'number') return null;
  return { x: activeNode.x, y: activeNode.y };
}

function shouldRunFinalSettle({
  fg,
  coords,
  dimensions,
}: {
  fg: ForceGraphMethods<NodeObject<GraphNode>> | undefined;
  coords: { x: number; y: number } | null;
  dimensions: { width: number; height: number };
}): boolean {
  if (!fg || !coords || dimensions.width <= 0 || dimensions.height <= 0) return false;

  const screen = fg.graph2ScreenCoords(coords.x, coords.y);
  const drift = Math.hypot(screen.x - dimensions.width / 2, screen.y - dimensions.height / 2);

  return drift >= FINAL_SETTLE_DRIFT_PX;
}

function maybeFocusActiveGraphNode({
  fg,
  nodes,
  activeDocName,
  zoom,
  focusKey,
  focusState,
  force = false,
  durationMs = FOCUS_ANIMATION_MS,
}: {
  fg: ForceGraphMethods<NodeObject<GraphNode>> | undefined;
  nodes: GraphNode[];
  activeDocName: string;
  zoom: number;
  focusKey: string;
  focusState: FocusState;
  force?: boolean;
  durationMs?: number;
}): FocusState {
  const now = Date.now();
  let nextState = focusState;

  if (nextState.key !== focusKey) {
    nextState = {
      key: focusKey,
      lastX: null,
      lastY: null,
      lastAt: 0,
    };
  } else if (!force && now - nextState.lastAt < FOCUS_RETRY_INTERVAL_MS) {
    return nextState;
  }

  const coords = getActiveGraphNodeCoords({
    nodes,
    activeDocName,
  });
  if (!coords) return nextState;

  const distance =
    nextState.lastX === null || nextState.lastY === null
      ? Number.POSITIVE_INFINITY
      : Math.hypot(coords.x - nextState.lastX, coords.y - nextState.lastY);

  if (!force && distance < FOCUS_RETRY_DISTANCE_PX && nextState.lastAt !== 0) {
    return {
      ...nextState,
      lastAt: now,
    };
  }

  if (!fg) return nextState;

  fg.centerAt(coords.x, coords.y, durationMs);
  if (Math.abs(fg.zoom() - zoom) > 0.01) {
    fg.zoom(zoom, durationMs);
  }

  return {
    key: focusKey,
    lastX: coords.x,
    lastY: coords.y,
    lastAt: now,
  };
}

/**
 * Folder territories as a MAP PARTITION: every pixel belongs to exactly one
 * folder, so the tints can never stack.
 *
 * Painting the ellipses straight onto the canvas is what turned a project with
 * forty folders into mud — alpha accumulates, so a patch covered by four
 * regions came out four times as dark, and the picture read as depth
 * information that is not there. The original SynapseNote composited its whole
 * cloud layer with a `max` blend for the same reason; a partition goes further
 * and is what a map actually is.
 *
 * Regions are painted onto their own layer DEEPEST FIRST with
 * `destination-over`, so each one only claims pixels no more specific region
 * has already taken and a nested folder reads as its own place inside its
 * parent. The finished layer is blurred and composited once, at one opacity.
 */
function paintGraphAreaPartition({
  ctx,
  layer,
  areas,
  boundsById,
  alphaById,
  colorOf,
  toScreen,
  globalScale,
  width,
  height,
}: {
  ctx: CanvasRenderingContext2D;
  layer: HTMLCanvasElement;
  areas: readonly GraphArea[];
  boundsById: ReadonlyMap<string, GraphAreaBounds>;
  alphaById: ReadonlyMap<string, number>;
  colorOf: (area: GraphArea) => string;
  toScreen: (x: number, y: number) => { x: number; y: number };
  globalScale: number;
  width: number;
  height: number;
}): void {
  // Deliberately low resolution — see GRAPH_AREA_LAYER_SCALE. Assigning
  // width/height also clears the canvas and resets its state, so it is only
  // done on a real resize; otherwise clear explicitly.
  const layerWidth = Math.max(1, Math.round(width * GRAPH_AREA_LAYER_SCALE));
  const layerHeight = Math.max(1, Math.round(height * GRAPH_AREA_LAYER_SCALE));
  if (layer.width !== layerWidth || layer.height !== layerHeight) {
    layer.width = layerWidth;
    layer.height = layerHeight;
  }
  const layerCtx = layer.getContext('2d');
  if (!layerCtx) return;
  // Ellipses are still placed in CSS pixels; the transform does the shrinking.
  layerCtx.setTransform(GRAPH_AREA_LAYER_SCALE, 0, 0, GRAPH_AREA_LAYER_SCALE, 0, 0);
  layerCtx.clearRect(0, 0, width, height);
  layerCtx.globalCompositeOperation = 'destination-over';

  for (const area of [...areas].sort((a, b) => b.depth - a.depth)) {
    const box = boundsById.get(area.id);
    if (!box) continue;
    // Only the regions that are a useful size right now. Varying alpha per
    // region does not bring back the accumulation problem: `destination-over`
    // still gives each pixel to the deepest region covering it, so a region
    // half faded in just lets its parent read through the gap — which is the
    // crossfade you want as one hands naming over to the other.
    const lod = alphaById.get(area.id) ?? 0;
    if (lod <= 0) continue;
    const center = toScreen(box.cx, box.cy);
    layerCtx.globalAlpha = lod;
    layerCtx.beginPath();
    layerCtx.ellipse(
      center.x,
      center.y,
      Math.max(1, box.rx * globalScale),
      Math.max(1, box.ry * globalScale),
      0,
      0,
      2 * Math.PI,
    );
    layerCtx.fillStyle = colorOf(area);
    layerCtx.fill();
  }
  layerCtx.globalAlpha = 1;

  const pxRatio = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);
  // The upscale is the first smoothing pass and the blur is the second.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = `blur(${GRAPH_AREA_BLUR_PX}px)`;
  ctx.globalAlpha = GRAPH_AREA_TINT_ALPHA;
  ctx.drawImage(layer, 0, 0, width, height);
  ctx.restore();
}

function drawGraphLabelPlacements({
  ctx,
  placements,
  labelColor,
}: {
  ctx: CanvasRenderingContext2D;
  placements: GraphLabelPlacement[];
  labelColor: string;
}): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Plain text, no chip, and every name at full weight. They used to be faint
  // for everything except the active document, which left a canvas of
  // anonymous circles with a scattering of digits — the names are the one
  // thing on screen that says what you are looking at.
  ctx.fillStyle = labelColor;
  for (const placement of placements) {
    ctx.fillText(placement.text, placement.textX, placement.textY);
  }
}

function getGraphNodeHitbox({
  node,
  fg,
  activeDocName,
  selectedNodeId,
  globalScale,
  displayState,
}: {
  node: NodeObject<GraphNode>;
  fg: ForceGraphMethods<NodeObject<GraphNode>>;
  activeDocName: string;
  selectedNodeId: string | null;
  globalScale: number;
  displayState: GraphDocDisplayState;
}): GraphNodeHitbox | null {
  if (typeof node.x !== 'number' || typeof node.y !== 'number') return null;

  const state = getGraphNodeVisualState(node, {
    activeDocName,
    selectedNodeId,
  });
  const screen = fg.graph2ScreenCoords(node.x, node.y);

  return {
    x: screen.x,
    y: screen.y,
    radiusPx: getGraphNodeInteractiveRadius({ state, displayState, globalScale }) * globalScale,
    state,
  };
}

function getLocalPointerPoint({
  clientX,
  clientY,
  container,
}: {
  clientX: number;
  clientY: number;
  container: HTMLElement;
}): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function getGraphNodeAtPoint({
  point,
  fg,
  nodes,
  activeDocName,
  selectedNodeId,
  navigationIntentByNodeId,
}: {
  point: { x: number; y: number };
  fg: ForceGraphMethods<NodeObject<GraphNode>>;
  nodes: GraphNode[];
  activeDocName: string;
  selectedNodeId: string | null;
  navigationIntentByNodeId: Map<string, { displayState: GraphDocDisplayState }>;
}): GraphNode | null {
  const globalScale = fg.zoom();
  let closestNode: { node: GraphNode; distance: number } | null = null;

  for (const node of nodes as NodeObject<GraphNode>[]) {
    const displayState = getGraphNodeDisplayState({
      node,
      navigationIntentByNodeId,
    });
    const hitbox = getGraphNodeHitbox({
      node,
      fg,
      activeDocName,
      selectedNodeId,
      globalScale,
      displayState,
    });
    if (!hitbox) continue;

    const distance = Math.hypot(point.x - hitbox.x, point.y - hitbox.y);
    if (distance > hitbox.radiusPx) continue;
    if (closestNode !== null && distance >= closestNode.distance) continue;

    closestNode = { node, distance };
  }

  return closestNode?.node ?? null;
}

function getLinkEndpointCoords(
  endpoint: string | number | NodeObject<GraphNode> | undefined,
  fg: ForceGraphMethods<NodeObject<GraphNode>>,
): { x: number; y: number } | null {
  if (
    endpoint === undefined ||
    typeof endpoint === 'string' ||
    typeof endpoint === 'number' ||
    typeof endpoint.x !== 'number' ||
    typeof endpoint.y !== 'number'
  ) {
    return null;
  }

  return fg.graph2ScreenCoords(endpoint.x, endpoint.y);
}

function getDistanceToSegmentPx({
  point,
  start,
  end,
}: {
  point: { x: number; y: number };
  start: { x: number; y: number };
  end: { x: number; y: number };
}): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  const projectedX = start.x + projection * dx;
  const projectedY = start.y + projection * dy;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function isGraphLinkAtPoint({
  point,
  fg,
  links,
}: {
  point: { x: number; y: number };
  fg: ForceGraphMethods<NodeObject<GraphNode>>;
  links: GraphLink[];
}): boolean {
  const LINK_HITBOX_PX = 6;

  return (links as LinkObject<GraphNode, GraphLink>[]).some((link) => {
    const start = getLinkEndpointCoords(link.source, fg);
    const end = getLinkEndpointCoords(link.target, fg);
    if (!start || !end) return false;
    return getDistanceToSegmentPx({ point, start, end }) <= LINK_HITBOX_PX;
  });
}

function getGraphLinkEndpointDocName({
  endpoint,
  nodes,
}: {
  endpoint: string | number | NodeObject<GraphNode> | undefined;
  nodes: GraphNode[];
}): string | null {
  if (endpoint === undefined || typeof endpoint === 'number') {
    return null;
  }

  if (typeof endpoint === 'string') {
    const node = nodes.find(
      (candidate): candidate is GraphNode & { kind: 'doc' } =>
        candidate.kind === 'doc' && candidate.id === endpoint,
    );
    return node?.docName ?? null;
  }

  if (endpoint.kind === 'doc') {
    return endpoint.docName;
  }

  return null;
}

function applyGraphNodeClick({
  node,
  docClickBehavior,
  onSelectNode,
}: {
  node: GraphNode;
  docClickBehavior: GraphDocClickBehavior;
  onSelectNode?: (selection: GraphNodeSelection) => void;
}): void {
  const action = resolveGraphNodeClickAction(node, docClickBehavior);

  if (action.kind === 'external') {
    // openExternalUrl gates unsafe schemes internally (a graph node URL can
    // carry any authored scheme), then routes to the OS browser / new tab.
    openExternalUrl(action.url);
    return;
  }

  if (action.kind === 'navigate') {
    window.location.assign(action.hash);
    return;
  }

  // A tag node clicked while the view navigates rather than selects: there is
  // no page behind a tag, so the click is inert by design.
  if (action.kind === 'none') return;

  onSelectNode?.(action.selection);
}

function handleGraphPointerTapTarget({
  target,
  docClickBehavior,
  selectedNodeId,
  onSelectNode,
  onBackgroundClick,
}: {
  target: GraphPointerTarget;
  docClickBehavior: GraphDocClickBehavior;
  selectedNodeId: string | null;
  onSelectNode?: (selection: GraphNodeSelection) => void;
  onBackgroundClick?: () => void;
}): void {
  if (target.kind === 'background' || target.kind === 'link') {
    onBackgroundClick?.();
    return;
  }

  if (
    docClickBehavior === 'select' &&
    selectedNodeId !== null &&
    target.node.id === selectedNodeId
  ) {
    onBackgroundClick?.();
    return;
  }

  applyGraphNodeClick({
    node: target.node,
    docClickBehavior,
    onSelectNode,
  });
}

export interface GraphViewHandle {
  /** Frames every visible node. The only camera control the panel drives directly. */
  zoomToFit(): void;
}

export function GraphView({
  activeDocName,
  settings,
  selectedNodeId = null,
  scope = 'local',
  className = '',
  docClickBehavior = 'navigate',
  ref,
  onSelectNode,
  onBackgroundClick,
  onStatsChange,
  onCardModeChange,
}: {
  activeDocName: string;
  settings: GraphSettings;
  selectedNodeId?: string | null;
  /**
   * `local` fetches a 2-hop neighborhood around the active document and reads
   * at close range; `global` fetches the whole project graph and reads wide.
   */
  scope?: GraphScope;
  className?: string;
  docClickBehavior?: GraphDocClickBehavior;
  ref?: React.Ref<GraphViewHandle>;
  onSelectNode?: (selection: GraphNodeSelection) => void;
  onBackgroundClick?: () => void;
  onStatsChange?: (nodes: number, links: number, loading: boolean) => void;
  /**
   * The neighbor deck to show, or null when the user is not zoomed in that far.
   * One callback rather than a raw mode plus a separate neighbor query: the
   * node list and adjacency live here, and the surface only needs the result.
   */
  onCardModeChange?: (deck: { centerNode: GraphNode; neighbors: GraphNode[] } | null) => void;
}) {
  // force-graph mutates the objects it receives in-place during layout, so we compare
  // incoming API payloads against separate signatures before replacing graphData.
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  // Signatures of the last-applied API response, stored separately from rendered graph data because
  // force-graph mutates link objects in-place (replacing string IDs with node object refs).
  const lastSigRef = useRef({ nodes: '', links: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<NodeObject<GraphNode>> | undefined>(undefined);
  const focusStateRef = useRef<FocusState>({ key: '', lastX: null, lastY: null, lastAt: 0 });
  const backgroundPointerRef = useRef<BackgroundPointerState | null>(null);
  const graphNodesRef = useRef<GraphNode[]>(graphData.nodes);
  // Tracks whether the force-layout simulation has reached its cooldown
  // terminus. Flipped true in `onEngineStop`, false on every `onEngineTick`
  // (engine re-runs whenever graphData mutates or an explicit reheat fires).
  // Consumed by the DEV-gated `__graphHarness.isSimulationSettled()` so
  // canvas-click-at-coord tests can gate on a real settlement signal instead
  // of racing the physics.
  const simulationSettledRef = useRef(false);
  // Hover NEVER goes through React state. Any re-render hands ForceGraph2D a new
  // `graphData` object, and force-graph's setter for that prop reinitializes the
  // layout and calls `resetCountdown()` — restarting the simulation. Driving
  // hover from state therefore scattered the graph on every mouseover. The
  // canvas repaints every frame regardless, so the paint callbacks read this ref
  // and the highlight lands on the next frame with no render at all.
  const hoveredNodeIdRef = useRef<string | null>(null);
  // Zoom drives the interaction mode. `onZoom` fires per wheel step, so the
  // scale itself lives in a ref (read during canvas paint) and only a MODE
  // CHANGE reaches React state — a re-render per wheel tick would be wasteful
  // and would fight the simulation.
  const zoomScaleRef = useRef(1);
  const [interactionMode, setInteractionMode] = useState<GraphInteractionMode>('browse');
  const [dimensions, setDimensions] = useState({ width: 320, height: 400 });
  const { t } = useLingui();
  const { resolvedTheme } = useTheme();
  const {
    folderPaths,
    loading: pageListLoading,
    pages,
    pagesBySlug,
    pagesByBasename,
  } = usePageList();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (scope === 'local' && activeDocName) {
          params.set('docName', activeDocName);
          params.set('degrees', '2');
        }
        const url = params.size > 0 ? `/api/link-graph?${params.toString()}` : '/api/link-graph';
        const res = await fetch(url);
        const body = (await res.json().catch(() => null)) as unknown;
        if (cancelled) return;
        if (!res.ok) {
          const problem = ProblemDetailsSchema.safeParse(body);
          const status = res.status;
          setError(problem.success ? problem.data.title : t`Server error: ${status}`);
          setLoading(false);
          return;
        }
        const success = LinkGraphSuccessSchema.safeParse(body);
        if (!success.success) {
          setError(t`Link-graph response did not match expected shape.`);
          setLoading(false);
          return;
        }
        const nextNodes = success.data.nodes as GraphNode[];
        const nextLinks = success.data.links as GraphLink[];
        const nextNodeSig = buildGraphNodeSignature(nextNodes);
        const nextLinkSig = buildGraphLinkSignature(nextLinks);
        if (nextNodeSig !== lastSigRef.current.nodes || nextLinkSig !== lastSigRef.current.links) {
          lastSigRef.current = { nodes: nextNodeSig, links: nextLinkSig };
          setGraphData((previous) =>
            reconcileGraphData(previous, {
              nodes: nextNodes,
              links: nextLinks,
            }),
          );
        }
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t`Failed to load graph`);
        setLoading(false);
      }
    }

    setLoading(true);
    void load();
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files') || channels.includes('graph')) {
        void load();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, [activeDocName, scope, t]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomToFit: () => {
        fgRef.current?.zoomToFit(FOCUS_ANIMATION_MS, ZOOM_TO_FIT_PADDING_PX);
      },
    }),
    [],
  );

  const isDark = resolvedTheme === 'dark';
  // The graph reads in the app's own chord: the neutral greyscale ramp from
  // `tokens.css` plus the one sky-blue `--primary`. Weight carries the
  // hierarchy (see `graph-node-style.ts`); hue is spent only on the active
  // document, so it is the single thing on screen that can claim the eye.
  const palette = isDark
    ? {
        background: 'oklch(0.145 0 0)',
        accent: '#69a3ff',
        strong: 'oklch(0.90 0 0)',
        normal: 'oklch(0.62 0 0)',
        faint: 'oklch(0.42 0 0)',
        label: 'oklch(0.78 0 0)',
        labelFaint: 'oklch(0.55 0 0)',
        edgeStrong: 'rgba(255,255,255,0.20)',
        edgeSoft: 'rgba(255,255,255,0.10)',
        edgeDim: 'rgba(255,255,255,0.045)',
        edgeContainment: 'rgba(255,255,255,0.075)',
      }
    : {
        background: 'oklch(1 0 0)',
        accent: '#3784ff',
        strong: 'oklch(0.32 0 0)',
        normal: 'oklch(0.68 0 0)',
        faint: 'oklch(0.86 0 0)',
        label: 'oklch(0.38 0 0)',
        labelFaint: 'oklch(0.62 0 0)',
        edgeStrong: 'rgba(23,23,23,0.20)',
        edgeSoft: 'rgba(23,23,23,0.10)',
        edgeDim: 'rgba(23,23,23,0.045)',
        edgeContainment: 'rgba(23,23,23,0.085)',
      };
  const bgColor = palette.background;
  const labelColor = palette.label;
  const emphasisColor = (emphasis: GraphNodeEmphasis): string =>
    emphasis === 'accent'
      ? palette.accent
      : emphasis === 'selected' || emphasis === 'strong'
        ? palette.strong
        : emphasis === 'faint'
          ? palette.faint
          : palette.normal;
  const focusZoom = scope === 'global' ? 1.6 : 2.35;
  const maxLabelWidthPx = scope === 'global' ? 220 : 150;

  // Built from the UNFILTERED node set: the missing-node filter reads display
  // state to decide what to drop, so resolving it after filtering would be
  // circular.
  const navigationIntentByNodeId = new Map(
    graphData.nodes.flatMap((node) => {
      if (node.kind !== 'doc') return [];
      const navigationIntent = pageListLoading
        ? {
            displayState: 'doc' as const,
            hashDocName: node.docName,
            hash: null,
          }
        : resolveTargetNavigationIntent(node.docName, {
            pages,
            folderPaths,
            pagesBySlug,
            pagesByBasename,
          });
      return [[node.id, navigationIntent] as const];
    }),
  );

  const filteredData = applyGraphFilters({
    data: graphData,
    filters: settings.filters,
    activeDocName,
    getDisplayState: (node) =>
      getGraphNodeDisplayState({
        node,
        navigationIntentByNodeId,
      }),
  });
  // Folders are synthesized from what SURVIVED the filters, not from the fetched
  // graph: containment edges would otherwise defeat the orphan filter (nothing
  // is an orphan once it has a parent), and the folders drawn would be those of
  // pages the user just hid.
  const folderAdditions = settings.filters.showFolderNodes
    ? buildGraphFolderNodes(filteredData.nodes, filteredData.links)
    : EMPTY_GRAPH_DATA;
  const composedData: GraphData =
    folderAdditions.nodes.length === 0 && folderAdditions.links.length === 0
      ? filteredData
      : {
          nodes: [...filteredData.nodes, ...folderAdditions.nodes],
          links: [...filteredData.links, ...folderAdditions.links],
        };
  // force-graph RESTARTS the simulation whenever the `graphData` prop changes
  // identity — its setter reinitializes the layout and resets the cooldown. The
  // filter above returns fresh arrays on every render, so handing its result
  // straight to the canvas would scatter the graph on any state change at all.
  // The signature is the real change signal; `renderData` holds the last value
  // that actually differed, so re-renders that change nothing pass the very same
  // object back and the layout is left alone.
  const filteredSignature = `${buildGraphNodeSignature(composedData.nodes)}\u0001${buildGraphLinkSignature(composedData.links)}`;
  const [renderData, setRenderData] = useState<GraphData>(EMPTY_GRAPH_DATA);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands in for `composedData`, whose identity churns every render — depending on it directly is the bug this exists to prevent
  useEffect(() => {
    setRenderData(composedData);
  }, [filteredSignature]);
  const displayData = renderData;

  const layoutNodes = displayData.nodes as GraphLabelLayoutNode[];
  const layoutLinks = displayData.links as GraphLabelLayoutLink[];
  const labelDescriptors = buildGraphLabelDescriptors(displayData.nodes);
  const focusKey = `${activeDocName}|${focusZoom}`;
  const displayLinks = displayData.links;
  const physics = getGraphPhysicsProfile(interactionMode, settings.forces);
  const { centerStrength, repelStrength, linkStrength, linkDistance } = physics;
  const alphaDecay = getGraphAlphaDecay(interactionMode);
  const pinSelectedNode = physics.pinSelectedNode;

  const adjacency = buildGraphAdjacency(displayData.links);
  // Degree means "how many links does this page have", which is what the hub
  // ring and its printed number claim. Containment is not a link anyone wrote,
  // so counting it would add one to every page and turn every folder into the
  // biggest hub on the canvas. Hover highlighting, above, DOES count it — there
  // the question is "what is this connected to", and a folder's members are.
  const degreeByNodeId = buildGraphDegreeMap(
    displayData.links.filter((link) => !isGraphFolderLink(link)),
  );
  // The size multiplier `nodeCanvasObject` actually paints with. The label
  // planner and the pointer hit area have to agree with it: a folder or a big
  // hub is drawn at twice its base radius, so measuring them at the base puts
  // their label underneath their own fill and stops their clickable circle
  // short of the edge you can see.
  const drawnNodeScale = (node: GraphNode): number =>
    getGraphNodeStyle({
      node,
      degree: degreeByNodeId.get(node.id) ?? 0,
      displayState: getGraphNodeDisplayState({ node, navigationIntentByNodeId }),
      visualState: getGraphNodeVisualState(node, { activeDocName, selectedNodeId }),
    }).scale;
  // Folder territories, and where each one currently sits. The bounds follow
  // the simulation, so they are recomputed once per frame in the pre-render
  // hook and reused by the post-render hook that writes the region names —
  // walking every member twice a frame is the one thing here that would cost.
  const areas = settings.filters.showFolderNodes
    ? buildGraphAreas(displayData.nodes, displayData.links)
    : EMPTY_GRAPH_AREAS;
  const areaBoundsRef = useRef<Map<string, GraphAreaBounds>>(new Map());
  // The deepest region each node sits in, which is the one whose on-screen size
  // decides when that node's name is revealed. An area's `memberIds` already
  // includes its descendants, so the deepest match is the innermost folder.
  // Built here rather than per frame — it only changes when the areas do.
  const innermostAreaByNodeId = new Map<string, GraphArea>();
  for (const area of areas) {
    for (const memberId of area.memberIds) {
      const current = innermostAreaByNodeId.get(memberId);
      if (!current || area.depth > current.depth) {
        innermostAreaByNodeId.set(memberId, area);
      }
    }
  }
  // Last frame's label decisions, so this frame can keep them — see
  // `previousOffsetStepByNodeId`. Held in a ref rather than state because it is
  // written from the canvas render hook and must never trigger a re-render.
  const labelOffsetStepsRef = useRef<Map<string, number>>(new Map());
  // Which region names were written last frame, for the same reason.
  const areaLabelShownRef = useRef<Set<string>>(new Set());
  // Each region's final opacity this frame: its own size-driven fade, times its
  // depth's share of the map. Computed once in the pre-render hook and read by
  // both the tint and the names, so the two can never disagree about which
  // storey of the folder tree is currently on show.
  const areaAlphaRef = useRef<Map<string, number>>(new Map());
  // Which storey the map has descended to, from the same computation. A page's
  // name is revealed when the map reaches the folder it lives in, so the
  // territories and the node labels are driven by one number rather than two
  // definitions of "we are inside this now" that could drift apart.
  const focusDepthRef = useRef<number | null>(null);
  // Offscreen layer the territories are partitioned onto before being
  // composited in one pass — see `paintGraphAreaPartition`. Created in an
  // effect rather than lazily on first render: the React Compiler rejects
  // reading a ref during render, and the render hooks that use it only run
  // after mount anyway.
  const areaLayerRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    areaLayerRef.current = document.createElement('canvas');
    return () => {
      areaLayerRef.current = null;
    };
  }, []);
  const areaColor = (area: GraphArea): string => {
    const pair = GRAPH_COLOR_PAIRS[area.colorIndex % GRAPH_COLOR_PAIRS.length];
    return isDark ? pair.dark : pair.light;
  };

  // Alpha applied to everything outside the hover highlight. Dimmed rather than
  // hidden: the surrounding shape is what makes the highlighted subgraph legible.
  const dimAlpha = isDark ? 0.16 : 0.12;
  // Resolved at PAINT time from the ref, not precomputed at render time.
  const nodeAlpha = (nodeId: string) => {
    const hovered = hoveredNodeIdRef.current;
    if (hovered === null) return 1;
    return hovered === nodeId || adjacency.get(hovered)?.has(nodeId) ? 1 : dimAlpha;
  };

  useEffect(() => {
    onStatsChange?.(displayData.nodes.length, displayData.links.length, loading);
  }, [displayData, loading, onStatsChange]);

  useEffect(() => {
    graphNodesRef.current = graphData.nodes;
  }, [graphData.nodes]);

  // Push the Forces sliders into the live d3 simulation. force-graph builds the
  // three standard forces once and keeps them across data updates, so this
  // re-applies on every settings change and on every topology change — the link
  // strength below is degree-derived, and degrees move when the data does.
  //
  // Depending on the four scalars rather than on `settings.forces` keeps a
  // filter-box keystroke (which rebuilds the settings object) from reheating
  // the simulation; `displayLinks` is memoized above for the same reason.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const charge = fg.d3Force('charge');
    // Stored as a magnitude; d3 wants a negative strength to push apart. Flat:
    // folder nodes used to push several times harder here, to clear room for
    // what they hold. That room is the containment spring's job — it is sized
    // by membership below — and doing it with repulsion instead shoved the
    // neighboring clusters to the far side of the canvas.
    charge?.strength?.(-repelStrength);
    // Bound the range, or the pressure of every distant node crushes each
    // cluster to a few pixels across at the zoom that fits the map. Scaled off
    // the spring length so dragging the Link distance slider keeps the two in
    // proportion — see GRAPH_REPEL_RANGE_FACTOR for the measurements.
    charge?.distanceMax?.(linkDistance * GRAPH_REPEL_RANGE_FACTOR);

    const center = fg.d3Force('center');
    center?.strength?.(centerStrength);

    const link = fg.d3Force('link');
    if (link) {
      // One length for every edge, containment included, as the original
      // SynapseNote layout had it.
      link.distance?.(linkDistance);
      // d3's own default is `1 / min(degree(source), degree(target))`, computed
      // once at initialize. Reproducing it here rather than passing a flat
      // number keeps a multiplier of 1 a true no-op: a flat strength would
      // stiffen hub edges that d3 deliberately slackens.
      const degrees = buildGraphDegreeMap(displayLinks);
      link.strength?.((candidate: { source: unknown; target: unknown; kind?: unknown }) => {
        // Containment opts out of the degree rule entirely — see
        // GRAPH_FOLDER_LINK_STRENGTH. Under `1 / min(degree)` a leaf page gets
        // the stiffest spring in the graph, which is what welds a big folder
        // into a shell instead of letting it breathe out to the radius its
        // members' own repulsion asks for.
        if (isGraphFolderLink(candidate)) return GRAPH_FOLDER_LINK_STRENGTH * linkStrength;

        const source = resolveGraphLinkEndpointId(candidate.source);
        const target = resolveGraphLinkEndpointId(candidate.target);
        const sourceDegree = source === null ? 1 : (degrees.get(source) ?? 1);
        const targetDegree = target === null ? 1 : (degrees.get(target) ?? 1);
        return (1 / Math.max(1, Math.min(sourceDegree, targetDegree))) * linkStrength;
      });
    }

    fg.d3ReheatSimulation();
  }, [centerStrength, repelStrength, linkStrength, linkDistance, displayLinks]);

  const canSelect = docClickBehavior === 'select';
  const syncInteractionMode = () => {
    setInteractionMode((previousMode) => {
      const next = getGraphInteractionMode({
        selectedNodeId,
        zoomScale: zoomScaleRef.current,
        canSelect,
        previousMode,
      });
      return next === previousMode ? previousMode : next;
    });
  };

  // Selection can change without any wheel event (clicking a node, clearing on
  // background click), so the mode is recomputed here too.
  useEffect(() => {
    setInteractionMode((previousMode) => {
      const next = getGraphInteractionMode({
        selectedNodeId,
        zoomScale: zoomScaleRef.current,
        canSelect,
        previousMode,
      });
      return next === previousMode ? previousMode : next;
    });
  }, [selectedNodeId, canSelect]);

  useEffect(() => {
    if (interactionMode !== 'card' || selectedNodeId === null) {
      onCardModeChange?.(null);
      return;
    }
    const centerNode = displayData.nodes.find((node) => node.id === selectedNodeId);
    if (!centerNode) {
      onCardModeChange?.(null);
      return;
    }
    onCardModeChange?.({
      centerNode,
      neighbors: getGraphCardNeighbors(selectedNodeId, displayData.nodes, adjacency),
    });
  }, [interactionMode, selectedNodeId, displayData.nodes, adjacency, onCardModeChange]);

  // Nail the project root to the origin. The original SynapseNote ran its
  // layout with the vault root fixed for the same reason: with the whole folder
  // tree hanging off one immovable point, the layout has a centre to organize
  // around and the branches settle around it instead of wandering off as
  // separate drifting components.
  useEffect(() => {
    const root = displayData.nodes.find(isGraphRootFolderNode) as
      | (GraphNode & { fx?: number | null; fy?: number | null })
      | undefined;
    if (!root) return;
    root.fx = 0;
    root.fy = 0;
    return () => {
      root.fx = null;
      root.fy = null;
    };
  }, [displayData.nodes]);

  // Pin the selected node while it is being read up close, and release it the
  // moment focus ends. Without this the simulation keeps nudging the very node
  // the user zoomed in on, and the camera chases it across the canvas.
  useEffect(() => {
    const pinned = displayData.nodes.find((node) => node.id === selectedNodeId) as
      | (GraphNode & { x?: number; y?: number; fx?: number | null; fy?: number | null })
      | undefined;
    if (!pinned || !pinSelectedNode) return;
    if (typeof pinned.x !== 'number' || typeof pinned.y !== 'number') return;

    pinned.fx = pinned.x;
    pinned.fy = pinned.y;
    return () => {
      pinned.fx = null;
      pinned.fy = null;
    };
  }, [pinSelectedNode, selectedNodeId, displayData.nodes]);

  useEffect(() => {
    focusStateRef.current = {
      key: focusKey,
      lastX: null,
      lastY: null,
      lastAt: 0,
    };
    const animationFrame = window.requestAnimationFrame(() => {
      focusStateRef.current = maybeFocusActiveGraphNode({
        fg: fgRef.current,
        nodes: graphNodesRef.current,
        activeDocName,
        zoom: focusZoom,
        focusKey,
        focusState: focusStateRef.current,
        force: true,
      });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [focusKey, activeDocName, focusZoom]);

  useEffect(() => {
    // DEV-gate guards all `window.__graphHarness` writes below; see
    // precedent #20. Vite statically replaces
    // `import.meta.env.DEV` at build time, so this entire effect body
    // is tree-shaken from production bundles.
    if (!import.meta.env.DEV) return;

    const harness = {
      clickDoc(docName: string) {
        const node = displayData.nodes.find(
          (candidate): candidate is GraphNode & { kind: 'doc' } =>
            candidate.kind === 'doc' && candidate.docName === docName,
        );
        if (!node) return false;
        applyGraphNodeClick({
          node,
          docClickBehavior,
          onSelectNode,
        });
        return true;
      },
      clickBackground() {
        if (!onBackgroundClick) return false;
        onBackgroundClick();
        return true;
      },
      clickExternal(url: string) {
        const node = displayData.nodes.find(
          (candidate): candidate is GraphNode & { kind: 'external' } =>
            candidate.kind === 'external' && candidate.url === url,
        );
        if (!node) return false;
        applyGraphNodeClick({
          node,
          docClickBehavior,
          onSelectNode,
        });
        return true;
      },
      getNodeVisualState(docName: string) {
        const node = displayData.nodes.find(
          (candidate): candidate is GraphNode & { kind: 'doc' } =>
            candidate.kind === 'doc' && candidate.docName === docName,
        );
        if (!node) return null;
        return getGraphNodeVisualState(node, {
          activeDocName,
          selectedNodeId,
        });
      },
      getNodeClickPoint(nodeKey: string) {
        const fg = fgRef.current;
        if (!fg) return null;

        const node = displayData.nodes.find(
          (candidate): candidate is NodeObject<GraphNode> =>
            ('docName' in candidate && candidate.docName === nodeKey) ||
            ('url' in candidate && candidate.url === nodeKey) ||
            candidate.id === nodeKey,
        );
        if (!node) return null;

        const hitbox = getGraphNodeHitbox({
          node,
          fg,
          activeDocName,
          selectedNodeId,
          globalScale: fg.zoom(),
          displayState: getGraphNodeDisplayState({
            node,
            navigationIntentByNodeId,
          }),
        });
        if (!hitbox) return null;

        return {
          x: hitbox.x,
          y: hitbox.y,
        };
      },
      getLayoutMetrics() {
        return {
          graphHeight:
            containerRef.current
              ?.querySelector<HTMLElement>('[role="img"]')
              ?.getBoundingClientRect().height ?? 0,
          containerHeight: containerRef.current?.getBoundingClientRect().height ?? 0,
          availableHeight: containerRef.current?.parentElement?.getBoundingClientRect().height ?? 0,
        };
      },
      // True once the force-layout simulation has reached cooldown — flipped
      // in `onEngineStop` and cleared on every `onEngineTick`.
      isSimulationSettled() {
        return simulationSettledRef.current;
      },
      getLinkClickPoint(sourceDocName: string, targetDocName: string) {
        const fg = fgRef.current;
        if (!fg) return null;

        const link = (displayData.links as LinkObject<GraphNode, GraphLink>[]).find((candidate) => {
          const source = getGraphLinkEndpointDocName({
            endpoint: candidate.source,
            nodes: displayData.nodes,
          });
          const target = getGraphLinkEndpointDocName({
            endpoint: candidate.target,
            nodes: displayData.nodes,
          });
          return source === sourceDocName && target === targetDocName;
        });
        if (!link) return null;

        const sourceNode =
          typeof link.source === 'object' && link.source !== null ? link.source : undefined;
        const targetNode =
          typeof link.target === 'object' && link.target !== null ? link.target : undefined;
        if (!sourceNode || !targetNode) return null;

        const sourceHitbox = getGraphNodeHitbox({
          node: sourceNode,
          fg,
          activeDocName,
          selectedNodeId,
          globalScale: fg.zoom(),
          displayState: getGraphNodeDisplayState({
            node: sourceNode,
            navigationIntentByNodeId,
          }),
        });
        const targetHitbox = getGraphNodeHitbox({
          node: targetNode,
          fg,
          activeDocName,
          selectedNodeId,
          globalScale: fg.zoom(),
          displayState: getGraphNodeDisplayState({
            node: targetNode,
            navigationIntentByNodeId,
          }),
        });
        if (!sourceHitbox || !targetHitbox) return null;

        const dx = targetHitbox.x - sourceHitbox.x;
        const dy = targetHitbox.y - sourceHitbox.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) return null;

        const sourceOffset = sourceHitbox.radiusPx + 8;
        const targetOffset = targetHitbox.radiusPx + 8;
        const usableLength = Math.max(length - sourceOffset - targetOffset, 0);
        const distanceFromSource = sourceOffset + usableLength / 2;
        const unitX = dx / length;
        const unitY = dy / length;

        return {
          x: sourceHitbox.x + unitX * distanceFromSource,
          y: sourceHitbox.y + unitY * distanceFromSource,
        };
      },
    };

    window.__graphHarness = harness;
    return () => {
      if (window.__graphHarness === harness) {
        delete window.__graphHarness;
      }
    };
  }, [
    activeDocName,
    docClickBehavior,
    displayData.links,
    displayData.nodes,
    navigationIntentByNodeId,
    onBackgroundClick,
    onSelectNode,
    selectedNodeId,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn('h-full min-h-0 overflow-hidden', className)}
      onPointerCancel={() => {
        backgroundPointerRef.current = null;
      }}
      onPointerDownCapture={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          backgroundPointerRef.current = null;
          return;
        }
        backgroundPointerRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          target: (() => {
            const container = containerRef.current;
            const fg = fgRef.current;
            if (!container || !fg) {
              return { kind: 'background' } satisfies GraphPointerTarget;
            }

            const point = getLocalPointerPoint({
              clientX: event.clientX,
              clientY: event.clientY,
              container,
            });
            const node = getGraphNodeAtPoint({
              point,
              fg,
              nodes: displayData.nodes,
              activeDocName,
              selectedNodeId,
              navigationIntentByNodeId,
            });
            if (node) {
              return { kind: 'node', node } satisfies GraphPointerTarget;
            }
            if (
              isGraphLinkAtPoint({
                point,
                fg,
                links: displayData.links,
              })
            ) {
              return { kind: 'link' } satisfies GraphPointerTarget;
            }
            return { kind: 'background' } satisfies GraphPointerTarget;
          })(),
        };
      }}
      onPointerUpCapture={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          backgroundPointerRef.current = null;
          return;
        }

        const pointerDown = backgroundPointerRef.current;
        backgroundPointerRef.current = null;
        if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;

        const travelPx = Math.hypot(
          event.clientX - pointerDown.clientX,
          event.clientY - pointerDown.clientY,
        );
        if (travelPx > BACKGROUND_CLICK_TOLERANCE_PX) return;

        handleGraphPointerTapTarget({
          target: pointerDown.target,
          docClickBehavior,
          selectedNodeId,
          onSelectNode,
          onBackgroundClick,
        });
      }}
    >
      {error ? (
        <p className="p-4 text-sm text-destructive">{error}</p>
      ) : graphData.nodes.length === 0 && !loading ? (
        <p className="p-4 text-sm text-muted-foreground">
          <Trans>No links yet. Add wiki links or markdown links to build a graph.</Trans>
        </p>
      ) : (
        <div
          className="h-full min-h-0"
          role="img"
          aria-label={t`Graph visualization of document links`}
        >
          <ForceGraph2D
            ref={fgRef}
            graphData={displayData}
            // Enough to converge. This used to be 150 on the belief that the
            // converged layout was a featureless disc and the structure at 150
            // was a lucky intermediate. Measuring it says the opposite: at 400
            // ticks ~71% of a node's six nearest neighbours are from its own
            // folder, and the radial density is lumpy, not uniform. The disc was
            // never the layout — it was every cluster crushed into a few pixels
            // by unbounded repulsion, which distanceMax now bounds.
            cooldownTicks={400}
            onEngineTick={() => {
              simulationSettledRef.current = false;
              // The camera stops chasing the ACTIVE document once the user has
              // zoomed in on a SELECTION: they are driving now, and re-centering
              // on a different node every tick would pull the ground out from
              // under the neighborhood they are reading.
              if (isGraphFocusMode(interactionMode)) return;
              focusStateRef.current = maybeFocusActiveGraphNode({
                fg: fgRef.current,
                nodes: graphData.nodes,
                activeDocName,
                zoom: focusZoom,
                focusKey,
                focusState: focusStateRef.current,
              });
            }}
            onEngineStop={() => {
              simulationSettledRef.current = true;
              if (isGraphFocusMode(interactionMode)) return;
              const coords = getActiveGraphNodeCoords({
                nodes: graphData.nodes,
                activeDocName,
              });
              if (
                shouldRunFinalSettle({
                  fg: fgRef.current,
                  coords,
                  dimensions,
                })
              ) {
                focusStateRef.current = maybeFocusActiveGraphNode({
                  fg: fgRef.current,
                  nodes: graphData.nodes,
                  activeDocName,
                  zoom: focusZoom,
                  focusKey,
                  focusState: focusStateRef.current,
                  force: true,
                });
              }
            }}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={bgColor}
            nodeId="id"
            nodeLabel={(node: NodeObject<GraphNode>) => {
              return getGraphNodeTooltipLabel(node, {
                displayState: getGraphNodeDisplayState({
                  node,
                  navigationIntentByNodeId,
                }),
              });
            }}
            nodeRelSize={4}
            nodeVal={(node: NodeObject<GraphNode>) => {
              const state = getGraphNodeVisualState(node, {
                activeDocName,
                selectedNodeId,
              });

              const base =
                state === 'active-selected'
                  ? 20
                  : state === 'active'
                    ? 18
                    : state === 'selected' ||
                        state === 'external-selected' ||
                        state === 'tag-selected'
                      ? 12
                      : 6;
              // nodeVal drives force-graph's own area math (and the drag hit
              // area), so it scales with the same multiplier as the drawn
              // radius — squared, since val is an area and nodeSize a length.
              return base * settings.display.nodeSize ** 2;
            }}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(
              node: NodeObject<GraphNode>,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;

              const state = getGraphNodeVisualState(node, {
                activeDocName,
                selectedNodeId,
              });
              const displayState = getGraphNodeDisplayState({
                node,
                navigationIntentByNodeId,
              });
              const degree = degreeByNodeId.get(node.id) ?? 0;
              const style = getGraphNodeStyle({ node, degree, displayState, visualState: state });
              const radius = capGraphNodeRadius(
                getGraphNodeCanvasRadius(state) * settings.display.nodeSize * style.scale,
                globalScale,
              );

              // A user-defined group is an explicit instruction and outranks the
              // weight scale; the auto-assigned cluster hue does NOT, because a
              // graph that colors every node by cluster is the confetti this
              // encoding exists to replace. Clusters still drive the legend.
              const group = matchGraphGroup(node, settings.groups);
              const color = group
                ? resolveGraphGroupColor(group.color, isDark)
                : emphasisColor(style.emphasis);

              ctx.save();
              ctx.globalAlpha = nodeAlpha(node.id);

              const strokeWidth = screenOffsetInGraphUnits(1.5, globalScale, radius);
              if (style.shape === 'filled') {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = color;
                ctx.fill();
              } else if (style.shape === 'ring') {
                // Hollow, so the fill has to be the background rather than
                // nothing — links are drawn first and would otherwise show
                // straight through the node.
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = bgColor;
                ctx.fill();
                ctx.lineWidth = strokeWidth;
                ctx.strokeStyle = color;
                ctx.stroke();
              } else if (style.shape === 'ghost') {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = bgColor;
                ctx.fill();
                ctx.lineWidth = strokeWidth;
                ctx.strokeStyle = color;
                ctx.setLineDash([
                  screenOffsetInGraphUnits(2.5, globalScale, radius),
                  screenOffsetInGraphUnits(2, globalScale, radius),
                ]);
                ctx.stroke();
                ctx.setLineDash([]);
              } else {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = color;
                ctx.fill();
              }

              // Selection is a halo OUTSIDE the node rather than a fill change,
              // so a selected node keeps whatever weight its role gave it.
              if (state !== 'default' && state !== 'external' && state !== 'tag') {
                ctx.beginPath();
                ctx.arc(
                  node.x,
                  node.y,
                  radius + screenOffsetInGraphUnits(3, globalScale, radius),
                  0,
                  2 * Math.PI,
                  false,
                );
                ctx.lineWidth = screenOffsetInGraphUnits(1.5, globalScale, radius);
                ctx.strokeStyle =
                  state === 'active' || state === 'active-selected'
                    ? palette.accent
                    : palette.strong;
                ctx.globalAlpha = nodeAlpha(node.id) * 0.45;
                ctx.stroke();
                ctx.globalAlpha = nodeAlpha(node.id);
              }

              // The edge count, inside the ring. Only drawn once the ring is
              // physically big enough on screen to hold a digit.
              // Quiet: the count is metadata about a node, not its identity.
              // Drawn bold and dark it was the loudest thing on the canvas while
              // the names were the faintest — exactly backwards.
              if (style.showDegree && radius * globalScale >= 11) {
                const fontPx = Math.min(radius * 0.85, 8 / globalScale);
                ctx.font = `400 ${fontPx}px system-ui, sans-serif`;
                ctx.fillStyle = color;
                ctx.globalAlpha = nodeAlpha(node.id) * 0.5;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(degree), node.x, node.y);
              }

              ctx.restore();
            }}
            nodePointerAreaPaint={(
              node: NodeObject<GraphNode>,
              color: string,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
              const state = getGraphNodeVisualState(node, {
                activeDocName,
                selectedNodeId,
              });
              const displayState = getGraphNodeDisplayState({
                node,
                navigationIntentByNodeId,
              });
              ctx.beginPath();
              ctx.arc(
                node.x,
                node.y,
                // Scaled by the same multiplier as the drawn radius, or the
                // clickable area would drift away from the visible circle.
                getGraphNodeInteractiveRadius({
                  state,
                  displayState,
                  globalScale,
                }) *
                  settings.display.nodeSize *
                  drawnNodeScale(node),
                0,
                2 * Math.PI,
                false,
              );
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              // Territories, painted under the links and nodes. Blurred, so they
              // read as ground the graph sits on rather than as shapes drawn in
              // it — the blur is what separates this from the hard grey
              // ellipses that were tried and reverted earlier.
              const bounds = areaBoundsRef.current;
              bounds.clear();
              if (areas.length === 0) return;

              const positionById = new Map(
                (displayData.nodes as Array<GraphNode & { x?: number; y?: number }>).map((node) => [
                  node.id,
                  node,
                ]),
              );

              for (const area of areas) {
                const box = getGraphAreaBounds(area, positionById);
                if (box) bounds.set(area.id, box);
              }

              // One storey of the tree at a time: size says how present each
              // region is, and the depth weighting then keeps whichever level
              // best fits the screen, crossfading into the next as you descend.
              const sized = areas.flatMap((area) => {
                const box = bounds.get(area.id);
                if (!box) return [];
                const share = (box.rx * globalScale * 2) / Math.max(1, dimensions.width);
                return [
                  {
                    area,
                    share,
                    lod: getGraphAreaLodAlpha(box.rx * globalScale * 2, dimensions.width),
                  },
                ];
              });
              const focusDepth = getGraphAreaFocusDepth(
                sized.map(({ area, share }) => ({ depth: area.depth, share })),
              );
              focusDepthRef.current = focusDepth;
              const alphas = areaAlphaRef.current;
              alphas.clear();
              for (const { area, lod } of sized) {
                const weighted = lod * getGraphAreaDepthWeight(area.depth, focusDepth);
                if (weighted > 0) alphas.set(area.id, weighted);
              }

              const fg = fgRef.current;
              const layer = areaLayerRef.current;
              if (!fg || !layer || bounds.size === 0) return;
              paintGraphAreaPartition({
                ctx,
                layer,
                areas,
                boundsById: bounds,
                alphaById: alphas,
                colorOf: areaColor,
                toScreen: (x, y) => fg.graph2ScreenCoords(x, y),
                globalScale,
                width: dimensions.width,
                height: dimensions.height,
              });
            }}
            onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              const areaFg = areas.length > 0 ? fgRef.current : null;
              if (areaFg) {
                // Region names, in screen space so they stay readable at any
                // zoom. They are the legend you navigate by, so they are drawn
                // before the node labels and yield to them: strong when you are
                // far enough out that node labels are gone, receding once you
                // are close enough to read individual pages.
                ctx.save();
                const pxRatio = window.devicePixelRatio || 1;
                ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = palette.label;
                // 0.45/0.22 was too faint to read — these names are the map's
                // legend, not a watermark, and the original carried them at
                // 0.82. They can afford the ink now that the level of detail
                // above draws only the few regions that are a useful size,
                // rather than every folder at once.
                ctx.globalAlpha = globalScale >= settings.display.textFadeThreshold ? 0.42 : 0.78;
                // Biggest region first, and a name is dropped when its box
                // would land on one already written. Without this every folder
                // writes at its own centroid and a dense project stacks a dozen
                // of them into a smear — which is worse than no name at all.
                const takenLabelBoxes: Array<[number, number, number, number]> = [];
                const baseAlpha = ctx.globalAlpha;
                // Largest on screen first, not shallowest: with the size-driven
                // level of detail above, "which region is the landmark right
                // now" is a question about pixels, and the one that owns the
                // most of them should get to keep its name.
                //
                // Everything below is decided against numbers that move while
                // you zoom, so — exactly as with the node labels — it is done
                // with a memory of what was written last frame. Two sibling
                // folders of near-equal size (`views-25` and `views-200`) kept
                // swapping rank frame to frame, and the swap handed the
                // contested spot back and forth: both names strobed the whole
                // way through a zoom.
                const shownLastFrame = areaLabelShownRef.current;
                const named = areas
                  .map((area) => {
                    const box = areaBoundsRef.current.get(area.id);
                    if (!box) return null;
                    const screen = areaFg.graph2ScreenCoords(box.cx, box.cy);
                    const edge = areaFg.graph2ScreenCoords(box.cx + box.rx, box.cy);
                    const widthPx = Math.abs(edge.x - screen.x) * 2;
                    return {
                      area,
                      screen,
                      widthPx,
                      lod: areaAlphaRef.current.get(area.id) ?? 0,
                      wasShown: shownLastFrame.has(area.id),
                    };
                  })
                  .filter((entry) => entry !== null)
                  .filter(
                    (entry) =>
                      entry.lod > 0 &&
                      // A name already up survives a little below the entry
                      // size, so a region hovering on the threshold does not
                      // chatter across it.
                      entry.widthPx >= GRAPH_AREA_LABEL_MIN_REGION_PX * (entry.wasShown ? 0.85 : 1),
                  )
                  .sort((a, b) => {
                    if (a.wasShown !== b.wasShown) return a.wasShown ? -1 : 1;
                    return b.widthPx - a.widthPx;
                  });
                const shownThisFrame = new Set<string>();

                for (const { area, screen, widthPx, lod, wasShown } of named) {
                  // Size the name to its own territory. Measured on screen
                  // rather than in graph units so it survives zoom.
                  const sizePx = getGraphAreaLabelSizePx(widthPx);
                  ctx.font = `italic ${sizePx}px Georgia, "Times New Roman", serif`;
                  // A name wider than the thing it names is a label for the
                  // whole canvas, not for that region — drop it rather than
                  // write across its neighbours. Same hysteresis as the size
                  // gate above: a name already up is given slack before it is
                  // taken away again.
                  const textWidth = ctx.measureText(area.name).width;
                  if (textWidth > widthPx * (wasShown ? 1.15 : 1)) continue;
                  const halfWidth = textWidth / 2;
                  const halfHeight = sizePx * 0.55;
                  const left = screen.x - halfWidth;
                  const right = screen.x + halfWidth;
                  const top = screen.y - halfHeight;
                  const bottom = screen.y + halfHeight;
                  const collides = takenLabelBoxes.some(
                    ([l, t, r, b]) => left < r && right > l && top < b && bottom > t,
                  );
                  if (collides) continue;
                  takenLabelBoxes.push([left, top, right, bottom]);
                  // A region fading in or out takes its name with it, so the
                  // handover from parent to child reads as one movement.
                  ctx.globalAlpha = baseAlpha * lod;
                  ctx.fillText(area.name, screen.x, screen.y);
                  shownThisFrame.add(area.id);
                }
                areaLabelShownRef.current = shownThisFrame;
                ctx.restore();
              }

              // No single cutoff any more: hubs earn a label further out than
              // leaves do, so the planner decides per node and this only skips
              // the work when not even the most permissive tier qualifies.
              if (globalScale < settings.display.textFadeThreshold * MIN_GRAPH_LABEL_ZOOM_FACTOR) {
                return;
              }

              const fg = fgRef.current;
              if (!fg) return;

              ctx.save();
              // force-graph keeps the graph transform active during frame hooks; reset to
              // CSS-pixel space so placement math and text rendering share one coordinate system.
              const pxRatio = window.devicePixelRatio || 1;
              ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);
              ctx.font = '10px system-ui, sans-serif';

              const placements = planGraphLabels({
                nodes: layoutNodes,
                links: layoutLinks,
                activeDocName,
                viewport: dimensions,
                maxLabels: settings.display.maxLabels,
                zoomScale: globalScale,
                leafLabelThreshold: settings.display.textFadeThreshold,
                maxLabelWidthPx,
                labelDescriptors,
                measureTextWidthPx: (text) => ctx.measureText(text).width,
                projectToScreen: (x, y) => fg.graph2ScreenCoords(x, y),
                getNodeRadiusPx: (node) => {
                  const state = getGraphNodeVisualState(node, {
                    activeDocName,
                    selectedNodeId,
                  });
                  const displayState = getGraphNodeDisplayState({
                    node,
                    navigationIntentByNodeId,
                  });
                  // Same cap as the drawn circle, so the name sits just under
                  // the disc it belongs to and stops sliding once the disc
                  // stops growing.
                  return (
                    capGraphNodeRadius(
                      getGraphNodeInteractiveRadius({ state, displayState, globalScale }) *
                        settings.display.nodeSize *
                        drawnNodeScale(node),
                      globalScale,
                    ) *
                      globalScale +
                    4
                  );
                },
                previousOffsetStepByNodeId: labelOffsetStepsRef.current,
                isRegionEnteredForNode: (nodeId) => {
                  const area = innermostAreaByNodeId.get(nodeId);
                  if (!area) return null;
                  const focusDepth = focusDepthRef.current;
                  if (focusDepth === null) return null;
                  return focusDepth >= area.depth;
                },
              });

              // Hand this frame's decisions to the next one. Without it the
              // plan is recomputed from scratch against inputs that move with
              // the view, and the labels shake themselves apart while you zoom.
              const nextOffsetSteps = new Map<string, number>();
              for (const placement of placements) {
                nextOffsetSteps.set(placement.nodeId, placement.offsetStep);
              }
              labelOffsetStepsRef.current = nextOffsetSteps;

              drawGraphLabelPlacements({ ctx, placements, labelColor });
              ctx.restore();
            }}
            linkColor={(link: LinkObject<GraphNode, GraphLink>) => {
              if (
                hoveredNodeIdRef.current !== null &&
                !isGraphLinkHighlighted(link, hoveredNodeIdRef.current)
              ) {
                return palette.edgeDim;
              }
              // Containment is drawn faintest of all. It is scaffolding: it
              // earns its keep in the LAYOUT, by gathering a folder's pages, and
              // the ink only has to be enough to show which folder they belong
              // to — any heavier and it reads as though every page links home.
              if (isGraphFolderLink(link)) return palette.edgeContainment;
              // A page-to-page link is the graph's real structure; a link to a
              // tag or an external URL is annotation, and recedes behind it.
              return isStructuralGraphLink(link) ? palette.edgeStrong : palette.edgeSoft;
            }}
            linkDirectionalArrowLength={(link: LinkObject<GraphNode, GraphLink>) =>
              // Containment has no direction to point at — a folder does not
              // link to its pages, it contains them.
              settings.display.showArrows && !isGraphFolderLink(link) ? 3 : 0
            }
            linkDirectionalArrowRelPos={1}
            linkWidth={(link: LinkObject<GraphNode, GraphLink>) =>
              // A hovered node's own edges thicken, so the highlighted subgraph
              // reads as a shape rather than just a brightness difference.
              settings.display.linkThickness *
              (isGraphLinkHighlighted(link, hoveredNodeIdRef.current) ? 2 : 1)
            }
            d3AlphaDecay={alphaDecay}
            onZoom={({ k }: { k: number }) => {
              zoomScaleRef.current = k;
              syncInteractionMode();
            }}
            onNodeHover={(node: NodeObject<GraphNode> | null) => {
              hoveredNodeIdRef.current = node?.id ?? null;
            }}
            showPointerCursor={(obj) => Boolean(obj && 'kind' in obj)}
            onNodeClick={(node: NodeObject<GraphNode>) => {
              if (node.kind === 'tag') return;
              if (node.kind === 'folder') {
                // The folder overview, through the ordinary hash route.
                window.location.assign(hashFromDocName(node.path, null));
                return;
              }
              if (node.kind === 'external') {
                // openExternalUrl gates unsafe schemes internally (a node URL can
                // carry any authored scheme), then routes to the OS browser / new tab.
                openExternalUrl(node.url);
                return;
              }
              if (node.docName) {
                const navigationIntent = navigationIntentByNodeId.get(node.id);
                // A kind-aware hash (e.g. a global skill bundle reference routing
                // to the read-only skill-file viewer) takes precedence; otherwise
                // wrap the resolved docName as a normal `#/<doc>` hash.
                window.location.assign(
                  navigationIntent?.hash ??
                    hashFromDocName(
                      navigationIntent?.hashDocName ?? node.docName,
                      node.anchor ?? null,
                    ),
                );
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
