import type { PoolChangeCallback, RenameRedirectHandler } from './provider-pool-contracts';
import { ProviderPoolPersistence } from './provider-pool-persistence';

/** Pool change, eviction, and server-rejection callback coordination. */
export abstract class ProviderPoolSignals extends ProviderPoolPersistence {
  setOnBranchMismatch(cb: (() => Promise<void>) | null): void {
    if (cb === null) {
      this.onBranchMismatch = null;
      return;
    }
    this.onBranchMismatch = () => {
      if (this.branchMismatchInFlight !== null) return;
      // Wrap `cb()` in `Promise.resolve().then(cb)` rather than
      // `Promise.resolve(cb())` so a synchronous throw from `cb`
      // settles the wrapper as a rejection instead of escaping the
      // gate. Without this, a sync throw bypasses the
      // `branchMismatchInFlight = inflight` assignment entirely; the
      // next dispatch sees a null gate and re-fires the (still
      // throwing) callback.
      const inflight = Promise.resolve()
        .then(cb)
        .finally(() => {
          if (this.branchMismatchInFlight === inflight) {
            this.branchMismatchInFlight = null;
          }
        });
      this.branchMismatchInFlight = inflight;
    };
  }

  setOnRenameRedirect(cb: RenameRedirectHandler | null): void {
    this.onRenameRedirect = cb;
  }

  setOnDocDeleted(
    cb: ((args: { docName: string; hadOpenProvider: boolean }) => void) | null,
  ): void {
    this.onDocDeleted = cb;
  }

  /** Register a callback that fires whenever pool state changes. */
  setOnChange(cb: PoolChangeCallback | null): void {
    this.onChange = cb;
  }
  protected notify(): void {
    this.onChange?.();
  }

  /**
   * Subscribe to entry-eviction events. Returns an unsubscribe function.
   * Multiple subscribers all fire in registration order; throws inside
   * a subscriber are caught + logged so one bad subscriber doesn't
   * prevent the others from running.
   */
  onEvict(cb: (docName: string) => void): () => void {
    this.evictListeners.add(cb);
    return () => {
      this.evictListeners.delete(cb);
    };
  }
  protected fireEvict(docName: string): void {
    for (const listener of this.evictListeners) {
      try {
        listener(docName);
      } catch (err) {
        console.warn(`[ProviderPool] evict listener threw for ${docName}:`, err);
      }
    }
  }

  /** Touch a doc in the LRU order (move to end = most recently used). */
  protected touch(docName: string): void {
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(docName);
  }
}
