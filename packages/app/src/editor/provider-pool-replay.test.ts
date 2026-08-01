import { describe, expect, test } from 'bun:test';
import { takeBufferedReplay } from './provider-pool-replay';

describe('provider-pool replay buffer', () => {
  test('takes a replay update exactly once before the caller applies it', () => {
    const updates = new Map<string, Uint8Array>();
    const update = new Uint8Array([1, 2, 3]);
    updates.set('doc-a', update);

    expect(takeBufferedReplay(updates, 'doc-a')).toBe(update);
    expect(updates.has('doc-a')).toBe(false);
    expect(takeBufferedReplay(updates, 'doc-a')).toBeUndefined();
  });
});
