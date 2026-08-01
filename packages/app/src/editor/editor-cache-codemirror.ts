import { mark } from '@/lib/perf';
import {
  BYTES_CACHE_THRESHOLD,
  CACHE_ENABLED,
  MAX_CACHE,
  VIEW_COUNT_CACHE_THRESHOLD,
} from './editor-cache-config';
import { parkCmDom, reparentCm } from './editor-cache-dom';
import { chooseEvictionCandidate, shouldCacheBySize, touchCacheOrder } from './editor-cache-policy';
import { cmCache, cmLru, getActivityMountList } from './editor-cache-state';
import type { CmCacheEntry, MountCmParams } from './editor-cache-types';
import { getMountId } from './mount-id-registry';

function removeFromCache(docName: string): void {
  cmCache.delete(docName);
  const index = cmLru.indexOf(docName);
  if (index !== -1) cmLru.splice(index, 1);
}
function markStats(
  docName: string,
  sizeStats: MountCmParams['sizeStats'],
  cacheHit: boolean,
): void {
  if (sizeStats)
    mark('ok/cold/editor-mount-stats', {
      docName,
      mountId: getMountId(docName),
      ...sizeStats,
      cacheHit,
      kind: 'cm',
    });
}

export function mountCmEditor(params: MountCmParams): CmCacheEntry {
  const { docName, container, factory, sizeStats } = params;
  const cacheAllowed =
    CACHE_ENABLED &&
    (!sizeStats || shouldCacheBySize(sizeStats, VIEW_COUNT_CACHE_THRESHOLD, BYTES_CACHE_THRESHOLD));
  if (!cacheAllowed) {
    const fresh = factory(container);
    mark('ok/cache/miss', {
      docName,
      mountId: getMountId(docName),
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
      reason: CACHE_ENABLED ? 'size-gate' : 'kill-switch',
      kind: 'cm',
    });
    return {
      ...fresh,
      scrollTop: 0,
      hadFocus: false,
      activeMountKey: docName,
      parkingNode: null,
      __uncached: true,
    };
  }
  const reuse = cmCache.get(docName);
  if (reuse) {
    mark('ok/cache/reparent-start', {
      docName,
      mountId: getMountId(docName),
      kind: 'cm',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    reparentCm(reuse, container);
    reuse.activeMountKey = docName;
    cmLru.splice(0, cmLru.length, ...touchCacheOrder(cmLru, docName));
    container.scrollTop = reuse.scrollTop;
    if (reuse.hadFocus)
      try {
        reuse.view.focus();
      } catch {
        /* focus is best effort */
      }
    mark('ok/cache/reparent-end', {
      docName,
      mountId: getMountId(docName),
      kind: 'cm',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    mark('ok/cache/hit', { docName, mountId: getMountId(docName), kind: 'cm' });
    markStats(docName, sizeStats, true);
    return reuse;
  }
  while (cmCache.size >= MAX_CACHE) {
    const candidate = chooseEvictionCandidate(cmLru, docName, getActivityMountList());
    if (!candidate) break;
    if (getActivityMountList().has(candidate))
      mark('ok/cache/evict-fallback-activity-saturated', {
        mountingDocName: docName,
        lruLength: cmLru.length,
        activityMountCount: getActivityMountList().size,
      });
    evictCmEditor(candidate);
  }
  const entry: CmCacheEntry = {
    ...factory(container),
    scrollTop: 0,
    hadFocus: false,
    activeMountKey: docName,
    parkingNode: null,
  };
  cmCache.set(docName, entry);
  cmLru.splice(0, cmLru.length, ...touchCacheOrder(cmLru, docName));
  mark('ok/cache/miss', {
    docName,
    mountId: getMountId(docName),
    viewCount: sizeStats?.viewCount ?? -1,
    bytes: sizeStats?.bytes ?? -1,
    reason: 'cold',
    kind: 'cm',
  });
  markStats(docName, sizeStats, false);
  return entry;
}

export function parkCmEditor(entry: CmCacheEntry): void {
  if (!CACHE_ENABLED || entry.__uncached) {
    try {
      entry.view.destroy();
    } catch (err) {
      mark('ok/cache/park-destroy-failed', {
        docName: entry.activeMountKey ?? '',
        kind: 'cm',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } else parkCmDom(entry);
  entry.activeMountKey = null;
}

export function evictCmEditor(docName: string): boolean {
  const entry = cmCache.get(docName);
  if (!entry) return false;
  for (const [stage, target] of [
    ['view', entry.view],
    ['provider', entry.provider],
    ['ydoc', entry.ydoc],
  ] as const) {
    try {
      target.destroy();
    } catch (err) {
      mark('ok/cache/evict-failed', {
        docName,
        kind: 'cm',
        stage,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  removeFromCache(docName);
  mark('ok/cache/evict', { docName, kind: 'cm' });
  return true;
}

export function peekCm(docName: string): CmCacheEntry | undefined {
  return cmCache.get(docName);
}
