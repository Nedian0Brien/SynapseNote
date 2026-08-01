/**
 * Editor cache public composition surface.
 *
 * Cache policy, DOM parking, lifecycle ownership, rename lineage, and
 * activity/provider transitions intentionally live in dedicated modules. This
 * facade preserves the established import path for editor consumers.
 */
import { evictCmEditor } from './editor-cache-codemirror';
import { BYTES_CACHE_THRESHOLD, VIEW_COUNT_CACHE_THRESHOLD } from './editor-cache-config';
import { shouldCacheBySize } from './editor-cache-policy';
import {
  cmCache,
  cmLru,
  getActivityMountNames,
  replaceActivityMountList,
  tiptapCache,
  tiptapLru,
} from './editor-cache-state';
import { evictTiptapEditor } from './editor-cache-tiptap';

export { setActivityMountList, subscribePoolEviction } from './editor-cache-activity';
export { evictCmEditor, mountCmEditor, parkCmEditor } from './editor-cache-codemirror';
export {
  BYTES_CACHE_THRESHOLD,
  CACHE_ENABLED,
  MAX_CACHE,
  readEditorUndoManager,
  VIEW_COUNT_CACHE_THRESHOLD,
} from './editor-cache-config';
export {
  __consumeRenameSnapshot,
  __resetRenameSnapshotStore,
  captureRenameSnapshots,
  clearRenameSnapshot,
  peekRenameSnapshot,
  storeRenameSnapshot,
} from './editor-cache-rename-snapshots';
export {
  evictTiptapEditor,
  mountTiptapEditor,
  parkTiptapEditor,
  peekTiptap,
} from './editor-cache-tiptap';
export type {
  CmCacheEntry,
  MountCmParams,
  MountTiptapParams,
  RenameSelectionJSON,
  RenameSnapshot,
  SizeStats,
  TiptapCacheEntry,
} from './editor-cache-types';

export function __getCacheSize(kind: 'tiptap' | 'cm'): number {
  return kind === 'tiptap' ? tiptapCache.size : cmCache.size;
}
export function __getCacheOrder(kind: 'tiptap' | 'cm'): string[] {
  return [...(kind === 'tiptap' ? tiptapLru : cmLru)];
}
export function __peekCm(docName: string) {
  return cmCache.get(docName);
}
export function __getActivityMountList(): string[] {
  return getActivityMountNames();
}
export function shouldCacheEditor(stats: { viewCount: number; bytes: number }): boolean {
  return shouldCacheBySize(stats, VIEW_COUNT_CACHE_THRESHOLD, BYTES_CACHE_THRESHOLD);
}
export function __resetCacheForTests(): void {
  for (const docName of [...tiptapCache.keys()]) evictTiptapEditor(docName);
  for (const docName of [...cmCache.keys()]) evictCmEditor(docName);
  replaceActivityMountList(new Set());
}
