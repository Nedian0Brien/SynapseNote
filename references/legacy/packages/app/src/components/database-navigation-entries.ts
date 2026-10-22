import type { DatabaseCatalogCandidate } from '@/lib/database-catalog-client';
import { databasePageTargetToHash } from '@/lib/database-navigation';

/** A human-facing database/source target used by the workspace omnibar. */
export interface DatabaseNavigationEntry {
  kind: 'database';
  /** Stable route; never a filesystem path or a display-name lookup key. */
  path: string;
  name: string;
  databaseId: string;
  sourceId: string;
  databaseName: string;
  sourceName: string;
  databaseKey: string;
  sourceKey: string;
  purpose: string;
}

export function buildDatabaseNavigationEntries(
  candidates: readonly DatabaseCatalogCandidate[],
): DatabaseNavigationEntry[] {
  return candidates.flatMap((database) =>
    database.sources.map((source) => ({
      kind: 'database' as const,
      path: databasePageTargetToHash({ databaseId: database.id, sourceId: source.id }),
      name: source.name,
      databaseId: database.id,
      sourceId: source.id,
      databaseName: database.name,
      sourceName: source.name,
      databaseKey: database.key,
      sourceKey: source.key,
      purpose: database.purpose,
    })),
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function scoreDatabaseEntry(entry: DatabaseNavigationEntry, query: string): number | null {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const fields = [
    { value: normalize(entry.name), weight: 8 },
    { value: normalize(entry.databaseName), weight: 6 },
    { value: normalize(entry.sourceKey), weight: 4 },
    { value: normalize(entry.databaseKey), weight: 3 },
    { value: normalize(entry.purpose), weight: 1 },
  ];
  let score = 0;
  for (const term of terms) {
    const match = fields.find(({ value }) => value.includes(term));
    if (!match) return null;
    score += match.weight;
  }
  return score;
}

/** Search catalog-backed page targets without exposing stable IDs in the UI. */
export function searchDatabaseNavigationEntries(
  entries: readonly DatabaseNavigationEntry[],
  query: string,
  limit = 8,
): DatabaseNavigationEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, score: scoreDatabaseEntry(entry, query) }))
    .filter(
      (candidate): candidate is { entry: DatabaseNavigationEntry; index: number; score: number } =>
        candidate.score !== null,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.databaseName.localeCompare(b.entry.databaseName) ||
        a.entry.sourceName.localeCompare(b.entry.sourceName) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}
