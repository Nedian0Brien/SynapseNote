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
import type { GraphSettings } from '@/lib/graph-settings-store';
import { cn } from '@/lib/utils';
import { getGraphCardNeighbors } from './GraphCardDeck';
import { clusterColor } from './graph-colors';
import { applyGraphFilters } from './graph-filter';
import { matchGraphGroup, resolveGraphGroupColor } from './graph-groups';
import { buildGraphAdjacency, isGraphLinkHighlighted } from './graph-highlight';
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
import {
  buildGraphDegreeMap,
  buildGraphLinkSignature,
  buildGraphNodeSignature,
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

function drawGraphLabelPlacements({
  ctx,
  placements,
  labelColor,
  chipColor,
  chipBorderColor,
}: {
  ctx: CanvasRenderingContext2D;
  placements: GraphLabelPlacement[];
  labelColor: string;
  chipColor: string;
  chipBorderColor: string;
}): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const placement of placements) {
    const width = placement.rect.right - placement.rect.left;
    const height = placement.rect.bottom - placement.rect.top;

    ctx.fillStyle = chipColor;
    ctx.fillRect(placement.rect.left, placement.rect.top, width, height);

    ctx.strokeStyle = chipBorderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(placement.rect.left, placement.rect.top, width, height);

    ctx.fillStyle = labelColor;
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
  onClustersChange,
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
  onClustersChange?: (clusters: string[]) => void;
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
  const bgColor = isDark ? 'hsl(0 0% 4%)' : 'hsl(0 0% 100%)';
  const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
  const activeNodeColor = isDark ? '#69a3ff' : '#3784ff';
  const selectedNodeColor = isDark ? '#34d399' : '#059669';
  const activeSelectedNodeColor = isDark ? '#c084fc' : '#7c3aed';
  const externalNodeColor = isDark ? '#f59e0b' : '#c2410c';
  const tagNodeColor = isDark ? '#22d3ee' : '#164e63';
  const tagNodeRingColor = isDark ? 'rgba(34,211,238,0.5)' : 'rgba(22,78,99,0.3)';
  const folderNodeColor = isDark ? '#a78bfa' : '#7c3aed';
  const missingNodeColor = isDark ? '#f87171' : '#dc2626';
  const edgeColor = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)';
  // Edges outside a hover highlight. Baked as a color rather than a globalAlpha
  // because force-graph draws links itself — there is no per-link canvas hook.
  const dimmedEdgeColor = isDark ? 'rgba(75,85,99,0.12)' : 'rgba(209,213,219,0.18)';
  const labelColor = isDark ? '#f3f4f6' : '#111827';
  const activeNodeRingColor = isDark ? 'rgba(105,163,255,0.45)' : 'rgba(55,132,255,0.3)';
  const folderNodeRingColor = isDark ? 'rgba(167,139,250,0.38)' : 'rgba(124,58,237,0.22)';
  const missingNodeRingColor = isDark ? 'rgba(248,113,113,0.58)' : 'rgba(220,38,38,0.38)';
  const selectedNodeRingColor = isDark ? 'rgba(52,211,153,0.5)' : 'rgba(5,150,105,0.3)';
  const activeSelectedNodeRingColor = isDark ? 'rgba(192,132,252,0.5)' : 'rgba(124,58,237,0.35)';
  const labelChipColor = isDark ? 'rgba(3,7,18,0.92)' : 'rgba(255,255,255,0.94)';
  const labelChipBorderColor = isDark ? 'rgba(243,244,246,0.08)' : 'rgba(17,24,39,0.08)';
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
  // force-graph RESTARTS the simulation whenever the `graphData` prop changes
  // identity — its setter reinitializes the layout and resets the cooldown. The
  // filter above returns fresh arrays on every render, so handing its result
  // straight to the canvas would scatter the graph on any state change at all.
  // The signature is the real change signal; `renderData` holds the last value
  // that actually differed, so re-renders that change nothing pass the very same
  // object back and the layout is left alone.
  const filteredSignature = `${buildGraphNodeSignature(filteredData.nodes)}\u0001${buildGraphLinkSignature(filteredData.links)}`;
  const [renderData, setRenderData] = useState<GraphData>(EMPTY_GRAPH_DATA);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands in for `filteredData`, whose identity churns every render — depending on it directly is the bug this exists to prevent
  useEffect(() => {
    setRenderData(filteredData);
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
    if (!onClustersChange) return;
    const seen = new Set<string>();
    for (const node of graphData.nodes) {
      if (node.kind === 'doc' && node.cluster) {
        seen.add(node.cluster);
      }
    }
    onClustersChange(Array.from(seen).sort());
  }, [graphData, onClustersChange]);

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
    // Stored as a magnitude; d3 wants a negative strength to push apart.
    charge?.strength?.(-repelStrength);

    const center = fg.d3Force('center');
    center?.strength?.(centerStrength);

    const link = fg.d3Force('link');
    if (link) {
      link.distance?.(linkDistance);
      // d3's own default is `1 / min(degree(source), degree(target))`, computed
      // once at initialize. Reproducing it here rather than passing a flat
      // number keeps a multiplier of 1 a true no-op: a flat strength would
      // stiffen hub edges that d3 deliberately slackens.
      const degrees = buildGraphDegreeMap(displayLinks);
      link.strength?.((candidate: { source: unknown; target: unknown }) => {
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
            cooldownTicks={150}
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
              const isFolderTarget = displayState === 'folder';
              const isMissingTarget = displayState === 'missing';
              const nodeRadius = getGraphNodeCanvasRadius(state) * settings.display.nodeSize;
              const pointerRadius =
                getGraphNodeInteractiveRadius({
                  state,
                  displayState,
                  globalScale,
                }) * settings.display.nodeSize;

              const group = matchGraphGroup(node, settings.groups);
              const docCluster = node.kind === 'doc' ? node.cluster : undefined;
              // A user-defined group outranks the auto-assigned cluster color:
              // the group is an explicit instruction, the cluster a fallback.
              const baseFill = group
                ? resolveGraphGroupColor(group.color, isDark)
                : docCluster
                  ? clusterColor(docCluster, isDark)
                  : defaultNodeColor;

              ctx.save();
              ctx.globalAlpha = nodeAlpha(node.id);
              ctx.beginPath();
              ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
              ctx.fillStyle =
                state === 'active'
                  ? activeNodeColor
                  : state === 'active-selected'
                    ? activeSelectedNodeColor
                    : state === 'external' || state === 'external-selected'
                      ? externalNodeColor
                      : state === 'tag' || state === 'tag-selected'
                        ? tagNodeColor
                        : isMissingTarget
                          ? missingNodeColor
                          : state === 'selected'
                            ? selectedNodeColor
                            : isFolderTarget
                              ? folderNodeColor
                              : baseFill;
              ctx.fill();

              if (pointerRadius > nodeRadius) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, pointerRadius, 0, 2 * Math.PI, false);
                ctx.strokeStyle = isMissingTarget
                  ? missingNodeRingColor
                  : state === 'active'
                    ? activeNodeRingColor
                    : state === 'tag-selected'
                      ? tagNodeRingColor
                      : state === 'selected' || state === 'external-selected'
                        ? selectedNodeRingColor
                        : activeSelectedNodeRingColor;
                // Same screen-space-to-graph-units cap as the radius above: an
                // uncapped 1.75/scale stroke swallows the node when zoomed out.
                ctx.lineWidth = screenOffsetInGraphUnits(
                  isMissingTarget ? 1.75 : 2,
                  globalScale,
                  nodeRadius,
                );
                ctx.setLineDash(
                  isMissingTarget
                    ? [
                        screenOffsetInGraphUnits(3, globalScale, nodeRadius),
                        screenOffsetInGraphUnits(2, globalScale, nodeRadius),
                      ]
                    : [],
                );
                ctx.stroke();
                ctx.setLineDash([]);
              } else if (isFolderTarget) {
                ctx.beginPath();
                ctx.arc(
                  node.x,
                  node.y,
                  nodeRadius + screenOffsetInGraphUnits(2, globalScale, nodeRadius),
                  0,
                  2 * Math.PI,
                  false,
                );
                ctx.strokeStyle = folderNodeRingColor;
                ctx.lineWidth = screenOffsetInGraphUnits(1.5, globalScale, nodeRadius);
                ctx.stroke();
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
                }) * settings.display.nodeSize,
                0,
                2 * Math.PI,
                false,
              );
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
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
                  return (
                    getGraphNodeInteractiveRadius({
                      state,
                      displayState,
                      globalScale,
                    }) *
                      settings.display.nodeSize *
                      globalScale +
                    4
                  );
                },
              });

              drawGraphLabelPlacements({
                ctx,
                placements,
                labelColor,
                chipColor: labelChipColor,
                chipBorderColor: labelChipBorderColor,
              });
              ctx.restore();
            }}
            linkColor={(link: LinkObject<GraphNode, GraphLink>) =>
              hoveredNodeIdRef.current === null ||
              isGraphLinkHighlighted(link, hoveredNodeIdRef.current)
                ? edgeColor
                : dimmedEdgeColor
            }
            linkDirectionalArrowLength={settings.display.showArrows ? 3 : 0}
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
