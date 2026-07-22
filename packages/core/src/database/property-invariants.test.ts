import { describe, expect, test } from 'bun:test';
import type { FormulaAst } from './formula.ts';
import { evaluateFormula } from './formula-evaluator.ts';
import { formulaValueResult } from './formula-result.ts';
import {
  createDatabasePortableBundle,
  parseDatabasePortableBundleJson,
  serializeDatabasePortableBundle,
} from './interchange.ts';
import { queryDatabaseRecords } from './query.ts';
import type { DatabaseRecord } from './record.ts';
import { DatabaseSourceSchema } from './schema.ts';
import {
  parseDatabaseTransactionReceipt,
  serializeDatabaseTransactionReceipt,
} from './transaction.ts';

const ITERATIONS = 128;
const sha = (digit: number) => `sha256:${digit.toString(16).repeat(64)}`;
const git = (digit: number) => `sha1:${digit.toString(16).repeat(40)}`;

function unit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

function integer(seed: number, salt: number, maximum: number): number {
  return Math.floor(unit(seed, salt) * maximum);
}

const source = DatabaseSourceSchema.parse({
  id: 'ds_properties',
  key: 'properties',
  name: 'Property invariants',
  recordMeaning: 'One generated row',
  folder: 'properties',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
    { id: 'prop_enabled', key: 'enabled', name: 'Enabled', type: 'checkbox' },
  ],
});

function generatedRecords(seed: number): DatabaseRecord[] {
  const count = 1 + integer(seed, 1, 80);
  return Array.from({ length: count }, (_, index) => ({
    id: `rec_${seed}_${index}`,
    databaseId: 'db_properties',
    sourceId: source.id,
    path: `properties/${seed}-${index}.md`,
    revision: `revision:${seed}:${index}`,
    values: {
      prop_title: `행 ${seed} 👩🏽‍💻 ${index}`,
      prop_score: integer(seed, index + 10, 1_000) - 500,
      prop_enabled: unit(seed, index + 100) >= 0.5,
    },
    body: '',
  }));
}

describe('seeded database property invariants', () => {
  test('filters, sorts, and paginates every generated snapshot without loss or overlap', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const records = generatedRecords(seed);
      const threshold = integer(seed, 2, 1_000) - 500;
      const expected = records
        .filter((record) => Number(record.values.prop_score) >= threshold)
        .sort(
          (left, right) =>
            Number(left.values.prop_score) - Number(right.values.prop_score) ||
            left.id.localeCompare(right.id),
        )
        .map((record) => record.id);
      const pageSize = 1 + integer(seed, 3, 9);
      const actual: string[] = [];
      let cursor: string | undefined;
      do {
        const result = queryDatabaseRecords({
          source,
          records,
          snapshotRevision: `snapshot:${seed}`,
          query: {
            where: { propertyId: 'prop_score', operator: 'gte', value: threshold },
            sort: [{ propertyId: 'prop_score', direction: 'asc' }],
            page: { limit: pageSize, ...(cursor ? { cursor } : {}) },
          },
        });
        actual.push(...result.records.map((record) => record.id));
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      expect(actual, `seed ${seed}`).toEqual(expected);
      expect(new Set(actual).size, `seed ${seed}`).toBe(actual.length);
    }
  });

  test('evaluates generated arithmetic Formula trees exactly', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const left = integer(seed, 4, 10_000) - 5_000;
      const right = integer(seed, 5, 10_000) - 5_000;
      const multiplier = 1 + integer(seed, 6, 20);
      const ast: FormulaAst = {
        language: 'synapse-formula-1',
        version: 1,
        resultType: 'number',
        expression: {
          type: 'binary',
          operator: 'multiply',
          left: {
            type: 'binary',
            operator: 'add',
            left: { type: 'literal', valueType: 'number', value: left },
            right: { type: 'literal', valueType: 'number', value: right },
          },
          right: { type: 'literal', valueType: 'number', value: multiplier },
        },
      };
      expect(
        evaluateFormula({
          ast,
          context: { now: '2026-07-21T00:00:00.000Z', timeZone: 'UTC', locale: 'und' },
          resolveProperty: () => formulaValueResult('null', null),
        }),
        `seed ${seed}`,
      ).toEqual(formulaValueResult('number', (left + right) * multiplier));
    }
  });

  test('round-trips generated portable bytes and content-free transaction receipts', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const content = `---\ntitle: "행 ${seed} 👩🏽‍💻 é العربية"\nscore: ${integer(seed, 7, 1_000)}\n---\n본문 ${seed}\n`;
      const bundle = createDatabasePortableBundle({
        manifests: [
          { path: `.ok/databases/generated-${seed}.yml`, yaml: `version: 1\nseed: ${seed}\n` },
        ],
        records: [{ path: `generated/${seed}.md`, markdown: content }],
      });
      expect(
        parseDatabasePortableBundleJson(serializeDatabasePortableBundle(bundle)),
        `bundle seed ${seed}`,
      ).toEqual(bundle);

      const receipt = {
        version: 1 as const,
        mutationId: `mut_property_${seed}`,
        planId: `plan_property_${seed}`,
        planHash: sha(seed % 16),
        intentSummary: `Update generated record ${seed}`,
        tool: { name: 'synapsenote/property-test', version: '1.0.0' },
        dataSources: { databaseIds: ['db_properties'], sourceIds: [source.id] },
        idempotencyKeyHash: sha((seed + 1) % 16),
        actor: { principalId: 'test:property', kind: 'system' as const },
        committedAt: '2026-07-21T00:00:00.000Z',
        base: { gitHead: git(seed % 16), snapshotRevision: sha((seed + 2) % 16) },
        result: { gitHead: git((seed + 1) % 16), snapshotRevision: sha((seed + 3) % 16) },
        files: [
          {
            operation: 'update' as const,
            path: `content/generated/${seed}.md`,
            before: { sha256: sha((seed + 4) % 16), gitBlob: git((seed + 2) % 16), bytes: seed },
            after: {
              sha256: sha((seed + 5) % 16),
              gitBlob: git((seed + 3) % 16),
              bytes: seed + 1,
            },
          },
        ],
        verification: {
          status: 'passed' as const,
          checks: [{ code: 'generated', status: 'passed' as const, message: 'Invariant held' }],
        },
        undo: {
          tokenId: `undo_property_${seed}`,
          strategy: 'git_three_way_reverse' as const,
          expectedSnapshotRevision: sha((seed + 3) % 16),
        },
      };
      const serialized = serializeDatabaseTransactionReceipt(receipt);
      expect(parseDatabaseTransactionReceipt(serialized), `receipt seed ${seed}`).toEqual(receipt);
      expect(serialized).not.toContain(content);
    }
  });
});
