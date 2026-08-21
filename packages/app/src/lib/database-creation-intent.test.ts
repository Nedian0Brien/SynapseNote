import { describe, expect, test } from 'bun:test';
import {
  completeDatabaseCreationIntent,
  type DatabaseCreationIntentStorage,
  getOrCreateDatabaseCreationIntent,
} from './database-creation-intent';

function memoryStorage(): DatabaseCreationIntentStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('database creation intent', () => {
  test('survives remounts until the matching creation completes', () => {
    const storage = memoryStorage();
    const first = getOrCreateDatabaseCreationIntent('notion-page', {
      storage,
      workspace: '/project/a',
      now: 10,
    });
    const recovered = getOrCreateDatabaseCreationIntent('notion-page', {
      storage,
      workspace: '/project/a',
      now: 20,
    });
    expect(recovered).toEqual(first);

    completeDatabaseCreationIntent('notion-page', 'creation_different', {
      storage,
      workspace: '/project/a',
    });
    expect(
      getOrCreateDatabaseCreationIntent('notion-page', {
        storage,
        workspace: '/project/a',
        now: 30,
      }),
    ).toEqual(first);

    completeDatabaseCreationIntent('notion-page', first.id, {
      storage,
      workspace: '/project/a',
    });
    expect(
      getOrCreateDatabaseCreationIntent('notion-page', {
        storage,
        workspace: '/project/a',
        now: 40,
      }).id,
    ).not.toBe(first.id);
  });

  test('isolates pending creation by workspace', () => {
    const storage = memoryStorage();
    const first = getOrCreateDatabaseCreationIntent('notion-page', {
      storage,
      workspace: '/project/a',
    });
    const second = getOrCreateDatabaseCreationIntent('notion-page', {
      storage,
      workspace: '/project/b',
    });
    expect(second.id).not.toBe(first.id);
  });
});
