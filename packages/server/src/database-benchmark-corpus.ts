import { createHash } from 'node:crypto';
import { mkdir, open, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabaseRecord,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { stringify } from 'yaml';

export const DATABASE_BENCHMARK_SCALES = {
  '1k': 1_000,
  '50k': 50_000,
  '500k': 500_000,
  '1m': 1_000_000,
} as const;
export type DatabaseBenchmarkScale = keyof typeof DATABASE_BENCHMARK_SCALES;
export const DATABASE_BENCHMARK_SEED = 0x5a17_2026;
export const DATABASE_BENCHMARK_DISTRIBUTION = Object.freeze({
  properties: 30,
  body: {
    empty: 0.1,
    short: 0.7,
    medium: 0.18,
    long: 0.02,
    shortBytes: [80, 400] as const,
    mediumBytes: [1_000, 4_000] as const,
    longBytes: [8_000, 16_000] as const,
  },
  relations: {
    empty: 0.2,
    small: 0.55,
    medium: 0.2,
    large: 0.05,
    smallCount: [1, 3] as const,
    mediumCount: [4, 8] as const,
    largeCount: [9, 20] as const,
  },
  optionalValueMissing: 0.15,
  formulas: 2,
  rollups: 1,
  people: 50,
});

export interface DatabaseBenchmarkCorpusSpec {
  version: 1;
  scale: DatabaseBenchmarkScale;
  recordCount: number;
  seed: number;
  definition: DatabaseDefinition;
  distribution: typeof DATABASE_BENCHMARK_DISTRIBUTION;
}

function mix32(input: number): number {
  let value = input | 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function unit(seed: number, index: number, salt: number): number {
  return mix32(seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) / 0x1_0000_0000;
}

function integer(seed: number, index: number, salt: number, min: number, max: number): number {
  return min + Math.floor(unit(seed, index, salt) * (max - min + 1));
}

function pick<T>(values: readonly T[], seed: number, index: number, salt: number): T {
  const value = values[Math.floor(unit(seed, index, salt) * values.length)];
  if (value === undefined) throw new Error('Benchmark distribution is empty');
  return value;
}

function definition(): DatabaseDefinition {
  const options = (prefix: string, values: readonly string[]) =>
    values.map((value) => ({
      id: `opt_bench_${prefix}_${value}`,
      key: value,
      name: value.replaceAll('_', ' '),
    }));
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_benchmark',
    key: 'benchmark',
    name: 'Database benchmark corpus',
    description: 'Deterministic realistic corpus for performance and reliability gates.',
    aliases: ['perf corpus'],
    people: Array.from({ length: 50 }, (_, index) => ({
      id: `person_bench_${String(index).padStart(2, '0')}`,
      key: `person_${String(index).padStart(2, '0')}`,
      name: `Benchmark Person ${index}`,
      kind: index % 10 === 0 ? 'agent' : 'collaborator',
      ...(index % 10 === 0 ? { subjectId: `agent:benchmark:${index}` } : {}),
    })),
    contract: {
      purpose: 'Measure typed query, index, formula, relation, and packing behavior',
      canonicality: 'canonical',
      vocabulary: ['task', 'owner', 'status', 'dependency', 'risk'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_benchmark_records',
        key: 'records',
        name: 'Benchmark records',
        recordMeaning: 'One realistic benchmark work item',
        folder: 'benchmark-records',
        includeSubfolders: true,
        properties: [
          { id: 'prop_bench_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_bench_summary', key: 'summary', name: 'Summary', type: 'text' },
          { id: 'prop_bench_description', key: 'description', name: 'Description', type: 'text' },
          { id: 'prop_bench_estimate', key: 'estimate', name: 'Estimate', type: 'number' },
          { id: 'prop_bench_actual', key: 'actual', name: 'Actual', type: 'number' },
          { id: 'prop_bench_score', key: 'score', name: 'Score', type: 'number' },
          { id: 'prop_bench_cost', key: 'cost', name: 'Cost', type: 'number' },
          { id: 'prop_bench_progress', key: 'progress', name: 'Progress', type: 'number' },
          { id: 'prop_bench_risk', key: 'risk', name: 'Risk', type: 'number' },
          { id: 'prop_bench_active', key: 'active', name: 'Active', type: 'checkbox' },
          { id: 'prop_bench_blocked', key: 'blocked', name: 'Blocked', type: 'checkbox' },
          { id: 'prop_bench_start', key: 'start', name: 'Start', type: 'date' },
          { id: 'prop_bench_due', key: 'due', name: 'Due', type: 'date' },
          { id: 'prop_bench_completed', key: 'completed', name: 'Completed', type: 'date' },
          {
            id: 'prop_bench_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            options: options('status', ['backlog', 'planned', 'active', 'done']),
          },
          {
            id: 'prop_bench_priority',
            key: 'priority',
            name: 'Priority',
            type: 'select',
            options: options('priority', ['low', 'medium', 'high', 'urgent']),
          },
          {
            id: 'prop_bench_region',
            key: 'region',
            name: 'Region',
            type: 'select',
            options: options('region', ['amer', 'emea', 'apac']),
          },
          {
            id: 'prop_bench_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multi_select',
            options: options('tag', [
              'backend',
              'frontend',
              'mobile',
              'research',
              'customer',
              'security',
              'quality',
              'infra',
            ]),
          },
          { id: 'prop_bench_url', key: 'url', name: 'URL', type: 'url' },
          { id: 'prop_bench_email', key: 'email', name: 'Email', type: 'email' },
          { id: 'prop_bench_phone', key: 'phone', name: 'Phone', type: 'phone' },
          { id: 'prop_bench_owner', key: 'owner', name: 'Owner', type: 'person' },
          { id: 'prop_bench_reviewers', key: 'reviewers', name: 'Reviewers', type: 'person' },
          {
            id: 'prop_bench_dependencies',
            key: 'dependencies',
            name: 'Dependencies',
            type: 'relation',
            targetSourceId: 'ds_benchmark_records',
            cardinality: 'many',
          },
          {
            id: 'prop_bench_related',
            key: 'related',
            name: 'Related',
            type: 'relation',
            targetSourceId: 'ds_benchmark_records',
            cardinality: 'many',
          },
          {
            id: 'prop_bench_created_time',
            key: 'created_time',
            name: 'Created time',
            type: 'created_time',
          },
          {
            id: 'prop_bench_last_edited_time',
            key: 'last_edited_time',
            name: 'Last edited time',
            type: 'last_edited_time',
          },
          {
            id: 'prop_bench_variance',
            key: 'variance',
            name: 'Variance',
            type: 'formula',
            source: 'prop("actual") - prop("estimate")',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'number',
              expression: {
                type: 'binary',
                operator: 'subtract',
                left: { type: 'property', propertyId: 'prop_bench_actual' },
                right: { type: 'property', propertyId: 'prop_bench_estimate' },
              },
            },
          },
          {
            id: 'prop_bench_health',
            key: 'health',
            name: 'Health',
            type: 'formula',
            source: 'prop("score") >= 70',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'boolean',
              expression: {
                type: 'binary',
                operator: 'greater_equal',
                left: { type: 'property', propertyId: 'prop_bench_score' },
                right: { type: 'literal', valueType: 'number', value: 70 },
              },
            },
          },
          {
            id: 'prop_bench_dependency_cost',
            key: 'dependency_cost',
            name: 'Dependency cost',
            type: 'rollup',
            relationPropertyId: 'prop_bench_dependencies',
            targetPropertyId: 'prop_bench_cost',
            function: 'sum',
            targetValueType: 'number',
          },
        ],
      },
    ],
    views: [
      {
        id: 'view_benchmark_table',
        key: 'all-records',
        name: 'All benchmark records',
        sourceId: 'ds_benchmark_records',
        layout: { type: 'table' },
        sort: [{ propertyId: 'prop_bench_score', direction: 'desc' }],
        projection: {
          propertyIds: [
            'prop_bench_title',
            'prop_bench_status',
            'prop_bench_priority',
            'prop_bench_score',
            'prop_bench_due',
          ],
          body: 'preview',
        },
      },
    ],
  });
}

