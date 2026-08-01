/**
 * Pure workspace-controller boundaries shared by lifecycle and presentation
 * composition. This module owns saved-view reconciliation and preserves the
 * exact render payload assembled by the controller.
 */
export function resolveDatabaseWorkspaceSelectedViewId({
  selectedViewId,
  availableViewIds,
  persistedViewId,
  defaultViewId,
}: {
  selectedViewId: string;
  availableViewIds: readonly string[];
  persistedViewId: string | null | undefined;
  defaultViewId: string | null | undefined;
}): string {
  if (selectedViewId) {
    return availableViewIds.includes(selectedViewId) ? selectedViewId : '';
  }
  return persistedViewId ?? defaultViewId ?? availableViewIds[0] ?? '';
}

export function createDatabaseWorkspaceRenderContext<T extends object>(context: T): T {
  return context;
}
