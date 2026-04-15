import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as d3 from 'd3';
import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  Text,
} from 'pixi.js';
import { useGraph } from '../../shared/hooks/useGraph';
import { ChatPanel } from '../panels/ChatPanel';
import {
  getBloomRadiusMultiplier,
  getFocusSettledScale,
  ZOOM_CARD_IN,
  ZOOM_FOCUS_IN,
  buildFocusSubgraph,
  getGraphEndAction,
  getGraphInteractionMode,
  getGraphPhysicsProfile,
  getNodeRadiusScale,
  shouldFocusSelectedNode,
  shouldPreserveViewportOnFocusTransition,
} from './graphViewState.js';

const LAYOUTS = ['force', 'tree', 'radial'];
const ZOOM_BLOOM = 1.75;
const LAYOUT_META = {
  force: { icon: 'grain' },
  tree: { icon: 'account_tree' },
  radial: { icon: 'hub' },
};

const DOC_LABEL_THRESHOLD = 0.78;
const HUB_LABEL_THRESHOLD = 0.55;
const DIR_LABEL_THRESHOLD = 0.40;
const DOC_GLYPH_THRESHOLD = 0.68;
const HUB_GLYPH_THRESHOLD = 0.48;
const DIR_GLYPH_THRESHOLD = 0.32;
const AREA_MODE_THRESHOLD = 0.60;
const AREA_PHASE2_THRESHOLD = 0.35;
const MAX_GRAPH_CANVAS_RESOLUTION = 3;

const CLUSTER_PALETTE = [
  0xc8a870, 0xa0b878, 0x90a8c0, 0xc09888,
  0xb8a0c0, 0xc0b070, 0x88b8a8, 0xc09070,
];

const DEFAULT_GRAPH_SETTINGS = {
  phase1Start: AREA_PHASE2_THRESHOLD,
  phase2FadeEnd: AREA_MODE_THRESHOLD,
  labelShowStart: DOC_LABEL_THRESHOLD,
  areaFontSizeP1: 72,
  areaFontSizeP2: 40,
  areaLabelAlpha: 0.82,
  chargeStrength: -200,
  linkDistance: 95,
  linkStrength: 0.7,
  centerStrength: 0.04,
};

function buildDirectoryClusters(nodes, edges) {
  const dirNodes = nodes.filter((n) => n.type === 'Directory');
  const childrenMap = new Map();
  const parentMap = new Map();

  for (const edge of edges) {
    if (edge.edge_type !== 'directory') continue;
    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
    childrenMap.get(edge.source).push(edge.target);
    parentMap.set(edge.target, edge.source);
  }

  const dirDepth = new Map();
  const rootDirs = dirNodes.filter((n) => !parentMap.has(n.id));
  const queue = rootDirs.map((n) => ({ id: n.id, depth: 0 }));
  while (queue.length) {
    const { id, depth } = queue.shift();
    dirDepth.set(id, depth);
    for (const childId of childrenMap.get(id) || []) {
      if (nodes.find((n) => n.id === childId)?.type === 'Directory') {
        queue.push({ id: childId, depth: depth + 1 });
      }
    }
  }

  const getDescendants = (dirId) => {
    const result = [];
    for (const childId of childrenMap.get(dirId) || []) {
      result.push(childId);
      if (childrenMap.has(childId)) result.push(...getDescendants(childId));
    }
    return result;
  };

  const rootIds = new Set(rootDirs.map((n) => n.id));
  return dirNodes
    .filter((dir) => (childrenMap.get(dir.id) || []).length > 0 && !rootIds.has(dir.id))
    .map((dir, idx) => ({
      id: dir.id,
      name: dir.name || dir.title || dir.id.split('/').pop(),
      depth: dirDepth.get(dir.id) ?? 0,
      memberIds: new Set([dir.id, ...getDescendants(dir.id)]),
      color: CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length],
    }))
    .sort((a, b) => a.depth - b.depth);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCanvasResolution() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return Math.min(dpr * 1.5, MAX_GRAPH_CANVAS_RESOLUTION);
}

function parseCssColor(input, fallback = { color: 0x000000, alpha: 1 }) {
  const value = String(input || '').trim();
  if (!value) return fallback;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const normalized = hex.split('').map((char) => char + char).join('');
      return { color: parseInt(normalized, 16), alpha: 1 };
    }
    if (hex.length === 6) {
      return { color: parseInt(hex, 16), alpha: 1 };
    }
  }

  const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    const [r, g, b, a] = parts.map(Number);
    return {
      color: ((clamp(r || 0, 0, 255) << 16) | (clamp(g || 0, 0, 255) << 8) | clamp(b || 0, 0, 255)) >>> 0,
      alpha: Number.isFinite(a) ? clamp(a, 0, 1) : 1,
    };
  }

  return fallback;
}

function getGraphPalette(element) {
  const styles = getComputedStyle(element);

  return {
    dirFill: parseCssColor(styles.getPropertyValue('--g-dir-fill'), { color: 0x2a1c08, alpha: 1 }),
    dirStroke: parseCssColor(styles.getPropertyValue('--g-dir-fill'), { color: 0x2a1c08, alpha: 1 }),
    dirIcon: parseCssColor(styles.getPropertyValue('--g-dir-icon'), { color: 0xf5f0e4, alpha: 0.92 }),
    dirLabel: parseCssColor(styles.getPropertyValue('--on-surface'), { color: 0xf0ece2, alpha: 1 }),
    hubFill: parseCssColor(styles.getPropertyValue('--g-hub-fill'), { color: 0xf0ebe0, alpha: 1 }),
    hubStroke: parseCssColor(styles.getPropertyValue('--g-hub-stroke'), { color: 0x2a1c08, alpha: 1 }),
    hubLabel: parseCssColor(styles.getPropertyValue('--on-surface'), { color: 0x2a1c08, alpha: 1 }),
    hubNum: parseCssColor(styles.getPropertyValue('--g-hub-stroke'), { color: 0x2a1c08, alpha: 1 }),
    hubSel: parseCssColor('rgba(42,28,8,0.42)', { color: 0x2a1c08, alpha: 0.42 }),
    docFill: parseCssColor(styles.getPropertyValue('--g-doc-fill'), { color: 0xf0ebe0, alpha: 1 }),
    docStroke: parseCssColor(styles.getPropertyValue('--g-doc-stroke'), { color: 0xc8b89a, alpha: 1 }),
    docLabel: parseCssColor(styles.getPropertyValue('--muted'), { color: 0x907860, alpha: 1 }),
    docIcon: parseCssColor(styles.getPropertyValue('--muted'), { color: 0x907860, alpha: 1 }),
    docSel: parseCssColor('rgba(200,160,80,0.42)', { color: 0xc8a878, alpha: 0.42 }),
    linkDir: parseCssColor(styles.getPropertyValue('--g-link-dir'), { color: 0x3c280a, alpha: 0.32 }),
    linkWiki: parseCssColor(styles.getPropertyValue('--g-link-wiki'), { color: 0x3c280a, alpha: 0.17 }),
    linkRef: parseCssColor(styles.getPropertyValue('--g-link-ref'), { color: 0x3c280a, alpha: 0.09 }),
  };
}

function getLinkNodeId(endpoint) {
  if (endpoint && typeof endpoint === 'object') return endpoint.id;
  return endpoint;
}

function buildMatchedNodeIdSet(nodes, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return null;

  return new Set(
    nodes
      .filter((node) => String(node.searchTitle ?? node.title ?? '').includes(normalizedQuery))
      .map((node) => node.id),
  );
}

function buildNeighborIdSet(selectedNodeId, links) {
  if (!selectedNodeId) return new Set();

  const ids = new Set([selectedNodeId]);
  for (const link of links) {
    const sourceId = getLinkNodeId(link.source);
    const targetId = getLinkNodeId(link.target);
    if (sourceId === selectedNodeId || targetId === selectedNodeId) {
      if (sourceId) ids.add(sourceId);
      if (targetId) ids.add(targetId);
    }
  }

  return ids;
}

function updateAreaBounds(areaObjects) {
  let geometryChanged = false;

  for (let index = 0; index < areaObjects.length; index += 1) {
    const area = areaObjects[index];
    const len = area.members.length;
    if (!len) continue;

    let sumX = 0;
    let sumY = 0;
    for (let memberIndex = 0; memberIndex < len; memberIndex += 1) {
      const member = area.members[memberIndex];
      sumX += member.x ?? 0;
      sumY += member.y ?? 0;
    }

    const cx = sumX / len;
    const cy = sumY / len;
    let maxDx = 30;
    let maxDy = 25;
    for (let memberIndex = 0; memberIndex < len; memberIndex += 1) {
      const member = area.members[memberIndex];
      const dx = Math.abs((member.x ?? 0) - cx);
      const dy = Math.abs((member.y ?? 0) - cy);
      if (dx > maxDx) maxDx = dx;
      if (dy > maxDy) maxDy = dy;
    }

    const isPhase2Area = area.depth >= 2;
    const pad = isPhase2Area ? 35 + (2 - area.depth) * 10 : 55 + (2 - area.depth) * 15;
    const rx = maxDx + pad;
    const ry = maxDy + pad;
    const changed = Math.abs(cx - area._cx) > 2
      || Math.abs(cy - area._cy) > 2
      || Math.abs(rx - area._rx) > 3
      || Math.abs(ry - area._ry) > 3;

    if (changed) {
      area._cx = cx;
      area._cy = cy;
      area._rx = rx;
      area._ry = ry;
      area._geometryDirty = true;
      geometryChanged = true;
    }
  }

  return geometryChanged;
}

