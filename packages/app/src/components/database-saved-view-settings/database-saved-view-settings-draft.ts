import {
  type DatabaseConditionalColorRule,
  type DatabaseSource,
  type DatabaseView,
  type DatabaseViewOpenBehavior,
  DatabaseViewSchema,
} from '@nedian0brien/synapsenote-core';

export interface SavedViewProjectionDraft {
  propertyOrder: string[];
  visiblePropertyIds: string[];
}

export type SavedViewEditorSort = DatabaseView['sort'][number] & { editorId: string };
export type SavedViewEditorGroup = DatabaseView['groups'][number] & { editorId: string };
export type SavedViewEditorConditionalColor = DatabaseConditionalColorRule & {
  editorId: string;
};

/** Owns the serializable draft that panels edit before one saved-view review. */
export interface SavedViewSettingsDraft extends SavedViewProjectionDraft {
  body: DatabaseView['projection']['body'];
  conditionalColors: SavedViewEditorConditionalColor[];
  groups: SavedViewEditorGroup[];
  layout: DatabaseView['layout'];
  openBehavior: DatabaseViewOpenBehavior;
  sort: SavedViewEditorSort[];
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

/** Reconciles projection state every time a saved-view dialog opens. */
export function reconcileSavedViewProjectionDraft(
  view: DatabaseView,
  source: DatabaseSource,
): SavedViewProjectionDraft {
  return createSavedViewProjectionDraft(view, source);
}

/** Creates the editable draft and assigns local-only identities for row controls. */
export function createSavedViewSettingsDraft(
  view: DatabaseView,
  source: DatabaseSource,
  initialSortPropertyId?: string,
): SavedViewSettingsDraft {
  const projection = reconcileSavedViewProjectionDraft(view, source);
  const sort = structuredClone(view.sort).map((item, index) => ({
    ...item,
    editorId: `${view.id}:sort:${index}`,
  }));
  if (
    initialSortPropertyId &&
    source.properties.some((property) => property.id === initialSortPropertyId) &&
    !sort.some((item) => item.propertyId === initialSortPropertyId)
  ) {
    sort.push({
      editorId: `${view.id}:sort:target`,
      propertyId: initialSortPropertyId,
      direction: 'asc',
    });
  }
  return {
    ...projection,
    body: view.projection.body,
    conditionalColors: structuredClone(view.conditionalColors ?? []).map((item, index) => ({
      ...item,
      editorId: `${view.id}:conditional-color:${index}`,
    })),
    groups: structuredClone(view.groups).map((item, index) => ({
      ...item,
      editorId: `${view.id}:group:${index}`,
    })),
    layout: structuredClone(view.layout),
    openBehavior: view.openBehavior ?? 'side_peek',
    sort,
  };
}

/** Compiles panel draft state into the one schema-validated saved-view revision. */
export function compileSavedViewDesiredState(
  view: DatabaseView,
  draft: SavedViewSettingsDraft,
): DatabaseView {
  const propertyIds = draft.propertyOrder.filter((propertyId) =>
    draft.visiblePropertyIds.includes(propertyId),
  );
  if (propertyIds.length === 0) throw new Error('A saved view must show at least one property');
  const sort = draft.sort.map(({ editorId: _editorId, ...item }) => item);
  const chronologyPropertyId =
    draft.layout.type === 'feed' ? draft.layout.configuration.chronologyPropertyId : undefined;
  return DatabaseViewSchema.parse({
    ...view,
    conditionalColors: draft.conditionalColors.map(({ editorId: _editorId, ...item }) => item),
    groups: draft.groups.map(({ editorId: _editorId, ...item }) => item),
    layout: draft.layout,
    openBehavior: draft.openBehavior,
    projection: { propertyIds, body: draft.body },
    sort: chronologyPropertyId
      ? [
          { propertyId: chronologyPropertyId, direction: 'desc' as const },
          ...sort.filter((item) => item.propertyId !== chronologyPropertyId),
        ]
      : sort,
  });
}
