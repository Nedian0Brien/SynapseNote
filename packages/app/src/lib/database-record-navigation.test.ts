import { describe, expect, test } from 'bun:test';
import {
  databaseRecordNavigationHash,
  databaseRecordNavigationOriginHash,
  rememberDatabaseRecordNavigation,
} from './database-record-navigation';

describe('database record navigation continuity', () => {
  test('stores a view order and resolves previous/next and return hashes', () => {
    const state = rememberDatabaseRecordNavigation({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      viewId: 'view_table',
      paths: ['records/first.md', 'records/second.md', 'records/third.md'],
      currentPath: 'records/second.md',
    });
    if (!state) throw new Error('expected navigation state');
    expect(state?.index).toBe(1);
    expect(databaseRecordNavigationHash(state, 0)).toBe('#/records/first');
    expect(databaseRecordNavigationOriginHash(state)).toBe(
      '#database/db_tasks/ds_tasks/view_table',
    );
  });

  test('rejects a record that is not in the originating view', () => {
    expect(
      rememberDatabaseRecordNavigation({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        paths: ['records/first.md'],
        currentPath: 'records/missing.md',
      }),
    ).toBeNull();
  });

  test('keeps large view orders bounded around the opened record', () => {
    const paths = Array.from({ length: 500 }, (_, index) => `records/${index}.md`);
    const state = rememberDatabaseRecordNavigation({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      paths,
      currentPath: 'records/250.md',
    });
    expect(state?.paths).toHaveLength(200);
    expect(state?.paths[state.index]).toBe('records/250.md');
  });
});
