import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { useEffect, useState } from 'react';
import {
  applyDatabaseSavedTableViewLayout,
  type DatabaseTableLayoutState,
  loadDatabaseTableLayout,
  reconcileDatabaseTableLayout,
  saveDatabaseTableLayout,
} from '@/lib/database-table-layout';
import type { DatabaseTableProps } from './database-table-types';
import { DATABASE_TABLE_RENDERED_COLUMN_LIMIT } from './database-table-types';
import { sourceProperties } from './database-table-utils';

/** Owns property order, visibility, persisted widths, and linked-view projection. */
export function useDatabaseTableLayoutModel({
  source,
  viewPropertyIds,
  viewConfiguration,
  onViewPropertyIdsChange,
}: Pick<
  DatabaseTableProps,
  'source' | 'viewPropertyIds' | 'viewConfiguration' | 'onViewPropertyIdsChange'
>) {
  const allProperties = sourceProperties(source);
  const [layout, setLayout] = useState(() => {
    const localLayout = loadDatabaseTableLayout(source.id, allProperties);
    return viewPropertyIds
      ? applyDatabaseSavedTableViewLayout(
          allProperties,
          localLayout,
          viewPropertyIds,
          viewConfiguration,
        )
      : localLayout;
  });
  const sourcePropertyIdsKey = allProperties.map((property) => property.id).join('\0');
  const viewPropertyIdsKey = viewPropertyIds?.join('\0') ?? '';
  const viewConfigurationKey = JSON.stringify(viewConfiguration ?? null);

  // Controlled linked views reconcile into the mounted table instead of
  // replacing the renderer and losing its focus/scroll identity.
  // biome-ignore lint/correctness/useExhaustiveDependencies: serialized keys intentionally define the controlled projection boundary
  useEffect(() => {
    setLayout((current) => {
      const reconciled = reconcileDatabaseTableLayout(allProperties, current);
      return viewPropertyIds
        ? applyDatabaseSavedTableViewLayout(
            allProperties,
            reconciled,
            viewPropertyIds,
            viewConfiguration,
          )
        : reconciled;
    });
  }, [sourcePropertyIdsKey, viewPropertyIdsKey, viewConfigurationKey]);

  const viewPropertySet = viewPropertyIds ? new Set(viewPropertyIds) : null;
  const visibleLayoutPropertyIds = layout.propertyIds.filter(
    (propertyId) => !layout.hiddenPropertyIds.includes(propertyId),
  );
  const visibleProperties = visibleLayoutPropertyIds
    .map((propertyId) => allProperties.find((property) => property.id === propertyId))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined && (!viewPropertySet || viewPropertySet.has(property.id)),
    );
  const properties = visibleProperties.slice(0, DATABASE_TABLE_RENDERED_COLUMN_LIMIT);

  const updatePropertyLayout = (
    update: (current: DatabaseTableLayoutState) => DatabaseTableLayoutState,
  ) => {
    const next = update(layout);
    if (viewPropertyIds && onViewPropertyIdsChange) {
      onViewPropertyIdsChange(
        next.propertyIds.filter((propertyId) => !next.hiddenPropertyIds.includes(propertyId)),
      );
      return;
    }
    setLayout(next);
  };

  useEffect(() => {
    if (!viewPropertyIds) saveDatabaseTableLayout(source.id, layout);
  }, [layout, source.id, viewPropertyIds]);

  return {
    allProperties,
    layout,
    setLayout,
    sourcePropertyIdsKey,
    visibleLayoutPropertyIds,
    visibleProperties,
    properties,
    updatePropertyLayout,
  };
}
