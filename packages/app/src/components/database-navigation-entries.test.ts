import { describe, expect, test } from 'bun:test';
import type { DatabaseCatalogCandidate } from '@/lib/database-catalog-client';
import {
  buildDatabaseNavigationEntries,
  searchDatabaseNavigationEntries,
} from './database-navigation-entries';

const candidates = [
  {
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    purpose: 'Track work in progress',
    sources: [
      {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'task',
        propertyCount: 2,
      },
    ],
    viewCount: 1,
    relationCount: 0,
    score: 0,
    matchedBy: [],
  },
  {
    id: 'db_research',
    key: 'research',
    name: 'Research library',
    purpose: 'Evidence and reading notes',
    sources: [
      {
        id: 'ds_sources',
        key: 'sources',
        name: 'Sources',
        recordMeaning: 'source',
        propertyCount: 3,
      },
    ],
    viewCount: 2,
    relationCount: 1,
    score: 0,
    matchedBy: [],
  },
] satisfies DatabaseCatalogCandidate[];

describe('database navigation entries', () => {
  test('compiles catalog sources to stable human-readable page targets', () => {
    const [entry] = buildDatabaseNavigationEntries(candidates);
    expect(entry).toMatchObject({
      kind: 'database',
      name: 'Tasks',
      databaseName: 'Tasks',
      sourceName: 'Tasks',
      path: '#database/db_tasks/ds_tasks',
    });
    expect(entry?.path).not.toContain('tasks/tasks');
  });

  test('matches source, database, key, and purpose terms without surfacing IDs', () => {
    const entries = buildDatabaseNavigationEntries(candidates);
    expect(searchDatabaseNavigationEntries(entries, 'evidence')).toHaveLength(1);
    expect(searchDatabaseNavigationEntries(entries, 'sources')).toHaveLength(1);
    expect(searchDatabaseNavigationEntries(entries, 'research')).toHaveLength(1);
    expect(searchDatabaseNavigationEntries(entries, 'db_research')).toHaveLength(0);
    expect(searchDatabaseNavigationEntries(entries, 'not found')).toEqual([]);
  });
});
