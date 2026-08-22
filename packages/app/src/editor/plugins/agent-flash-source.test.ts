import { describe, expect, test } from 'bun:test';
import type * as Y from 'yjs';
import { sourceAnimationRangesFromDelta } from './agent-flash-source';

describe('source Writing Tools ranges', () => {
  test('maps retained and inserted Y.Text operations to post-change coordinates', () => {
    const delta = [
      { retain: 6 },
      { insert: 'AI ' },
      { retain: 5 },
      { insert: 'note' },
    ] as Y.YTextEvent['delta'];

    expect(sourceAnimationRangesFromDelta(delta, 18)).toEqual([
      { from: 6, to: 9 },
      { from: 14, to: 18 },
    ]);
  });

  test('uses a neighboring surviving character for a pure deletion', () => {
    const delta = [{ retain: 4 }, { delete: 3 }, { retain: 2 }] as Y.YTextEvent['delta'];
    expect(sourceAnimationRangesFromDelta(delta, 6)).toEqual([{ from: 3, to: 5 }]);
  });

  test('a replacement animates only the inserted result, not its neighbor', () => {
    const delta = [{ retain: 4 }, { delete: 3 }, { insert: 'new' }] as Y.YTextEvent['delta'];
    expect(sourceAnimationRangesFromDelta(delta, 7)).toEqual([{ from: 4, to: 7 }]);
  });
});