export function databaseBenchmarkCorpusSpec(
  scale: DatabaseBenchmarkScale,
  seed = DATABASE_BENCHMARK_SEED,
): DatabaseBenchmarkCorpusSpec {
  return {
    version: 1,
    scale,
    recordCount: DATABASE_BENCHMARK_SCALES[scale],
    seed: seed >>> 0,
    definition: definition(),
    distribution: DATABASE_BENCHMARK_DISTRIBUTION,
  };
}

function relationCount(seed: number, index: number, salt: number): number {
  const value = unit(seed, index, salt);
  if (value < 0.2) return 0;
  if (value < 0.75) return integer(seed, index, salt + 1, 1, 3);
  if (value < 0.95) return integer(seed, index, salt + 1, 4, 8);
  return integer(seed, index, salt + 1, 9, 20);
}

function relations(count: number, seed: number, index: number, salt: number): string[] {
  const targetCount = Math.min(Math.max(0, count - 1), relationCount(seed, index, salt));
  const ids = new Set<string>();
  for (let offset = 0; ids.size < targetCount; offset += 1) {
    const target = integer(seed, index, salt + 10 + offset, 0, count - 1);
    if (target !== index) ids.add(`rec_bench_${String(target).padStart(7, '0')}`);
  }
  return [...ids].sort();
}

