import type { GraphDocDisplayState, GraphNode, GraphNodeVisualState } from './graph-view-utils';

/**
 * How a node is drawn, decided by FORM rather than by hue.
 *
 * The graph used to encode meaning in color: unresolved links were alarm red,
 * clusters drew from a sixteen-hue palette, and folders, tags and URLs each had
 * their own. At a thousand nodes that reads as confetti — every node shouting,
 * none of them legible.
 *
 * The rule here is the one the original SynapseNote graph used: a single
 * neutral family, with three levels of *weight* carrying the hierarchy —
 * filled, ringed, faint. Color is spent on exactly one thing, the document you
 * came from, so it is the only thing on screen that can claim attention by hue.
 */
export type GraphNodeShape =
  /** Solid disc. Structural anchors — a link that resolves to a folder view. */
  | 'filled'
  /** Outlined disc, with the edge count inside. Well-connected pages. */
  | 'ring'
  /** Small soft disc. Ordinary pages. */
  | 'dot'
  /** Outlined and dashed. Things that are referenced but are not pages. */
  | 'ghost';

export type GraphNodeEmphasis =
  /** The document the user came from. The only hue in the graph. */
  | 'accent'
  /** Explicitly selected. */
  | 'selected'
  | 'strong'
  | 'normal'
  | 'faint';

export interface GraphNodeStyle {
  shape: GraphNodeShape;
  emphasis: GraphNodeEmphasis;
  /** Radius multiplier applied to the base canvas radius. */
  scale: number;
  /**
   * Draw the edge count inside the node. Only for ring nodes, and only because
   * a ring leaves room for it — on a filled or faint node it would be noise.
   */
  showDegree: boolean;
}

/**
 * At or above this many edges a page is drawn as a hub.
 *
 * 8, matching the label tiers' idea of a landmark. It was 4, which in a vault of
 * any maturity is most pages — so nearly every node drew as a ring with a count
 * in it, and a hierarchy where everything is a hub is not a hierarchy. It also
 * meant the canvas was covered in digits while only a handful of nodes showed
 * their name, which is the wrong thing to be able to read.
 */
export const GRAPH_HUB_DEGREE = 8;

export function getGraphNodeStyle({
  node,
  degree,
  displayState,
  visualState,
}: {
  node: GraphNode;
  degree: number;
  displayState: GraphDocDisplayState;
  visualState: GraphNodeVisualState;
}): GraphNodeStyle {
  const emphasis: GraphNodeEmphasis =
    visualState === 'active' || visualState === 'active-selected'
      ? 'accent'
      : visualState === 'selected' ||
          visualState === 'external-selected' ||
          visualState === 'tag-selected' ||
          visualState === 'folder-selected'
        ? 'selected'
        : 'normal';

  // A directory. Solid, and sized by how much it holds — the role the original
  // SynapseNote graph gave its directory nodes, and the reason the folders in
  // the layout read as places rather than as a stray labelled dot.
  if (node.kind === 'folder') {
    return {
      shape: 'filled',
      emphasis: emphasis === 'normal' ? 'strong' : emphasis,
      // Same logarithmic curve as a hub: a 200-page folder is roughly twice a
      // 4-page one, not fifty times.
      scale: 1.15 + Math.min(Math.log2(node.memberCount + 1) * 0.22, 1.05),
      showDegree: false,
    };
  }

  // A folder target is a structural anchor, so it reads as solid — the same
  // role the original graph gave its directory nodes.
  if (node.kind === 'doc' && displayState === 'folder') {
    return {
      shape: 'filled',
      emphasis: emphasis === 'normal' ? 'strong' : emphasis,
      scale: 1.3,
      showDegree: false,
    };
  }

  // Referenced but not a page: an unresolved wiki link, an external URL, a tag.
  // These are the bulk of a large graph and they are CONTEXT, not content, so
  // they sit at the bottom of the weight scale instead of shouting in red.
  const isGhost =
    (node.kind === 'doc' && displayState === 'missing') ||
    node.kind === 'external' ||
    node.kind === 'tag';
  if (isGhost) {
    return {
      shape: 'ghost',
      emphasis: emphasis === 'normal' ? 'faint' : emphasis,
      scale: 0.72,
      showDegree: false,
    };
  }

  if (degree >= GRAPH_HUB_DEGREE) {
    return {
      shape: 'ring',
      emphasis: emphasis === 'normal' ? 'strong' : emphasis,
      // Grows with connectedness, but logarithmically — a 200-edge hub must not
      // be fifty times the size of a 4-edge one.
      scale: 1 + Math.min(Math.log2(degree / GRAPH_HUB_DEGREE + 1) * 0.32, 0.9),
      showDegree: true,
    };
  }

  return { shape: 'dot', emphasis, scale: 1, showDegree: false };
}
