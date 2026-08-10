import type { GraphGroup } from '@/lib/graph-settings-store';
import { GRAPH_COLOR_PAIRS } from './graph-colors';
import { matchesGraphQuery } from './graph-filter';
import type { GraphNode } from './graph-view-utils';

/**
 * Colors offered in the group editor, drawn from the same hues the cluster
 * palette uses so a hand-picked group and an auto-colored cluster never sit
 * next to each other in two unrelated color systems.
 *
 * A group stores ONE color — the dark-theme hex, which is what the swatch grid
 * shows — and `resolveGraphGroupColor` translates it for the light theme. The
 * alternative, storing whichever hex was current when the user picked, would
 * make the same group render as a different hue after a theme switch.
 */
export const GRAPH_GROUP_SWATCHES: readonly string[] = GRAPH_COLOR_PAIRS.map((pair) => pair.dark);

const LIGHT_BY_DARK = new Map(
  GRAPH_COLOR_PAIRS.map((pair) => [pair.dark.toLowerCase(), pair.light]),
);

export function resolveGraphGroupColor(color: string, isDark: boolean): string {
  if (isDark) return color;
  // An unrecognized hex (hand-edited storage, or a swatch retired by a later
  // build) is honored as authored rather than snapped to some nearest match.
  return LIGHT_BY_DARK.get(color.toLowerCase()) ?? color;
}

/**
 * First match in list order wins, so moving a group up the list is how a user
 * resolves an overlap between two queries. A group with an empty query is
 * inert: a blank box is a half-finished row, not a rule that matches the world.
 */
export function matchGraphGroup(node: GraphNode, groups: readonly GraphGroup[]): GraphGroup | null {
  for (const group of groups) {
    if (group.query.trim() === '') continue;
    if (matchesGraphQuery(node, group.query)) return group;
  }
  return null;
}

/** Cycles the palette so consecutive additions are visually distinct by default. */
export function nextGraphGroupColor(existing: readonly GraphGroup[]): string {
  const used = new Set(existing.map((group) => group.color.toLowerCase()));
  const unused = GRAPH_GROUP_SWATCHES.find((color) => !used.has(color.toLowerCase()));
  return unused ?? GRAPH_GROUP_SWATCHES[existing.length % GRAPH_GROUP_SWATCHES.length];
}
