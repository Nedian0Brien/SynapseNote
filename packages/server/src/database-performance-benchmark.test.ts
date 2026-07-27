import { describe, expect, test } from 'bun:test';
import { runWarmTypedQueryBenchmark } from './database-performance-benchmark.ts';

describe('database performance benchmark harness', () => {
  test('runs warm typed queries against the shared corpus and reports a reproducible gate', () => {
    const result = runWarmTypedQueryBenchmark({
      scale: '1k',
      warmups: 1,
      samples: 5,
      budgetMs: 2_000,
      memoryBudgetBytes: 1_024 * 1024 * 1024,
    });
    expect(result).toMatchObject({
      version: 1,
      benchmark: 'warm-typed-query',
      scale: '1k',
      records: 1_000,
      properties: 30,
      warmups: 1,
      samples: 5,
      budgetMs: 2_000,
      returned: 100,
      passed: true,
      runtime: { bun: expect.any(String), node: expect.any(String) },
    });
    expect(result.matched).toBeGreaterThan(100);
    expect(result.latencyMs.min).toBeLessThanOrEqual(result.latencyMs.p50);
    expect(result.latencyMs.p50).toBeLessThanOrEqual(result.latencyMs.p95);
    expect(result.latencyMs.p95).toBeLessThanOrEqual(result.latencyMs.p99);
    expect(result.latencyMs.p99).toBeLessThanOrEqual(result.latencyMs.max);
    expect(result.peakRssBytes).toBeLessThanOrEqual(result.memoryBudgetBytes);
  });

  test('records the supported 50k numeric latency and RSS SLO', () => {
    const result = runWarmTypedQueryBenchmark({
      scale: '50k',
      warmups: 1,
      samples: 5,
      budgetMs: 250,
      memoryBudgetBytes: 1_024 * 1024 * 1024,
    });
    expect(result).toMatchObject({
      version: 1,
      benchmark: 'warm-typed-query',
      scale: '50k',
      records: 50_000,
      samples: 5,
      budgetMs: 250,
      returned: 100,
      passed: true,
    });
    expect(result.latencyMs.p50).toBeLessThanOrEqual(result.latencyMs.p95);
    expect(result.latencyMs.p95).toBeLessThan(250);
    expect(result.peakRssBytes).toBeLessThanOrEqual(result.memoryBudgetBytes);
  }, 30_000);
});
