import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { CmCacheEntry, TiptapCacheEntry } from './editor-cache-types';

export const tiptapCache = new Map<string, TiptapCacheEntry>();
export const cmCache = new Map<string, CmCacheEntry>();
export const tiptapLru: string[] = [];
export const cmLru: string[] = [];
let activityMountList: ReadonlySet<string> = new Set();
let activeProviderPool: { entries: ReadonlyMap<string, { provider: HocuspocusProvider }> } | null =
  null;

export function getActivityMountList(): ReadonlySet<string> {
  return activityMountList;
}
export function getActivityMountNames(): string[] {
  return [...activityMountList];
}
export function replaceActivityMountList(next: ReadonlySet<string>): void {
  activityMountList = next;
}
export function setActiveProviderPool(
  pool: { entries: ReadonlyMap<string, { provider: HocuspocusProvider }> } | null,
): void {
  activeProviderPool = pool;
}
export function clearActiveProviderPool(pool: {
  entries: ReadonlyMap<string, { provider: HocuspocusProvider }>;
}): void {
  if (activeProviderPool === pool) activeProviderPool = null;
}
export function findCachedProvider(docName: string): HocuspocusProvider | null {
  return (
    tiptapCache.get(docName)?.provider ??
    cmCache.get(docName)?.provider ??
    activeProviderPool?.entries.get(docName)?.provider ??
    null
  );
}
