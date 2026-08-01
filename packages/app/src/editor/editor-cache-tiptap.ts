import { mark } from '@/lib/perf';
import {
  BYTES_CACHE_THRESHOLD,
  CACHE_ENABLED,
  MAX_CACHE,
  readEditorUndoManager,
  VIEW_COUNT_CACHE_THRESHOLD,
} from './editor-cache-config';
import { getTiptapEditorView, parkTiptapDom, reparentTiptap } from './editor-cache-dom';
import { chooseEvictionCandidate, shouldCacheBySize, touchCacheOrder } from './editor-cache-policy';
import { getActivityMountList, tiptapCache, tiptapLru } from './editor-cache-state';
import type { MountTiptapParams, TiptapCacheEntry } from './editor-cache-types';
import { getMountId } from './mount-id-registry';
import { invalidateMountPromise } from './mount-promise';

function markStats(
  docName: string,
  sizeStats: MountTiptapParams['sizeStats'],
  cacheHit: boolean,
): void {
  if (!sizeStats) return;
  mark('ok/cold/editor-mount-stats', {
    docName,
    mountId: getMountId(docName),
    ...sizeStats,
    cacheHit,
    kind: 'tiptap',
  });
}

function removeFromCache(docName: string): void {
  tiptapCache.delete(docName);
  const index = tiptapLru.indexOf(docName);
  if (index !== -1) tiptapLru.splice(index, 1);
}

function destroyEditor(entry: TiptapCacheEntry, docName: string, event: string): void {
  const undoManager = readEditorUndoManager(entry.editor);
  try {
    entry.editor.destroy();
  } catch (err) {
    mark(event, {
      docName,
      kind: 'tiptap',
      stage: 'editor',
      message: err instanceof Error ? err.message : String(err),
    });
  }
  if (undoManager) undoManager.restore = undefined;
}

export function mountTiptapEditor(params: MountTiptapParams): TiptapCacheEntry {
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

  const reuse = tiptapCache.get(docName);
  if (reuse) {
    mark('ok/cache/reparent-start', {
      docName,
      mountId: getMountId(docName),
      kind: 'tiptap',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    reparentTiptap(reuse, container);
    reuse.activeMountKey = docName;
    tiptapLru.splice(0, tiptapLru.length, ...touchCacheOrder(tiptapLru, docName));
    container.scrollTop = reuse.scrollTop;
    if (reuse.hadFocus)
      try {
        reuse.editor.commands.focus();
      } catch {
        /* focus is best effort */
      }
    mark('ok/cache/reparent-end', {
      docName,
      mountId: getMountId(docName),
      kind: 'tiptap',
      viewCount: sizeStats?.viewCount ?? -1,
      bytes: sizeStats?.bytes ?? -1,
    });
    mark('ok/cache/hit', { docName, mountId: getMountId(docName), kind: 'tiptap' });
    markStats(docName, sizeStats, true);
    return reuse;
  }

  while (tiptapCache.size >= MAX_CACHE) {
    const candidate = chooseEvictionCandidate(tiptapLru, docName, getActivityMountList());
    if (!candidate) break;
    if (getActivityMountList().has(candidate))
      mark('ok/cache/evict-fallback-activity-saturated', {
        mountingDocName: docName,
        lruLength: tiptapLru.length,
        activityMountCount: getActivityMountList().size,
      });
    evictTiptapEditor(candidate);
  }
  const entry: TiptapCacheEntry = {
    ...factory(container),
    scrollTop: 0,
    hadFocus: false,
    activeMountKey: docName,
    parkingNode: null,
  };
  tiptapCache.set(docName, entry);
  tiptapLru.splice(0, tiptapLru.length, ...touchCacheOrder(tiptapLru, docName));
  mark('ok/cache/miss', {
    docName,
    mountId: getMountId(docName),
    viewCount: sizeStats?.viewCount ?? -1,
    bytes: sizeStats?.bytes ?? -1,
    reason: 'cold',
    kind: 'tiptap',
  });
  markStats(docName, sizeStats, false);
  return entry;
}

export function parkTiptapEditor(entry: TiptapCacheEntry): void {
  const docName = entry.activeMountKey;
  if (!CACHE_ENABLED || entry.__uncached) {
    if (docName) invalidateMountPromise(docName);
    destroyEditor(entry, docName ?? '', 'ok/cache/park-destroy-failed');
  } else {
    parkTiptapDom(entry);
  }
  entry.activeMountKey = null;
}

export function evictTiptapEditor(docName: string): boolean {
  invalidateMountPromise(docName);
  const entry = tiptapCache.get(docName);
  if (!entry) return false;
  destroyEditor(entry, docName, 'ok/cache/evict-failed');
  for (const [stage, target] of [
    ['provider', entry.provider],
    ['ydoc', entry.ydoc],
  ] as const) {
    try {
      target.destroy();
    } catch (err) {
      mark('ok/cache/evict-failed', {
        docName,
        kind: 'tiptap',
        stage,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  removeFromCache(docName);
  mark('ok/cache/evict', { docName, kind: 'tiptap' });
  return true;
}

export function peekTiptap(docName: string): TiptapCacheEntry | undefined {
  return tiptapCache.get(docName);
}

/** Deliberately exposes only the safe non-throwing view accessor to lifecycle adapters. */
export { getTiptapEditorView };