function benchmarkBody(seed: number, index: number): string {
  const bucket = unit(seed, index, 700);
  if (bucket < 0.1) return '';
  const [min, max] =
    bucket < 0.8
      ? DATABASE_BENCHMARK_DISTRIBUTION.body.shortBytes
      : bucket < 0.98
        ? DATABASE_BENCHMARK_DISTRIBUTION.body.mediumBytes
        : DATABASE_BENCHMARK_DISTRIBUTION.body.longBytes;
  const target = integer(seed, index, 701, min, max);
  const text = `Record ${index} discusses evidence, tradeoffs, risks, decisions, and follow-up actions. `;
  return `${text.repeat(Math.ceil(target / text.length)).slice(0, target)}\n`;
}

function isoDay(index: number, offset: number): string {
  return new Date(Date.UTC(2024, 0, 1 + ((index + offset) % 1_825))).toISOString();
}

export function databaseBenchmarkRecord(
  spec: DatabaseBenchmarkCorpusSpec,
  index: number,
): DatabaseRecord {
  if (!Number.isSafeInteger(index) || index < 0 || index >= spec.recordCount)
    throw new RangeError(`Benchmark record index ${index} is out of range`);
  const { seed, recordCount } = spec;
  const id = `rec_bench_${String(index).padStart(7, '0')}`;
  const statusRoll = unit(seed, index, 100);
  const status =
    statusRoll < 0.45
      ? 'backlog'
      : statusRoll < 0.75
        ? 'planned'
        : statusRoll < 0.95
          ? 'active'
          : 'done';
  const tagNames = [
    'backend',
    'frontend',
    'mobile',
    'research',
    'customer',
    'security',
    'quality',
    'infra',
  ] as const;
  const selectedTags = new Set<string>();
  const tagCount = integer(seed, index, 110, 0, 4);
  for (let offset = 0; selectedTags.size < tagCount; offset += 1)
    selectedTags.add(`opt_bench_tag_${pick(tagNames, seed, index, 111 + offset)}`);
  const missing = (salt: number) => unit(seed, index, salt) < 0.15;
  const values: DatabaseRecord['values'] = {
    prop_bench_title: `Benchmark work item ${String(index).padStart(7, '0')}`,
    prop_bench_summary: `Summary for item ${index} in cohort ${index % 100}`,
    prop_bench_estimate: integer(seed, index, 200, 1, 100),
    prop_bench_actual: integer(seed, index, 201, 0, 160),
    prop_bench_score: integer(seed, index, 202, 0, 100),
    prop_bench_cost: integer(seed, index, 203, 100, 1_000_000) / 100,
    prop_bench_progress: integer(seed, index, 204, 0, 100) / 100,
    prop_bench_risk: integer(seed, index, 205, 1, 10),
    prop_bench_active: status !== 'done',
    prop_bench_blocked: unit(seed, index, 206) < 0.12,
    prop_bench_start: isoDay(index, 0),
    prop_bench_due: isoDay(index, integer(seed, index, 207, 1, 90)),
    prop_bench_status: `opt_bench_status_${status}`,
    prop_bench_priority: `opt_bench_priority_${pick(['low', 'medium', 'high', 'urgent'], seed, index, 208)}`,
    prop_bench_region: `opt_bench_region_${pick(['amer', 'emea', 'apac'], seed, index, 209)}`,
    prop_bench_tags: [...selectedTags].sort(),
    prop_bench_owner: [`person_bench_${String(index % 50).padStart(2, '0')}`],
    prop_bench_reviewers: [
      `person_bench_${String((index + 7) % 50).padStart(2, '0')}`,
      `person_bench_${String((index + 19) % 50).padStart(2, '0')}`,
    ],
    prop_bench_dependencies: relations(recordCount, seed, index, 300),
    prop_bench_related: relations(recordCount, seed, index, 400),
    prop_bench_created_time: isoDay(index, -30),
    prop_bench_last_edited_time: isoDay(index, 0),
  };
  if (!missing(500)) values.prop_bench_description = `Detailed description cohort ${index % 250}`;
  if (!missing(501)) values.prop_bench_url = `https://example.invalid/work/${index}`;
  if (!missing(502)) values.prop_bench_email = `owner-${index % 10_000}@example.invalid`;
  if (!missing(503)) values.prop_bench_phone = `+1-555-${String(index % 10_000).padStart(4, '0')}`;
  if (status === 'done') values.prop_bench_completed = isoDay(index, 1);
  const body = benchmarkBody(seed, index);
  return {
    id,
    databaseId: spec.definition.id,
    sourceId: 'ds_benchmark_records',
    path: `benchmark-records/${String(Math.floor(index / 1_000)).padStart(4, '0')}/${id}.md`,
    values,
    body,
    revision: `sha256:${createHash('sha256').update(JSON.stringify({ id, values, body })).digest('hex')}`,
  };
}