function updateTint(displayObject, tone) {
  if (!displayObject || !tone) return;
  if (displayObject.tint !== tone.color) {
    displayObject.tint = tone.color;
  }
}

function drawDashedLine(graphics, x1, y1, x2, y2, dashLength = 4, gapLength = 4) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);

  if (!distance) return;

  const ux = dx / distance;
  const uy = dy / distance;
  let cursor = 0;

  while (cursor < distance) {
    const start = cursor;
    const end = Math.min(cursor + dashLength, distance);
    graphics.moveTo(x1 + (ux * start), y1 + (uy * start));
    graphics.lineTo(x1 + (ux * end), y1 + (uy * end));
    cursor += dashLength + gapLength;
  }
}

function drawDashedCircle(graphics, cx, cy, radius, dashArc = 0.3, gapArc = 0.18) {
  let angle = 0;
  while (angle < Math.PI * 2) {
    const startX = cx + (Math.cos(angle) * radius);
    const startY = cy + (Math.sin(angle) * radius);
    graphics.moveTo(startX, startY);
    const endAngle = Math.min(angle + dashArc, Math.PI * 2);
    let current = angle;
    while (current < endAngle) {
      current = Math.min(current + 0.05, endAngle);
      graphics.lineTo(cx + (Math.cos(current) * radius), cy + (Math.sin(current) * radius));
    }
    angle += dashArc + gapArc;
  }
}

function getNodeDegreeMap(nodes, edges) {
  const degreeMap = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  }
  return degreeMap;
}

function getNodeType(node, degreeMap) {
  if (node.type === 'Directory') return 'dir';
  if ((degreeMap.get(node.id) || 0) >= 4) return 'hub';
  return 'doc';
}

function getNodeRadius(node, degreeMap, interactionMode = 'browse') {
  const visualType = getNodeType(node, degreeMap);
  const scale = getNodeRadiusScale({ nodeType: visualType, interactionMode });
  if (visualType === 'dir') return Math.max(14, Math.min(26, (18 + (degreeMap.get(node.id) || 0) * 0.8) * scale));
  if (visualType === 'hub') return Math.max(12, Math.min(18, 12 + (degreeMap.get(node.id) || 0) * 0.6));
  return Math.max(6, 7 * scale);
}

function buildNodeMeta(nodes, edges, degreeMap) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const directoryChildren = new Map();

  for (const edge of edges) {
    if (edge.edge_type !== 'directory') continue;
    if (!directoryChildren.has(edge.source)) directoryChildren.set(edge.source, []);
    directoryChildren.get(edge.source).push(edge.target);
  }

  return new Map(nodes.map((node) => {
    const children = directoryChildren.get(node.id) || [];
    const childDocs = children.filter((childId) => nodeMap.get(childId)?.type === 'Document').length;
    const nodeTags = [
      node.type === 'Directory' ? '#directory' : '#document',
      node.directory ? `#${node.directory.split('/').pop()}` : '#vault',
    ];

    return [node.id, {
      icon: node.type === 'Directory' ? 'folder' : 'article',
      type: node.type,
      links: degreeMap.get(node.id) || 0,
      age: node.type === 'Directory' ? 'live' : 'recent',
      docs: node.type === 'Directory' ? childDocs : 1,
      tags: nodeTags,
      preview: node.type === 'Directory'
        ? `${node.name} 아래 ${children.length}개 항목이 연결되어 있습니다.`
        : `${node.name} 문서와 연결된 그래프 관계를 시각적으로 탐색합니다.`,
    }];
  }));
}

function buildBreadcrumb(node, nodeIndex) {
  const path = node.path || node.id;
  const segments = path.split('/').filter(Boolean);
  const crumbs = [];
  let currentPath = '';

  if (!segments.length) return [node];

  for (let i = 0; i < segments.length; i += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i];
    crumbs.push(nodeIndex.get(currentPath) || {
      id: currentPath,
      name: segments[i].replace(/\.md$/, ''),
      path: currentPath,
    });
  }

  return crumbs;
}

function getNeighborIds(nodeId, links) {
  const ids = new Set();
  for (const link of links) {
    if (link.source.id === nodeId) ids.add(link.target.id);
    if (link.target.id === nodeId) ids.add(link.source.id);
  }
  return ids;
}

function bfsDepths(simNodes, simLinks) {
  const degreeMap = new Map(simNodes.map((node) => [node.id, 0]));
  simLinks.forEach((link) => {
    degreeMap.set(link.source.id, (degreeMap.get(link.source.id) || 0) + 1);
    degreeMap.set(link.target.id, (degreeMap.get(link.target.id) || 0) + 1);
  });

  const rootId = simNodes.reduce((best, node) => (
    (degreeMap.get(node.id) || 0) > (degreeMap.get(best) || 0) ? node.id : best
  ), simNodes[0]?.id);

  const depth = new Map([[rootId, 0]]);
  const queue = [rootId];

  while (queue.length) {
    const id = queue.shift();
    const level = depth.get(id);
    for (const link of simLinks) {
      const sourceId = link.source.id;
      const targetId = link.target.id;
      if (sourceId === id && !depth.has(targetId)) {
        depth.set(targetId, level + 1);
        queue.push(targetId);
      }
      if (targetId === id && !depth.has(sourceId)) {
        depth.set(sourceId, level + 1);
        queue.push(sourceId);
      }
    }
  }

  return depth;
}

function computeTreeTargets(simNodes, simLinks) {
  const depth = bfsDepths(simNodes, simLinks);
  const levels = new Map();

  simNodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  });

  const targets = new Map();
  const maxDepth = Math.max(...levels.keys(), 0);
  const levelHeight = 130;
  const columnWidth = 140;

  levels.forEach((nodesAtLevel, level) => {
    const rowHalf = ((nodesAtLevel.length - 1) * columnWidth) / 2;
    nodesAtLevel.forEach((node, index) => {
      targets.set(node.id, {
        x: nodesAtLevel.length === 1 ? 0 : -rowHalf + index * columnWidth,
        y: -((maxDepth * levelHeight) / 2) + level * levelHeight,
      });
    });
  });

  return targets;
}

function computeRadialTargets(simNodes, simLinks) {
  const depth = bfsDepths(simNodes, simLinks);
  const levels = new Map();

  simNodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  });

  const radii = [0, 130, 230, 320, 395];
  const targets = new Map();

  levels.forEach((nodesAtLevel, level) => {
    const radius = radii[level] ?? 395;
    if (level === 0 && nodesAtLevel.length === 1) {
      targets.set(nodesAtLevel[0].id, { x: 0, y: 0 });
      return;
    }

    nodesAtLevel.forEach((node, index) => {
      const angle = ((2 * Math.PI * index) / nodesAtLevel.length) - (Math.PI / 2);
      targets.set(node.id, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    });
  });

  return targets;
}

