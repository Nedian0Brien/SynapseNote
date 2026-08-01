import { describe, expect, test } from 'bun:test';
import { beginEntryTeardown } from './provider-pool-entry-state';

describe('provider pool entry state transitions', () => {
  test('teardown snapshots cleanup resources before atomically making the entry inert', () => {
    const observerCleanup = () => {};
    const observerCounterCleanup = () => {};
    const timer = setTimeout(() => {}, 1);
    const persistence = { destroy: async () => {} };
    const entry = {
      kind: 'active' as const,
      persistence,
      observerCleanup,
      observerFireCounterCleanup: observerCounterCleanup,
      pendingRecycleTimer: timer,
      serverDrivenCloseReauthInFlight: true,
    };

    const resources = beginEntryTeardown(entry);

    expect(resources).toEqual({
      persistence,
      observerCleanup,
      observerFireCounterCleanup: observerCounterCleanup,
      pendingRecycleTimer: timer,
    });
    expect(entry).toMatchObject({
      kind: 'tearing-down',
      persistence: null,
      observerCleanup: null,
      observerFireCounterCleanup: null,
      pendingRecycleTimer: null,
      serverDrivenCloseReauthInFlight: false,
    });
    clearTimeout(timer);
  });

  test('a tearing-down entry does not expose cleanup resources again', () => {
    const entry = {
      kind: 'tearing-down' as const,
      persistence: null,
      observerCleanup: null,
      observerFireCounterCleanup: null,
      pendingRecycleTimer: null,
      serverDrivenCloseReauthInFlight: false,
    };

    expect(beginEntryTeardown(entry)).toBeNull();
  });
});
