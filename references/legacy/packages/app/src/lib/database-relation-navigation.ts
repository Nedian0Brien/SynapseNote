import type {
  DatabaseDefinition,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { fetchDatabaseRecord } from './database-query-client';

export interface DatabaseRelationNavigationItem {
  propertyId: string;
  propertyName: string;
  recordId: string;
  sourceId: string;
  title: string;
  path: string;
}

export interface DatabaseRelationNavigationResult {
  items: DatabaseRelationNavigationItem[];
  unavailable: number;
  truncated: boolean;
}

export async function resolveDatabaseRelationNavigation(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  limit?: number;
  fetchRecord?: typeof fetchDatabaseRecord;
}): Promise<DatabaseRelationNavigationResult> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const references = input.source.properties.flatMap((property) => {
    if (property.type !== 'relation') return [];
    const value = input.record.values[property.id];
    const ids = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : typeof value === 'string'
        ? [value]
        : [];
    return ids.map((recordId) => ({ property, recordId }));
  });
  const selected = references.slice(0, limit);
  const fetchRecord = input.fetchRecord ?? fetchDatabaseRecord;
  const resolved = await Promise.all(
    selected.map(async ({ property, recordId }) => {
      const targetSource = input.database.sources.find(
        (candidate) => candidate.id === property.targetSourceId,
      );
      const titleProperty = targetSource?.properties.find(
        (candidate) => candidate.type === 'title',
      );
      if (!targetSource || !titleProperty) return null;
      try {
        const result = await fetchRecord({
          databaseId: input.database.id,
          sourceId: targetSource.id,
          recordId,
        });
        const title = result.record.values[titleProperty.id];
        if (typeof title !== 'string') return null;
        return {
          propertyId: property.id,
          propertyName: property.name,
          recordId,
          sourceId: targetSource.id,
          title,
          path: result.record.path,
        } satisfies DatabaseRelationNavigationItem;
      } catch {
        return null;
      }
    }),
  );
  const items = resolved.filter((item): item is DatabaseRelationNavigationItem => item !== null);
  return {
    items,
    unavailable: selected.length - items.length,
    truncated: references.length > selected.length,
  };
}
