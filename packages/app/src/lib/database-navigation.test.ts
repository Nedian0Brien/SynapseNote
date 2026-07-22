import { describe, expect, test } from 'bun:test';
import type { DatabaseView } from '@nedian0brien/synapsenote-core';
import { databaseAgentScopeInstruction } from '@/components/handoff/database-agent-scope';
import {
  DATABASE_CREATION_HASH,
  databasePageFavoriteKey,
  databasePageTargetFromHash,
  databasePageTargetToHash,
  databaseRecordPathToHash,
  databaseViewOpenBehavior,
  isDatabaseCreationHash,
  isDatabasePageFavorite,
  setDatabasePageFavorite,
} from './database-navigation';
import { docNameFromHash } from './doc-hash';

describe('databaseRecordPathToHash', () => {
  test.each([
    ['tasks/rec_alpha.md', 'tasks/rec_alpha'],
    ['research/deep/record with spaces.mdx', 'research/deep/record with spaces'],
    ['고객/증거-🧪.md', '고객/증거-🧪'],
  ])('opens %s through the ordinary document identity', (path, documentName) => {
    const hash = databaseRecordPathToHash(path);
    expect(hash).toBe(`#/${documentName}`);
    expect(docNameFromHash(hash)).toBe(documentName);
  });

  test('preserves a backlink anchor while using the same canonical record route', () => {
    expect(databaseRecordPathToHash('notes/context.md', 'decision')).toBe(
      '#/notes/context#decision',
    );
  });
});

describe('database workspace route', () => {
  test('round-trips stable database/source/view references', () => {
    const target = { databaseId: 'db_tasks', sourceId: 'source/tasks', viewId: 'view active' };
    const hash = databasePageTargetToHash(target);
    expect(hash).toBe('#database/db_tasks/source%2Ftasks/view%20active');
    expect(databasePageTargetFromHash(hash)).toEqual(target);
  });

  test('rejects malformed or non-database hashes', () => {
    expect(databasePageTargetFromHash('#/tasks')).toBeNull();
    expect(databasePageTargetFromHash('#database/db_only')).toBeNull();
    expect(databasePageTargetFromHash('#database/db/source/extra/view')).toBeNull();
  });

  test('keeps the uncommitted creation route distinct from a canonical database page', () => {
    expect(DATABASE_CREATION_HASH).toBe('#database/new');
    expect(isDatabaseCreationHash(DATABASE_CREATION_HASH)).toBe(true);
    expect(isDatabaseCreationHash('#database/db_tasks/ds_tasks')).toBe(false);
    expect(databasePageTargetFromHash(DATABASE_CREATION_HASH)).toBeNull();
  });

  test('keeps canonical route IDs identical to the MCP agent scope boundary', () => {
    const target = { databaseId: 'db_tasks', sourceId: 'ds_tasks', viewId: 'view_table' };
    const routeTarget = databasePageTargetFromHash(databasePageTargetToHash(target));
    if (!routeTarget) throw new Error('expected a canonical database route target');

    const instruction = databaseAgentScopeInstruction(routeTarget);
    expect(instruction).toContain('- database_id: db_tasks');
    expect(instruction).toContain('- source_id: ds_tasks');
    expect(instruction).toContain('- view_id: view_table');
    expect(instruction).not.toContain('#database/');
  });
});

describe('database page favorites', () => {
  test('stores a stable database/source key without exposing it in the page route', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const target = { databaseId: 'db_tasks', sourceId: 'ds_tasks' };
    expect(databasePageFavoriteKey(target)).toBe('db_tasks/ds_tasks');
    expect(isDatabasePageFavorite(target, storage)).toBe(false);
    setDatabasePageFavorite(target, true, storage);
    expect(isDatabasePageFavorite(target, storage)).toBe(true);
    setDatabasePageFavorite(target, false, storage);
    expect(isDatabasePageFavorite(target, storage)).toBe(false);
  });
});

describe('databaseViewOpenBehavior', () => {
  const view = (
    type: DatabaseView['layout']['type'],
    openBehavior?: DatabaseView['openBehavior'],
  ) => ({ layout: { type }, ...(openBehavior ? { openBehavior } : {}) }) as DatabaseView;
  test('uses Notion-compatible layout defaults and preserves the saved per-view choice', () => {
    expect(databaseViewOpenBehavior(view('table'))).toBe('side_peek');
    expect(databaseViewOpenBehavior(view('gallery'))).toBe('center_peek');
    expect(databaseViewOpenBehavior(view('table', 'full_page'))).toBe('full_page');
  });
});
