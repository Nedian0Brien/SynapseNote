import { describe, expect, test } from 'bun:test';
import {
  GRAPH_COLLISION_NODE_PADDING,
  GRAPH_COLLISION_RADIUS_TO_LINK_DISTANCE,
  getGraphCollisionRadius,
} from './graph-collision';

describe('getGraphCollisionRadius', () => {
  test('tracks the link distance at the Obsidian collision ratio', () => {
    expect(GRAPH_COLLISION_RADIUS_TO_LINK_DISTANCE).toBe(0.24);
    expect(getGraphCollisionRadius({ baseNodeRadius: 5, nodeScale: 1, linkDistance: 250 })).toBe(
      60,
    );
    expect(
      getGraphCollisionRadius({ baseNodeRadius: 5, nodeScale: 1, linkDistance: 145 }),
    ).toBeCloseTo(34.8, 5);
  });

  test('never lets a short-distance preset overlap the painted node', () => {
    expect(getGraphCollisionRadius({ baseNodeRadius: 5, nodeScale: 1, linkDistance: 5 })).toBe(
      5 + GRAPH_COLLISION_NODE_PADDING,
    );
  });

  test('gives a large folder enough room for its structural size', () => {
    const page = getGraphCollisionRadius({ baseNodeRadius: 5, nodeScale: 1, linkDistance: 30 });
    const folder = getGraphCollisionRadius({
      baseNodeRadius: 5,
      nodeScale: 2.2,
      linkDistance: 30,
    });

    expect(folder).toBeGreaterThan(page);
    expect(folder).toBe(5 * 2.2 + GRAPH_COLLISION_NODE_PADDING);
  });

  test('defensively clamps invalid negative geometry', () => {
    expect(getGraphCollisionRadius({ baseNodeRadius: -5, nodeScale: -2, linkDistance: -30 })).toBe(
      GRAPH_COLLISION_NODE_PADDING,
    );
  });
});
