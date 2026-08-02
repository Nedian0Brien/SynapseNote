import { databasePageTargetToHash, databaseRecordPathToHash } from './database-navigation';

const DATABASE_RECORD_NAVIGATION_KEY = 'synapsenote:database-record-navigation-v1';
const DATABASE_RECORD_NAVIGATION_LIMIT = 200;

export interface DatabaseRecordNavigationState {
  databaseId: string;
  sourceId: string;
  viewId?: string;
  paths: string[];
  index: number;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readState(): DatabaseRecordNavigationState | null {
  const target = storage();
  if (!target) return null;
  try {
    const parsed: unknown = JSON.parse(target.getItem(DATABASE_RECORD_NAVIGATION_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<DatabaseRecordNavigationState>;
    if (
      typeof value.databaseId !== 'string' ||
      typeof value.sourceId !== 'string' ||
      !Array.isArray(value.paths) ||
      value.paths.some((path) => typeof path !== 'string') ||
      value.paths.length === 0 ||
      typeof value.index !== 'number' ||
      !Number.isInteger(value.index) ||
      value.index < 0 ||
      value.index >= value.paths.length
    ) {
      return null;
    }
    return {
      databaseId: value.databaseId,
      sourceId: value.sourceId,
      ...(typeof value.viewId === 'string' ? { viewId: value.viewId } : {}),
      paths: [...value.paths],
      index: value.index,
    };
  } catch {
    return null;
  }
}

export function rememberDatabaseRecordNavigation(input: {
  databaseId: string;
  sourceId: string;
  viewId?: string | null;
  paths: readonly string[];
  currentPath: string;
}): DatabaseRecordNavigationState | null {
  const uniquePaths = [...new Set(input.paths.filter((path) => path.length > 0))];
  const currentIndex = uniquePaths.indexOf(input.currentPath);
  if (currentIndex < 0) return null;
  const start = Math.max(
    0,
    Math.min(
      currentIndex - Math.floor(DATABASE_RECORD_NAVIGATION_LIMIT / 2),
      uniquePaths.length - DATABASE_RECORD_NAVIGATION_LIMIT,
    ),
  );
  const paths = uniquePaths.slice(start, start + DATABASE_RECORD_NAVIGATION_LIMIT);
  const index = paths.indexOf(input.currentPath);
  if (!input.databaseId || !input.sourceId || index < 0) return null;
  const next: DatabaseRecordNavigationState = {
    databaseId: input.databaseId,
    sourceId: input.sourceId,
    ...(input.viewId ? { viewId: input.viewId } : {}),
    paths,
    index,
  };
  const target = storage();
  if (target) {
    try {
      target.setItem(DATABASE_RECORD_NAVIGATION_KEY, JSON.stringify(next));
    } catch {
      // Session storage is a convenience; navigation remains canonical without it.
    }
  }
  return next;
}

export function readDatabaseRecordNavigation(
  currentPath: string,
): DatabaseRecordNavigationState | null {
  const state = readState();
  return state?.paths[state.index] === currentPath ? state : null;
}

function updateDatabaseRecordNavigationIndex(
  state: DatabaseRecordNavigationState,
  index: number,
): DatabaseRecordNavigationState | null {
  if (!Number.isInteger(index) || index < 0 || index >= state.paths.length) return null;
  const next = { ...state, paths: [...state.paths], index };
  const target = storage();
  if (target) {
    try {
      target.setItem(DATABASE_RECORD_NAVIGATION_KEY, JSON.stringify(next));
    } catch {
      // Best effort only.
    }
  }
  return next;
}

export function databaseRecordNavigationHash(
  state: DatabaseRecordNavigationState,
  index: number,
): string | null {
  const next = updateDatabaseRecordNavigationIndex(state, index);
  const path = next?.paths[index];
  return path ? databaseRecordPathToHash(path) : null;
}

export function databaseRecordNavigationOriginHash(state: DatabaseRecordNavigationState): string {
  return databasePageTargetToHash({
    databaseId: state.databaseId,
    sourceId: state.sourceId,
    ...(state.viewId ? { viewId: state.viewId } : {}),
  });
}
