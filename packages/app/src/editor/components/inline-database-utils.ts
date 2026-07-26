import type {
  DatabaseLinkedViewSettings,
  DatabaseQueryResult,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabaseViewTabAction } from '@/components/DatabaseViewTabMenu';
import type { DatabaseDescription } from '@/lib/database-catalog-client';

export function databaseViewTabActionToInitialAction(
  view: Pick<DatabaseView, 'id' | 'favorite'>,
  action: DatabaseViewTabAction,
): DatabaseViewManagerInitialAction | null {
  switch (action) {
    case 'duplicate':
      return { kind: 'duplicate', viewId: view.id };
    case 'favorite':
      return { kind: 'favorite', viewId: view.id, favorite: view.favorite !== true };
    case 'move-left':
      return { kind: 'reorder', viewId: view.id, direction: -1 };
    case 'move-right':
      return { kind: 'reorder', viewId: view.id, direction: 1 };
    case 'delete':
      return { kind: 'delete', viewId: view.id };
    case 'rename':
      return { kind: 'rename', viewId: view.id };
    case 'make-default':
      return { kind: 'make-default', viewId: view.id };
    case 'clear-default':
      return { kind: 'clear-default', viewId: view.id };
    default:
      return null;
  }
}

export function linkedViewSettingsFromView(view: DatabaseView): DatabaseLinkedViewSettings {
  return {
    layout: structuredClone(view.layout),
    where: view.where ? structuredClone(view.where) : null,
    conditionalColors: structuredClone(view.conditionalColors ?? []),
    sort: structuredClone(view.sort),
    groups: structuredClone(view.groups),
    projection: structuredClone(view.projection),
    ...(view.openBehavior ? { openBehavior: view.openBehavior } : {}),
  };
}

export function inlineDatabaseRecordMatchesSearch(
  record: ProjectedDatabaseRecord,
  source: DatabaseDescription['source'],
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const readableValues =
    source?.properties.map((property) => {
      const value = record.values[property.id];
      return `${property.name} ${typeof value === 'string' ? value : JSON.stringify(value ?? '')}`;
    }) ?? [];
  return [record.path, ...readableValues].join('\n').toLowerCase().includes(needle);
}

export function applyInlineOptimisticValues(
  result: DatabaseQueryResult,
  optimisticValues: ReadonlyMap<string, DatabaseValue | undefined>,
): DatabaseQueryResult {
  if (optimisticValues.size === 0) return result;
  const records = result.records.map((record) => {
    const prefix = `${record.id}:`;
    const changes = [...optimisticValues.entries()].filter(([key]) => key.startsWith(prefix));
    if (changes.length === 0) return record;
    const values = { ...record.values };
    for (const [key, value] of changes) {
      const propertyId = key.slice(prefix.length);
      if (value === undefined) delete values[propertyId];
      else values[propertyId] = value;
    }
    return { ...record, values };
  });
  const groupMemberships = result.groupMemberships
    ? Object.fromEntries(
        Object.entries(result.groupMemberships).map(([recordId, memberships]) => {
          const prefix = `${recordId}:`;
          const nextMemberships = memberships.map((membership) =>
            membership.map((item) => {
              const key = `${prefix}${item.propertyId}`;
              if (!optimisticValues.has(key)) return item;
              const value = optimisticValues.get(key);
              return { ...item, value: value === undefined ? null : value };
            }),
          );
          return [recordId, nextMemberships];
        }),
      )
    : undefined;
  return { ...result, records, ...(groupMemberships ? { groupMemberships } : {}) };
}

/** Apply a linked table's manual row order without mutating the query result. */
export function applyInlineManualRecordOrder(
  result: DatabaseQueryResult,
  manualRecordIds: readonly string[] | undefined,
): DatabaseQueryResult {
  if (!manualRecordIds || manualRecordIds.length === 0 || result.records.length < 2) return result;
  const rank = new Map(manualRecordIds.map((recordId, index) => [recordId, index]));
  const originalIndex = new Map(result.records.map((record, index) => [record.id, index]));
  const records = [...result.records].sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
  });
  return records.every((record, index) => record === result.records[index])
    ? result
    : { ...result, records };
}

/** Preserve unloaded IDs while replacing the order of the currently loaded page. */
export function mergeInlineManualRecordOrder(
  current: readonly string[] | undefined,
  reorderedLoadedIds: readonly string[],
): string[] {
  if (!current || current.length === 0) return [...new Set(reorderedLoadedIds)];
  const loaded = new Set(reorderedLoadedIds);
  const next: string[] = [];
  let loadedIndex = 0;
  for (const recordId of current) {
    if (loaded.has(recordId)) {
      const replacement = reorderedLoadedIds[loadedIndex++];
      if (replacement) next.push(replacement);
    } else {
      next.push(recordId);
    }
  }
  while (loadedIndex < reorderedLoadedIds.length) {
    const recordId = reorderedLoadedIds[loadedIndex++];
    if (recordId) next.push(recordId);
  }
  return [...new Set(next)];
}
