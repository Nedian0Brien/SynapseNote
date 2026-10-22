import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';

export interface SavedViewProjectionDraft {
  propertyOrder: string[];
  visiblePropertyIds: string[];
}

/** Build the stable initial projection draft used by both inline and full settings surfaces. */
export function createSavedViewProjectionDraft(
  view: DatabaseView,
  source: DatabaseSource,
): SavedViewProjectionDraft {
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const propertyOrder = [
    ...view.projection.propertyIds,
    ...source.properties
      .map((property) => property.id)
      .filter((propertyId) => !view.projection.propertyIds.includes(propertyId)),
  ];
  return {
    propertyOrder: titleProperty
      ? [titleProperty.id, ...propertyOrder.filter((propertyId) => propertyId !== titleProperty.id)]
      : propertyOrder,
    visiblePropertyIds: [
      ...new Set([...(titleProperty ? [titleProperty.id] : []), ...view.projection.propertyIds]),
    ],
  };
}
