import { describe, expect, test } from 'bun:test';
import {
  getGraphNodeStyle,
  getObsidianGraphNodeDiameter,
  OBSIDIAN_GRAPH_LIGHT_COLORS,
  OBSIDIAN_GRAPH_UNRESOLVED_ALPHA,
} from './graph-node-style';
import type { GraphDocDisplayState, GraphNode, GraphNodeVisualState } from './graph-view-utils';

function doc(docName = 'notes/A'): GraphNode {
  return {
    kind: 'doc',
    id: docName,
    docName,
    anchor: null,
    label: docName,
    cluster: null,
    category: null,
    tags: null,
  };
}

function style({
  node = doc(),
  degree = 0,
  displayState = 'doc' as GraphDocDisplayState,
  visualState = 'default' as GraphNodeVisualState,
  isGhostFolder = false,
} = {}) {
  return getGraphNodeStyle({ node, degree, displayState, visualState, isGhostFolder });
}

describe('Obsidian graph node sizing', () => {
  test('uses the exact clamped square-root curve', () => {
    expect(getObsidianGraphNodeDiameter(0)).toBe(8);
    expect(getObsidianGraphNodeDiameter(7)).toBeCloseTo(Math.sqrt(72), 10);
    expect(getObsidianGraphNodeDiameter(10)).toBeCloseTo(Math.sqrt(99), 10);
    expect(getObsidianGraphNodeDiameter(10_000)).toBe(30);
  });

  test('uses visible subtree weight for folders and degree for files', () => {
    const folder: GraphNode = {
      kind: 'folder',
      id: '/notes',
      label: 'notes',
      path: 'notes',
      memberCount: 99,
    };
    expect(style({ node: folder, degree: 1 }).diameter).toBe(30);
    expect(style({ degree: 10 }).diameter).toBeCloseTo(Math.sqrt(99), 10);
  });
});

describe('Obsidian graph node paint roles', () => {
  test('uses the renderer colors sampled from Obsidian 1.13.4', () => {
    expect(OBSIDIAN_GRAPH_LIGHT_COLORS).toEqual({
      background: '#ffffff',
      node: '#737373',
      focused: '#5c82f5',
      folder: '#5c8af5',
      unresolved: '#bfbfbf',
      line: '#dadada',
      text: '#262626',
      highlight: '#7396f7',
    });
  });

  test('draws ordinary files and real folders as solid circles', () => {
    expect(style()).toMatchObject({ shape: 'filled', colorRole: 'node', alpha: 1 });
    const folder: GraphNode = {
      kind: 'folder',
      id: '/notes',
      label: 'notes',
      path: 'notes',
      memberCount: 2,
    };
    expect(style({ node: folder })).toMatchObject({
      shape: 'filled',
      colorRole: 'folder',
      alpha: 1,
    });
  });

  test('draws unresolved nodes and ghost folders as rings', () => {
    expect(style({ displayState: 'missing' })).toMatchObject({
      shape: 'ring',
      colorRole: 'unresolved',
      alpha: OBSIDIAN_GRAPH_UNRESOLVED_ALPHA,
    });
    const folder: GraphNode = {
      kind: 'folder',
      id: '/ghost',
      label: 'ghost',
      path: 'ghost',
      memberCount: 1,
    };
    expect(style({ node: folder, isGhostFolder: true })).toMatchObject({
      shape: 'ring',
      colorRole: 'folder',
      alpha: 1,
    });
  });

  test('uses focused and highlight colors for the corresponding states', () => {
    expect(style({ visualState: 'active' }).colorRole).toBe('focused');
    expect(style({ visualState: 'selected' }).colorRole).toBe('highlight');
    expect(style({ displayState: 'missing', visualState: 'selected' })).toMatchObject({
      shape: 'ring',
      colorRole: 'highlight',
      alpha: 1,
    });
  });
});
