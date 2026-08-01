/** Pure cache ordering and admission rules. No DOM or provider ownership. */
export interface EditorCacheSizeStats {
  viewCount: number;
  bytes: number;
}

export function shouldCacheBySize(
  stats: EditorCacheSizeStats,
  viewCountThreshold: number,
  bytesThreshold: number,
): boolean {
  return (
    !(stats.viewCount > 0 && stats.viewCount >= viewCountThreshold) && stats.bytes <= bytesThreshold
  );
}

/** Return the LRU order after a mount replay. The newest item is last. */
export function touchCacheOrder(order: readonly string[], docName: string): string[] {
  return [...order.filter((item) => item !== docName), docName];
}

/**
 * Prefer a parked document for eviction; retain the pure-LRU fallback when
 * every cache entry is activity-mounted.
 */
export function chooseEvictionCandidate(
  order: readonly string[],
  mountingDocName: string,
  activityMounts: ReadonlySet<string>,
): string | null {
  return (
    order.find((docName) => docName !== mountingDocName && !activityMounts.has(docName)) ??
    order.find((docName) => docName !== mountingDocName) ??
    null
  );
}
