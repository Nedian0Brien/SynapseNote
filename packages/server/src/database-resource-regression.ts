import { arch, platform, release } from 'node:os';
import { queryDatabaseRecords } from '@nedian0brien/synapsenote-core';
import {
  databaseBenchmarkCorpusSpec,
  iterateDatabaseBenchmarkRecords,
} from './database-benchmark-corpus.ts';
import { createDatabaseContextPack } from './database-context-pack.ts';

export const DATABASE_RESOURCE_REGRESSION_BUDGETS = Object.freeze({
  retainedMemoryBytes: 320 * 1024 * 1024,
  indexBytes: 128 * 1024 * 1024,
  contextTokens: 7_500,
  minimumPackedRecords: 90,
});

export interface DatabaseResourceRegressionResult {
  version: 1;
  benchmark: 'database-resource-regression';
  scale: '50k';
  records: number;
  seed: number;
  metrics: {
    retainedMemory: {
      bytes: number;
      budgetBytes: number;
      model: 'js-structural-v1';
      passed: boolean;
    };
    indexSize: {
      bytes: number;
      budgetBytes: number;
      encoding: 'canonical-jsonl-utf8';
      passed: boolean;
    };
    tokenUse: {
      estimatedTokens: number;
      budgetTokens: number;
      minimumReturned: number;
      returned: number;
      payloadBytes: number;
      tokenizer: 'utf8_bytes_div3';
      passed: boolean;
    };
  };
  passed: boolean;
  runtime: { bun: string; node: string; platform: string; release: string; arch: string };
}

/** Stable retained-size model used for regression comparison, not a heap-profiler substitute. */
function structuralBytes(value: unknown): number {
  if (value === null || value === undefined) return 8;
  if (typeof value === 'string') return 24 + value.length * 2;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 4;
  if (Array.isArray(value)) {
    return (
      24 + value.length * 8 + value.reduce((total, entry) => total + structuralBytes(entry), 0)
    );
  }
  if (typeof value === 'object') {
    return (
      32 +
      Object.entries(value).reduce(
        (total, [key, entry]) => total + 16 + key.length * 2 + structuralBytes(entry),
        0,
      )
    );
  }
  return 0;
}

/** Deterministic 50k regression gate for retained projection, index payload, and agent tokens. */
export function runDatabaseResourceRegression(): DatabaseResourceRegressionResult {
  const spec = databaseBenchmarkCorpusSpec('50k');
  const source = spec.definition.sources[0];
  if (!source) throw new Error('Benchmark source is missing');
  const records = [...iterateDatabaseBenchmarkRecords(spec)];
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const encoder = new TextEncoder();
  const retainedBytes = structuralBytes(records);
  const indexBytes = records.reduce(
    (total, record) => total + encoder.encode(JSON.stringify(record)).byteLength + 1,
    0,
  );
  const pack = createDatabaseContextPack(
    {
      describe: () => ({
        manifestRevision: `benchmark:${spec.seed}`,
        schemaRevision: `benchmark:${spec.seed}:schema`,
        database: spec.definition,
        source,
      }),
      query: ({ query }) => ({
        ...queryDatabaseRecords({
          source,
          records,
          query,
          snapshotRevision: `benchmark:50k:${spec.seed}`,
          people: spec.definition.people,
        }),
        indexRevision: `benchmark:50k:${spec.seed}`,
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
      databaseId: spec.definition.id,
      sourceId: source.id,
      goal: 'Summarize active high-scoring work',
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
  );
  const retainedMemory = {
    bytes: retainedBytes,
    budgetBytes: DATABASE_RESOURCE_REGRESSION_BUDGETS.retainedMemoryBytes,
    model: 'js-structural-v1' as const,
    passed: retainedBytes <= DATABASE_RESOURCE_REGRESSION_BUDGETS.retainedMemoryBytes,
  };
  const indexSize = {
    bytes: indexBytes,
    budgetBytes: DATABASE_RESOURCE_REGRESSION_BUDGETS.indexBytes,
    encoding: 'canonical-jsonl-utf8' as const,
    passed: indexBytes <= DATABASE_RESOURCE_REGRESSION_BUDGETS.indexBytes,
  };
  const tokenUse = {
    estimatedTokens: pack.budget.estimatedTokens,
    budgetTokens: DATABASE_RESOURCE_REGRESSION_BUDGETS.contextTokens,
    minimumReturned: DATABASE_RESOURCE_REGRESSION_BUDGETS.minimumPackedRecords,
    returned: pack.returned,
    payloadBytes: encoder.encode(JSON.stringify(pack)).byteLength,
    tokenizer: 'utf8_bytes_div3' as const,
    passed:
      pack.budget.estimatedTokens <= DATABASE_RESOURCE_REGRESSION_BUDGETS.contextTokens &&
      pack.returned >= DATABASE_RESOURCE_REGRESSION_BUDGETS.minimumPackedRecords,
  };
  return {
    version: 1,
    benchmark: 'database-resource-regression',
    scale: '50k',
    records: spec.recordCount,
    seed: spec.seed,
    metrics: { retainedMemory, indexSize, tokenUse },
    passed: retainedMemory.passed && indexSize.passed && tokenUse.passed,
    runtime: {
      bun: process.versions.bun ?? 'unknown',
      node: process.versions.node,
      platform: platform(),
      release: release(),
      arch: arch(),
    },
  };
}
