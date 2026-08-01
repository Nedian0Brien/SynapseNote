import { mark } from '../lib/perf/mark';
import { computeUnsyncedUpdate } from './client-persistence';
import { isSystemDoc } from './is-system-doc';
import { ProviderPoolConnection } from './provider-pool-connection';
import {
  ClientPersistenceClearTimeoutError,
  clearObserverFireCounter,
  IDLE_SERVER_RESTART_RECOVERY,
  MAX_BUFFER_BYTES,
  type PoolEntry,
} from './provider-pool-contracts';
import { disposeEntryResources } from './provider-pool-entry-disposal';
import { beginEntryTeardown } from './provider-pool-entry-state';
import { invalidateSyncPromise } from './sync-promise';

/** Recycle, LRU eviction, teardown, and explicit persistence-clear workflows. */
export class ProviderPoolEviction extends ProviderPoolConnection {
  protected handleServerInstanceMismatch(staleClaimedServerInstanceId: string): void {
    this.recoveryMismatchStaleClaim =
      staleClaimedServerInstanceId.length > 0 ? staleClaimedServerInstanceId : undefined;

    const snapshot = Array.from(this.entries.entries());
    const startedAt = Date.now();
    const recoveryActiveDocName = this.activeDocName;
    const activeRecoveryDocNames =
      recoveryActiveDocName !== null &&
      snapshot.some(
        ([docName, poolEntry]) => docName === recoveryActiveDocName && poolEntry.kind === 'active',
      )
        ? [recoveryActiveDocName]
        : [];

    const telemetryDocName =
      recoveryActiveDocName ??
      snapshot.find(([, poolEntry]) => poolEntry.kind === 'active')?.[0] ??
      '';
    if (telemetryDocName.length > 0) {
      this.emitStructuredClientRecoveryEvent({
        event: 'ok-client-cache-epoch-mismatch',
        ...this.recoveryTelemetryBase(telemetryDocName),
      });
    }

    this.beginServerRestartRecovery(activeRecoveryDocNames, startedAt);
    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind === 'active' && !activeRecoveryDocNames.includes(docName)) {
        invalidateSyncPromise(docName);
      }
    }

    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind !== 'active') continue;
      const baseline = poolEntry.lastDiskAckedSV ?? poolEntry.lastServerSyncedSV;
      if (baseline === null) {
        this.emitStructuredClientRecoveryEvent({
          event: 'ok-buffer-replay-skipped-no-baseline',
          ...this.recoveryTelemetryBase(docName),
          reason: 'no-disk-ack-or-server-sync-vector',
        });
        continue;
      }
      const unsynced = computeUnsyncedUpdate(poolEntry.provider.document, baseline);
      if (unsynced.byteLength > MAX_BUFFER_BYTES) {
        mark('ok/pool/buffer-overflow', { docName, bytes: unsynced.byteLength });
        continue;
      }
      if (unsynced.byteLength > 0) {
        this.bufferedUpdates.set(docName, unsynced);
      }
    }

    const clears: { docName: string; promise: Promise<void> }[] = [];
    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind !== 'active') continue;
      if (poolEntry.persistence === null) continue;
      clears.push({
        docName,
        promise: this.withClearDataTimeout(docName, poolEntry.persistence.clearData()),
      });
    }

    const inflight: Promise<void> = Promise.allSettled(clears.map((c) => c.promise))
      .then((results) => {
        const failed: string[] = [];
        const cleared: string[] = [];
        let sawClearTimeout = false;
        results.forEach((result, i) => {
          const row = clears[i];
          if (!row) return;
          const docName = row.docName;
          if (result.status === 'rejected') {
            failed.push(docName);
            const isClearTimeout = result.reason instanceof ClientPersistenceClearTimeoutError;
            if (isClearTimeout) {
              sawClearTimeout = true;
            }
            if (isClearTimeout) {
              this.emitStructuredClientRecoveryEvent({
                event: 'ok-client-cache-clear-failed',
                ...this.recoveryTelemetryBase(docName),
                failureKind: 'timeout',
              });
            } else {
              const errorName = result.reason instanceof Error ? result.reason.name : 'unknown';
              this.emitStructuredClientRecoveryEvent({
                event: 'ok-client-cache-clear-failed',
                ...this.recoveryTelemetryBase(docName),
                failureKind: 'rejected',
                errorName,
                errorMessage:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
              });
            }
          } else {
            cleared.push(docName);
          }
        });
        const reconnectDocNames = cleared.filter((docName) => docName === recoveryActiveDocName);
        if (failed.length > 0) {
          const failureReason: 'clear-data-failed' | 'clear-data-timeout' = sawClearTimeout
            ? 'clear-data-timeout'
            : 'clear-data-failed';
          console.warn(
            JSON.stringify({
              event: 'ok-mismatch-recycle-partial-clears-failed',
              failedDocs: failed,
              clearedDocs: cleared,
            }),
          );
          this.enterServerRestartReconnect(reconnectDocNames, failed, startedAt, failureReason);
          for (const docName of cleared) {
            this.recycleDisconnectedEntry(docName);
          }
          return;
        }
        this.enterServerRestartReconnect(reconnectDocNames, [], startedAt, 'clear-data-failed');
        this.recycleAllEntries();
      })
      .finally(() => {
        if (this.mismatchInFlight === inflight) {
          this.mismatchInFlight = null;
        }
      });
    this.mismatchInFlight = inflight;
  }

  awaitMismatchSettled(): Promise<void> {
    return this.mismatchInFlight ?? Promise.resolve();
  }

  recycleAllEntries(): void {
    const docNames = Array.from(this.entries.keys());
    for (const docName of docNames) {
      this.recycleDisconnectedEntry(docName);
    }
  }

  prewarm(docName: string): PoolEntry | null {
    if (isSystemDoc(docName)) return null;
    const existing = this.entries.get(docName);
    if (existing) {
      return existing;
    }
    const entry = this.open(docName);
    if (!entry) return null;
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) {
      this.lruOrder.splice(idx, 1);
      this.lruOrder.unshift(docName);
    }
    return entry;
  }

  close(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) return;

    this.destroyEntry(entry);
    this._entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);
    this.bufferedUpdates.delete(docName);

    if (this.activeDocName === docName) {
      this.activeDocName = null;
    }
    this.notify();
  }

  async closeAndClearPersistence(docName: string): Promise<void> {
    try {
      await this.runCloseAndClearPersistence(docName);
    } catch {}
  }

  protected runCloseAndClearPersistence(docName: string): Promise<void> {
    const inFlight = this.pendingClears.get(docName);
    if (inFlight !== undefined) {
      return inFlight;
    }
    let resolveWork: () => void = () => {};
    let rejectWork: (err: unknown) => void = () => {};
    const work = new Promise<void>((resolve, reject) => {
      resolveWork = resolve;
      rejectWork = reject;
    });
    this.pendingClears.set(docName, work);
    const finalize = () => {
      if (this.pendingClears.get(docName) === work) {
        this.pendingClears.delete(docName);
      }
    };
    void work.then(finalize, finalize);
    this.executeCloseAndClearPersistence(docName).then(resolveWork, rejectWork);
    return work;
  }
  protected async executeCloseAndClearPersistence(docName: string): Promise<void> {
    this.clearFailures.delete(docName);
    const entry = this.entries.get(docName);
    if (entry?.kind === 'active' && entry.persistence !== null) {
      const persistence = entry.persistence;
      try {
        this.close(docName);
      } catch (err) {
        console.warn(`[ProviderPool] close before clearData threw for ${docName}:`, err);
      }
      try {
        await this.withClearDataTimeout(docName, persistence.clearData());
      } catch (err) {
        console.warn(`[ProviderPool] clearData on rename failed for ${docName}:`, err);
        this.clearFailures.add(docName);
        throw err;
      }
      return;
    }
    if (entry) {
      try {
        this.close(docName);
      } catch (err) {
        console.warn(`[ProviderPool] close before IDB-by-name delete threw for ${docName}:`, err);
      }
    }

    const branch = this.normalizedObservedBranch();
    const serverInstanceId = this.cachedServerInstanceId;
    if (serverInstanceId === null) return;

    const dbName = `ok-ydoc:${branch}:${serverInstanceId}:${docName}`;
    try {
      await this.withClearDataTimeout(
        docName,
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => {
            console.warn(`[ProviderPool] IDB delete blocked for ${dbName}`);
          };
        }),
      );
    } catch (err) {
      console.warn(`[ProviderPool] IDB delete on rename failed for ${dbName}:`, err);
      this.clearFailures.add(docName);
      throw err;
    }
  }

  clearBufferedUpdates(): void {
    this.bufferedUpdates.clear();
  }

  __test_seedBufferedUpdate(docName: string, update: Uint8Array): void {
    this.bufferedUpdates.set(docName, update);
  }

  __test_bufferedUpdatesSize(): number {
    return this.bufferedUpdates.size;
  }

  __test_hasBufferedUpdate(docName: string): boolean {
    return this.bufferedUpdates.has(docName);
  }

  __test_getBufferedUpdate(docName: string): Uint8Array | undefined {
    return this.bufferedUpdates.get(docName);
  }

  setActive(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) {
      throw new Error(`[ProviderPool] Cannot setActive — "${docName}" is not open`);
    }
    entry.lastAccessedAt = Date.now();
    this.touch(docName);
    this.activeDocName = docName;
    this.notify();
  }

  clearActive(): void {
    if (this.activeDocName === null) return;
    this.activeDocName = null;
    this.notify();
  }

  getActive(): PoolEntry | null {
    if (!this.activeDocName) return null;
    return this.entries.get(this.activeDocName) ?? null;
  }

  getActiveDocName(): string | null {
    return this.activeDocName;
  }

  has(docName: string): boolean {
    return this.entries.has(docName);
  }

  peek(docName: string): PoolEntry | null {
    return this.entries.get(docName) ?? null;
  }

  recycle(docName: string): void {
    this.recycleDisconnectedEntry(docName);
  }

  dispose(): void {
    for (const entry of this._entries.values()) {
      this.destroyEntry(entry);
    }
    this._entries.clear();
    this.lruOrder = [];
    this.activeDocName = null;
    this.onChange = null;
    this.bufferedUpdates.clear();
    this.pendingClears.clear();
    this.clearFailures.clear();
    this.docLineageEpochs.clear();
    this.docLineageEpochsEnvelopeConsumed = false;
    this.onBranchMismatch = null;
    this.branchMismatchInFlight = null;
    this.onRenameRedirect = null;
    this.onDocDeleted = null;
    this.evictListeners.clear();
    this.serverRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
    this.cachedServerInstanceId = null;
    this.pendingServerInstanceKnown = null;
    this.tabIdentity = null;
    this.recoveryMismatchStaleClaim = undefined;
  }
  protected evictLru(): void {
    for (const docName of this.lruOrder) {
      if (docName !== this.activeDocName) {
        mark('ok/pool/evict-lru', { docName });
        this.close(docName);
        return;
      }
    }
  }
  protected destroyEntry(entry: PoolEntry): void {
    const resources = beginEntryTeardown(entry);
    if (resources === null) return;
    disposeEntryResources({
      ...resources,
      docName: entry.docName,
      provider: entry.provider,
      fireEvict: (docName) => this.fireEvict(docName),
      clearObserverFireCounter,
    });
  }
  protected recycleDisconnectedEntry(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.kind !== 'active') return;

    const wasActive = this.activeDocName === docName;
    mark('ok/pool/recycle-disconnected', { docName, wasActive });

    this.destroyEntry(entry);
    this._entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);

    if (wasActive) {
      const reopened = this.open(docName);
      if (reopened) this.setActive(docName);
      return;
    }

    this.notify();
  }
}
