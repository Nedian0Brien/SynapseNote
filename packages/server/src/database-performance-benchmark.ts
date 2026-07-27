import { arch, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { queryDatabaseRecords } from '@nedian0brien/synapsenote-core';
import {
  type DatabaseBenchmarkScale,
  databaseBenchmarkCorpusSpec,
  iterateDatabaseBenchmarkRecords,
} from './database-benchmark-corpus.ts';

export interface DatabaseTypedQueryBenchmarkResult {
  version: 1;
  benchmark: 'warm-typed-query';
  scale: DatabaseBenchmarkScale;
  records: number;
  properties: number;
  seed: number;
  warmups: number;
  samples: number;
  budgetMs: number;
  memoryBudgetBytes: number;
  peakRssBytes: number;
  latencyMs: { min: number; p50: number; p95: number; p99: number; max: number; mean: number };
  matched: number;
  returned: number;
  passed: boolean;
  runtime: { bun: string; node: string; platform: string; release: string; arch: string };
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function runWarmTypedQueryBenchmark(
  options: {
    scale?: DatabaseBenchmarkScale;
    warmups?: number;
    samples?: number;
    budgetMs?: number;
    memoryBudgetBytes?: number;
  } = {},
): DatabaseTypedQueryBenchmarkResult {
  const scale = options.scale ?? '50k';
  const warmups = options.warmups ?? 5;
  const samples = options.samples ?? 30;
  const budgetMs = options.budgetMs ?? 150;
  const memoryBudgetBytes = options.memoryBudgetBytes ?? 256 * 1024 * 1024;
  if (!Number.isInteger(warmups) || warmups < 1 || warmups > 100) {
    throw new RangeError('Warm typed-query benchmark requires 1..100 warmups');
  }
  if (!Number.isInteger(samples) || samples < 5 || samples > 1_000) {
    throw new RangeError('Warm typed-query benchmark requires 5..1000 samples');
  }
  const spec = databaseBenchmarkCorpusSpec(scale);
  const source = spec.definition.sources[0];
  if (!source) throw new Error('Benchmark source is missing');
  const baselineRssBytes = process.memoryUsage().rss;
  const records = [...iterateDatabaseBenchmarkRecords(spec)];
  let peakRssBytes = Math.max(0, process.memoryUsage().rss - baselineRssBytes);
  const query = {
    where: {
      and: [
        { propertyId: 'prop_bench_status', operator: 'eq', value: 'opt_bench_status_active' },
        { propertyId: 'prop_bench_score', operator: 'gte', value: 40 },
        { propertyId: 'prop_bench_active', operator: 'eq', value: true },
      ],
    },
    sort: [
      { propertyId: 'prop_bench_score', direction: 'desc' },
      { propertyId: 'prop_bench_due', direction: 'asc' },
    ],
    select: [
      'prop_bench_title',
      'prop_bench_status',
      'prop_bench_priority',
      'prop_bench_score',
      'prop_bench_due',
    ],
    page: { limit: 100 },
  } as const;
  let matched = 0;
  let returned = 0;
  const execute = () => {
    const result = queryDatabaseRecords({
      source,
      records,
      query,
      snapshotRevision: `benchmark:${scale}:${spec.seed}`,
      people: spec.definition.people,
    });
    matched = result.matched;
    returned = result.returned;
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss - baselineRssBytes);
  };
  for (let index = 0; index < warmups; index += 1) execute();
  const timings: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    execute();
    timings.push(performance.now() - started);
  }
  const mean = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  const latencyMs = {
    min: rounded(Math.min(...timings)),
    p50: rounded(percentile(timings, 0.5)),
    p95: rounded(percentile(timings, 0.95)),
    p99: rounded(percentile(timings, 0.99)),
    max: rounded(Math.max(...timings)),
    mean: rounded(mean),
  };
  return {
    version: 1,
    benchmark: 'warm-typed-query',
    scale,
    records: spec.recordCount,
    properties: source.properties.length,
    seed: spec.seed,
    warmups,
    samples,
    budgetMs,
    latencyMs,
    matched,
    returned,
    memoryBudgetBytes,
    peakRssBytes,
    passed: latencyMs.p95 < budgetMs && peakRssBytes <= memoryBudgetBytes,
    runtime: {
      bun: process.versions.bun ?? 'unknown',
      node: process.versions.node,
      platform: platform(),
      release: release(),
      arch: arch(),
    },
  };
}
