import { readFile, rm } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  materializeDatabaseDerivedRecords,
  queryDatabaseRecords,
} from '@nedian0brien/synapsenote-core';
import {
  databaseBenchmarkCorpusSpec,
  databaseBenchmarkRecord,
  iterateDatabaseBenchmarkRecords,
  materializeDatabaseBenchmarkCorpus,
} from './database-benchmark-corpus.ts';
import { createDatabaseContextPack } from './database-context-pack.ts';
import { DatabaseRecordIndex } from './database-record-index.ts';
import { DatabaseStore } from './database-store.ts';

export const DATABASE_LIFECYCLE_BUDGETS_MS = Object.freeze({
  coldStartup: 250,
  initialIndex: 5_000,
  incrementalIndex: 50,
  formulaPropagation: 500,
  contextPacking: 150,
});

export interface DatabaseLifecycleBenchmarkMetric {
  scale: '1k' | '50k';
  samples: number;
  budgetMs: number;
  latencyMs: { min: number; p50: number; p95: number; max: number; mean: number };
  passed: boolean;
}

export interface DatabaseLifecycleBenchmarkResult {
  version: 1;
  benchmark: 'database-lifecycle';
  seed: number;
  corpusDigest: string;
  metrics: {
    coldStartup: DatabaseLifecycleBenchmarkMetric;
    initialIndex: DatabaseLifecycleBenchmarkMetric;
    incrementalIndex: DatabaseLifecycleBenchmarkMetric;
    formulaPropagation: DatabaseLifecycleBenchmarkMetric;
    contextPacking: DatabaseLifecycleBenchmarkMetric;
  };
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

function metric(
  scale: DatabaseLifecycleBenchmarkMetric['scale'],
  timings: readonly number[],
  budgetMs: number,
): DatabaseLifecycleBenchmarkMetric {
  const mean = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  const latencyMs = {
    min: rounded(Math.min(...timings)),
    p50: rounded(percentile(timings, 0.5)),
    p95: rounded(percentile(timings, 0.95)),
    max: rounded(Math.max(...timings)),
    mean: rounded(mean),
  };
  return {
    scale,
    samples: timings.length,
    budgetMs,
    latencyMs,
    passed: latencyMs.p95 < budgetMs,
  };
}

async function timed<T>(operation: () => T | Promise<T>): Promise<{ value: T; elapsed: number }> {
  const started = performance.now();
  const value = await operation();
  return { value, elapsed: performance.now() - started };
}

/**
 * Measures the database-specific product paths without starting unrelated HTTP,
 * collaboration, or desktop services. Corpus materialization is setup work and
 * is intentionally excluded from the timings.
 */
export async function runDatabaseLifecycleBenchmark(
  options: { samples?: number; root?: string } = {},
): Promise<DatabaseLifecycleBenchmarkResult> {
  const samples = options.samples ?? 5;
  if (!Number.isInteger(samples) || samples < 5 || samples > 30) {
    throw new RangeError('Database lifecycle benchmark requires 5..30 samples');
  }
  const root = resolve(
    options.root ??
      resolve(tmpdir(), `synapsenote-database-lifecycle-${process.pid}-${Date.now()}`),
  );
  const contentDir = root;
  const spec1k = databaseBenchmarkCorpusSpec('1k');
  const spec50k = databaseBenchmarkCorpusSpec('50k');
  const source50k = spec50k.definition.sources[0];
  if (!source50k) throw new Error('Benchmark source is missing');

  try {
    const corpus = await materializeDatabaseBenchmarkCorpus({
      root,
      scale: '1k',
      format: 'markdown',
    });
    const coldStartupTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const store = new DatabaseStore({ projectDir: root, contentDir });
      const result = await timed(() => store.reload());
      if (result.value.databases.length !== 1) throw new Error('Cold startup lost the manifest');
      coldStartupTimings.push(result.elapsed);
    }

    const initialIndexTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const store = new DatabaseStore({ projectDir: root, contentDir });
      const recordIndex = new DatabaseRecordIndex({ contentDir, databaseStore: store });
      const result = await timed(() => recordIndex.rebuild());
      if (result.value.indexed !== 1_000 || result.value.invalid !== 0) {
        throw new Error('Initial index did not consume the canonical 1k corpus');
      }
      initialIndexTimings.push(result.elapsed);
    }

