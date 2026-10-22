import { describe, expect, test } from 'bun:test';
import { runDatabaseLifecycleBenchmark } from './database-lifecycle-benchmark.ts';

describe('database lifecycle performance benchmark', () => {
  test('measures real canonical startup, indexing, formulas, and context packing', async () => {
    const result = await runDatabaseLifecycleBenchmark({ samples: 5 });
    expect(result).toMatchObject({
      version: 1,
      benchmark: 'database-lifecycle',
      runtime: { bun: expect.any(String), node: expect.any(String) },
    });
    const metrics = Object.values(result.metrics);
    expect(metrics).toHaveLength(5);
    for (const measured of metrics) {
      expect(measured.samples).toBe(5);
      expect(measured.latencyMs.min).toBeLessThanOrEqual(measured.latencyMs.p50);
      expect(measured.latencyMs.p50).toBeLessThanOrEqual(measured.latencyMs.p95);
      expect(measured.latencyMs.p95).toBeLessThanOrEqual(measured.latencyMs.max);
      expect(measured.passed).toBe(measured.latencyMs.p95 < measured.budgetMs);
    }
    expect(result.passed).toBe(metrics.every((measured) => measured.passed));
  }, 60_000);
});
