import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  databaseLastOpenedViewStorageKey,
  loadDatabaseLastOpenedView,
  saveDatabaseLastOpenedView,
} from './database-view-state';

const databaseId = 'db_tasks';
const sourceId = 'ds_tasks';
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      clear: () => values.clear(),
    },
  });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('database last-opened view state', () => {
  test('distinguishes no preference, a stable view, and explicit All records', () => {
    expect(loadDatabaseLastOpenedView(databaseId, sourceId, ['view_open'])).toBeUndefined();
    saveDatabaseLastOpenedView(databaseId, sourceId, 'view_open');
    expect(loadDatabaseLastOpenedView(databaseId, sourceId, ['view_open'])).toBe('view_open');
    expect(loadDatabaseLastOpenedView(databaseId, sourceId, ['view_other'])).toBeUndefined();
    saveDatabaseLastOpenedView(databaseId, sourceId, '');
    expect(loadDatabaseLastOpenedView(databaseId, sourceId, ['view_open'])).toBe('');
  });

  test('fails closed on malformed local state', () => {
    localStorage.setItem(databaseLastOpenedViewStorageKey(databaseId, sourceId), '{broken');
    expect(loadDatabaseLastOpenedView(databaseId, sourceId, [])).toBeUndefined();
  });
});
