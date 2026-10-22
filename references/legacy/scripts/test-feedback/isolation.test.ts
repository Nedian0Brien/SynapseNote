import { describe, expect, test } from 'bun:test';

import { withTestIsolation } from './isolation.ts';

describe('test isolation helper', () => {
  test('restores registered timer, telemetry, mock, and singleton cleanup hooks', async () => {
    const cleanupOrder: string[] = [];
    await withTestIsolation('representative isolation fixture', (isolation) => {
      for (const name of ['timer', 'telemetry', 'mock', 'singleton']) {
        isolation.registerCleanup(() => cleanupOrder.push(name));
      }
      const release = isolation.trackResource('watcher', 'representative');
      release();
    });

    expect(cleanupOrder).toEqual(['singleton', 'mock', 'telemetry', 'timer']);
  });

  test('reports an environment leak before restoring the process', async () => {
    await expect(
      withTestIsolation('environment fixture', () => {
        process.env.TEST_FEEDBACK_ISOLATION_LEAK = '1';
      }),
    ).rejects.toThrow(/leaked runtime state/);
    expect(process.env.TEST_FEEDBACK_ISOLATION_LEAK).toBeUndefined();
  });
});
