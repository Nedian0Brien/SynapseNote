import { LINEAGE_EPOCH_KEY } from '@nedian0brien/synapsenote-core';
import type * as Y from 'yjs';
import type { ClientPersistenceProvider } from './client-persistence';
import { type ActivePoolEntry, StoredEpochPeekTimeoutError } from './provider-pool-contracts';
import { ProviderPoolRecovery } from './provider-pool-recovery';

/** Claim-fenced and stored-state-validated client-persistence attachment. */
export abstract class ProviderPoolPersistence extends ProviderPoolRecovery {
  /**
   * Single constructor for client persistence. Boundary contract: every
   * persistence attach is either CLAIM-FENCED (the synchronous admission
   * attach in `open()` — the auth token carried the rows' recorded epoch
   * and the server rejects stale claims before any Yjs sync can run) or
   * STORED-STATE-VALIDATED (`validateStoredStateThenAttach`). Exactly two
   * callers; a third path would re-open the dead-lineage union-merge
   * corruption class this pair of fences closes.
   */
  protected buildPersistence(
    serverInstanceId: string,
    docName: string,
    doc: Y.Doc,
  ): ClientPersistenceProvider {
    return this.persistenceFactory({
      branch: this.normalizedObservedBranch(),
      serverInstanceId,
      docName,
      doc,
    });
  }

