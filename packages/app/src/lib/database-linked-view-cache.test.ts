import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabaseDescription } from './database-catalog-client';
import {
  databaseLinkedViewCacheStorageKey,
  readDatabaseLinkedView,
  rememberDatabaseLinkedView,
  resetDatabaseLinkedViewCacheForTests,
} from './database-linked-view-cache';

const originalStorage = globalThis.sessionStorage;

function installStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>,
  });
}

function description(databaseId: string): DatabaseDescription {
  return {
    database: { id: databaseId, views: [] },
    source: { id: `ds_${databaseId}`, properties: [] },
  } as never;
}

afterEach(() => {
  resetDatabaseLinkedViewCacheForTests();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: originalStorage,
  });
});

describe('database linked-view cache', () => {
  test('persists a bounded read snapshot and rehydrates it after module state reset', () => {
    installStorage();
    rememberDatabaseLinkedView('first', { description: description('db_first'), result: null }, 1);
    const stored = globalThis.sessionStorage.getItem(databaseLinkedViewCacheStorageKey);
    expect(stored).toContain('db_first');

    resetDatabaseLinkedViewCacheForTests();
    globalThis.sessionStorage.setItem(databaseLinkedViewCacheStorageKey, stored ?? '');
    const cached = readDatabaseLinkedView('first');
    expect(cached?.description.database.id).toBe('db_first');
  });

  test('rejects malformed persisted entries and keeps the cache bounded', () => {
    installStorage();
    globalThis.sessionStorage.setItem(
      databaseLinkedViewCacheStorageKey,
      JSON.stringify({ version: 1, entries: [{ key: 'bad', description: null }] }),
    );
    expect(readDatabaseLinkedView('bad')).toBeNull();

    for (let index = 0; index < 9; index += 1) {
      rememberDatabaseLinkedView(
        `key-${index}`,
        { description: description(`db_${index}`), result: null },
        index,
      );
    }
    expect(readDatabaseLinkedView('key-0')).toBeNull();
    expect(readDatabaseLinkedView('key-8')?.description.database.id).toBe('db_8');
  });
});
