/**
 * When a node's label is allowed to appear.
 *
 * A single zoom threshold for every label means a zoomed-out graph shows no
 * names at all — the moment you most need to know what you are looking at. An
 * atlas does the opposite: continents are labelled from orbit, streets only
 * when you are standing on them. These tiers are that gradient.
 *
 * Ported from the original SynapseNote graph, which keyed them on the node's
 * KIND rather than on where it sat in the folder tree: directories 0.40, hubs
 * 0.55, plain documents 0.78, against its own zoom scale.
 */
export type GraphLabelTier = 'active' | 'folder' | 'hub' | 'leaf';

/**
 * The original's `getNodeType`: a page with four or more edges is a hub. Not a
 * percentile — a page with a dozen inbound links is a landmark whether the
 * project holds fifty pages or five thousand.
 */
const HUB_DEGREE = 4;

/**
 * Multipliers on the user's "Text fade threshold" setting, which stays the
 * authority: it is the leaf-document threshold and the other tiers are stated
 * relative to it. The ratios are the original's own — 0.40/0.78 and 0.55/0.78 —
 * so a folder names itself first, then the hubs, then everything else.
 */
const TIER_ZOOM_FACTOR: Record<GraphLabelTier, number> = {
  // The document you came from is never hidden — it is the one label that
  // orients everything else on screen.
  active: 0,
  folder: 0.4 / 0.78,
  hub: 0.55 / 0.78,
  leaf: 1,
};

/** The most permissive factor, for callers that want to skip label work entirely. */
export const MIN_GRAPH_LABEL_ZOOM_FACTOR = Math.min(...Object.values(TIER_ZOOM_FACTOR));

export function getGraphLabelTier({
  degree,
  isActive,
  isFolder = false,
}: {
  degree: number;
  isActive: boolean;
  isFolder?: boolean;
}): GraphLabelTier {
  if (isActive) return 'active';
  if (isFolder) return 'folder';
  if (degree >= HUB_DEGREE) return 'hub';
  return 'leaf';
}

export function getGraphLabelZoomThreshold(tier: GraphLabelTier, leafThreshold: number): number {
  return leafThreshold * TIER_ZOOM_FACTOR[tier];
}

/** Whether a label may be drawn at the current zoom. */
export function isGraphLabelVisibleAtZoom({
  degree,
  isActive,
  isFolder = false,
  zoomScale,
  leafThreshold,
}: {
  degree: number;
  isActive: boolean;
  isFolder?: boolean;
  zoomScale: number;
  leafThreshold: number;
}): boolean {
  const tier = getGraphLabelTier({ degree, isActive, isFolder });
  return zoomScale >= getGraphLabelZoomThreshold(tier, leafThreshold);
}
