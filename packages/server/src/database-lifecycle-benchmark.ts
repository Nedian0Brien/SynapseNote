import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  DatabaseDefinitionSchema,
  materializeDatabaseDerivedRecords,
  planDatabaseMarkdownV2Migration,
  queryDatabaseRecords,
} from '@nedian0brien/synapsenote-core';
import {
  databaseBenchmarkCorpusSpec,
  databaseBenchmarkRecord,
  iterateDatabaseBenchmarkRecords,
  materializeDatabaseBenchmarkCorpus,
} from './database-benchmark-corpus.ts';
import { createDatabaseContextPack } from './database-context-pack.ts';
import { createDatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
import { DatabaseRecordIndex } from './database-record-index.ts';
import { DatabaseStore } from './database-store.ts';

export const DATABASE_LIFECYCLE_BUDGETS_MS = Object.freeze({
  coldStartup: 250,
  initialIndex: 5_000,
  incrementalIndex: 50,
  formulaPropagation: 500,
  contextPacking: 150,
  cellCommit: 250,
  migrationThroughput: 2_000,
});
/** Reference-machine RSS delta budget for the combined 50k context fixture. */
export const DATABASE_LIFECYCLE_MEMORY_BUDGET_BYTES = 2_048 * 1024 * 1024;

export interface DatabaseLifecycleBenchmarkMetric {
  scale: '100' | '1k' | '50k';
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
    cellCommit: DatabaseLifecycleBenchmarkMetric;
    migrationThroughput: DatabaseLifecycleBenchmarkMetric;
  };
  peakRssBytes: number;
  memoryBudgetBytes: number;
  memoryPassed: boolean;
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

function v2BenchmarkDefinition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_lifecycle_bench',
    key: 'lifecycle_bench',
    name: 'Lifecycle benchmark',
    contract: {
      purpose: 'Measure canonical v2 cell commits',
      canonicality: 'canonical',
      vocabulary: ['benchmark'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_lifecycle_bench',
        key: 'bench',
        name: 'Benchmark rows',
        recordMeaning: 'One benchmark row',
        folder: 'bench',
        includeSubfolders: true,
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'bench.md', blockId: 'dbb_lifecycle_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title', 'prop_notes'],
        },
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
        ],
      },
    ],
  });
}

