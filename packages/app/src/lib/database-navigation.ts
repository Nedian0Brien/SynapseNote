import type { DatabaseView, DatabaseViewOpenBehavior } from '@nedian0brien/synapsenote-core';
import { filePathToDocName, hashFromDocName } from './doc-hash';

const DATABASE_PAGE_HASH_PREFIX = '#database/';
export const DATABASE_CREATION_HASH = '#database/new';
/**
 * Emitted after a database route is changed with history.replaceState.
 * replaceState intentionally avoids a browser hashchange, but the ordinary
 * sidebar still needs to refresh its active page target immediately.
 */
export const DATABASE_NAVIGATION_CHANGE_EVENT = 'synapsenote:database-navigation-change';
const DATABASE_PAGE_FAVORITES_STORAGE_KEY = 'synapsenote-database-page-favorites-v1';

export interface DatabasePageTarget {
  databaseId: string;
  sourceId: string;
  viewId?: string;
}

/**
 * Converts a canonical database record path to the ordinary document route.
 * No database-only page identity is introduced: the editor opens the same
 * Markdown file whose `_sn.record_id` remains canonical frontmatter.
 */
export function databaseRecordPathToHash(path: string, anchor?: string | null): string {
  return hashFromDocName(filePathToDocName(path), anchor);
}

/** Stable, reloadable route for a database workspace page. */
export function databasePageTargetToHash(target: DatabasePageTarget): string {
  const segments = [target.databaseId, target.sourceId, ...(target.viewId ? [target.viewId] : [])];
  return `${DATABASE_PAGE_HASH_PREFIX}${segments.map(encodeURIComponent).join('/')}`;
}

/** Parses only the database workspace route; ordinary document hashes are untouched. */
export function databasePageTargetFromHash(hash: string): DatabasePageTarget | null {
  if (!hash.startsWith(DATABASE_PAGE_HASH_PREFIX)) return null;
  const segments = hash.slice(DATABASE_PAGE_HASH_PREFIX.length).split('/');
  if (segments.length < 2 || segments.length > 3 || segments.some((segment) => !segment)) {
    return null;
  }
  try {
    const [databaseId, sourceId, viewId] = segments.map(decodeURIComponent);
    if (!databaseId || !sourceId) return null;
    return { databaseId, sourceId, ...(viewId ? { viewId } : {}) };
  } catch {
    return null;
  }
}

export function isDatabasePageHash(hash: string): boolean {
  return hash.startsWith(DATABASE_PAGE_HASH_PREFIX);
}

/** Ephemeral route used while a new database is still only a local draft. */
export function isDatabaseCreationHash(hash: string): boolean {
  return hash === DATABASE_CREATION_HASH;
}

export function databasePageFavoriteKey(
  target: Pick<DatabasePageTarget, 'databaseId' | 'sourceId'>,
): string {
  return `${target.databaseId}/${target.sourceId}`;
}

function databasePageFavoriteStorage(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isDatabasePageFavorite(
  target: Pick<DatabasePageTarget, 'databaseId' | 'sourceId'>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  const resolved = databasePageFavoriteStorage(storage);
  if (!resolved) return false;
  try {
    const parsed: unknown = JSON.parse(
      resolved.getItem(DATABASE_PAGE_FAVORITES_STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(parsed) && parsed.includes(databasePageFavoriteKey(target));
  } catch {
    return false;
  }
}

export function setDatabasePageFavorite(
  target: Pick<DatabasePageTarget, 'databaseId' | 'sourceId'>,
  favorite: boolean,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): void {
  const resolved = databasePageFavoriteStorage(storage);
  if (!resolved) return;
  try {
    const parsed: unknown = JSON.parse(
      resolved.getItem(DATABASE_PAGE_FAVORITES_STORAGE_KEY) ?? '[]',
    );
    const current = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
    const key = databasePageFavoriteKey(target);
    const next = favorite
      ? [...new Set([...current, key])]
      : current.filter((value) => value !== key);
    resolved.setItem(DATABASE_PAGE_FAVORITES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local preferences are best-effort and must never block database navigation.
  }
}

export function databaseViewOpenBehavior(view: DatabaseView): DatabaseViewOpenBehavior {
  if (view.openBehavior) return view.openBehavior;
  return ['gallery', 'calendar', 'map'].includes(view.layout.type) ? 'center_peek' : 'side_peek';
}
