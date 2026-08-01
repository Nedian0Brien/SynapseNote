import { describe, expect, test } from 'bun:test';
import { chooseEvictionCandidate, touchCacheOrder } from './editor-cache-policy';

describe('editor cache policy', () => {
  test('replays a cache hit as most-recent and evicts the oldest inactive document', () => {
    const replayed = touchCacheOrder(['older', 'active', 'recent'], 'older');

    expect(replayed).toEqual(['active', 'recent', 'older']);
    expect(chooseEvictionCandidate(replayed, 'incoming', new Set(['active']))).toBe('recent');
  });
});
