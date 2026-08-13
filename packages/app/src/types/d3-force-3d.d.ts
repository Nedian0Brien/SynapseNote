/**
 * Minimal typings for the one force this app constructs itself.
 *
 * `d3-force-3d` ships no types and has no `@types` package. It is the
 * simulation library `force-graph` runs on, so a collision force built with it
 * is the same implementation the link, charge and centering forces already
 * come from — using the 2D `d3-force` instead would mix two quadtrees into one
 * simulation for the sake of a type declaration.
 *
 * Only the surface used here is declared. Widen it if more is needed rather
 * than reaching for `any` at the call site.
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
