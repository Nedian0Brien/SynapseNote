import type { GraphForceSettings } from '@/lib/graph-settings-store';

/**
 * What the user is doing with the graph, derived from zoom rather than from a
 * mode switch.
 *
 * - `browse` — nothing selected. The whole graph, free-floating.
 * - `select` — a node is selected but the camera is still pulled back.
 * - `focus` — zoomed in on a selection: the graph stops drifting so the
 *   neighborhood can be read and clicked.
 * - `card`  — zoomed in past reading distance: the neighbors become cards.
 *
 * Zoom IS the mode. There is no toggle to find, and the transitions are
 * continuous with the gesture the user is already making.
 */
export type GraphInteractionMode = 'browse' | 'select' | 'focus' | 'card';

/** Zoom scale at which a selection becomes a focused neighborhood. */
export const GRAPH_ZOOM_FOCUS_IN = 1.9;
/** Zoom scale at which the focused neighborhood becomes a card deck. */
export const GRAPH_ZOOM_CARD_IN = 2.45;
/**
 * Leaving a mode uses a lower threshold than entering it, so a graph that
 * settles a hair below the entry point does not oscillate between modes while
 * the user's hand is still.
 */
const MODE_EXIT_HYSTERESIS = 0.15;

export interface GraphInteractionModeInput {
  selectedNodeId: string | null;
  zoomScale: number;
  /**
   * Whether this view can hold a selection at all. The docked rail navigates on
   * click instead of selecting, so it never leaves `browse` however far the
   * user zooms — a 2-hop neighborhood is already a focused view.
   */
  canSelect: boolean;
  /** The mode currently in effect, for hysteresis. Omit on first computation. */
  previousMode?: GraphInteractionMode;
}

export function getGraphInteractionMode({
  selectedNodeId,
  zoomScale,
  canSelect,
  previousMode,
}: GraphInteractionModeInput): GraphInteractionMode {
  if (!canSelect || selectedNodeId === null) return 'browse';

  const cardIn =
    previousMode === 'card' ? GRAPH_ZOOM_CARD_IN - MODE_EXIT_HYSTERESIS : GRAPH_ZOOM_CARD_IN;
  if (zoomScale >= cardIn) return 'card';

  const focusIn =
    previousMode === 'focus' || previousMode === 'card'
      ? GRAPH_ZOOM_FOCUS_IN - MODE_EXIT_HYSTERESIS
      : GRAPH_ZOOM_FOCUS_IN;
  if (zoomScale >= focusIn) return 'focus';

  return 'select';
}

/** True while the selection is being read up close rather than surveyed. */
export function isGraphFocusMode(mode: GraphInteractionMode): boolean {
  return mode === 'focus' || mode === 'card';
}

export interface GraphPhysicsProfile extends GraphForceSettings {
  /**
   * Pin the selected node in place. Without this the simulation keeps nudging
   * the very node the user zoomed in to read, and the camera chases it.
   */
  pinSelectedNode: boolean;
}

/**
 * The live simulation parameters for a mode, layered over the user's Forces
 * settings.
 *
 * Focus mode is not "the same graph, closer". It drops the centering force to
 * zero and pins the selection, so the neighborhood holds still under the
 * cursor; it also shortens links and slows alpha decay so the local shape
 * relaxes into something readable instead of freezing mid-drift. Browse mode
 * hands the user's own settings back untouched.
 */
export function getGraphPhysicsProfile(
  mode: GraphInteractionMode,
  forces: GraphForceSettings,
): GraphPhysicsProfile {
  if (!isGraphFocusMode(mode)) {
    return { ...forces, pinSelectedNode: false };
  }

  return {
    ...forces,
    pinSelectedNode: true,
    // Zero, not "small": any centering at all drags the pinned selection's
    // neighbors toward the middle of the viewport while the user reads them.
    centerStrength: 0,
    // Scaled from the user's own value rather than replaced, so someone who
    // widened their graph still gets a proportionally wider focus view.
    linkDistance: forces.linkDistance * 0.86,
  };
}

/**
 * d3's `alphaDecay`. Focus mode cools more slowly so the pinned neighborhood
 * has time to settle into place after the reheat; browse mode uses d3's own
 * default and stops sooner.
 */
export function getGraphAlphaDecay(mode: GraphInteractionMode): number {
  return isGraphFocusMode(mode) ? 0.01 : 0.0228;
}
