import { describe, expect, test } from 'bun:test';
import { DatabaseQueryError, queryDatabaseRecords } from './query.ts';
import type { DatabaseRecord } from './record.ts';
import { DatabaseSourceSchema } from './schema.ts';

/**
 * Bounded, seeded fuzz corpus for query pagination cursors (R-007).
 * `queryDatabaseRecords` never accepts a client-supplied cursor at face
 * value — it is a `v2:<8-hex-fingerprint>:<offset>` token checked against a
 * fingerprint recomputed from the query shape, so a cursor from a stale or
 * different query must be rejected, not silently reinterpreted.
 */

const ITERATIONS = 256;

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
  id: 'ds_cursor',
  key: 'cursor',
  name: 'Cursor fuzz',
  recordMeaning: 'One generated row',
  folder: 'cursor',
  properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
});

const records: DatabaseRecord[] = Array.from({ length: 20 }, (_, index) => ({
  id: `rec_${index}`,
  databaseId: 'db_cursor',
  sourceId: source.id,
  path: `cursor/${index}.md`,
  revision: `revision:${index}`,
  values: { prop_title: `Row ${index}` },
  body: '',
}));

const CURSOR_FRAGMENTS = [
  'v2:00000000:0',
  'v2::0',
  'v2:xxxxxxxx:0',
  'v2:00000000:-1',
  'v2:00000000:999999999999999999999',
  'v2:00000000:1.5',
  'v1:00000000:0',
  '',
  ':',
  'v2:00000000:',
  'v2:00000000',
  `v2:00000000:${'9'.repeat(400)}`,
  'null',
  'undefined',
  '../../etc/passwd',
  '행 😀 مرحبا',
  '\0',
  'v2:00000000:0'.repeat(50),
];

function generatedCursor(seed: number): string {
  const fragmentCount = 1 + integer(seed, 1, 3);
  const parts: string[] = [];
  for (let index = 0; index < fragmentCount; index += 1) {
    parts.push(CURSOR_FRAGMENTS[integer(seed, 10 + index, CURSOR_FRAGMENTS.length)] ?? '');
  }
  return parts.join('');
}

function query(cursor: string | undefined) {
  return queryDatabaseRecords({
    source,
    records,
    snapshotRevision: 'snapshot:cursor-fuzz',
    query: { page: { limit: 5, ...(cursor !== undefined ? { cursor } : {}) } },
  });
}

describe('database query cursor fuzz corpus', () => {
  test('never throws anything other than DatabaseQueryError for generated adversarial cursors', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const cursor = generatedCursor(seed);
      try {
        query(cursor);
      } catch (cause) {
        if (cause instanceof DatabaseQueryError) continue;
        throw new Error(
          `seed ${seed} (cursor ${JSON.stringify(cursor)}) threw an untyped error instead of DatabaseQueryError: ${String(cause)}`,
          { cause },
        );
      }
    }
  });

  test('rejects a cursor from a different query shape instead of reinterpreting its offset', () => {
    const first = query(undefined);
    expect(first.nextCursor).not.toBeNull();
    const stableCursor = first.nextCursor as string;
    const second = query(stableCursor);
    expect(second.records.length).toBe(5);
    expect(
      second.records.every((record) => !first.records.some((seen) => seen.id === record.id)),
    ).toBe(true);

    const differentQuery = () =>
      queryDatabaseRecords({
        source,
        records,
        snapshotRevision: 'snapshot:cursor-fuzz',
        query: {
          page: { limit: 5, cursor: stableCursor },
          sort: [{ propertyId: 'prop_title', direction: 'desc' }],
        },
      });
    expect(differentQuery).toThrow(DatabaseQueryError);
  });

  test('rejects an out-of-range offset instead of returning an empty or wrapped page', () => {
    expect(() => query(`v2:${'0'.repeat(8)}:99999`)).toThrow(DatabaseQueryError);
  });

  test('rejects an extremely long cursor without hanging or crashing', () => {
    const started = performance.now();
    expect(() => query(`v2:00000000:${'1'.repeat(1_000_000)}`)).toThrow();
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
