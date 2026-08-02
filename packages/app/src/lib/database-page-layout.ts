import type {
  DatabasePageLayout,
  DatabaseProperty,
  DatabaseRecordPageLayoutOverride,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';

interface ResolvedDatabasePageLayoutGroup {
  id: string;
  key: string;
  name: string;
  collapsed: boolean;
  properties: DatabaseProperty[];
}

interface ResolvedDatabasePageLayoutSection {
  id: string;
  key: string;
  name: string;
  groups: ResolvedDatabasePageLayoutGroup[];
}

export interface ResolvedDatabasePageLayout {
  pinned: DatabaseProperty[];
  panel: DatabaseProperty[];
  hidden: DatabaseProperty[];
  sections: ResolvedDatabasePageLayoutSection[];
  fullWidthContent: boolean;
}

function propertiesForIds(
  propertyById: ReadonlyMap<string, DatabaseProperty>,
  ids: readonly string[],
): DatabaseProperty[] {
  return ids.flatMap((id) => {
    const property = propertyById.get(id);
    return property ? [property] : [];
  });
}

/**
 * Resolves the validated stable-ID manifest layout into renderable properties.
 * New properties that have not been placed yet remain visible in the panel;
 * hiding is always explicit and the Title stays owned by the page header.
 */
export function resolveDatabasePageLayout(
  source: DatabaseSource,
  layout: DatabasePageLayout | undefined = source.pageLayout,
  override?: DatabaseRecordPageLayoutOverride,
): ResolvedDatabasePageLayout {
  const nonTitle = source.properties.filter((property) => property.type !== 'title');
  const propertyById = new Map(nonTitle.map((property) => [property.id, property] as const));
  const explicitPlacements = new Set(
    override
      ? [...override.pinnedPropertyIds, ...override.panelPropertyIds, ...override.hiddenPropertyIds]
      : [],
  );
  const pinnedIds = [
    ...(override?.pinnedPropertyIds ?? []),
    ...(layout?.pinnedPropertyIds ?? []).filter(
      (propertyId) => !explicitPlacements.has(propertyId),
    ),
  ];
  const hiddenIds = [
    ...(override?.hiddenPropertyIds ?? []),
    ...(layout?.hiddenPropertyIds ?? []).filter(
      (propertyId) => !explicitPlacements.has(propertyId),
    ),
  ];
  const unavailable = new Set([...pinnedIds, ...hiddenIds, ...(override?.panelPropertyIds ?? [])]);
  const groupState = new Map(
    override?.groupOverrides.map((item) => [item.groupId, item.collapsed] as const) ?? [],
  );
  const sections = (layout?.sections ?? []).map((section) => ({
    id: section.id,
    key: section.key,
    name: section.name,
    groups: section.groups.map((group) => ({
      id: group.id,
      key: group.key,
      name: group.name,
      collapsed: groupState.get(group.id) ?? group.collapsed,
      properties: propertiesForIds(propertyById, group.propertyIds).filter(
        (property) => !unavailable.has(property.id),
      ),
    })),
  }));
  const sectionPropertyIds = new Set(
    sections.flatMap((section) =>
      section.groups.flatMap((group) => group.properties.map((property) => property.id)),
    ),
  );
  const panelOrder = [
    ...(override?.panelPropertyIds ?? []),
    ...(layout?.panelPropertyIds ?? []),
    ...(layout?.pinnedPropertyIds ?? []),
    ...(layout?.hiddenPropertyIds ?? []),
    ...nonTitle.map((property) => property.id),
  ];
  const panelIds = [
    ...new Set(
      panelOrder.filter(
        (propertyId) =>
          (!unavailable.has(propertyId) || override?.panelPropertyIds.includes(propertyId)) &&
          !sectionPropertyIds.has(propertyId),
      ),
    ),
  ];
  return {
    pinned: propertiesForIds(propertyById, pinnedIds),
    panel: propertiesForIds(propertyById, panelIds),
    hidden: propertiesForIds(propertyById, hiddenIds),
    sections,
    fullWidthContent: override?.fullWidthContent ?? layout?.fullWidthContent ?? false,
  };
}
