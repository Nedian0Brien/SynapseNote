import type { GraphDocDisplayState, GraphNode, GraphNodeVisualState } from './graph-view-utils';

/** Exact light-theme colors reported by Obsidian 1.13.4's graph renderer. */
export const OBSIDIAN_GRAPH_LIGHT_COLORS = {
  background: '#ffffff',
  node: '#737373',
  focused: '#5c82f5',
  folder: '#5c8af5',
  unresolved: '#bfbfbf',
  line: '#dadada',
  text: '#262626',
  highlight: '#7396f7',
} as const;

export const OBSIDIAN_GRAPH_UNRESOLVED_ALPHA = 0.5;
export const OBSIDIAN_GRAPH_DIM_ALPHA = 0.2;

export type GraphNodeShape = 'filled' | 'ring';
export type GraphNodeColorRole = 'node' | 'focused' | 'folder' | 'unresolved' | 'highlight';

export interface GraphNodeStyle {
  shape: GraphNodeShape;
  colorRole: GraphNodeColorRole;
  /** Obsidian's logical node diameter before its sqrt(zoom) screen transform. */
  diameter: number;
  /** Fill/stroke alpha before hover dimming. */
  alpha: number;
}

/**
 * Obsidian renderer source:
 * `max(8, min(3 * sqrt(weight + 1), 30)) * nodeSizeMultiplier`.
 */
export function getObsidianGraphNodeDiameter(weight: number, multiplier = 1): number {
  return Math.max(8, Math.min(3 * Math.sqrt(Math.max(0, weight) + 1), 30)) * multiplier;
}

/**
 * At overview zoom Obsidian renders unresolved nodes and ghost folders as
 * hollow circles. Ordinary files and real folders are solid.
 */
export function getGraphNodeStyle({
  node,
  degree,
  displayState,
  visualState,
  isGhostFolder = false,
  nodeSizeMultiplier = 1,
}: {
  node: GraphNode;
  degree: number;
  displayState: GraphDocDisplayState;
  visualState: GraphNodeVisualState;
  isGhostFolder?: boolean;
  nodeSizeMultiplier?: number;
}): GraphNodeStyle {
  const selected =
    visualState === 'selected' ||
    visualState === 'external-selected' ||
    visualState === 'tag-selected' ||
    visualState === 'folder-selected' ||
    visualState === 'active-selected';
  const focused = visualState === 'active' || visualState === 'active-selected';
  const unresolved =
    (node.kind === 'doc' && displayState === 'missing') ||
    node.kind === 'external' ||
    node.kind === 'tag';
  const folder = node.kind === 'folder';
  const ring = unresolved || (folder && isGhostFolder);
  const weight = folder ? node.memberCount : degree;

  return {
    shape: ring ? 'ring' : 'filled',
    colorRole: selected
      ? 'highlight'
      : focused
        ? 'focused'
        : folder
          ? 'folder'
          : unresolved
            ? 'unresolved'
            : 'node',
    diameter: getObsidianGraphNodeDiameter(weight, nodeSizeMultiplier),
    alpha: unresolved && !selected ? OBSIDIAN_GRAPH_UNRESOLVED_ALPHA : 1,
  };
}
