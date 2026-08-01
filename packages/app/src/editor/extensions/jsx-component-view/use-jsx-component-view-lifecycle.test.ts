import { describe, expect, test } from 'bun:test';
import { resolveJsxComponentSiblingState } from './use-jsx-component-view-lifecycle';

describe('resolveJsxComponentSiblingState', () => {
  test('derives movement affordances for a JSX component among siblings', () => {
    expect(
      resolveJsxComponentSiblingState(
        {
          resolve: () => ({
            depth: 2,
            index: () => 1,
            parent: { childCount: 3, type: { name: 'jsxComponent' } },
          }),
        },
        8,
      ),
    ).toEqual({
      canMoveDown: true,
      canMoveUp: true,
      isChildOfComponent: true,
      siblingCount: 3,
      siblingIndex: 1,
    });
  });

  test('suppresses movement for stale positions without swallowing unexpected failures', () => {
    expect(
      resolveJsxComponentSiblingState(
        {
          resolve: () => {
            throw new RangeError('stale');
          },
        },
        8,
      ),
    ).toMatchObject({ canMoveDown: false, canMoveUp: false, isChildOfComponent: false });
    expect(() =>
      resolveJsxComponentSiblingState(
        {
          resolve: () => {
            throw new Error('broken');
          },
        },
        8,
      ),
    ).toThrow('broken');
  });
});
