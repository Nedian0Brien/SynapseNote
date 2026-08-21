/**
 * Minimal typings for the collision force constructed by the graph view.
 *
 * `force-graph` already runs on `d3-force-3d`; importing the collision force
 * from the same package keeps every force on one simulation implementation.
 */
declare module 'd3-force-3d' {
  interface ForceCollide<Node> {
    (alpha: number): void;
    initialize(nodes: Node[], random: () => number, numDimensions?: number): void;
    radius(radius: number | ((node: Node, index: number, nodes: Node[]) => number)): this;
    strength(strength: number): this;
    iterations(iterations: number): this;
  }

  export function forceCollide<Node>(
    radius?: number | ((node: Node, index: number, nodes: Node[]) => number),
  ): ForceCollide<Node>;
}
