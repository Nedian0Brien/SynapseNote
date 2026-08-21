/**
 * Collision is local spacing, not another global repulsion knob.
 *
 * Obsidian keeps a 60-unit collision radius beside a 250-unit default link
 * distance. Keeping that 0.24 ratio makes the minimum breathing room scale
 * with SynapseNote's user-controlled link distance instead of hard-coding a
 * world-unit radius that only works for one preset.
 */
export const GRAPH_COLLISION_RADIUS_TO_LINK_DISTANCE = 0.24;

/** The same soft collision strength used by Obsidian's graph simulation. */
export const GRAPH_COLLISION_STRENGTH = 0.5;

/**
 * Space beyond the painted disc when a short link distance would otherwise
 * make the proportional radius smaller than the node itself.
 */
export const GRAPH_COLLISION_NODE_PADDING = 3;

export function getGraphCollisionRadius({
  baseNodeRadius,
  nodeScale,
  linkDistance,
}: {
  baseNodeRadius: number;
  nodeScale: number;
  linkDistance: number;
}): number {
  const paintedRadius = Math.max(0, baseNodeRadius) * Math.max(0, nodeScale);
  const proportionalRadius = Math.max(0, linkDistance) * GRAPH_COLLISION_RADIUS_TO_LINK_DISTANCE;
  return Math.max(paintedRadius + GRAPH_COLLISION_NODE_PADDING, proportionalRadius);
}