export function GraphView({ onUnauthorized, onOpenNode, refreshKey }) {
  const { nodes, edges, stats, loading, error, refetch } = useGraph({ onUnauthorized, refreshKey });
  const svgRef = useRef(null);
  const stageCanvasRef = useRef(null);
  const graphRootRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const zoomScaleRef = useRef(1);
  const interactionModeRef = useRef('browse');
  const previousInteractionModeRef = useRef('browse');
  const searchQueryRef = useRef('');
  const svgSelectionRef = useRef(null);
  const simNodesRef = useRef([]);
  const simLinksRef = useRef([]);
  const nodePositionsRef = useRef(new Map());
  const fittedRef = useRef(false);
  const autoFrameRef = useRef(true);
  const selectedIdRef = useRef(null);
  const cardModeNodeIdRef = useRef(null);
  const pixiAppRef = useRef(null);
  const pixiViewportRef = useRef(null);
  const pixiEdgeGraphicsRef = useRef(null);
  const pixiNodeGraphicsRef = useRef(null);
  const pixiGlyphLayerRef = useRef(null);
  const pixiLabelLayerRef = useRef(null);
  const pixiAreaLayerRef = useRef(null);
  const pixiTextObjectsRef = useRef(new Map());
  const pixiAreaObjectsRef = useRef([]);
  const directoryClustersRef = useRef([]);
  const paletteRef = useRef(null);
  const matchedIdsRef = useRef(null);
  const neighborIdsRef = useRef(new Set());
  const renderStageRef = useRef(() => {});
  const renderFrameRef = useRef(0);
  const dragStateRef = useRef({
    node: null,
    startX: 0,
    startY: 0,
    moved: false,
  });

  const [selectedId, setSelectedId] = useState(null);
  const [interactionMode, setInteractionMode] = useState('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [layout, setLayout] = useState('force');
  const [cardModeNodeId, setCardModeNodeId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDocked, setChatDocked] = useState(false);
  const [mobilePanelState, setMobilePanelState] = useState('none');
  const [stageReady, setStageReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [graphSettings, setGraphSettings] = useState(DEFAULT_GRAPH_SETTINGS);
  const graphSettingsRef = useRef(DEFAULT_GRAPH_SETTINGS);
  const zoomDisplayRef = useRef(null);
  const zoomSliderRef = useRef(null);
  const lastZoomPercentRef = useRef(100);

  const degreeMap = useMemo(() => getNodeDegreeMap(nodes, edges), [nodes, edges]);
  const nodeMeta = useMemo(() => buildNodeMeta(nodes, edges, degreeMap), [nodes, edges, degreeMap]);
  const nodeIndex = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedId ? nodeIndex.get(selectedId) : null;
  const selectedMeta = selectedNode ? nodeMeta.get(selectedNode.id) : null;
  const cardModeNode = cardModeNodeId ? nodeIndex.get(cardModeNodeId) : null;
  const renderedGraph = useMemo(() => {
    if (interactionMode !== 'focus' && interactionMode !== 'card') {
      return { nodes, edges };
    }
    return buildFocusSubgraph(nodes, edges, selectedId);
  }, [edges, interactionMode, nodes, selectedId]);
  const cardViewRef = useRef(null);
  const cardGridRef = useRef(null);
  const cardTouchStartYRef = useRef(0);
  const exitingCardRef = useRef(false);
  const exitingCardZoomRef = useRef(false);

  const refreshMatchedIds = useCallback(() => {
    matchedIdsRef.current = buildMatchedNodeIdSet(simNodesRef.current, searchQueryRef.current);
  }, []);

  const refreshNeighborIds = useCallback(() => {
    neighborIdsRef.current = buildNeighborIdSet(selectedIdRef.current, simLinksRef.current);
  }, []);

  useEffect(() => {
    if (loading) return undefined;

    let disposed = false;
    let resizeObserver = null;

    const setup = async () => {
      if (!svgRef.current || !stageCanvasRef.current || pixiAppRef.current) return;

      const app = new Application();
      await app.init({
        canvas: stageCanvasRef.current,
        preference: 'webgl',
        antialias: true,
        autoDensity: true,
        resolution: getCanvasResolution(),
        backgroundAlpha: 0,
      });

      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      const viewport = new Container();
      const areaLayer = new Container();
      const areaCloudContainer = new Container();
      const areaLabelContainer = new Container();
      areaCloudContainer.filters = [new BlurFilter({ strength: 16, quality: 2 })];
      areaCloudContainer.blendMode = 'max';
      areaLayer.addChild(areaCloudContainer);
      areaLayer.addChild(areaLabelContainer);
      const edgeGraphics = new Graphics();
      const nodeGraphics = new Graphics();
      const glyphLayer = new Container();
      const labelLayer = new Container();

      viewport.addChild(areaLayer);
      viewport.addChild(edgeGraphics);
      viewport.addChild(nodeGraphics);
      viewport.addChild(glyphLayer);
      viewport.addChild(labelLayer);
      app.stage.addChild(viewport);

      pixiAppRef.current = app;
      pixiViewportRef.current = viewport;
      pixiAreaLayerRef.current = areaLayer;
      pixiEdgeGraphicsRef.current = edgeGraphics;
      pixiNodeGraphicsRef.current = nodeGraphics;
      pixiGlyphLayerRef.current = glyphLayer;
      pixiLabelLayerRef.current = labelLayer;
      svgSelectionRef.current = d3.select(svgRef.current);
      paletteRef.current = getGraphPalette(svgRef.current);

      const resizeRenderer = () => {
        if (!svgRef.current || !stageCanvasRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        app.renderer.resolution = getCanvasResolution();
        app.renderer.resize(width, height);
      };

      resizeRenderer();
      const ResizeObserverCtor = window.ResizeObserver ?? globalThis.ResizeObserver;
      if (ResizeObserverCtor) {
        resizeObserver = new ResizeObserverCtor(() => {
          resizeRenderer();
          renderStageRef.current();
        });
        resizeObserver.observe(svgRef.current);
      }
      setStageReady(true);

      renderStageRef.current();
    };

    setup();

    return () => {
      disposed = true;
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = 0;
      }
      pixiAppRef.current?.destroy(true, { children: true });
      pixiAppRef.current = null;
      pixiViewportRef.current = null;
      pixiAreaLayerRef.current = null;
      pixiEdgeGraphicsRef.current = null;
      pixiNodeGraphicsRef.current = null;
      pixiGlyphLayerRef.current = null;
      pixiLabelLayerRef.current = null;
      pixiTextObjectsRef.current = new Map();
      pixiAreaObjectsRef.current = [];
      directoryClustersRef.current = [];
      paletteRef.current = null;
      matchedIdsRef.current = null;
      neighborIdsRef.current = new Set();
      renderStageRef.current = () => {};
      setStageReady(false);
      resizeObserver?.disconnect();
    };
  }, [loading]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    refreshNeighborIds();
  }, [refreshNeighborIds, selectedId]);

  useEffect(() => {
    cardModeNodeIdRef.current = cardModeNodeId;
  }, [cardModeNodeId]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
    refreshMatchedIds();
    renderStageRef.current();
  }, [refreshMatchedIds, searchQuery]);

  useEffect(() => {
    const nextMode = getGraphInteractionMode({
      selectedId,
      zoomScale: zoomScaleRef.current,
      cardModeNodeId,
    });
    setInteractionMode((current) => (current === nextMode ? current : nextMode));
  }, [cardModeNodeId, selectedId]);

  const isMobileViewport = useCallback(() => typeof window !== 'undefined' && window.innerWidth <= 640, []);

  const handleToggleChatPanel = useCallback(() => {
    if (chatDocked) return;
    if (isMobileViewport()) {
      setMobilePanelState((prev) => (prev === 'chat' ? 'none' : 'chat'));
      return;
    }
    setChatOpen((prev) => !prev);
  }, [chatDocked, isMobileViewport]);

  const handleToggleChatPin = useCallback(() => {
    if (isMobileViewport()) return;
    setChatDocked((prev) => !prev);
    setChatOpen(true);
  }, [isMobileViewport]);

  const chatPanelOpen = chatDocked || (isMobileViewport() ? mobilePanelState === 'chat' : chatOpen);
  const chatPanelPeerOpen = !chatDocked && isMobileViewport() && mobilePanelState === 'chat';

  const updateGraphSetting = useCallback((key, value) => {
    setGraphSettings((prev) => {
      const next = { ...prev, [key]: value };
      graphSettingsRef.current = next;
      return next;
    });
  }, []);

  const handleZoomSlider = useCallback((event) => {
    const pct = Number(event.target.value);
    const scale = pct / 100;
    if (svgSelectionRef.current && zoomRef.current) {
      svgSelectionRef.current.transition().duration(200).call(zoomRef.current.scaleTo, scale);
    }
  }, []);

  const fitAll = useCallback(() => {
    const svgElement = svgRef.current;
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    const simNodesValue = simNodesRef.current;
    if (!svgElement || !svg || !zoom || !simNodesValue.length) return;

    const width = svgElement.clientWidth || svgElement.getBoundingClientRect().width;
    const height = svgElement.clientHeight || svgElement.getBoundingClientRect().height;
    if (!width || !height) return;

    const xs = simNodesValue.map((node) => node.x ?? 0);
    const ys = simNodesValue.map((node) => node.y ?? 0);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    const scale = Math.min((width * 0.62) / spanX, (height * 0.72) / spanY, 1.2);

    svg.transition()
      .duration(900)
      .ease(d3.easeCubicInOut)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy),
      );
  }, []);

  const requestAutoFrame = useCallback(() => {
    autoFrameRef.current = true;
  }, []);

  const preserveViewFrame = useCallback(() => {
    autoFrameRef.current = false;
  }, []);

  const settleFocusZoom = useCallback(() => {
    const svgElement = svgRef.current;
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !svg || !zoom) return;

    const width = svgElement.clientWidth || svgElement.getBoundingClientRect().width;
    const height = svgElement.clientHeight || svgElement.getBoundingClientRect().height;
    if (!width || !height) return;

    const currentTransform = d3.zoomTransform(svgElement);
    const settledScale = getFocusSettledScale(currentTransform.k);
    if (settledScale === currentTransform.k) return;

    const centerGraphX = currentTransform.invertX(width / 2);
    const centerGraphY = currentTransform.invertY(height / 2);

    svg.transition()
      .duration(360)
      .ease(d3.easeCubicOut)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(settledScale)
          .translate(-centerGraphX, -centerGraphY),
      );
  }, []);

  const focusNode = useCallback((node) => {
    const svgElement = svgRef.current;
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    const simLinksValue = simLinksRef.current;
    const simNodesValue = simNodesRef.current;
    if (!svgElement || !svg || !zoom || !node) return;

    const width = svgElement.clientWidth || svgElement.getBoundingClientRect().width;
    const height = svgElement.clientHeight || svgElement.getBoundingClientRect().height;
    const neighborIds = getNeighborIds(node.id, simLinksValue);
    const visible = simNodesValue.filter((candidate) => candidate.id === node.id || neighborIds.has(candidate.id));
    const minimumScale = interactionModeRef.current === 'focus' || interactionModeRef.current === 'card'
      ? ZOOM_FOCUS_IN
      : 0.3;

    if (visible.length <= 1) {
      svg.transition()
        .duration(680)
        .ease(d3.easeCubicInOut)
        .call(
          zoom.transform,
          d3.zoomIdentity
            .translate(width / 2, (height / 2) - 40)
            .scale(Math.max(1.8, minimumScale))
            .translate(-(node.x ?? 0), -(node.y ?? 0)),
        );
      return;
    }

    const xs = visible.map((candidate) => candidate.x ?? 0);
    const ys = visible.map((candidate) => candidate.y ?? 0);
    const bx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const by = (Math.min(...ys) + Math.max(...ys)) / 2;
    const bw = Math.max(...xs) - Math.min(...xs) + 110;
    const bh = Math.max(...ys) - Math.min(...ys) + 110;
    const scale = Math.min((width * 0.78) / Math.max(bw, 1), ((height - 120) * 0.78) / Math.max(bh, 1), 1.9);

    svg.transition()
      .duration(720)
      .ease(d3.easeCubicInOut)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2, (height / 2) - 30)
          .scale(Math.max(scale, minimumScale))
          .translate(-bx, -by),
      );
  }, []);

  const enterCardModeForSelected = useCallback(() => {
    if (!selectedIdRef.current || cardModeNodeIdRef.current) return;
    setCardModeNodeId(selectedIdRef.current);
  }, [setCardModeNodeId]);

  const applyBloom = useCallback((scale) => {
    zoomScaleRef.current = scale;
    renderStageRef.current();
  }, []);

  const resetBloom = useCallback(() => {
    renderStageRef.current();
  }, []);

  const applyVisualState = useCallback(() => {
    renderStageRef.current();
  }, []);

  const getCardNeighborNodes = useCallback((nodeId) => {
    if (!nodeId) return [];
    const neighbors = getNeighborIds(nodeId, simLinksRef.current);
    return nodes.filter((node) => neighbors.has(node.id));
  }, [nodes]);

  const animateCardTransition = useCallback((mode = 'enter', nodeId = cardModeNode?.id) => {
    const cardGrid = cardGridRef.current;
    const cardView = cardViewRef.current;
    const svgElement = svgRef.current;
    if (!cardGrid || !cardView || !svgElement || !nodeId) return;

    const tr = d3.zoomTransform(svgElement);
    const rect = svgElement.getBoundingClientRect();
    const neighbors = getCardNeighborNodes(nodeId);
    if (!neighbors.length) return;

    const posById = new Map();
    neighbors.forEach((node) => {
      const simNode = simNodesRef.current.find((candidate) => candidate.id === node.id);
      if (!simNode) return;

      posById.set(node.id, {
        x: rect.left + tr.applyX(simNode.x ?? 0),
        y: rect.top + tr.applyY(simNode.y ?? 0),
        r: getNodeRadius(simNode, degreeMap) * tr.k,
      });
    });

    const cards = [...cardGrid.querySelectorAll('.card-item')];
    if (!cards.length) return;

    cards.forEach((card) => {
      const nodeId = card.dataset.nodeId;
      const pos = posById.get(nodeId);
      if (!pos) return;
      const cr = card.getBoundingClientRect();
      const dx = pos.x - (cr.left + cr.width / 2);
      const dy = pos.y - (cr.top + cr.height / 2);
      const sc = Math.max((pos.r * 2) / Math.max(cr.width, 1) * 0.9, 0.05);

      if (mode === 'exit') {
        const delay = cards.indexOf(card) * 0.028;
        card.style.transition = [
          'transform 0.42s cubic-bezier(0.4,0,0.6,1) ' + delay + 's',
          'border-radius 0.28s ease ' + delay + 's',
          'opacity 0.2s ease ' + delay + 's',
        ].join(',');
        card.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')';
        card.style.borderRadius = '50%';
        card.style.opacity = '0';
        card.style.overflow = 'hidden';
      } else {
        card.style.animation = 'none';
        card.style.transition = 'none';
        card.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')';
        card.style.borderRadius = '50%';
        card.style.opacity = '0';
        card.style.overflow = 'hidden';
      }
    });

    if (mode === 'enter') {
      cardView.style.opacity = '0';
      cardView.style.transition = 'none';
      cardView.offsetHeight;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          cardView.style.transition = 'opacity 0.22s ease';
          cardView.style.opacity = '1';
          const maxDelay = (cards.length - 1) * 0.05 + 0.65;
          cards.forEach((card, index) => {
            const d = index * 0.05;
            card.style.transition = [
              'transform 0.65s cubic-bezier(0.34,1.56,0.64,1) ' + d + 's',
              'border-radius 0.4s ease ' + (d + 0.05) + 's',
              'opacity 0.32s ease ' + d * 0.4 + 's',
            ].join(',');
            card.style.transform = '';
            card.style.borderRadius = '14px';
            card.style.opacity = '1';
            card.style.overflow = '';
          });

          setTimeout(() => {
            cards.forEach((card) => card.classList.add('flip-done'));
          }, maxDelay * 1000);
        });
      });
    }
  }, [cardModeNode?.id, degreeMap, getCardNeighborNodes]);

  const exitCardMode = useCallback(() => {
    const currentCardNodeId = cardModeNodeIdRef.current;
    const cardView = cardViewRef.current;
    if (!currentCardNodeId || exitingCardRef.current) return;

    animateCardTransition('exit', currentCardNodeId);
    exitingCardRef.current = true;
    exitingCardZoomRef.current = true;
    if (cardView) {
      cardView.style.transition = 'opacity 0.28s ease 0.18s';
      cardView.style.opacity = '0';
    }

    setTimeout(() => {
      setCardModeNodeId(null);
      exitingCardRef.current = false;
      cardGridRef.current?.querySelectorAll('.card-item').forEach((card) => {
        card.style.cssText = '';
        card.classList.remove('flip-done');
      });
      if (cardView) {
        cardView.style.opacity = '';
        cardView.style.transition = '';
      }

      const zoom = zoomRef.current;
      const svgElement = svgRef.current;
      if (zoom && svgElement) {
        d3.select(svgElement)
          .transition()
          .duration(520)
          .ease(d3.easeCubicOut)
          .call(zoom.scaleTo, ZOOM_CARD_IN * 0.62)
          .on('end', () => {
            exitingCardZoomRef.current = false;
          });
      }
    }, 480);
  }, [animateCardTransition]);

  const handleCardBack = useCallback(() => {
    if (cardModeNodeId) {
      exitCardMode();
    }
  }, [cardModeNodeId, exitCardMode]);

  const handleCardWheel = useCallback((event) => {
    if (event.deltaY > 0) {
      exitCardMode();
    }
  }, [exitCardMode]);

  const handleCardTouchStart = useCallback((event) => {
    const next = event.touches?.[0]?.clientY;
    if (typeof next === 'number') {
      cardTouchStartYRef.current = next;
    }
  }, []);

  const handleCardTouchEnd = useCallback((event) => {
    const startY = cardTouchStartYRef.current;
    const endY = event.changedTouches?.[0]?.clientY;
    if (typeof startY !== 'number' || typeof endY !== 'number') return;

    const deltaY = endY - startY;
    const cardGrid = cardGridRef.current;
    if (deltaY > 72 && cardGrid && cardGrid.scrollTop === 0) {
      exitCardMode();
    }
  }, [exitCardMode]);

  useEffect(() => {
    if (!cardModeNodeId) return;
    if (exitingCardRef.current) return;
    animateCardTransition('enter', cardModeNodeId);
  }, [animateCardTransition, cardModeNodeId]);

  useEffect(() => {
    if (!stageReady || loading || error || !renderedGraph.nodes.length || !svgRef.current || !pixiAppRef.current) return undefined;

    fittedRef.current = false;
    const host = svgRef.current;
    let paletteObserver = null;
    host.dataset.webglEffect = 'entered';
    const hostSelection = d3.select(host);
    svgSelectionRef.current = hostSelection;
    paletteRef.current = getGraphPalette(host);

    const app = pixiAppRef.current;
    const viewport = pixiViewportRef.current;
    const edgeGraphics = pixiEdgeGraphicsRef.current;
    const nodeGraphics = pixiNodeGraphicsRef.current;
    const glyphLayer = pixiGlyphLayerRef.current;
    const labelLayer = pixiLabelLayerRef.current;
    const areaLayer = pixiAreaLayerRef.current;
    if (!app || !viewport || !edgeGraphics || !nodeGraphics || !glyphLayer || !labelLayer || !areaLayer) return undefined;

    const hostRect = host.getBoundingClientRect();
    app.renderer.resolution = getCanvasResolution();
    app.renderer.resize(Math.max(1, Math.round(hostRect.width)), Math.max(1, Math.round(hostRect.height)));

    graphRootRef.current = viewport;
    glyphLayer.removeChildren();
    labelLayer.removeChildren();
    pixiTextObjectsRef.current = new Map();

    const simNodes = renderedGraph.nodes.map((node, index) => {
      const preservedPosition = nodePositionsRef.current.get(node.id);
      return {
        ...node,
        title: node.title ?? node.name ?? node.id,
        name: node.name ?? node.title ?? node.id,
        path: node.path ?? node.id,
        searchTitle: String(node.title ?? node.name ?? node.id).toLowerCase(),
        x: typeof preservedPosition?.x === 'number'
          ? preservedPosition.x
          : typeof node.x === 'number'
            ? node.x
            : Math.cos(index) * 120,
        y: typeof preservedPosition?.y === 'number'
          ? preservedPosition.y
          : typeof node.y === 'number'
            ? node.y
            : Math.sin(index) * 120,
      };
    });
    const nodeIds = new Set(simNodes.map((node) => node.id));
    const simLinks = renderedGraph.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ ...edge }));

    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;

    simNodes.forEach((node) => {
      const visualType = getNodeType(node, degreeMap);
      const glyphText = visualType === 'dir'
        ? 'folder'
        : visualType === 'hub'
          ? String(degreeMap.get(node.id) || 0)
          : 'article';

      const glyph = new Text({
        text: glyphText,
        anchor: 0.5,
        style: {
          fontFamily: visualType === 'hub' ? 'Inter, sans-serif' : 'Material Symbols Outlined',
          fontSize: visualType === 'dir' ? 13 : 8,
          fontWeight: visualType === 'hub' ? '700' : '400',
          fill: '#ffffff',
        },
      });
      const label = new Text({
        text: node.title.length > 16 ? `${node.title.slice(0, 15)}…` : node.title,
        anchor: { x: 0.5, y: 0 },
        style: {
          fontFamily: 'Lexend, Inter, sans-serif',
          fontSize: visualType === 'dir' ? 10.5 : visualType === 'hub' ? 9.5 : 9,
          fontWeight: visualType === 'dir' ? '700' : visualType === 'hub' ? '600' : '400',
          fill: '#ffffff',
        },
      });
      glyph.eventMode = 'none';
      label.eventMode = 'none';
      glyphLayer.addChild(glyph);
      labelLayer.addChild(label);
      pixiTextObjectsRef.current.set(node.id, { glyph, label, visualType });
    });

    const areaCloudContainer = areaLayer.children[0];
    const areaLabelContainer = areaLayer.children[1];
    areaCloudContainer.removeChildren();
    areaLabelContainer.removeChildren();
    const clusters = buildDirectoryClusters(renderedGraph.nodes, renderedGraph.edges);
    const nodeById = new Map(simNodes.map((n) => [n.id, n]));
    const areaObjects = clusters.map((cluster) => {
      const bg = new Graphics();
      bg.eventMode = 'none';
      areaCloudContainer.addChild(bg);
      const areaLabel = new Text({
        text: cluster.name,
        anchor: 0.5,
        style: {
          fontFamily: '"Nanum Myeongjo", Georgia, "Palatino Linotype", Palatino, "Times New Roman", serif',
          fontSize: Math.max(30, 72 - cluster.depth * 16),
          fontWeight: '400',
          fontStyle: 'italic',
          fill: '#1a0f0a',
        },
      });
      areaLabel.eventMode = 'none';
      areaLabelContainer.addChild(areaLabel);
      const members = [...cluster.memberIds].map((id) => nodeById.get(id)).filter(Boolean);
      return {
        ...cluster,
        bg,
        areaLabel,
        members,
        _cx: 0,
        _cy: 0,
        _rx: 0,
        _ry: 0,
        _geometryDirty: true,
      };
    });
    directoryClustersRef.current = clusters;
    pixiAreaObjectsRef.current = areaObjects;
    updateAreaBounds(areaObjects);
    refreshMatchedIds();
    refreshNeighborIds();

    const physicsProfile = getGraphPhysicsProfile({
      interactionMode: interactionModeRef.current,
      selectedId: selectedIdRef.current,
    });
    const focusAnchorNode = physicsProfile.pinSelectedNode
      ? simNodes.find((node) => node.id === selectedIdRef.current) || null
      : null;

    if (focusAnchorNode) {
      focusAnchorNode.fx = focusAnchorNode.x ?? 0;
      focusAnchorNode.fy = focusAnchorNode.y ?? 0;
    }

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks).id((datum) => datum.id).distance(physicsProfile.linkDistance).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(0, 0).strength(physicsProfile.centerStrength))
      .force('collision', d3.forceCollide().radius((datum) => getNodeRadius(datum, degreeMap, interactionModeRef.current) + 12).strength(0.58))
      .alphaDecay(physicsProfile.alphaDecay)
      .velocityDecay(physicsProfile.velocityDecay);
    simulationRef.current = simulation;

    const renderStage = () => {
      const palette = paletteRef.current ?? getGraphPalette(host);
      const selectedNodeId = selectedIdRef.current;
      const matchedIds = matchedIdsRef.current;
      const neighborIds = neighborIdsRef.current;
      const isFocusedContext = interactionModeRef.current === 'focus' || interactionModeRef.current === 'card';
      const zk = zoomScaleRef.current;
      const bloomProgress = clamp((zk - ZOOM_BLOOM) / (ZOOM_CARD_IN - ZOOM_BLOOM), 0, 1);

      edgeGraphics.clear();
      nodeGraphics.clear();

      simLinksRef.current.forEach((edge) => {
        const source = edge.source;
        const target = edge.target;
        let opacity = 1;
        if (selectedNodeId && isFocusedContext) opacity = 1;
        else if (selectedNodeId) opacity = source.id === selectedNodeId || target.id === selectedNodeId ? 1 : 0.05;
        else if (matchedIds) opacity = matchedIds.has(source.id) && matchedIds.has(target.id) ? 0.8 : 0.04;

        if (opacity <= 0.01) return;

        const tone = edge.edge_type === 'directory'
          ? palette.linkDir
          : edge.edge_type === 'wikilink'
            ? palette.linkWiki
            : palette.linkRef;

        if (edge.edge_type === 'ref') {
          drawDashedLine(edgeGraphics, source.x ?? 0, source.y ?? 0, target.x ?? 0, target.y ?? 0);
        } else {
          edgeGraphics.moveTo(source.x ?? 0, source.y ?? 0);
          edgeGraphics.lineTo(target.x ?? 0, target.y ?? 0);
        }
        edgeGraphics.stroke({
          width: edge.edge_type === 'directory' ? 1.6 : 1.1,
          color: tone.color,
          alpha: tone.alpha * opacity,
        });
      });

      simNodesRef.current.forEach((node) => {
        const radius = getNodeRadius(node, degreeMap, interactionModeRef.current);
        const visualType = getNodeType(node, degreeMap);
        const isSelected = node.id === selectedNodeId;
        const nodeOpacity = selectedNodeId
          ? isFocusedContext
            ? 1
            : neighborIds.has(node.id) ? 1 : 0.1
          : matchedIds
            ? matchedIds.has(node.id) ? 1 : 0.08
            : 1;

        const bloomRadius = radius * getBloomRadiusMultiplier({
          isSelected,
          isNeighbor: neighborIds.has(node.id),
          progress: bloomProgress,
        });

        if (isSelected) {
          const ringTone = visualType === 'dir' ? palette.hubSel : visualType === 'hub' ? palette.hubSel : palette.docSel;
          drawDashedCircle(nodeGraphics, node.x ?? 0, node.y ?? 0, bloomRadius + 7);
          nodeGraphics.stroke({
            width: 1.5,
            color: ringTone.color,
            alpha: ringTone.alpha,
          });
        }

        const fillTone = visualType === 'dir' ? palette.dirFill : visualType === 'hub' ? palette.hubFill : palette.docFill;
        const strokeTone = visualType === 'dir' ? palette.dirStroke : visualType === 'hub' ? palette.hubStroke : palette.docStroke;
        nodeGraphics.circle(node.x ?? 0, node.y ?? 0, bloomRadius);
        nodeGraphics.fill({ color: fillTone.color, alpha: fillTone.alpha * nodeOpacity });
        nodeGraphics.stroke({
          width: visualType === 'dir' ? 1.5 : visualType === 'hub' ? 1.8 : 1.2,
          color: strokeTone.color,
          alpha: strokeTone.alpha * nodeOpacity,
        });

        const textPair = pixiTextObjectsRef.current.get(node.id);
        if (!textPair) return;

        updateTint(textPair.glyph, visualType === 'dir'
          ? palette.dirIcon
          : visualType === 'hub'
            ? palette.hubNum
            : palette.docIcon);
        updateTint(textPair.label, visualType === 'dir'
          ? palette.dirLabel
          : visualType === 'hub'
            ? palette.hubLabel
            : palette.docLabel);
        textPair.glyph.x = node.x ?? 0;
        textPair.glyph.y = node.y ?? 0;
        textPair.glyph.alpha = nodeOpacity;
        textPair.label.x = node.x ?? 0;
        textPair.label.y = (node.y ?? 0) + bloomRadius + 12;
        textPair.label.alpha = nodeOpacity;
        const lsScale = graphSettingsRef.current.labelShowStart / DOC_LABEL_THRESHOLD;
        const glyphThreshold = (visualType === 'doc' ? DOC_GLYPH_THRESHOLD
          : visualType === 'hub' ? HUB_GLYPH_THRESHOLD : DIR_GLYPH_THRESHOLD) * lsScale;
        const labelThreshold = (visualType === 'doc' ? DOC_LABEL_THRESHOLD
          : visualType === 'hub' ? HUB_LABEL_THRESHOLD : DIR_LABEL_THRESHOLD) * lsScale;
        textPair.glyph.visible = zk >= glyphThreshold || isSelected;
        textPair.label.visible = zk >= labelThreshold || isSelected || Boolean(matchedIds?.has(node.id));
      });

      const areaObjs = pixiAreaObjectsRef.current;
      if (areaObjs.length > 0) {
        const gs = graphSettingsRef.current;
        const FADE_RANGE = 0.08;
        const fadeT = clamp((zk - (gs.phase1Start - FADE_RANGE)) / (2 * FADE_RANGE), 0, 1);
        const phase2UpperFade = clamp(1 - (zk - (gs.phase2FadeEnd - FADE_RANGE)) / (2 * FADE_RANGE), 0, 1);
        const phase1TextAlpha = gs.areaLabelAlpha * (1 - fadeT);
        const phase2TextAlpha = gs.areaLabelAlpha * fadeT * phase2UpperFade;
        const p1BgFade = 1 - fadeT * 0.6;
        const p2BgFade = clamp(fadeT / 0.6, 0, 1);

        for (let ai = 0; ai < areaObjs.length; ai++) {
          const area = areaObjs[ai];
          const isP2 = area.depth >= 2;
          const bgVisible = area.members.length >= 2 && (!isP2 || zk > gs.phase1Start - FADE_RANGE);
          area.bg.visible = bgVisible;

          if (!bgVisible) { area.areaLabel.visible = false; continue; }

          if (area._geometryDirty) {
            area.bg.clear();
            area.bg.ellipse(area._cx, area._cy, area._rx, area._ry);
            area.bg.fill({ color: area.color, alpha: 0.10 + area.depth * 0.02 });
            area._geometryDirty = false;
          }

          area.bg.alpha = isP2 ? p2BgFade : p1BgFade;

          const targetFontSize = isP2
            ? Math.max(24, gs.areaFontSizeP2 - (area.depth - 2) * 12)
            : Math.max(30, gs.areaFontSizeP1 - area.depth * 16);
          if (area.areaLabel.style.fontSize !== targetFontSize) {
            area.areaLabel.style.fontSize = targetFontSize;
          }

          const textAlpha = isP2 ? phase2TextAlpha : phase1TextAlpha;
          area.areaLabel.x = area._cx;
          area.areaLabel.y = area._cy;
          area.areaLabel.alpha = textAlpha;
          area.areaLabel.visible = textAlpha > 0.01;
        }
      }

      const zoomPercent = Math.round(zk * 100);
      if (lastZoomPercentRef.current !== zoomPercent) {
        lastZoomPercentRef.current = zoomPercent;
        if (zoomDisplayRef.current) {
          zoomDisplayRef.current.textContent = `${zoomPercent}%`;
        }
        if (zoomSliderRef.current) {
          zoomSliderRef.current.value = String(zoomPercent);
        }
      }

      app.render();
    };

    const requestRender = () => {
      if (renderFrameRef.current) return;
      renderFrameRef.current = requestAnimationFrame(() => {
        renderFrameRef.current = 0;
        renderStage();
      });
    };

    renderStageRef.current = requestRender;

    const graphPointFromClient = (clientX, clientY) => {
      const rect = host.getBoundingClientRect();
      const transform = d3.zoomTransform(host);
      return {
        x: transform.invertX(clientX - rect.left),
        y: transform.invertY(clientY - rect.top),
      };
    };

    const pickNode = (clientX, clientY) => {
      const point = graphPointFromClient(clientX, clientY);
      for (let index = simNodesRef.current.length - 1; index >= 0; index -= 1) {
        const node = simNodesRef.current[index];
        const radius = getNodeRadius(node, degreeMap, interactionModeRef.current) + 8;
        const dx = (node.x ?? 0) - point.x;
        const dy = (node.y ?? 0) - point.y;
        if ((dx * dx) + (dy * dy) <= radius * radius) return node;
      }
      return null;
    };

    const safeClearGraphics = (graphics) => {
      if (!graphics) return;
      try {
        graphics.clear();
      } catch {
        // Graphics may already be destroyed during a layout swap.
      }
    };

    const zoom = d3.zoom()
      .scaleExtent([0.08, 5])
      .on('zoom', (event) => {
        if (!viewport?.position?.set || !viewport?.scale?.set) {
          return;
        }

        viewport.position.set(event.transform.x, event.transform.y);
        viewport.scale.set(event.transform.k);

        const { k } = event.transform;
        zoomScaleRef.current = k;
        const nextMode = getGraphInteractionMode({
          selectedId: selectedIdRef.current,
          zoomScale: k,
          cardModeNodeId: cardModeNodeIdRef.current,
        });
        setInteractionMode((current) => (current === nextMode ? current : nextMode));

        if (cardModeNodeIdRef.current || exitingCardRef.current) {
          if (exitingCardZoomRef.current && k < ZOOM_CARD_IN) {
            exitingCardZoomRef.current = false;
          }
          requestRender();
          return;
        }

        if (exitingCardZoomRef.current) {
          if (k < ZOOM_CARD_IN) {
            exitingCardZoomRef.current = false;
          } else {
            requestRender();
            return;
          }
        }

        if (!selectedIdRef.current) {
          resetBloom();
          requestRender();
          return;
        }

        if (k >= ZOOM_CARD_IN) {
          enterCardModeForSelected();
          requestRender();
          return;
        }

        if (k >= ZOOM_BLOOM) {
          applyBloom(k);
        } else {
          resetBloom();
        }
        requestRender();
      });

    hostSelection.call(zoom).on('dblclick.zoom', null);
    zoomRef.current = zoom;
    host.dataset.webglEffect = 'zoom-bound';
    paletteObserver = new MutationObserver(() => {
      paletteRef.current = getGraphPalette(host);
      requestRender();
    });
    paletteObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    paletteObserver.observe(host, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    const handlePointerDown = (event) => {
      const hit = pickNode(event.clientX, event.clientY);
      dragStateRef.current = {
        node: hit,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      if (hit && layout === 'force') {
        hit.fx = hit.x;
        hit.fy = hit.y;
        simulation.alphaTarget(0.2).restart();
      }
    };

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState.node) return;

      const point = graphPointFromClient(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) {
        dragState.moved = true;
      }
      dragState.node.fx = point.x;
      dragState.node.fy = point.y;
      if (layout !== 'force') {
        dragState.node.x = point.x;
        dragState.node.y = point.y;
        nodePositionsRef.current.set(dragState.node.id, { x: point.x, y: point.y });
        updateAreaBounds(pixiAreaObjectsRef.current);
        requestRender();
      }
    };

    const handlePointerUp = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState.node) {
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 4) {
          preserveViewFrame();
          setSelectedId(null);
          setCardModeNodeId(null);
        }
        dragStateRef.current = { node: null, startX: 0, startY: 0, moved: false };
        return;
      }

      if (layout === 'force') {
        simulation.alphaTarget(0);
        dragState.node.fx = null;
        dragState.node.fy = null;
      } else {
        dragState.node.fx = null;
        dragState.node.fy = null;
      }

      if (!dragState.moved) {
        preserveViewFrame();
        setCardModeNodeId(null);
        setSelectedId(dragState.node.id);
        if (d3.zoomTransform(host).k >= ZOOM_CARD_IN) {
          setCardModeNodeId(dragState.node.id);
        }
      }

      dragStateRef.current = { node: null, startX: 0, startY: 0, moved: false };
    };

    host.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    requestAnimationFrame(() => {
      if (!selectedIdRef.current && !fittedRef.current) {
        fitAll();
      }
      requestRender();
    });

    simulation.on('tick', () => {
      simNodes.forEach((node) => {
        nodePositionsRef.current.set(node.id, { x: node.x, y: node.y });
      });
      updateAreaBounds(pixiAreaObjectsRef.current);
      requestRender();
    });
    host.dataset.webglEffect = 'simulation-ready';

    simulation.on('end', () => {
      if (fittedRef.current) return;
      fittedRef.current = true;

      const endAction = getGraphEndAction({
        selectedId: selectedIdRef.current,
        interactionMode: interactionModeRef.current,
        autoFrameRequested: autoFrameRef.current,
      });

      if (endAction === 'focus') {
        if (shouldPreserveViewportOnFocusTransition({
          previousInteractionMode: previousInteractionModeRef.current,
          interactionMode: interactionModeRef.current,
          selectedId: selectedIdRef.current,
        })) {
          settleFocusZoom();
          return;
        }
        focusNode(simNodesRef.current.find((node) => node.id === selectedIdRef.current));
        return;
      }

      if (endAction === 'fit') {
        fitAll();
      }
    });

    requestRender();

    return () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = 0;
      }
      simulation.stop();
      hostSelection.on('.zoom', null);
      host.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      paletteObserver?.disconnect();
      glyphLayer.removeChildren();
      labelLayer.removeChildren();
      if (areaLayer.children[0]) areaLayer.children[0].removeChildren();
      if (areaLayer.children[1]) areaLayer.children[1].removeChildren();
      pixiTextObjectsRef.current = new Map();
      pixiAreaObjectsRef.current = [];
      directoryClustersRef.current = [];
      safeClearGraphics(edgeGraphics);
      safeClearGraphics(nodeGraphics);
    };
  }, [
    applyBloom,
    applyVisualState,
    degreeMap,
    enterCardModeForSelected,
    fitAll,
    focusNode,
    layout,
    loading,
    error,
    preserveViewFrame,
    renderedGraph.edges,
    renderedGraph.nodes,
    refreshMatchedIds,
    refreshNeighborIds,
    resetBloom,
    settleFocusZoom,
    stageReady,
  ]);

  useEffect(() => {
    applyVisualState();
    if (!selectedNode) {
      resetBloom();
      return;
    }

    if (!shouldFocusSelectedNode({ selectedId: selectedNode.id, interactionMode })) {
      resetBloom();
      return;
    }

    if (shouldPreserveViewportOnFocusTransition({
      previousInteractionMode: previousInteractionModeRef.current,
      interactionMode,
      selectedId: selectedNode.id,
    })) {
      resetBloom();
      settleFocusZoom();
      return;
    }

    preserveViewFrame();
    focusNode(simNodesRef.current.find((node) => node.id === selectedNode.id) || selectedNode);
  }, [applyVisualState, focusNode, interactionMode, preserveViewFrame, resetBloom, selectedNode, settleFocusZoom]);

  useEffect(() => {
    previousInteractionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    const s = graphSettings;
    sim.force('charge')?.strength(s.chargeStrength);
    sim.force('link')?.distance(s.linkDistance).strength(s.linkStrength);
    sim.force('center')?.strength(s.centerStrength);
    sim.alpha(0.3).restart();
  }, [graphSettings]);

  useEffect(() => {
    if (!simulationRef.current) return;
    requestAutoFrame();
    if (layout === 'force') {
      simNodesRef.current.forEach((node) => {
        node.fx = null;
        node.fy = null;
      });
      simulationRef.current.alpha(0.55).restart();
      renderStageRef.current();
      window.setTimeout(() => fitAll(), 1300);
      return undefined;
    }

    const targets = layout === 'tree'
      ? computeTreeTargets(simNodesRef.current, simLinksRef.current)
      : computeRadialTargets(simNodesRef.current, simLinksRef.current);

    const startX = new Map(simNodesRef.current.map((node) => [node.id, node.x]));
    const startY = new Map(simNodesRef.current.map((node) => [node.id, node.y]));
    const startedAt = performance.now();
    const duration = 700;

    simulationRef.current.stop();

    let frame = 0;
    const animate = () => {
      const progress = Math.min((performance.now() - startedAt) / duration, 1);
      const eased = d3.easeCubicInOut(progress);

      simNodesRef.current.forEach((node) => {
        const target = targets.get(node.id) || { x: node.x, y: node.y };
        node.x = startX.get(node.id) + ((target.x ?? node.x) - startX.get(node.id)) * eased;
        node.y = startY.get(node.id) + ((target.y ?? node.y) - startY.get(node.id)) * eased;
        nodePositionsRef.current.set(node.id, { x: node.x, y: node.y });
      });
      updateAreaBounds(pixiAreaObjectsRef.current);
      renderStageRef.current();

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        window.setTimeout(() => {
          if (selectedIdRef.current && (interactionModeRef.current === 'focus' || interactionModeRef.current === 'card')) {
            focusNode(simNodesRef.current.find((node) => node.id === selectedIdRef.current));
            return;
          }
          fitAll();
        }, 60);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [fitAll, focusNode, layout, requestAutoFrame]);

  const legendRows = [
    { label: 'Directory', swatchClass: 'legend-swatch legend-swatch-dir' },
    { label: 'Wikilink', swatchClass: 'legend-swatch legend-swatch-wiki' },
    { label: 'Reference', swatchClass: 'legend-swatch legend-swatch-ref' },
  ];

  const breadcrumbItems = selectedNode ? buildBreadcrumb(selectedNode, nodeIndex) : [];
  const cardNodes = cardModeNode ? getCardNeighborNodes(cardModeNode.id) : [];

  if (loading) {
    return (
      <div className="graph-loading">
        <div className="graph-loading-spinner" />
        <span>그래프 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-loading graph-loading--error">
        <span className="icon">error_outline</span>
        <p>{error}</p>
        <button onClick={refetch}>다시 시도</button>
      </div>
    );
  }

  return (
    <>
      <div className={`shell${chatDocked ? ' chat-docked' : ''}`} id="shell">
        <div className="graph-stage" ref={svgRef} data-stage-ready={stageReady ? 'yes' : 'no'}>
          <canvas className="graph-canvas" ref={stageCanvasRef} />
        </div>

        <div className="toolbar">
          <div className="toolbar-side">
            <button className="tb-cir" title="필터">
              <span className="icon" style={{ fontSize: 17 }}>filter_list</span>
            </button>
            <button className="tb-cir" title="레이아웃" onClick={() => {
              const index = LAYOUTS.indexOf(layout);
              setLayout(LAYOUTS[(index + 1) % LAYOUTS.length]);
            }}>
              <span className="icon" style={{ fontSize: 17 }}>{LAYOUT_META[layout].icon}</span>
            </button>
          </div>
          <div className="toolbar-side">
            <div className="zoom-pill">
              <button className="tb-cir" onClick={() => svgSelectionRef.current?.transition().duration(320).call(zoomRef.current.scaleBy, 1.3)}>
                <span className="icon" style={{ fontSize: 17 }}>add</span>
              </button>
              <div className="tb-divider" />
              <button className="tb-cir" onClick={() => svgSelectionRef.current?.transition().duration(320).call(zoomRef.current.scaleBy, 0.77)}>
                <span className="icon" style={{ fontSize: 17 }}>remove</span>
              </button>
            </div>
            <button className="tb-cir" onClick={fitAll}>
              <span className="icon" style={{ fontSize: 17 }}>fit_screen</span>
            </button>
          </div>
        </div>

        <div className="search-bar">
          <span className="icon">search</span>
          <input
            id="searchInput"
            placeholder="노드 검색…"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className={`graph-breadcrumb${selectedNode ? ' visible' : ''}`}>
          {selectedNode && (
            <>
              <span className="crumb" onClick={() => setSelectedId(null)}>그래프</span>
              {breadcrumbItems.map((item, index) => (
                <span key={item.id} className="crumb-group">
                  <span className="crumb-sep">chevron_right</span>
                  <span
                    className={`crumb${index === breadcrumbItems.length - 1 ? ' active' : ''}`}
                    onClick={() => {
                      if (index === breadcrumbItems.length - 1) return;
                      setSelectedId(item.id);
                    }}
                  >
                    {item.name}
                  </span>
                </span>
              ))}
            </>
          )}
        </div>

        <div className={`stats${selectedNode ? ' merging' : ''}`}>
          <div className="stat-chip">
            <span className="icon">scatter_plot</span>
            <strong>{stats?.nodes ?? nodes.length}</strong> 노드
          </div>
          <div className="stat-chip">
            <span className="icon">share</span>
            <strong>{stats?.edges ?? edges.length}</strong> 연결
          </div>
        </div>

        <div className="legend">
          <div className="legend-title">Legend</div>
          {legendRows.map((row) => (
            <div className="legend-row" key={row.label}>
              <span className={row.swatchClass} />
              {row.label}
            </div>
          ))}
        </div>

        <div className="zoom-panel">
          <span className="zoom-pct" ref={zoomDisplayRef}>100%</span>
          <div className="zoom-slider-wrap">
            <input
              type="range"
              className="zoom-slider-v"
              min="8"
              max="500"
              defaultValue="100"
              ref={zoomSliderRef}
              onChange={handleZoomSlider}
            />
          </div>
          <button
            className={`tb-cir${showSettings ? ' active' : ''}`}
            onClick={() => setShowSettings((s) => !s)}
            title="그래프 설정"
          >
            <span className="icon" style={{ fontSize: 17 }}>tune</span>
          </button>
        </div>

        {showSettings && (
          <div className="graph-settings-card">
            <div className="gs-header">
              <span className="gs-title">그래프 설정</span>
              <button className="gs-close" onClick={() => setShowSettings(false)}>
                <span className="icon" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>

            <div className="gs-section">
              <div className="gs-section-title">영역 라벨 전환</div>
              <label className="gs-row">
                <span className="gs-label">Phase 1 시작</span>
                <input type="range" min="0.05" max="0.60" step="0.01" value={graphSettings.phase1Start}
                  onChange={(e) => updateGraphSetting('phase1Start', +e.target.value)} />
                <span className="gs-value">{graphSettings.phase1Start.toFixed(2)}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">Phase 2 끝</span>
                <input type="range" min="0.30" max="1.00" step="0.01" value={graphSettings.phase2FadeEnd}
                  onChange={(e) => updateGraphSetting('phase2FadeEnd', +e.target.value)} />
                <span className="gs-value">{graphSettings.phase2FadeEnd.toFixed(2)}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">글자 표시</span>
                <input type="range" min="0.30" max="1.50" step="0.01" value={graphSettings.labelShowStart}
                  onChange={(e) => updateGraphSetting('labelShowStart', +e.target.value)} />
                <span className="gs-value">{graphSettings.labelShowStart.toFixed(2)}</span>
              </label>
            </div>

            <div className="gs-section">
              <div className="gs-section-title">영역 라벨 스타일</div>
              <label className="gs-row">
                <span className="gs-label">Phase 1 크기</span>
                <input type="range" min="20" max="120" step="2" value={graphSettings.areaFontSizeP1}
                  onChange={(e) => updateGraphSetting('areaFontSizeP1', +e.target.value)} />
                <span className="gs-value">{graphSettings.areaFontSizeP1}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">Phase 2 크기</span>
                <input type="range" min="16" max="80" step="2" value={graphSettings.areaFontSizeP2}
                  onChange={(e) => updateGraphSetting('areaFontSizeP2', +e.target.value)} />
                <span className="gs-value">{graphSettings.areaFontSizeP2}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">글자 투명도</span>
                <input type="range" min="0.10" max="1.00" step="0.02" value={graphSettings.areaLabelAlpha}
                  onChange={(e) => updateGraphSetting('areaLabelAlpha', +e.target.value)} />
                <span className="gs-value">{graphSettings.areaLabelAlpha.toFixed(2)}</span>
              </label>
            </div>

            <div className="gs-section">
              <div className="gs-section-title">물리 시뮬레이션</div>
              <label className="gs-row">
                <span className="gs-label">반발력</span>
                <input type="range" min="-600" max="-30" step="10" value={graphSettings.chargeStrength}
                  onChange={(e) => updateGraphSetting('chargeStrength', +e.target.value)} />
                <span className="gs-value">{graphSettings.chargeStrength}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">링크 길이</span>
                <input type="range" min="30" max="250" step="5" value={graphSettings.linkDistance}
                  onChange={(e) => updateGraphSetting('linkDistance', +e.target.value)} />
                <span className="gs-value">{graphSettings.linkDistance}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">링크 인력</span>
                <input type="range" min="0.05" max="1.50" step="0.05" value={graphSettings.linkStrength}
                  onChange={(e) => updateGraphSetting('linkStrength', +e.target.value)} />
                <span className="gs-value">{graphSettings.linkStrength.toFixed(2)}</span>
              </label>
              <label className="gs-row">
                <span className="gs-label">중력</span>
                <input type="range" min="0.00" max="0.20" step="0.005" value={graphSettings.centerStrength}
                  onChange={(e) => updateGraphSetting('centerStrength', +e.target.value)} />
                <span className="gs-value">{graphSettings.centerStrength.toFixed(3)}</span>
              </label>
            </div>

            <button className="gs-reset" onClick={() => {
              setGraphSettings(DEFAULT_GRAPH_SETTINGS);
              graphSettingsRef.current = DEFAULT_GRAPH_SETTINGS;
            }}>
              <span className="icon" style={{ fontSize: 14 }}>restart_alt</span>
              초기화
            </button>
          </div>
        )}

        <div className={`card-view${cardModeNode ? '' : ' hidden'}`} ref={cardViewRef} onWheel={handleCardWheel} onTouchStart={handleCardTouchStart} onTouchEnd={handleCardTouchEnd}>
          <div className="card-view-header">
            <button className="card-back" onClick={handleCardBack}>
              <span className="icon" style={{ fontSize: 17 }}>arrow_back</span>
            </button>
            <span className="card-view-title">{cardModeNode?.name ?? '—'}</span>
            <span className="card-view-hint">{cardNodes.length ? `연결된 노드 ${cardNodes.length}개` : ''}</span>
          </div>
          <div className="card-grid" ref={cardGridRef}>
            {cardNodes.map((node) => {
              const meta = nodeMeta.get(node.id);
              return (
                <div className="card-item" key={node.id} data-node-id={node.id}>
                  <div className="card-item-header">
                    <span className="icon card-item-icon">{meta?.icon ?? 'article'}</span>
                    <span className="card-item-type">{meta?.type ?? 'Document'}</span>
                  </div>
                  <div className="card-item-title">{node.name}</div>
                  <div className="card-item-preview">{meta?.preview}</div>
                  <div className="card-item-divider" />
                  <div className="card-item-meta">
                    <span className="icon">link</span>{meta?.links ?? 0}
                    <span className="icon" style={{ marginLeft: 6 }}>schedule</span>{meta?.age ?? '—'}
                  </div>
                  <div className="card-item-tags">
                    {meta?.tags?.map((tag) => <span className="card-item-tag" key={tag}>{tag}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="card-exit-hint">
            <span className="icon">keyboard_arrow_down</span>스크롤 다운 또는 축소하면 그래프로 복귀
          </div>
        </div>
      </div>

      {chatDocked && (
        <ChatPanel
          open={chatPanelOpen}
          docked
          onToggle={() => {}}
          onTogglePin={handleToggleChatPin}
        />
      )}

      <div className="panel-stack">
        <div className="float-cluster">
          {!chatDocked && (
            <ChatPanel
              open={chatPanelOpen}
              peerOpen={chatPanelPeerOpen}
              onToggle={handleToggleChatPanel}
              onTogglePin={handleToggleChatPin}
            />
          )}
        </div>

        <div className={`dock-wrap${selectedNode ? '' : ' hidden'}`}>
          <div className="dock">
            <div className="dock-main">
              <div className="dock-icon">
                <span className="icon icon--fill" id="dockIcon" style={{ color: 'var(--primary-icon)', fontSize: 16 }}>
                  {selectedMeta?.icon ?? 'folder'}
                </span>
              </div>
              <div className="dock-info">
                <div className="dock-type">{selectedMeta?.type ?? 'Directory'}</div>
                <div className="dock-title">{selectedNode?.name ?? 'AI Research Notes'}</div>
              </div>
              <div className="dock-divider" />
              <div className="dock-stats">
                <div className="dock-stat"><div className="dock-stat-num">{selectedMeta?.links ?? 0}</div><div className="dock-stat-label">Links</div></div>
                <div className="dock-stat"><div className="dock-stat-num">{selectedMeta?.age ?? '—'}</div><div className="dock-stat-label">Updated</div></div>
                <div className="dock-stat"><div className="dock-stat-num">{selectedMeta?.docs ?? 0}</div><div className="dock-stat-label">Docs</div></div>
              </div>
              <div className="dock-divider" />
              <div className="dock-actions">
                <button className="dock-btn primary" onClick={() => selectedNode && onOpenNode?.(selectedNode.id)}>
                  <span className="icon icon--fill" style={{ fontSize: 15 }}>add_circle</span>
                </button>
                <button className="dock-btn" onClick={() => setCardModeNodeId(selectedNode?.id ?? null)}>
                  <span className="icon" style={{ fontSize: 15 }}>center_focus_strong</span>
                </button>
                <button className="dock-btn close" onClick={() => setSelectedId(null)}>
                  <span className="icon" style={{ fontSize: 15 }}>close</span>
                </button>
              </div>
            </div>
            <div className="dock-footer">
              <span className="dock-footer-label">Tags</span>
              <div className="dock-tags">
                {selectedMeta?.tags?.map((tag) => <span className="dock-tag" key={tag}>{tag}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
