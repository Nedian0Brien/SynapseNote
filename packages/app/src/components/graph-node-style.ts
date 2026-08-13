import type { GraphDocDisplayState, GraphNode, GraphNodeVisualState } from './graph-view-utils';

/**
 * How a node is drawn — the original SynapseNote graph's three kinds, restored.
 *
 * It sorted every node into `dir`, `hub` or `doc` by KIND and edge count, gave
 * each a radius formula, a stroke weight and a glyph, and drew all of it in
 * WORLD units so a node grew as you zoomed into it. That is what made its
 * graph read as objects laid out on a surface rather than as a scatter plot.
 *
 * What stood here instead was a deliberate departure — one neutral family with
 * meaning carried by weight (filled / ring / dot / ghost), all sized off one
 * base radius and capped at 11 screen pixels so nothing grew past a dot. It
 * was answering a real problem (a sixteen-hue palette at a thousand nodes
 * reads as confetti) and it solved that one, but it also flattened the size
 * hierarchy exactly when you had zoomed in far enough to use it.
 *
 * The one thing NOT restored is the palette: hue still says only "this is the
 * document you came from", because the original's parchment tones have no dark
 * mode. Roles map onto the theme's own weights instead.
 */
export type GraphNodeKind =
  /** A directory. Solid, largest, holds a folder glyph. */
  | 'dir'
  /** A well-connected page. Outlined, with its edge count inside. */
  | 'hub'
  /** An ordinary page. Outlined, small, holds a document glyph. */
  | 'doc'
  /**
   * Referenced but not a page — an unresolved link, an external URL, a tag.
   *
   * Not one of the original's three: its backend indexed a vault of files and
   * directories and nothing else, so it never had to draw one of these. Drawing
   * them as `doc` would state that a link resolves when it does not, so they
   * keep the dashed outline the rebuilt graph gave them.
   */
  | 'ghost';

export type GraphNodeEmphasis =
  /** The document the user came from. The only hue in the graph. */
  | 'accent'
  /** Explicitly selected. */
  | 'selected'
  | 'strong'
  | 'normal'
  | 'faint';

export type GraphNodeGlyph = 'folder' | 'article' | 'degree' | null;

export interface GraphNodeStyle {
  kind: GraphNodeKind;
  emphasis: GraphNodeEmphasis;
  /** Radius in WORLD units, so the node grows as the view zooms in. */
  radius: number;
  /** Outline width in world units. Zero for a node that is drawn solid. */
  strokeWidth: number;
  glyph: GraphNodeGlyph;
  /** Point size of the glyph, in world units. */
  glyphSize: number;
}

/**
 * At or above this many edges a page is drawn as a hub — the original's
 * `getNodeType`.
 *
 * It was raised to 8 here, on the reasoning that in a mature vault 4 is most
 * pages and a hierarchy where everything is a hub is not a hierarchy. That
 * holds for a graph where the hub ring is loud; the original's is not — it is
 * the same outline as a page, one size up, with a small number in it. At 4 the
 * count is a reading of how connected something is rather than a badge, which
 * is what the tier system underneath the labels already assumes.
 */
export const GRAPH_HUB_DEGREE = 4;

/** The original's `getNodeRadiusScale`: directories shrink in a focused view. */
export function getGraphNodeRadiusScale(kind: GraphNodeKind, isFocused: boolean): number {
  return kind === 'dir' && isFocused ? 0.76 : 1;
}

export function getGraphNodeKind({
  node,
  degree,
  displayState,
}: {
  node: GraphNode;
  degree: number;
  displayState: GraphDocDisplayState;
}): GraphNodeKind {
  if (node.kind === 'folder') return 'dir';
  if (node.kind === 'doc' && displayState === 'folder') return 'dir';
  if (node.kind === 'external' || node.kind === 'tag') return 'ghost';
  if (node.kind === 'doc' && displayState === 'missing') return 'ghost';
  if (degree >= GRAPH_HUB_DEGREE) return 'hub';
  return 'doc';
}

/**
 * The original's `getNodeRadius`, in world units:
 *
 *     dir: clamp(18 + degree * 0.8, 14, 26)   (times the focus scale)
 *     hub: clamp(12 + degree * 0.6, 12, 18)
 *     doc: 7
 *
 * Linear in degree with a hard ceiling, not logarithmic — the ceiling is what
 * keeps a 200-edge hub from swallowing the canvas, and below it the growth is
 * legible at a glance because it is proportional.
 */
export function getGraphNodeWorldRadius({
  kind,
  degree,
  isFocused = false,
}: {
  kind: GraphNodeKind;
  degree: number;
  isFocused?: boolean;
}): number {
  const scale = getGraphNodeRadiusScale(kind, isFocused);
  if (kind === 'dir') return Math.max(14, Math.min(26, (18 + degree * 0.8) * scale));
  if (kind === 'hub') return Math.max(12, Math.min(18, 12 + degree * 0.6));
  if (kind === 'ghost') return 6;
  return 7;
}

export function getGraphNodeStyle({
  node,
  degree,
  displayState,
  visualState,
  isFocused = false,
}: {
  node: GraphNode;
  degree: number;
  displayState: GraphDocDisplayState;
  visualState: GraphNodeVisualState;
  isFocused?: boolean;
}): GraphNodeStyle {
  const kind = getGraphNodeKind({ node, degree, displayState });
  const selectedEmphasis: GraphNodeEmphasis | null =
    visualState === 'active' || visualState === 'active-selected'
      ? 'accent'
      : visualState === 'selected' ||
          visualState === 'external-selected' ||
          visualState === 'tag-selected' ||
          visualState === 'folder-selected'
        ? 'selected'
        : null;

  const restingEmphasis: GraphNodeEmphasis =
    kind === 'dir' ? 'strong' : kind === 'hub' ? 'strong' : kind === 'ghost' ? 'faint' : 'normal';

  return {
    kind,
    emphasis: selectedEmphasis ?? restingEmphasis,
    radius: getGraphNodeWorldRadius({ kind, degree, isFocused }),
    // The original's three stroke weights. A directory is solid, so its
    // outline is only there to seat it against the territory behind it.
    strokeWidth: kind === 'dir' ? 1.5 : kind === 'hub' ? 1.8 : 1.2,
    glyph:
      kind === 'dir' ? 'folder' : kind === 'hub' ? 'degree' : kind === 'doc' ? 'article' : null,
    glyphSize: kind === 'dir' ? 13 : 8,
  };
}
