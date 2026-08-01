import type { HocuspocusProvider } from '@hocuspocus/provider';
import { mark } from '@/lib/perf';
import { evictCmEditor } from './editor-cache-codemirror';
import {
  clearActiveProviderPool,
  findCachedProvider,
  getActivityMountList,
  replaceActivityMountList,
  setActiveProviderPool,
} from './editor-cache-state';
import { evictTiptapEditor } from './editor-cache-tiptap';

function markFailure(event: string, docName: string, err: unknown): void {
  mark(event, { docName, message: err instanceof Error ? err.message : String(err) });
}

/** Apply activity promotion/demotion without owning cache or DOM state. */
export function setActivityMountList(docNames: readonly string[]): void {
  const previous = getActivityMountList();
  const next = new Set(docNames);
  for (const docName of previous) {
    if (next.has(docName)) continue;
    const provider = findCachedProvider(docName);
    if (!provider) continue;
    try {
      provider.disconnect();
      mark('ok/cache/disconnect', { docName });
    } catch (err) {
      markFailure('ok/cache/disconnect-failed', docName, err);
    }
  }
  for (const docName of next) {
    if (previous.has(docName)) continue;
    const provider = findCachedProvider(docName);
    if (!provider) continue;
    const fail = (err: unknown): void => markFailure('ok/cache/connect-failed', docName, err);
    try {
      const result = provider.connect();
      if (result && typeof (result as Promise<unknown>).then === 'function')
        (result as Promise<unknown>).then(() => mark('ok/cache/connect', { docName }), fail);
      else mark('ok/cache/connect', { docName });
    } catch (err) {
      fail(err);
    }
  }
  replaceActivityMountList(next);
}

export function subscribePoolEviction(pool: {
  onEvict: (callback: (docName: string) => void) => () => void;
  entries: ReadonlyMap<string, { provider: HocuspocusProvider }>;
}): () => void {
  setActiveProviderPool(pool);
  const unsubscribe = pool.onEvict((docName) => {
    evictTiptapEditor(docName);
    evictCmEditor(docName);
  });
  return () => {
    unsubscribe();
    clearActiveProviderPool(pool);
  };
}
