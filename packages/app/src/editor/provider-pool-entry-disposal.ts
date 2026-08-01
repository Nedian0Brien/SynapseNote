import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { ClientPersistenceProvider } from './client-persistence';
import type { EntryTeardownResources } from './provider-pool-entry-state';
import { invalidateSyncPromise } from './sync-promise';

type DisposeEntryResourcesArgs = EntryTeardownResources<ClientPersistenceProvider | null> & {
  docName: string;
  provider: HocuspocusProvider;
  fireEvict: (docName: string) => void;
  clearObserverFireCounter: (docName: string) => void;
};

/**
 * Performs the side effects after `beginEntryTeardown` made an entry inert.
 * Keep this ordering stable: consumers evict cache-held Y.Doc references
 * before the provider dies, while persistence detaches before Y.Doc destroy.
 */
export function disposeEntryResources({
  docName,
  provider,
  persistence,
  observerCleanup,
  observerFireCounterCleanup,
  pendingRecycleTimer,
  fireEvict,
  clearObserverFireCounter,
}: DisposeEntryResourcesArgs): void {
  if (pendingRecycleTimer) clearTimeout(pendingRecycleTimer);
  invalidateSyncPromise(docName);
  fireEvict(docName);
  try {
    observerCleanup?.();
  } catch (err) {
    console.warn(`[ProviderPool] observer cleanup threw for ${docName}:`, err);
  }
  try {
    observerFireCounterCleanup?.();
  } catch (err) {
    console.warn(`[ProviderPool] observer-fire-counter cleanup threw for ${docName}:`, err);
  }
  clearObserverFireCounter(docName);
  if (persistence !== null) {
    persistence.destroy().catch((err) => {
      console.warn(`[ProviderPool] persistence destroy failed for ${docName}:`, err);
    });
  }
  try {
    provider.destroy();
  } catch (err) {
    console.warn(`[ProviderPool] Provider destroy failed for ${docName}:`, err);
  }
}