function v2BenchmarkOwner(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const id = String(index).padStart(4, '0');
    return `| [[bench/row-${id}]] | note-${id} |`;
  });
  return [
    '<!-- synapsenote:database',
    'version=2',
    'database=db_lifecycle_bench',
    'source=ds_lifecycle_bench',
    'block=dbb_lifecycle_primary',
    'columns=prop_title,prop_notes',
    '-->',
    '',
    '| Title | Notes |',
    '| --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

async function seedV2CellBenchmark(root: string, rowCount = 100): Promise<void> {
  const contentDir = resolve(root, 'v2-content');
  const definition = v2BenchmarkDefinition();
  await mkdir(resolve(root, '.ok', 'databases'), { recursive: true });
  await mkdir(resolve(contentDir, 'bench'), { recursive: true });
  // Use the product manifest writer so this fixture cannot drift from the
  // store's key-derived filename and load rules.
  const store = new DatabaseStore({ projectDir: root, contentDir });
  await store.create(definition);
  await writeFile(resolve(contentDir, 'bench.md'), v2BenchmarkOwner(rowCount), 'utf8');
  await Promise.all(
    Array.from({ length: rowCount }, (_, index) => {
      const id = String(index).padStart(4, '0');
      return writeFile(
        resolve(contentDir, 'bench', `row-${id}.md`),
        `---\n_sn:\n  document_id: doc_lifecycle_${id}\n---\n# Row ${id}\n\nBenchmark row ${id}.\n`,
        'utf8',
      );
    }),
  );
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
  options: { samples?: number; root?: string; memoryBudgetBytes?: number } = {},
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
  const memoryBudgetBytes = options.memoryBudgetBytes ?? DATABASE_LIFECYCLE_MEMORY_BUDGET_BYTES;
  if (!Number.isSafeInteger(memoryBudgetBytes) || memoryBudgetBytes <= 0) {
    throw new RangeError('Database lifecycle memory budget must be a positive integer');
  }

  try {
    const corpus = await materializeDatabaseBenchmarkCorpus({
      root,
      scale: '1k',
      format: 'markdown',
    });
    // Corpus materialization is setup work. Measure the product paths as a
    // process-relative RSS delta so results are comparable across runs.
    const baselineRssBytes = process.memoryUsage().rss;
    let peakRssBytes = 0;
    const observeMemory = () => {
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss - baselineRssBytes);
    };
    const coldStartupTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const store = new DatabaseStore({ projectDir: root, contentDir });
      const result = await timed(() => store.reload());
      if (result.value.databases.length !== 1) throw new Error('Cold startup lost the manifest');
      coldStartupTimings.push(result.elapsed);
      observeMemory();
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
      observeMemory();
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
      observeMemory();
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
      observeMemory();
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
      observeMemory();
    }

    const cellCommitRoot = resolve(root, 'v2-cell-commit');
    await seedV2CellBenchmark(cellCommitRoot);
    const cellContentDir = resolve(cellCommitRoot, 'v2-content');
    const cellStore = new DatabaseStore({ projectDir: cellCommitRoot, contentDir: cellContentDir });
    await cellStore.reload();
    const cellIndex = new DatabaseRecordIndex({
      contentDir: cellContentDir,
      databaseStore: cellStore,
    });
    await cellIndex.rebuild();
    const cellWriter = createDatabaseMarkdownTableWriter({
      projectDir: cellCommitRoot,
      contentDir: cellContentDir,
      databaseStore: cellStore,
      databaseRecordIndex: cellIndex,
    });
    const cellRecord = cellIndex.list()[0];
    if (!cellRecord) throw new Error('Cell-commit benchmark row is missing');
    if (!cellRecord.id.startsWith('rec_'))
      throw new Error(`Cell-commit benchmark identity is invalid: ${cellRecord.id}`);
    const cellCommitTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const ownerPath = resolve(cellContentDir, 'bench.md');
      const owner = await readFile(ownerPath, 'utf8');
      const ownerRevision = `sha256:${createHash('sha256').update(owner).digest('hex')}`;
      const result = await timed(() =>
        cellWriter.updateCell({
          databaseId: 'db_lifecycle_bench',
          sourceId: 'ds_lifecycle_bench',
          recordId: cellRecord.id,
          propertyId: 'prop_notes',
          value: `commit-${index}`,
          expectedOwnerRevision: ownerRevision,
        }),
      );
      if (!result.value.changed) throw new Error('Cell-commit benchmark did not change the owner');
      cellCommitTimings.push(result.elapsed);
      observeMemory();
    }

    const migrationRecords = await Promise.all(
      [...iterateDatabaseBenchmarkRecords(spec1k)].map(async (record) => ({
        recordId: record.id,
        databaseId: record.databaseId,
        sourceId: record.sourceId,
        path: record.path,
        markdown: await readFile(resolve(contentDir, record.path), 'utf8'),
      })),
    );
    const titleChoices = Object.fromEntries(
      migrationRecords.map((record) => [record.recordId, { kind: 'use_record_title' as const }]),
    );
    const migrationThroughputTimings: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const result = await timed(() =>
        planDatabaseMarkdownV2Migration({
          definition: spec1k.definition,
          records: migrationRecords,
          owners: [
            {
              sourceId: 'ds_benchmark_records',
              path: 'benchmark-owner.md',
              blockId: 'dbb_benchmark_primary',
            },
          ],
          preserveLegacyMetadata: true,
          migrationCommittedAt: '2026-07-27T00:00:00.000Z',
          titleChoices,
        }),
      );
      if (result.value.status !== 'ready') {
        throw new Error(
          `Migration benchmark produced blockers: ${result.value.blockers[0]?.code ?? 'unknown'}`,
        );
      }
      migrationThroughputTimings.push(result.elapsed);
      observeMemory();
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
      cellCommit: metric('100', cellCommitTimings, DATABASE_LIFECYCLE_BUDGETS_MS.cellCommit),
      migrationThroughput: metric(
        '1k',
        migrationThroughputTimings,
        DATABASE_LIFECYCLE_BUDGETS_MS.migrationThroughput,
      ),
    };
    const memoryPassed = peakRssBytes <= memoryBudgetBytes;
    return {
      version: 1,
      benchmark: 'database-lifecycle',
      seed: spec1k.seed,
      corpusDigest: corpus.digest,
      metrics,
      peakRssBytes,
      memoryBudgetBytes,
      memoryPassed,
      passed: memoryPassed && Object.values(metrics).every((entry) => entry.passed),
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