    const store = new DatabaseStore({ projectDir: root, contentDir });
    const recordIndex = new DatabaseRecordIndex({ contentDir, databaseStore: store });
    await recordIndex.rebuild();
    const changedRecord = databaseBenchmarkRecord(spec1k, 0);
    const changedPath = resolve(contentDir, changedRecord.path);
    const canonicalMarkdown = await readFile(changedPath, 'utf8');
    const incrementalIndexTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const markdown = `${canonicalMarkdown}\nbenchmark incremental revision ${index}\n`;
      const result = await timed(() => recordIndex.upsertPath(changedRecord.path, markdown));
      if (!recordIndex.getById(changedRecord.id))
        throw new Error('Incremental upsert lost its row');
      incrementalIndexTimings.push(result.elapsed);
    }

    const formulaRecords = [...iterateDatabaseBenchmarkRecords(spec1k)];
    const firstFormulaRecord = formulaRecords[0];
    if (!firstFormulaRecord) throw new Error('Formula benchmark record is missing');
    const formulaPropagationTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      formulaRecords[0] = {
        ...firstFormulaRecord,
        values: { ...firstFormulaRecord.values, prop_bench_score: 70 + index },
      };
      const result = await timed(() =>
        materializeDatabaseDerivedRecords({
          definition: spec1k.definition,
          records: formulaRecords,
          context: { now: '2026-07-21T00:00:00.000Z', timeZone: 'UTC', locale: 'en' },
          permissionRevision: 'benchmark:all-readable',
        }),
      );
      if (result.value.length !== 1_000) throw new Error('Formula projection lost records');
      formulaPropagationTimings.push(result.elapsed);
    }

    const contextRecords = [...iterateDatabaseBenchmarkRecords(spec50k)];
    const recordsById = new Map(contextRecords.map((record) => [record.id, record]));
    const contextPackingTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const result = await timed(() =>
        createDatabaseContextPack(
          {
            describe: () => ({
              manifestRevision: `benchmark:${spec50k.seed}`,
              schemaRevision: `benchmark:${spec50k.seed}:schema`,
              database: spec50k.definition,
              source: source50k,
            }),
            query: ({ query }) => ({
              ...queryDatabaseRecords({
                source: source50k,
                records: contextRecords,
                query,
                snapshotRevision: `benchmark:50k:${spec50k.seed}`,
                people: spec50k.definition.people,
              }),
              indexRevision: `benchmark:50k:${spec50k.seed}`,
            }),
            searchText: () => {
              throw new Error('Record disclosure must not invoke lexical search');
            },
            getRecord: (recordId) => ({
              record: recordsById.get(recordId) ?? null,
              deniedRecord: false,
              deniedPropertyIds: [],
            }),
          },
          {
            databaseId: spec50k.definition.id,
            sourceId: source50k.id,
            goal: `Summarize active high-scoring work (${index})`,
            query: {
              includeArchived: false,
              where: {
                and: [
                  {
                    propertyId: 'prop_bench_status',
                    operator: 'eq',
                    value: 'opt_bench_status_active',
                  },
                  { propertyId: 'prop_bench_score', operator: 'gte', value: 40 },
                ],
              },
              sort: [{ propertyId: 'prop_bench_score', direction: 'desc' }],
            },
            propertyIds: [
              'prop_bench_title',
              'prop_bench_status',
              'prop_bench_priority',
              'prop_bench_score',
              'prop_bench_due',
            ],
            maxTokens: 8_000,
            reserveTokens: 500,
            tokenizer: 'utf8_bytes_div3',
            encoding: 'columnar_dictionary',
            disclosure: { level: 'records' },
            recordLimit: 500,
          },
        ),
      );
      if (result.value.returned < 1 || result.value.budget.estimatedTokens > 7_500) {
        throw new Error('Context pack violated its result or token contract');
      }
      contextPackingTimings.push(result.elapsed);
    }

    const metrics = {
      coldStartup: metric('1k', coldStartupTimings, DATABASE_LIFECYCLE_BUDGETS_MS.coldStartup),
      initialIndex: metric('1k', initialIndexTimings, DATABASE_LIFECYCLE_BUDGETS_MS.initialIndex),
      incrementalIndex: metric(
        '1k',
        incrementalIndexTimings,
        DATABASE_LIFECYCLE_BUDGETS_MS.incrementalIndex,
      ),
      formulaPropagation: metric(
        '1k',
        formulaPropagationTimings,
        DATABASE_LIFECYCLE_BUDGETS_MS.formulaPropagation,
      ),
      contextPacking: metric(
        '50k',
        contextPackingTimings,
        DATABASE_LIFECYCLE_BUDGETS_MS.contextPacking,
      ),
    };
    return {
      version: 1,
      benchmark: 'database-lifecycle',
      seed: spec1k.seed,
      corpusDigest: corpus.digest,
      metrics,
      passed: Object.values(metrics).every((entry) => entry.passed),
      runtime: {
        bun: process.versions.bun ?? 'unknown',
        node: process.versions.node,
        platform: platform(),
        release: release(),
        arch: arch(),
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
