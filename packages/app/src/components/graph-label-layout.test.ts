import { describe, expect, test } from 'bun:test';
import { type GraphLabelLayoutNode, planGraphLabels } from './graph-label-layout';
import { buildGraphLabelDescriptors } from './graph-label-utils';

function plan(nodes: GraphLabelLayoutNode[]) {
  return planGraphLabels({
    nodes,
    maxLabelWidthPx: 120,
    labelDescriptors: buildGraphLabelDescriptors(nodes),
    measureTextWidthPx: (text) => text.length * 6,
    projectToScreen: (x, y) => ({ x, y }),
    getNodeRadiusPx: () => 6,
  });
}

describe('planGraphLabels', () => {
  test('returns one label for every positioned node in input order', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'alpha', label: 'Alpha', x: 40, y: 30 },
      { id: 'beta', label: 'Beta', x: 80, y: 60 },
      { id: 'gamma', label: 'Gamma', x: 120, y: 90 },
    ];

    expect(plan(nodes).map((placement) => placement.nodeId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  test('keeps every label when nodes and label boxes overlap', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'alpha', label: 'Alpha', x: 50, y: 50 },
      { id: 'beta', label: 'Beta', x: 50, y: 50 },
      { id: 'gamma', label: 'Gamma', x: 50, y: 50 },
    ];

    expect(plan(nodes)).toHaveLength(nodes.length);
  });

  test('positions each label directly below its node', () => {
    const [placement] = plan([{ id: 'alpha', label: 'Alpha', x: 50, y: 40 }]);

    expect(placement).toMatchObject({
      nodeId: 'alpha',
      text: 'Alpha',
      textX: 50,
      textY: 50,
    });
  });

  test('skips only nodes that do not yet have layout coordinates', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'pending', label: 'Pending' },
      { id: 'ready', label: 'Ready', x: 20, y: 20 },
    ];

    expect(plan(nodes).map((placement) => placement.nodeId)).toEqual(['ready']);
  });
});
