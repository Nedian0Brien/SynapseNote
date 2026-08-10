import type { GraphLink } from './graph-view-utils';
import { resolveGraphLinkEndpointId } from './graph-view-utils';

/**
 * Undirected adjacency. Hover highlighting answers "what is this node connected
 * to", which does not care which end authored the link.
 */
export function buildGraphAdjacency(
  links: ReadonlyArray<{ source: unknown; target: unknown }>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  const connect = (from: string, to: string) => {
    const existing = adjacency.get(from);
    if (existing) {
      existing.add(to);
      return;
    }
    adjacency.set(from, new Set([to]));
  };

  for (const link of links) {
    const source = resolveGraphLinkEndpointId(link.source);
    const target = resolveGraphLinkEndpointId(link.target);
    if (source === null || target === null) continue;
    connect(source, target);
    connect(target, source);
  }

  return adjacency;
}

/**
 * The hovered node plus its direct neighbors — one hop, matching Obsidian.
 * Returns `null` when nothing is hovered, which callers read as "no dimming at
 * all" rather than "an empty highlight set" (which would dim the whole canvas).
 */
export function getGraphHighlightSet(
  hoveredNodeId: string | null,
  adjacency: Map<string, Set<string>>,
): Set<string> | null {
  if (hoveredNodeId === null) return null;
  const highlighted = new Set<string>([hoveredNodeId]);
  for (const neighbor of adjacency.get(hoveredNodeId) ?? []) {
    highlighted.add(neighbor);
  }
  return highlighted;
}

/**
 * A link is highlighted only when it is one of the hovered node's own edges —
 * not merely when both endpoints happen to be in the highlight set. Two
 * neighbors of the hovered node may also link to each other; that edge is
 * context, not part of what the hover is pointing at.
 */
export function isGraphLinkHighlighted(
  link: Pick<GraphLink, 'source' | 'target'>,
  hoveredNodeId: string | null,
): boolean {
  if (hoveredNodeId === null) return false;
  return (
    resolveGraphLinkEndpointId(link.source) === hoveredNodeId ||
    resolveGraphLinkEndpointId(link.target) === hoveredNodeId
  );
}
