import type { DatabaseDefinition } from './schema.ts';

/**
 * Drop every reference to a property that can be dropped without changing what
 * a view MEANS, so a removal produces a definition the manifest schema accepts.
 *
 * Removing a property leaves references behind all over a definition, and the
 * schema refuses a definition that still names one. This prunes the sites where
 * the property's absence has exactly one sensible answer:
 *
 *   - `storage.storedPropertyIds` — the owner-table column set
 *   - `projection.propertyIds` — a hidden column is simply not shown
 *   - `sort` / `groups` — there is nothing left to order or group by
 *   - table `propertyWidths` — pure display state for a column that is gone
 *   - `agent.writePolicy.allowedPropertyIds` — a grant over nothing
 *
 * It deliberately does NOT touch `where` filters, `conditionalColors`, or the
 * properties a layout requires (a calendar's date, a map's place, a chart's
 * measure). Silently dropping a filter changes which rows a view shows, and a
 * layout cannot render without its required property — those are refusals for
 * the caller to surface, not edits to make on the user's behalf. The schema
 * still reports them by view, which is the honest outcome.
 */
export function pruneDatabasePropertyReferences(
  definition: DatabaseDefinition,
  sourceId: string,
  propertyId: string,
): DatabaseDefinition {
  const sources = definition.sources.map((source) => {
    if (source.id !== sourceId) return source;
    const storage =
      source.storage?.kind === 'markdown_table'
        ? {
            ...source.storage,
            storedPropertyIds: source.storage.storedPropertyIds.filter((id) => id !== propertyId),
          }
        : source.storage;
    return {
      ...source,
      properties: source.properties.filter((property) => property.id !== propertyId),
      ...(storage ? { storage } : {}),
    };
  });

  const views = definition.views.map((view) => {
    if (view.sourceId !== sourceId) return view;
    const layout =
      view.layout.type === 'table' && view.layout.configuration.propertyWidths
        ? {
            ...view.layout,
            configuration: {
              ...view.layout.configuration,
              propertyWidths: Object.fromEntries(
                Object.entries(view.layout.configuration.propertyWidths).filter(
                  ([id]) => id !== propertyId,
                ),
              ),
            },
          }
        : view.layout;
    return {
      ...view,
      layout,
      sort: view.sort.filter((entry) => entry.propertyId !== propertyId),
      groups: view.groups.filter((entry) => entry.propertyId !== propertyId),
      projection: {
        ...view.projection,
        propertyIds: view.projection.propertyIds.filter((id) => id !== propertyId),
      },
      ...(view.agent
        ? {
            agent: {
              ...view.agent,
              writePolicy: {
                ...view.agent.writePolicy,
                allowedPropertyIds: view.agent.writePolicy.allowedPropertyIds?.filter(
                  (id) => id !== propertyId,
                ),
              },
            },
          }
        : {}),
    };
  }) as DatabaseDefinition['views'];

  return { ...definition, sources, views } as DatabaseDefinition;
}
