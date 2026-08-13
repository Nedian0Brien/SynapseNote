import { isGraphLabelVisibleAtZoom } from './graph-label-tiers';
import type { GraphNode } from './graph-view-utils';

/**
 * Which nodes are named right now, and where their names sit.
 *
 * This is the original SynapseNote graph's rule, which is one line of its
 * frame loop:
 *
 *     label.visible = zk >= labelThreshold || isSelected || matched
 *     label.x = node.x
 *     label.y = node.y + bloomRadius + 12
 *
 * A name hangs under its node, always, in world units — so it grows with the
 * zoom and keeps a constant gap from a disc that is also growing.
 *
 * What this replaces is a greedy screen-space planner: it ranked every
 * candidate, rejected any name whose box overlapped an accepted one or a large
 * node's circle, retried at up to two rows further down, and stopped at a
 * budget. Each piece was answering something real — and together they made the
 * set of visible names unexplainable, because what you actually saw was
 * whichever names the packing happened to fit. The original names everything
 * that clears its threshold and lets the reader's eye do the rest; the
 * threshold per node KIND is what keeps that from becoming a wall of text.
 */

export interface GraphNodeLabelPlacement {
  nodeId: string;
  text: string;
  /** World coordinates. The text is centred horizontally and hangs below y. */
  x: number;
  y: number;
  /** Point size in world units. */
  sizePx: number;
  fontWeight: number;
  isActive: boolean;
}

export interface GraphNodeLabelInput {
  node: GraphNode & { x?: number; y?: number };
  text: string;
  degree: number;
  radius: number;
  isActive: boolean;
  /** Search match, or any other reason to name a node below its threshold. */
  isForced?: boolean;
}

/**
 * The original truncated at 15 characters and appended an ellipsis, with no
 * measurement involved. A width budget reads better in principle and worse in
 * practice: it makes the cut depend on the glyphs, so two names of the same
 * length end at different points and a name changes length when the font
 * loads.
 */
export const GRAPH_NODE_LABEL_MAX_CHARS = 15;

export function truncateGraphNodeLabel(text: string): string {
  const characters = [...text];
  if (characters.length <= GRAPH_NODE_LABEL_MAX_CHARS + 1) return text;
  return `${characters.slice(0, GRAPH_NODE_LABEL_MAX_CHARS).join('')}…`;
}

/** Gap between the bottom of a node and the top of its name, in world units. */
export const GRAPH_NODE_LABEL_GAP = 12;

/** The original's three label sizes and weights, by node kind. */
function getLabelType(node: GraphNode, degree: number): { sizePx: number; fontWeight: number } {
  if (node.kind === 'folder') return { sizePx: 10.5, fontWeight: 700 };
  if (degree >= 4) return { sizePx: 9.5, fontWeight: 600 };
  return { sizePx: 9, fontWeight: 400 };
}

export function planGraphNodeLabels({
  nodes,
  zoomScale,
  leafLabelThreshold,
}: {
  nodes: readonly GraphNodeLabelInput[];
  /** Zoom on the ORIGINAL's scale — see `getGraphAreaZoom`. */
  zoomScale: number;
  leafLabelThreshold: number;
}): GraphNodeLabelPlacement[] {
  const placements: GraphNodeLabelPlacement[] = [];

  for (const candidate of nodes) {
    const { node } = candidate;
    if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
    if (candidate.text === '') continue;

    const visible =
      candidate.isForced === true ||
      isGraphLabelVisibleAtZoom({
        degree: candidate.degree,
        isActive: candidate.isActive,
        isFolder: node.kind === 'folder',
        zoomScale,
        leafThreshold: leafLabelThreshold,
      });
    if (!visible) continue;

    const { sizePx, fontWeight } = getLabelType(node, candidate.degree);
    placements.push({
      nodeId: node.id,
      text: truncateGraphNodeLabel(candidate.text),
      x: node.x,
      y: node.y + candidate.radius + GRAPH_NODE_LABEL_GAP,
      sizePx,
      fontWeight,
      isActive: candidate.isActive,
    });
  }

  return placements;
}
