import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  DATABASE_BENCHMARK_SCALES,
  databaseBenchmarkCorpusSpec,
  databaseBenchmarkRecord,
  iterateDatabaseBenchmarkRecords,
  materializeDatabaseBenchmarkCorpus,
} from './database-benchmark-corpus.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

describe('database benchmark corpus', () => {
  test('defines deterministic 1k, 50k, 500k, and 1m scales with 30 realistic properties', () => {
    expect(DATABASE_BENCHMARK_SCALES).toEqual({
      '1k': 1_000,
      '50k': 50_000,
      '500k': 500_000,
      '1m': 1_000_000,
    });
    for (const scale of Object.keys(DATABASE_BENCHMARK_SCALES) as Array<
      keyof typeof DATABASE_BENCHMARK_SCALES
    >) {
      const spec = databaseBenchmarkCorpusSpec(scale);
      expect(DatabaseDefinitionSchema.parse(spec.definition)).toEqual(spec.definition);
      expect(spec.recordCount).toBe(DATABASE_BENCHMARK_SCALES[scale]);
      const properties = spec.definition.sources[0]?.properties ?? [];
      expect(properties).toHaveLength(30);
      expect(properties.filter((property) => property.type === 'formula')).toHaveLength(2);
      expect(properties.filter((property) => property.type === 'rollup')).toHaveLength(1);
    }
  });

  test('generates stable bounded body, missing-value, relation, and typed-value distributions', () => {
    const spec = databaseBenchmarkCorpusSpec('1k');
    expect(databaseBenchmarkRecord(spec, 417)).toEqual(databaseBenchmarkRecord(spec, 417));
    expect(() => databaseBenchmarkRecord(spec, 1_000)).toThrow(RangeError);
    const records = [...iterateDatabaseBenchmarkRecords(spec)];
    expect(records).toHaveLength(1_000);
    expect(new Set(records.map((record) => record.id)).size).toBe(1_000);
    expect(records.every((record) => record.values.prop_bench_title)).toBe(true);
    expect(records.every((record) => record.body.length <= 16_001)).toBe(true);
    expect(
      records.every((record) => (record.values.prop_bench_dependencies as string[]).length <= 20),
    ).toBe(true);
    const emptyBodies = records.filter((record) => record.body === '').length;
    const missingDescriptions = records.filter(
      (record) => record.values.prop_bench_description === undefined,
    ).length;
    expect(emptyBodies).toBeGreaterThanOrEqual(70);
    expect(emptyBodies).toBeLessThanOrEqual(130);
    expect(missingDescriptions).toBeGreaterThanOrEqual(110);
    expect(missingDescriptions).toBeLessThanOrEqual(190);
  });

  test('materializes reproducible streaming JSONL without retaining the full corpus', async () => {
    const first = await mkdtemp(join(tmpdir(), 'synapsenote-benchmark-a-'));
    const second = await mkdtemp(join(tmpdir(), 'synapsenote-benchmark-b-'));
    try {
      const left = await materializeDatabaseBenchmarkCorpus({ root: first, scale: '1k' });
      const right = await materializeDatabaseBenchmarkCorpus({ root: second, scale: '1k' });
      expect(left).toEqual(right);
      expect(left).toMatchObject({ files: 2, digest: expect.stringMatching(/^sha256:/) });
      const lines = (await readFile(join(first, '.benchmark', '1k-records.ndjson'), 'utf8'))
        .trimEnd()
        .split('\n');
      expect(lines).toHaveLength(1_000);
      expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ id: 'rec_bench_0000000' });
      await expect(
        materializeDatabaseBenchmarkCorpus({ root: first, scale: '1k' }),
      ).rejects.toThrow('must be empty');
    } finally {
      await Promise.all([
        rm(first, { recursive: true, force: true }),
        rm(second, { recursive: true, force: true }),
      ]);
    }
  });

  test('materializes canonical Markdown that the real store and record index consume', async () => {
    const root = await mkdtemp(join(tmpdir(), 'synapsenote-benchmark-markdown-'));
    try {
      const materialized = await materializeDatabaseBenchmarkCorpus({
        root,
        scale: '1k',
        format: 'markdown',
      });
      expect(materialized.files).toBe(1_001);
      const store = createDatabaseStore({ projectDir: root, contentDir: root });
      const snapshot = await store.reload();
      expect(snapshot.databases).toHaveLength(1);
      const index = createDatabaseRecordIndex({ contentDir: root, databaseStore: store });
      let heartbeats = 0;
      const heartbeat = setInterval(() => {
        heartbeats += 1;
      }, 1);
      const result = await index.rebuild().finally(() => clearInterval(heartbeat));
      expect(result).toMatchObject({ indexed: 1_000, invalid: 0 });
      expect(heartbeats).toBeGreaterThan(10);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