  /**
   * Stored-state validation spine — the only asynchronous route to
   * `buildPersistence`. Validates the lineage of the stored IndexedDB
   * rows IN-BAND (the epoch travels with the rows; see
   * `peekStoredLineageEpoch`) before they may hydrate into the live doc.
   * Unlike the localStorage record, the in-band epoch is total over
   * every post-epoch row set: no read-timing window (instance-unknown
   * boot) or storage-eviction pattern (record evicted, rows surviving)
   * can detach it from the state it identifies.
   *
   *   stored epoch  | live epoch       | action
   *   --------------|------------------|---------------------------------
   *   absent        | any              | attach (nothing to validate:
   *                 |                  | first open, post-clear reattach,
   *                 |                  | offline-only or pre-epoch rows)
   *   present       | === stored       | attach (same lineage — the warm
   *                 |                  | reload this cache exists for)
   *   present       | differs / absent | refuse; recover via the same
   *                 |                  | close → clear → reopen machinery
   *                 |                  | as the record-present arms
   *
   * The live doc's epoch is only trustworthy post-sync, so when stored
   * rows carry an epoch and the entry hasn't synced yet the spine waits
   * for the entry's first `synced` event. No offline regression hides in
   * that wait: every flow that reaches the spine already required live
   * server contact (the deferred pass needs the server-info fetch, the
   * admission dispatch needs `cachedServerInstanceId`).
   *
   * Refused rows are discarded, not buffered: a Yjs delta extending a
   * dead lineage IS the corruption vector (same policy as the
   * auth-rejection arm and `handleServerInstanceMismatch`'s no-baseline
   * drop). The structured `ok-doc-lineage-mismatch` emission is what
   * makes the discarded population observable.
   *
   * Entry identity is rechecked after every await per this file's
   * stale-closure idiom; `persistenceAttachOwned` keeps a re-dispatch
   * from racing an in-flight run.
   */
  protected async validateStoredStateThenAttach(
    entry: ActivePoolEntry,
    serverInstanceId: string,
  ): Promise<void> {
    if (entry.persistenceAttachOwned) return;
    entry.persistenceAttachOwned = true;
    const docName = entry.docName;
    // `pendingClears` is part of the currency check: a clear in flight for
    // this docName owns the (deferred) attach via its own scheduler, and a
    // peek now would both read rows scheduled for deletion and block the
    // pending `deleteDatabase` with a competing connection.
    const entryIsCurrent = (): boolean =>
      this._entries.get(docName) === entry &&
      entry.kind === 'active' &&
      entry.persistence === null &&
      !this.pendingClears.has(docName);
    if (!entryIsCurrent()) return;
    let storedEpoch: string | null;
    try {
      // The peek can wedge indefinitely (e.g. its versionless open queued
      // behind another tab's blocked `deleteDatabase` — invisible to this
      // tab's `pendingClears`). Bound it so a wedge decays into the
      // observable failure arm below instead of a silent forever-cacheless
      // entry with the attach ownership latched.
      storedEpoch = await new Promise<string | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new StoredEpochPeekTimeoutError(docName, this.clearDataTimeoutMs));
        }, this.clearDataTimeoutMs);
        this.peekStoredEpoch({
          branch: this.normalizedObservedBranch(),
          serverInstanceId,
          docName,
        }).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (err: unknown) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      });
    } catch (err: unknown) {
      // Stored state we cannot read must not hydrate. Leave the entry
      // cacheless for the session — the same degraded-but-correct mode as
      // a failed attach; WS sync remains the source of truth.
      this.emitStructuredClientRecoveryEvent({
        event: 'ok-client-persistence-attach-failed',
        ...this.recoveryTelemetryBase(docName),
        phase: 'peek',
        errorName: err instanceof Error ? err.name : 'non-error-throw',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!entryIsCurrent()) return;
    if (storedEpoch === null) {
      this.attachValidatedPersistence(entry, serverInstanceId);
      return;
    }
    if (!entry.hasSynced) {
      await this.awaitFirstSyncOrDestroy(entry);
      if (!entryIsCurrent() || !entry.hasSynced) return;
    }
    const liveEpochRaw = entry.provider.document.getMap('lifecycle').get(LINEAGE_EPOCH_KEY);
    const liveEpoch =
      typeof liveEpochRaw === 'string' && liveEpochRaw.length > 0 ? liveEpochRaw : null;
    if (liveEpoch === storedEpoch) {
      this.attachValidatedPersistence(entry, serverInstanceId);
      return;
    }
    this.emitStructuredClientRecoveryEvent({
      event: 'ok-doc-lineage-mismatch',
      ...this.recoveryTelemetryBase(docName),
      via: 'stored-state-validation',
      staleEpoch: storedEpoch,
      liveEpoch: liveEpoch ?? '<absent>',
    });
    const wasActive = this.activeDocName === docName;
    // Synchronously registers `pendingClears` + closes the entry, so the
    // open() below defers its persistence attach past the clear.
    void this.runCloseAndClearPersistence(docName);
    const reopened = this.open(docName);
    if (reopened !== null && wasActive) this.setActive(docName);
  }

  /**
   * Terminal attach arm of the spine. Builds persistence and schedules
   * the warm-cache backfill for attaches that land after sync already
   * delivered content (see `flushFullState` on the provider interface —
   * without the backfill those caches silently degrade to orphan rows).
   */
  protected attachValidatedPersistence(entry: ActivePoolEntry, serverInstanceId: string): void {
    const docName = entry.docName;
    try {
      const persistence = this.buildPersistence(serverInstanceId, docName, entry.provider.document);
      entry.persistence = persistence;
      // Externally observable state change — match the pool's notify-on-state-change
      // pattern used at every other null→real persistence transition site.
      this.notify();
      // A failed backfill degrades the warm cache to orphan rows — the same
      // population the sibling degraded arms make observable, so it routes
      // through the structured emitter rather than a bare console.warn.
      void this.backfillCacheAfterFirstSync(entry, persistence).catch((err: unknown) => {
        this.emitStructuredClientRecoveryEvent({
          event: 'ok-client-persistence-attach-failed',
          ...this.recoveryTelemetryBase(docName),
          phase: 'backfill',
          errorName: err instanceof Error ? err.name : 'non-error-throw',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
    } catch (err: unknown) {
      this.emitStructuredClientRecoveryEvent({
        event: 'ok-client-persistence-attach-failed',
        ...this.recoveryTelemetryBase(docName),
        phase: 'attach',
        errorName: err instanceof Error ? err.name : 'non-error-throw',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Flush the doc's full state into the just-attached cache once both the
   * IDB hydrate and the entry's first WS sync have completed. Spine
   * attaches can land at any point relative to sync, and updates applied
   * to the doc BEFORE the attach are invisible to y-indexeddb's
   * incremental listener — flushing once after first sync makes the cache
   * complete regardless of which side won that race.
   */
  protected async backfillCacheAfterFirstSync(
    entry: ActivePoolEntry,
    persistence: ClientPersistenceProvider,
  ): Promise<void> {
    await persistence.whenSynced;
    if (!entry.hasSynced) {
      await this.awaitFirstSyncOrDestroy(entry);
    }
    if (
      this._entries.get(entry.docName) !== entry ||
      entry.kind !== 'active' ||
      entry.persistence !== persistence ||
      !entry.hasSynced
    ) {
      return;
    }
    await persistence.flushFullState();
  }

  /**
   * Settle once the entry's provider has either delivered its first
   * `synced` event or been destroyed. The `destroy` arm is load-bearing
   * against hung awaits: a recycled provider never syncs, and Hocuspocus
   * emits `destroy` before `removeAllListeners()`, so the one-shot
   * listener always settles. Callers re-validate entry identity (and
   * `hasSynced`, to distinguish the destroy arm) after the await.
   */
  protected async awaitFirstSyncOrDestroy(entry: ActivePoolEntry): Promise<void> {
    if (entry.hasSynced) return;
    await new Promise<void>((resolve) => {
      const settle = (): void => {
        entry.provider.off('synced', settle);
        entry.provider.off('destroy', settle);
        resolve();
      };
      entry.provider.on('synced', settle);
      entry.provider.on('destroy', settle);
    });
  }
  protected attachDeferredPersistence(serverInstanceId: string): void {
    // Snapshot — the lineage-guard arm below mutates `_entries` mid-loop
    // (close + reopen). The reopened entry must not be visited by this
    // pass: its attach is owned by the `pendingClears` deferred-attach
    // scheduler, and a direct attach here would hydrate the IDB the
    // in-flight clear is still deleting.
    for (const entry of Array.from(this._entries.values())) {
      if (entry.kind !== 'active') continue;
      if (entry.persistence !== null) continue;
      if (this._entries.get(entry.docName) !== entry) continue;
      // Deferred-attach lineage guard (second door of the doc-lineage
      // fence). This entry opened + synced while the instance id was
      // unknown, so the auth-time epoch claim was deliberately omitted —
      // the IDB rows a late attach would now hydrate were written under
      // the lineage recorded at open() time. When that record exists and
      // differs from the lineage this entry actually synced, hydrating
      // would union-merge a dead lineage into the live doc: route through
      // the same close → clear → reopen recovery as the auth-rejection
      // arm instead. Compare against the open-time SNAPSHOT, not the
      // record map's current value — this entry's own `synced` handler
      // already re-recorded the fresh epoch, which describes the live
      // doc, not the stale IDB rows.
      if (entry.hasSynced && entry.lineageEpochRecordAtOpen !== null) {
        const liveEpoch = entry.provider.document.getMap('lifecycle').get(LINEAGE_EPOCH_KEY);
        if (
          typeof liveEpoch === 'string' &&
          liveEpoch.length > 0 &&
          liveEpoch !== entry.lineageEpochRecordAtOpen
        ) {
          const docName = entry.docName;
          this.emitStructuredClientRecoveryEvent({
            event: 'ok-doc-lineage-mismatch',
            ...this.recoveryTelemetryBase(docName),
            via: 'deferred-attach',
            staleEpoch: entry.lineageEpochRecordAtOpen,
            liveEpoch,
          });
          const wasActive = this.activeDocName === docName;
          void this.runCloseAndClearPersistence(docName);
          const reopened = this.open(docName);
          if (reopened !== null && wasActive) this.setActive(docName);
          continue;
        }
      }
      // Every other deferred attach — record absent (boot-window
      // snapshot, evicted envelope, pre-epoch profile), record present
      // but not yet synced, or record present and matching — routes
      // through the spine, which validates the rows' own in-band epoch.
      // The record-absent population in particular used to attach
      // unconditionally here; it is exactly the unfenced door the spine
      // closes.
      void this.validateStoredStateThenAttach(entry, serverInstanceId);
    }
  }

  /**
   * Attach persistence to an entry that opened during an in-flight
   * `closeAndClearPersistence(docName)`. Called from the
   * `pendingClears.get(docName).then(...)` epilogue in `open()` —
   * guarded against the entry being torn down or replaced before the
   * clear settled. Skips silently if the entry no longer holds the
   * deferred-attach slot (kind flipped, replaced by a recycle, or
   * already attached by a parallel code path). Routes through the
   * stored-state validation spine for uniformity: a successful clear
   * leaves an empty store, so the peek's null fast path makes this
   * equivalent to the direct attach it replaces.
   */
  protected attachDeferredPersistenceForEntry(
    entry: ActivePoolEntry,
    serverInstanceId: string,
  ): void {
    const current = this._entries.get(entry.docName);
    if (current !== entry || current.kind !== 'active' || current.persistence !== null) {
      return;
    }
    void this.validateStoredStateThenAttach(current, serverInstanceId);
  }
}
