import { afterEach, describe, expect, test } from 'bun:test';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { withTestIsolation } from './isolation.ts';
import {
  assertNoTestRuntimeLeaks,
  captureTestRuntimeState,
  restoreEnvironment,
  trackTestResource,
} from './leak-detector.ts';

const originalEnvironment = { ...process.env };

afterEach(() => restoreEnvironment(originalEnvironment));

describe('test runtime leak detector', () => {
  test('restores environment changes and accepts a clean resource lifecycle', async () => {
    await withTestIsolation('clean lifecycle', (isolation) => {
      const release = isolation.trackResource('watcher', 'fixture');
      release();
      delete process.env.TEST_FEEDBACK_LEAK_FIXTURE;
      expect(() => isolation.assertClean()).not.toThrow();
    });
  });

  test('reports an uncleaned resource and environment mutation', () => {
    const before = captureTestRuntimeState();
    const release = trackTestResource('subprocess', 'intentional-leak');
    process.env.TEST_FEEDBACK_LEAK_FIXTURE = '1';
    const after = captureTestRuntimeState();
    expect(() => assertNoTestRuntimeLeaks(before, after, { label: 'fixture' })).toThrow(
      /leaked runtime state/,
    );
    release();
  });

  test('reports an intentionally open server handle', async () => {
    const before = captureTestRuntimeState();
    const server = createServer();
    server.listen(0);
    await once(server, 'listening');
    const release = trackTestResource('server', 'intentional-open-handle');
    try {
      expect(() => assertNoTestRuntimeLeaks(before, captureTestRuntimeState())).toThrow(
        /newResources/,
      );
    } finally {
      release();
      const closed = once(server, 'close');
      server.close();
      await closed;
    }
  });
});
