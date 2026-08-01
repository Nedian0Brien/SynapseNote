import { describe, expect, test } from 'bun:test';
import { runDatabaseLifecycleBenchmark } from './database-lifecycle-benchmark.ts';

describe('database lifecycle performance benchmark', () => {
  test('measures real canonical startup, indexing, derived work, commits, and migration planning', async () => {
    const result = await runDatabaseLifecycleBenchmark({ samples: 5 });
    expect(result).toMatchObject({
      version: 1,
      benchmark: 'database-lifecycle',
      runtime: { bun: expect.any(String), node: expect.any(String) },
      peakRssBytes: expect.any(Number),
      memoryBudgetBytes: expect.any(Number),
      memoryPassed: true,
    });
    const metrics = Object.values(result.metrics);
    expect(metrics).toHaveLength(7);
    for (const measured of metrics) {
      expect(measured.samples).toBe(5);
      expect(measured.latencyMs.min).toBeLessThanOrEqual(measured.latencyMs.p50);
      expect(measured.latencyMs.p50).toBeLessThanOrEqual(measured.latencyMs.p95);
      expect(measured.latencyMs.p95).toBeLessThanOrEqual(measured.latencyMs.max);
      expect(measured.passed).toBe(measured.latencyMs.p95 < measured.budgetMs);
    }
    expect(result.peakRssBytes <= result.memoryBudgetBytes).toBe(true);
    expect(result.passed).toBe(metrics.every((measured) => measured.passed));
    // The seven five-sample product paths take ~23s alone. This test runs in the
    // database category alongside Turbo's four package workers, so match the
    // server harness's contention-safe ceiling instead of overriding it at 60s.
  }, 120_000);
});
