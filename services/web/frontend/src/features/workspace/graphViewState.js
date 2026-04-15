export const ZOOM_FOCUS_IN = 1.9;
export const ZOOM_CARD_IN = 2.45;
export const ZOOM_FOCUS_SETTLE = 2.02;

export function buildFocusSubgraph(nodes, edges, centerNodeId) {
  if (!centerNodeId) return { nodes, edges };

  const visibleIds = new Set([centerNodeId]);
  for (const edge of edges) {
    if (edge.source === centerNodeId) visibleIds.add(edge.target);
    if (edge.target === centerNodeId) visibleIds.add(edge.source);
  }

  return {
    nodes: nodes.filter((node) => visibleIds.has(node.id)),
    edges: edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}

export function getGraphInteractionMode({ selectedId, zoomScale, cardModeNodeId }) {
  if (!selectedId) return 'browse';
  if (cardModeNodeId) return 'card';
  if (zoomScale >= ZOOM_FOCUS_IN) return 'focus';
  return 'select';
}

export function getGraphEndAction({ selectedId, interactionMode, autoFrameRequested }) {
  if (selectedId && (interactionMode === 'focus' || interactionMode === 'card')) {
    return 'focus';
  }

  if (autoFrameRequested) {
    return 'fit';
  }

  return 'preserve';
}

export function shouldFocusSelectedNode({ selectedId, interactionMode }) {
  if (!selectedId) return false;
  return interactionMode === 'focus' || interactionMode === 'card';
}

export function shouldPreserveViewportOnFocusTransition({
  previousInteractionMode,
  interactionMode,
  selectedId,
}) {
  if (!selectedId) return false;
  return previousInteractionMode === 'select' && interactionMode === 'focus';
}

export function getGraphPhysicsProfile({ interactionMode, selectedId }) {
  if (selectedId && (interactionMode === 'focus' || interactionMode === 'card')) {
    return {
      pinSelectedNode: true,
      linkDistance: 82,
      centerStrength: 0,
      alphaDecay: 0.01,
      velocityDecay: 0.5,
    };
  }

  return {
    pinSelectedNode: false,
    linkDistance: 95,
    centerStrength: 0.04,
    alphaDecay: 0.018,
    velocityDecay: 0.42,
  };
}

export function getNodeRadiusScale({ nodeType, interactionMode }) {
  if (nodeType === 'dir' && (interactionMode === 'focus' || interactionMode === 'card')) {
    return 0.76;
  }

  return 1;
}

export function getBloomRadiusMultiplier({ isSelected, isNeighbor, progress }) {
  if (isSelected) return 1 + (progress * 0.08);
  if (isNeighbor) return 1;
  return 1;
}

export function getFocusSettledScale(zoomScale) {
  if (zoomScale < ZOOM_FOCUS_IN || zoomScale >= ZOOM_CARD_IN) return zoomScale;
  return Math.max(zoomScale, ZOOM_FOCUS_SETTLE);
}
