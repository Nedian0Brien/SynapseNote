/**
 * When a node's label is allowed to appear, by how connected the node is.
 *
 * A single zoom threshold for every label means a zoomed-out graph shows no
 * names at all — the moment you most need to know what you are looking at. An
 * atlas does the opposite: continents are labelled from orbit, streets only
 * when you are standing on them. These tiers are that gradient.
 */
export type GraphLabelTier = 'active' | 'hub' | 'prominent' | 'leaf';

/**
 * Absolute edge counts, not percentiles. A page with a dozen inbound links is a
 * landmark whether the project holds fifty pages or five thousand, and a
 * percentile would label exactly the same *proportion* of a tiny graph as of a
 * huge one — which is the behavior this is meant to replace.
 */
const HUB_DEGREE = 8;
const PROMINENT_DEGREE = 3;

/**
 * Multipliers on the user's "Text fade threshold" setting, which stays the
 * authority: it is the leaf-document threshold, and the other tiers are stated
 * relative to it. At the default 1.8 that puts hubs at 0.9 and mid-degree pages
 * at 1.35, so zooming out thins the labels down to the landmarks rather than
 * clearing them all at once.
 */
const TIER_ZOOM_FACTOR: Record<GraphLabelTier, number> = {
  // The document you came from is never hidden — it is the one label that
  // orients everything else on screen.
  active: 0,
  hub: 0.5,
  prominent: 0.75,
  leaf: 1,
};

/** The most permissive factor, for callers that want to skip label work entirely. */
export const MIN_GRAPH_LABEL_ZOOM_FACTOR = Math.min(...Object.values(TIER_ZOOM_FACTOR));

export function getGraphLabelTier({
  degree,
  isActive,
}: {
  degree: number;
  isActive: boolean;
}): GraphLabelTier {
  if (isActive) return 'active';
  if (degree >= HUB_DEGREE) return 'hub';
  if (degree >= PROMINENT_DEGREE) return 'prominent';
  return 'leaf';
}

export function getGraphLabelZoomThreshold(tier: GraphLabelTier, leafThreshold: number): number {
  return leafThreshold * TIER_ZOOM_FACTOR[tier];
}

/** Whether a label may be drawn at the current zoom. */
export function isGraphLabelVisibleAtZoom({
  degree,
  isActive,
  zoomScale,
  leafThreshold,
}: {
  degree: number;
  isActive: boolean;
  zoomScale: number;
  leafThreshold: number;
}): boolean {
  const tier = getGraphLabelTier({ degree, isActive });
  return zoomScale >= getGraphLabelZoomThreshold(tier, leafThreshold);
}
