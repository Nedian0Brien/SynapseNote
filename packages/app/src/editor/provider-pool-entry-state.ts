/**
 * Pure state transitions for a provider-pool entry. Side effects such as
 * clearing timers and destroying persistence deliberately remain with the
 * lifecycle adapter, which consumes the resources returned here.
 */

export type EntryTeardownResources<TPersistence> = {
  persistence: TPersistence;
  observerCleanup: (() => void) | null;
  observerFireCounterCleanup: (() => void) | null;
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
};

type ActiveEntry<TPersistence> = {
  kind: 'active';
  persistence: TPersistence;
  observerCleanup: (() => void) | null;
  observerFireCounterCleanup: (() => void) | null;
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
  serverDrivenCloseReauthInFlight: boolean;
};

type TearingDownEntry = {
  kind: 'tearing-down';
  persistence: null;
  observerCleanup: null;
  observerFireCounterCleanup: null;
  pendingRecycleTimer: null;
  serverDrivenCloseReauthInFlight: false;
};

type MutableEntry<TPersistence> = ActiveEntry<TPersistence> | TearingDownEntry;

/**
 * Atomically make an active entry inert and return the resources that the
 * lifecycle adapter must dispose in its documented order.  This is pure:
 * it neither calls a cleanup function nor clears a timer.
 */
export function beginEntryTeardown<TPersistence>(
  entry: MutableEntry<TPersistence>,
): EntryTeardownResources<TPersistence> | null {
  if (entry.kind === 'tearing-down') return null;

  const resources: EntryTeardownResources<TPersistence> = {
    persistence: entry.persistence,
    observerCleanup: entry.observerCleanup,
    observerFireCounterCleanup: entry.observerFireCounterCleanup,
    pendingRecycleTimer: entry.pendingRecycleTimer,
  };
  const torn = entry as unknown as TearingDownEntry;
  torn.kind = 'tearing-down';
  torn.persistence = null;
  torn.observerCleanup = null;
  torn.observerFireCounterCleanup = null;
  torn.pendingRecycleTimer = null;
  torn.serverDrivenCloseReauthInFlight = false;
  return resources;
}
