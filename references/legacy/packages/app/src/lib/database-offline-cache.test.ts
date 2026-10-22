import { afterEach, describe, expect, test } from 'bun:test';
import {
  cacheDatabaseSnapshot,
  databaseOfflineCacheKey,
  readCachedDatabaseSnapshot,
  resetDatabaseOfflineCacheForTests,
} from './database-offline-cache';

afterEach(resetDatabaseOfflineCacheForTests);

describe('database offline cache', () => {
  test('builds a stable key independent of calculation insertion order', () => {
    const base = { databaseId: 'db_one', sourceId: 'ds_one', viewId: '', showArchived: false };
    expect(databaseOfflineCacheKey({ ...base, calculations: { b: 'sum', a: 'count' } })).toBe(
      databaseOfflineCacheKey({ ...base, calculations: { a: 'count', b: 'sum' } }),
    );
  });

  test('returns an isolated cached snapshot and evicts the oldest bounded entry', () => {
    for (let index = 0; index < 13; index += 1) {
      cacheDatabaseSnapshot(
        `key-${index}`,
        {
          description: { database: { id: `db_${index}` }, source: null } as never,
          result: { sourceId: 'ds_one', records: [] } as never,
        },
        index,
      );
    }
    expect(readCachedDatabaseSnapshot('key-0')).toBeNull();
    const cached = readCachedDatabaseSnapshot('key-12');
    expect(cached?.cachedAt).toBe(12);
    cached?.result.records.push({ id: 'rec_mutated' } as never);
    expect(readCachedDatabaseSnapshot('key-12')?.result.records).toEqual([]);
  });
});
