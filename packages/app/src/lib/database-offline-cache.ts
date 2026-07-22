import type { DatabaseQueryResult } from '@nedian0brien/synapsenote-core';
import type { DatabaseCatalogCandidate, DatabaseDescription } from './database-catalog-client';

const DATABASE_CACHE_LIMIT = 12;

export interface CachedDatabaseSnapshot {
  description: DatabaseDescription;
  result: DatabaseQueryResult;
  cachedAt: number;
}

let catalogCache: { candidates: DatabaseCatalogCandidate[]; cachedAt: number } | null = null;
const snapshotCache = new Map<string, CachedDatabaseSnapshot>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function databaseOfflineCacheKey(input: {
  databaseId: string;
  sourceId: string;
  viewId: string;
  showArchived: boolean;
  calculations: Readonly<Record<string, string>>;
}): string {
  return JSON.stringify({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
    viewId: input.viewId,
    showArchived: input.showArchived,
    calculations: Object.entries(input.calculations).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  });
}

export function cacheDatabaseCatalog(
  candidates: readonly DatabaseCatalogCandidate[],
  cachedAt = Date.now(),
): void {
  catalogCache = { candidates: clone([...candidates]), cachedAt };
}

export function readCachedDatabaseCatalog(): typeof catalogCache {
  return catalogCache ? clone(catalogCache) : null;
}

export function cacheDatabaseSnapshot(
  key: string,
  snapshot: Omit<CachedDatabaseSnapshot, 'cachedAt'>,
  cachedAt = Date.now(),
): void {
  snapshotCache.delete(key);
  snapshotCache.set(key, { ...clone(snapshot), cachedAt });
  while (snapshotCache.size > DATABASE_CACHE_LIMIT) {
    const oldest = snapshotCache.keys().next().value;
    if (oldest === undefined) break;
    snapshotCache.delete(oldest);
  }
}

export function readCachedDatabaseSnapshot(key: string): CachedDatabaseSnapshot | null {
  const snapshot = snapshotCache.get(key);
  if (!snapshot) return null;
  snapshotCache.delete(key);
  snapshotCache.set(key, snapshot);
  return clone(snapshot);
}

export function resetDatabaseOfflineCacheForTests(): void {
  catalogCache = null;
  snapshotCache.clear();
}
