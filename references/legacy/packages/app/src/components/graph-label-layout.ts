import { type GraphLabelDescriptor, pickGraphLabelText } from './graph-label-utils';
import type { GraphNode } from './graph-view-utils';

export type GraphLabelLayoutNode = GraphNode & {
  x?: number;
  y?: number;
};

export interface GraphLabelPlacement {
  nodeId: string;
  text: string;
  textX: number;
  textY: number;
}

interface PlanGraphLabelsInput {
  nodes: GraphLabelLayoutNode[];
  maxLabelWidthPx: number;
  labelDescriptors: Map<string, GraphLabelDescriptor>;
  measureTextWidthPx: (text: string) => number;
  projectToScreen: (x: number, y: number) => { x: number; y: number };
  getNodeRadiusPx: (node: GraphLabelLayoutNode) => number;
}

const LABEL_GAP_PX = 4;

/**
 * Builds one label for every positioned graph node.
 *
 * Selection does not belong in this layer: zoom, degree, folder depth, label
 * budgets, previous-frame state, viewport edges, and collisions must never
 * decide whether a node has a name. Canvas clipping naturally handles nodes
 * outside the visible viewport, while labels inside it remain complete even
 * when the graph is dense.
 */
export function planGraphLabels({
  nodes,
  maxLabelWidthPx,
  labelDescriptors,
  measureTextWidthPx,
  projectToScreen,
  getNodeRadiusPx,
}: PlanGraphLabelsInput): GraphLabelPlacement[] {
  return nodes.flatMap((node) => {
    if (typeof node.x !== 'number' || typeof node.y !== 'number') return [];

    const screen = projectToScreen(node.x, node.y);
    const text =
      pickGraphLabelText(labelDescriptors.get(node.id), maxLabelWidthPx, measureTextWidthPx) ||
      node.label ||
      node.id;

    return [
      {
        nodeId: node.id,
        text,
        textX: screen.x,
        textY: screen.y + getNodeRadiusPx(node) + LABEL_GAP_PX,
      },
    ];
  });
}
