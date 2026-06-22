import { describe, expect, it } from 'vitest';
import {
  getFocusSettledScale,
  getBloomRadiusMultiplier,
  getGraphEndAction,
  getGraphPhysicsProfile,
  getNodeRadiusScale,
  shouldPreserveViewportOnFocusTransition,
  shouldFocusSelectedNode,
  ZOOM_CARD_IN,
  ZOOM_FOCUS_IN,
  buildFocusSubgraph,
  getGraphInteractionMode,
} from './graphViewState.js';

describe('graphViewState', () => {
  it('선택 노드 기준 1-hop 로컬 그래프만 남긴다', () => {
    const nodes = [
      { id: 'hub', name: 'Hub' },
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];
    const edges = [
      { source: 'hub', target: 'a', edge_type: 'wikilink' },
      { source: 'hub', target: 'b', edge_type: 'wikilink' },
      { source: 'b', target: 'c', edge_type: 'wikilink' },
      { source: 'a', target: 'b', edge_type: 'ref' },
    ];

    const subgraph = buildFocusSubgraph(nodes, edges, 'hub');

    expect(subgraph.nodes.map((node) => node.id)).toEqual(['hub', 'a', 'b']);
    expect(subgraph.edges).toEqual([
      { source: 'hub', target: 'a', edge_type: 'wikilink' },
      { source: 'hub', target: 'b', edge_type: 'wikilink' },
      { source: 'a', target: 'b', edge_type: 'ref' },
    ]);
  });

  it('선택이 없거나 카드 뷰면 현재 모드를 정확히 판정한다', () => {
    expect(getGraphInteractionMode({ selectedId: null, zoomScale: 3, cardModeNodeId: null })).toBe('browse');
    expect(getGraphInteractionMode({ selectedId: 'hub', zoomScale: ZOOM_FOCUS_IN - 0.01, cardModeNodeId: null })).toBe('select');
    expect(getGraphInteractionMode({ selectedId: 'hub', zoomScale: ZOOM_FOCUS_IN, cardModeNodeId: null })).toBe('focus');
    expect(getGraphInteractionMode({ selectedId: 'hub', zoomScale: ZOOM_CARD_IN + 1, cardModeNodeId: 'hub' })).toBe('card');
  });

  it('그래프 재구성 후에는 상황에 따라 focus, fit, preserve를 구분한다', () => {
    expect(getGraphEndAction({
      selectedId: 'hub',
      interactionMode: 'focus',
      autoFrameRequested: false,
    })).toBe('focus');

    expect(getGraphEndAction({
      selectedId: null,
      interactionMode: 'browse',
      autoFrameRequested: true,
    })).toBe('fit');

    expect(getGraphEndAction({
      selectedId: null,
      interactionMode: 'browse',
      autoFrameRequested: false,
    })).toBe('preserve');
  });

  it('선택 노드 자동 포커스는 focus/card 모드에서만 허용한다', () => {
    expect(shouldFocusSelectedNode({ selectedId: 'hub', interactionMode: 'select' })).toBe(false);
    expect(shouldFocusSelectedNode({ selectedId: 'hub', interactionMode: 'focus' })).toBe(true);
    expect(shouldFocusSelectedNode({ selectedId: 'hub', interactionMode: 'card' })).toBe(true);
    expect(shouldFocusSelectedNode({ selectedId: null, interactionMode: 'focus' })).toBe(false);
  });

  it('선택 모드에서 포커스 모드로 처음 들어갈 때는 현재 뷰포트를 유지한다', () => {
    expect(shouldPreserveViewportOnFocusTransition({
      previousInteractionMode: 'select',
      interactionMode: 'focus',
      selectedId: 'hub',
    })).toBe(true);

    expect(shouldPreserveViewportOnFocusTransition({
      previousInteractionMode: 'focus',
      interactionMode: 'focus',
      selectedId: 'hub',
    })).toBe(false);

    expect(shouldPreserveViewportOnFocusTransition({
      previousInteractionMode: 'select',
      interactionMode: 'card',
      selectedId: 'hub',
    })).toBe(false);
  });

  it('포커스 모드에서는 중심 노드를 고정하고 주변 노드를 더 가깝게 모은다', () => {
    expect(getGraphPhysicsProfile({ interactionMode: 'select', selectedId: 'hub' })).toEqual({
      pinSelectedNode: false,
      linkDistance: 95,
      centerStrength: 0.04,
      alphaDecay: 0.018,
      velocityDecay: 0.42,
    });

    expect(getGraphPhysicsProfile({ interactionMode: 'focus', selectedId: 'hub' })).toEqual({
      pinSelectedNode: true,
      linkDistance: 82,
      centerStrength: 0,
      alphaDecay: 0.01,
      velocityDecay: 0.5,
    });
  });

  it('포커스 모드에서는 폴더 노드 반지름을 더 작게 쓴다', () => {
    expect(getNodeRadiusScale({ nodeType: 'dir', interactionMode: 'focus' })).toBe(0.76);
    expect(getNodeRadiusScale({ nodeType: 'dir', interactionMode: 'select' })).toBe(1);
    expect(getNodeRadiusScale({ nodeType: 'doc', interactionMode: 'focus' })).toBe(1);
  });

  it('카드 뷰 직전 bloom 단계에서는 중심 포커스 노드만 살짝 키운다', () => {
    expect(getBloomRadiusMultiplier({ isSelected: true, isNeighbor: false, progress: 1 })).toBe(1.08);
    expect(getBloomRadiusMultiplier({ isSelected: false, isNeighbor: true, progress: 1 })).toBe(1);
    expect(getBloomRadiusMultiplier({ isSelected: false, isNeighbor: false, progress: 1 })).toBe(1);
  });

  it('포커스 모드 진입 시 줌을 최소치보다 살짝 안쪽으로 보정한다', () => {
    expect(getFocusSettledScale(1.85)).toBe(1.85);
    expect(getFocusSettledScale(ZOOM_FOCUS_IN)).toBe(2.02);
    expect(getFocusSettledScale(1.97)).toBe(2.02);
    expect(getFocusSettledScale(2.2)).toBe(2.2);
    expect(getFocusSettledScale(ZOOM_CARD_IN)).toBe(ZOOM_CARD_IN);
  });
});
