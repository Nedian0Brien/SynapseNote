import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectOperationsMetrics } from './operations-metrics.ts';

describe('operations metrics', () => {
  test('records duration, failure, skip, cache, and retry dimensions without local paths', () => {
    const directory = mkdtempSync(join(tmpdir(), 'synapsenote-metrics-'));
    mkdirSync(join(directory, 'nested'));
    writeFileSync(
      join(directory, 'nested', 'unit.xml'),
      `<testsuite><testcase classname="unit" name="pass" file="src/unit.test.ts" time="0.25" /><testcase classname="unit" name="skip" time="0"><skipped /></testcase><testcase classname="unit" name="fail" time="0.5"><failure>boom</failure></testcase></testsuite>`,
    );
    const previousCache = process.env.TEST_FEEDBACK_TURBO_CACHE_HIT;
    const previousRetry = process.env.TEST_FEEDBACK_RETRY_COUNT;
    const previousWallClock = process.env.TEST_FEEDBACK_WALL_CLOCK_MS;
    process.env.TEST_FEEDBACK_TURBO_CACHE_HIT = '1';
    process.env.TEST_FEEDBACK_RETRY_COUNT = '0';
    process.env.TEST_FEEDBACK_WALL_CLOCK_MS = '1200';
    try {
      const report = collectOperationsMetrics(directory);
      expect(report.cache.hit).toBe(true);
      expect(report.wallClockMs).toBe(1200);
      expect(report.retry.retryCount).toBe(0);
      expect(report.test).toMatchObject({
        failedCount: 1,
        skippedCount: 1,
        totalCases: 3,
        totalDurationMs: 750,
      });
      expect(report.source.startsWith('synapsenote-metrics-')).toBe(true);
      expect(JSON.stringify(report)).not.toContain(directory);
    } finally {
      if (previousCache === undefined) delete process.env.TEST_FEEDBACK_TURBO_CACHE_HIT;
      else process.env.TEST_FEEDBACK_TURBO_CACHE_HIT = previousCache;
      if (previousRetry === undefined) delete process.env.TEST_FEEDBACK_RETRY_COUNT;
      else process.env.TEST_FEEDBACK_RETRY_COUNT = previousRetry;
      if (previousWallClock === undefined) delete process.env.TEST_FEEDBACK_WALL_CLOCK_MS;
      else process.env.TEST_FEEDBACK_WALL_CLOCK_MS = previousWallClock;
    }
  });
});
