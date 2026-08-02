import type {
  DatabaseProperty,
  DatabaseTableViewConfiguration,
} from '@nedian0brien/synapsenote-core';
import {
  clampDatabaseTableColumnWidth,
  DATABASE_TABLE_DEFAULT_PROPERTY_WIDTH,
  DATABASE_TABLE_DEFAULT_TITLE_WIDTH,
} from './database-table-geometry';

export type DatabaseTableRowHeight = 'compact' | 'standard' | 'tall';

export interface DatabaseTableLayoutState {
  propertyIds: string[];
  hiddenPropertyIds: string[];
  widths: Record<string, number>;
  wrap: boolean;
  rowHeight: DatabaseTableRowHeight;
}

const boundedWidth = clampDatabaseTableColumnWidth;

export function reconcileDatabaseTableLayout(
  properties: readonly DatabaseProperty[],
  saved?: Partial<DatabaseTableLayoutState> | null,
): DatabaseTableLayoutState {
  const ids = new Set(properties.map((property) => property.id));
  const titleId = properties.find((property) => property.type === 'title')?.id;
  const savedOrder = Array.isArray(saved?.propertyIds)
    ? saved.propertyIds.filter((id): id is string => typeof id === 'string' && ids.has(id))
    : [];
  const deduped = [...new Set(savedOrder)];
  for (const property of properties) {
    if (!deduped.includes(property.id)) deduped.push(property.id);
  }
  const propertyIds = titleId
    ? [titleId, ...deduped.filter((propertyId) => propertyId !== titleId)]
    : deduped;
  const hiddenPropertyIds = Array.isArray(saved?.hiddenPropertyIds)
    ? [...new Set(saved.hiddenPropertyIds)].filter(
        (propertyId) => ids.has(propertyId) && propertyId !== titleId,
      )
    : [];
  const widths: Record<string, number> = {};
  for (const propertyId of propertyIds) {
    const width = boundedWidth(saved?.widths?.[propertyId]);
    widths[propertyId] =
      width ??
      (propertyId === titleId
        ? DATABASE_TABLE_DEFAULT_TITLE_WIDTH
        : DATABASE_TABLE_DEFAULT_PROPERTY_WIDTH);
  }
  return {
    propertyIds,
    hiddenPropertyIds,
    widths,
    wrap: saved?.wrap === true,
    rowHeight:
      saved?.rowHeight === 'compact' || saved?.rowHeight === 'tall' ? saved.rowHeight : 'standard',
  };
}

export function applyDatabaseSavedTableViewLayout(
  properties: readonly DatabaseProperty[],
  localLayout: DatabaseTableLayoutState,
  projectionPropertyIds: readonly string[],
  configuration: DatabaseTableViewConfiguration = {},
): DatabaseTableLayoutState {
  const ids = new Set(properties.map((property) => property.id));
  const titleId = properties.find((property) => property.type === 'title')?.id;
  const projectionOrder = [...new Set(projectionPropertyIds)].filter((propertyId) =>
    ids.has(propertyId),
  );
  const canonicalOrder = titleId
    ? [titleId, ...projectionOrder.filter((propertyId) => propertyId !== titleId)]
    : projectionOrder;
  const propertyIds = [
    ...canonicalOrder,
    ...localLayout.propertyIds.filter((propertyId) => !canonicalOrder.includes(propertyId)),
  ];
  const widths = { ...localLayout.widths };
  for (const [propertyId, value] of Object.entries(configuration.propertyWidths ?? {})) {
    if (!ids.has(propertyId)) continue;
    const width = boundedWidth(value);
    if (width !== null) widths[propertyId] = width;
  }
  const projected = new Set(canonicalOrder);
  return {
    propertyIds,
    hiddenPropertyIds: properties
      .map((property) => property.id)
      .filter((propertyId) => !projected.has(propertyId) && propertyId !== titleId),
    widths,
    wrap: configuration.wrap ?? localLayout.wrap,
    rowHeight: configuration.rowHeight ?? localLayout.rowHeight,
  };
}

export function moveDatabaseTableProperty(
  layout: DatabaseTableLayoutState,
  propertyId: string,
  direction: -1 | 1,
): DatabaseTableLayoutState {
  const hiddenPropertyIds = new Set(layout.hiddenPropertyIds);
  const visiblePropertyIds = layout.propertyIds.filter(
    (candidate) => !hiddenPropertyIds.has(candidate),
  );
  const visibleFrom = visiblePropertyIds.indexOf(propertyId);
  const visibleTo = visibleFrom + direction;
  if (visibleFrom <= 0 || visibleTo <= 0 || visibleTo >= visiblePropertyIds.length) {
    return layout;
  }
  const from = layout.propertyIds.indexOf(propertyId);
  const targetPropertyId = visiblePropertyIds[visibleTo];
  const to = targetPropertyId ? layout.propertyIds.indexOf(targetPropertyId) : -1;
  if (from <= 0 || to <= 0 || to >= layout.propertyIds.length) return layout;
  const propertyIds = [...layout.propertyIds];
  const [moved] = propertyIds.splice(from, 1);
  if (!moved) return layout;
  propertyIds.splice(to, 0, moved);
  return { ...layout, propertyIds };
}

export function databaseTableRowHeightPixels(height: DatabaseTableRowHeight): number {
  if (height === 'compact') return 36;
  if (height === 'tall') return 72;
  return 52;
}

export function databaseTableLayoutStorageKey(sourceId: string): string {
  return `synapsenote:database-table-layout:v1:${sourceId}`;
}

export function loadDatabaseTableLayout(
  sourceId: string,
  properties: readonly DatabaseProperty[],
): DatabaseTableLayoutState {
  if (typeof localStorage === 'undefined') return reconcileDatabaseTableLayout(properties);
  try {
    const raw = localStorage.getItem(databaseTableLayoutStorageKey(sourceId));
    const parsed = raw ? (JSON.parse(raw) as Partial<DatabaseTableLayoutState>) : null;
    return reconcileDatabaseTableLayout(properties, parsed);
  } catch {
    return reconcileDatabaseTableLayout(properties);
  }
}

export function saveDatabaseTableLayout(sourceId: string, layout: DatabaseTableLayoutState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(databaseTableLayoutStorageKey(sourceId), JSON.stringify(layout));
}