export function* iterateDatabaseBenchmarkRecords(
  spec: DatabaseBenchmarkCorpusSpec,
): Generator<DatabaseRecord> {
  for (let index = 0; index < spec.recordCount; index += 1)
    yield databaseBenchmarkRecord(spec, index);
}

export async function materializeDatabaseBenchmarkCorpus(options: {
  root: string;
  scale: DatabaseBenchmarkScale;
  seed?: number;
  format?: 'jsonl' | 'markdown';
}): Promise<{ files: number; bytes: number; digest: string }> {
  const root = resolve(options.root);
  const existing = await readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (existing.length > 0) {
    throw new Error('Benchmark output directory must be empty');
  }
  const spec = databaseBenchmarkCorpusSpec(options.scale, options.seed);
  await mkdir(resolve(root, '.ok', 'databases'), { recursive: true });
  const manifest = serializeDatabaseManifestYaml(spec.definition);
  await writeFile(resolve(root, '.ok', 'databases', 'benchmark.yml'), manifest, 'utf8');
  const digest = createHash('sha256').update(manifest);
  let bytes = Buffer.byteLength(manifest);
  if ((options.format ?? 'jsonl') === 'jsonl') {
    const outputDir = resolve(root, '.benchmark');
    await mkdir(outputDir, { recursive: true });
    const handle = await open(resolve(outputDir, `${options.scale}-records.ndjson`), 'w', 0o600);
    try {
      for (const record of iterateDatabaseBenchmarkRecords(spec)) {
        const line = `${JSON.stringify(record)}\n`;
        await handle.write(line);
        digest.update(line);
        bytes += Buffer.byteLength(line);
      }
    } finally {
      await handle.close();
    }
    return { files: 2, bytes, digest: `sha256:${digest.digest('hex')}` };
  }
  const source = spec.definition.sources[0];
  if (!source) throw new Error('Benchmark source is missing');
  const peopleById = new Map(spec.definition.people.map((person) => [person.id, person.key]));
  const pending = new Set<Promise<void>>();
  const createdShards = new Set<string>();
  let files = 1;
  for (const record of iterateDatabaseBenchmarkRecords(spec)) {
    const frontmatter: Record<string, unknown> = {
      _sn: {
        database_id: record.databaseId,
        source_id: record.sourceId,
        record_id: record.id,
      },
    };
    for (const property of source.properties) {
      if (
        property.type === 'formula' ||
        property.type === 'rollup' ||
        property.type === 'created_time' ||
        property.type === 'last_edited_time'
      ) {
        continue;
      }
      const value = record.values[property.id];
      if (value === undefined) continue;
      if (
        property.type === 'select' ||
        property.type === 'status' ||
        property.type === 'multi_select'
      ) {
        const optionsById = new Map(property.options.map((item) => [item.id, item.key]));
        frontmatter[property.key] = Array.isArray(value)
          ? value.map((item) => optionsById.get(String(item)) ?? item)
          : (optionsById.get(String(value)) ?? value);
      } else if (property.type === 'person') {
        frontmatter[property.key] = Array.isArray(value)
          ? value.map((item) => peopleById.get(String(item)) ?? item)
          : value;
      } else {
        frontmatter[property.key] = value;
      }
    }
    const markdown = `---\n${stringify(frontmatter, { lineWidth: 0 })}---\n${record.body}`;
    const absolute = resolve(root, record.path);
    const shard = resolve(absolute, '..');
    if (!createdShards.has(shard)) {
      await mkdir(shard, { recursive: true });
      createdShards.add(shard);
    }
    digest.update(record.path).update('\0').update(markdown);
    bytes += Buffer.byteLength(markdown);
    files += 1;
    const write = writeFile(absolute, markdown, { encoding: 'utf8', mode: 0o600 }).then(() => {
      pending.delete(write);
    });
    pending.add(write);
    if (pending.size >= 64) await Promise.race(pending);
  }
  await Promise.all(pending);
  return { files, bytes, digest: `sha256:${digest.digest('hex')}` };
}
