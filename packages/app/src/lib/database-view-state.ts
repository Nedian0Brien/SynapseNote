export function databaseLastOpenedViewStorageKey(databaseId: string, sourceId: string): string {
  return `synapsenote:database-last-view:v1:${databaseId}:${sourceId}`;
}

/** `undefined` means no preference; an empty string explicitly means All records. */
export function loadDatabaseLastOpenedView(
  databaseId: string,
  sourceId: string,
  availableViewIds: readonly string[],
): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(databaseLastOpenedViewStorageKey(databaseId, sourceId));
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('viewId' in value)) {
      return undefined;
    }
    const viewId = (value as { viewId?: unknown }).viewId;
    if (viewId === null) return '';
    return typeof viewId === 'string' && availableViewIds.includes(viewId) ? viewId : undefined;
  } catch {
    return undefined;
  }
}

export function saveDatabaseLastOpenedView(
  databaseId: string,
  sourceId: string,
  viewId: string,
): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    databaseLastOpenedViewStorageKey(databaseId, sourceId),
    JSON.stringify({ viewId: viewId || null }),
  );
}
