import { describe, expect, test } from 'bun:test';
import {
  DATABASE_CARD_VIEW_LOADED_RECORD_LIMIT,
  DATABASE_TABLE_LOADED_RECORD_LIMIT,
  databaseBrowserLoadedRecordLimit,
  databaseBrowserNextPageLimit,
} from './database-view-bounds';

describe('database browser view bounds', () => {
  test('allows the virtualized table a larger bounded snapshot', () => {
    expect(databaseBrowserLoadedRecordLimit(undefined)).toBe(DATABASE_TABLE_LOADED_RECORD_LIMIT);
    expect(databaseBrowserLoadedRecordLimit('table')).toBe(DATABASE_TABLE_LOADED_RECORD_LIMIT);
    expect(databaseBrowserNextPageLimit('table', 4_950)).toBe(50);
    expect(databaseBrowserNextPageLimit('table', 5_000)).toBe(0);
  });

  test('bounds every card, spatial, aggregate, and compact view', () => {
    for (const type of [
      'board',
      'timeline',
      'calendar',
      'list',
      'gallery',
      'chart',
      'form',
      'map',
      'dashboard',
      'feed',
    ] as const) {
      expect(databaseBrowserLoadedRecordLimit(type)).toBe(DATABASE_CARD_VIEW_LOADED_RECORD_LIMIT);
      expect(databaseBrowserNextPageLimit(type, 450)).toBe(50);
      expect(databaseBrowserNextPageLimit(type, 500)).toBe(0);
    }
  });
});
