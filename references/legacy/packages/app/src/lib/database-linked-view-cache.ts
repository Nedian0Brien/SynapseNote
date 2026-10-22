import {
  type DatabaseQueryResult,
  DatabaseQueryResultSchema,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDescription } from './database-catalog-client';

const LINKED_VIEW_CACHE_LIMIT = 8;
const LINKED_VIEW_CACHE_STORAGE_KEY = 'synapsenote:database-linked-view-cache-v1';

export interface DatabaseLinkedViewCacheEntry {
  description: DatabaseDescription;
  result: DatabaseQueryResult | null;
  touchedAt: number;
}

interface PersistedEntry {
  key: string;
  description: DatabaseDescription;
  result: DatabaseQueryResult | null;
  touchedAt: number;
}

let cacheLoaded = false;
const cache = new Map<string, DatabaseLinkedViewCacheEntry>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function storage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
  } catch {
    // Safari private windows and locked-down embedded views can throw while
    // resolving sessionStorage. The in-memory cache remains a safe fallback.
    return null;
  }
}

function isDescription(value: unknown): value is DatabaseDescription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { database?: unknown; source?: unknown };
  if (!candidate.database || typeof candidate.database !== 'object') return false;
  if (!candidate.source || typeof candidate.source !== 'object') return false;
  const database = candidate.database as { id?: unknown; views?: unknown };
  const source = candidate.source as { id?: unknown; properties?: unknown };
  return (
    typeof database.id === 'string' &&
    Array.isArray(database.views) &&
    typeof source.id === 'string' &&
    Array.isArray(source.properties)
  );
}

function isPersistedEntry(value: unknown): value is PersistedEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedEntry>;
  return (
    typeof candidate.key === 'string' &&
    isDescription(candidate.description) &&
    (candidate.result === null || DatabaseQueryResultSchema.safeParse(candidate.result).success) &&
    typeof candidate.touchedAt === 'number' &&
    Number.isFinite(candidate.touchedAt)
  );
}

function persist(): void {
  const target = storage();
  if (!target) return;
  try {
    const entries = [...cache.entries()]
      .sort(([, left], [, right]) => left.touchedAt - right.touchedAt)
      .map(([key, entry]) => ({ key, ...clone(entry) }));
    target.setItem(LINKED_VIEW_CACHE_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  } catch {
    // Quota/security errors must never turn a stale read into a failed render.
  }
}

function load(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  const target = storage();
  if (!target) return;
  try {
    const raw = target.getItem(LINKED_VIEW_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    const entriesValue =
      parsed && typeof parsed === 'object' ? (parsed as { entries?: unknown }).entries : undefined;
    if (!Array.isArray(entriesValue)) {
      target.removeItem(LINKED_VIEW_CACHE_STORAGE_KEY);
      return;
    }
    const entries = entriesValue.filter(isPersistedEntry);
    for (const entry of entries
      .sort((left, right) => left.touchedAt - right.touchedAt)
      .slice(-LINKED_VIEW_CACHE_LIMIT)) {
      cache.set(entry.key, {
        description: clone(entry.description),
        result: clone(entry.result),
        touchedAt: entry.touchedAt,
      });
    }
  } catch {
    cache.clear();
    try {
      target.removeItem(LINKED_VIEW_CACHE_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}

export function rememberDatabaseLinkedView(
  key: string,
  entry: Omit<DatabaseLinkedViewCacheEntry, 'touchedAt'>,
  touchedAt = Date.now(),
): void {
  load();
  cache.delete(key);
  cache.set(key, { ...clone(entry), touchedAt });
  while (cache.size > LINKED_VIEW_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  persist();
}

export function readDatabaseLinkedView(key: string): DatabaseLinkedViewCacheEntry | null {
  load();
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  const next = { ...entry, touchedAt: Date.now() };
  cache.set(key, next);
  persist();
  return clone(next);
}

export function resetDatabaseLinkedViewCacheForTests(): void {
  cache.clear();
  cacheLoaded = false;
  try {
    storage()?.removeItem(LINKED_VIEW_CACHE_STORAGE_KEY);
  } catch {
    // Ignore test/runtime storage cleanup failures.
  }
}

export const databaseLinkedViewCacheStorageKey = LINKED_VIEW_CACHE_STORAGE_KEY;
