import { HocuspocusProvider } from '@hocuspocus/provider';
import { LINEAGE_EPOCH_KEY, MarkdownManager } from '@nedian0brien/synapsenote-core';
import type { HocuspocusAuthRejectionReason } from '@nedian0brien/synapsenote-server';
import * as Y from 'yjs';
import { buildAuthToken } from '../lib/auth-token';
import { mark } from '../lib/perf/mark';
import { emitColdMountChild } from '../lib/perf/otel-spans';
import { type ClientPersistenceProvider, captureStateVector } from './client-persistence';
import { appendTraceContextToCollabUrl } from './collab-otel';
import { sharedExtensions } from './extensions/shared.ts';
import { isSystemDoc } from './is-system-doc';
import { getMountId } from './mount-id-registry';
import { setupObservers } from './observers';
import {
  type ActivePoolEntry,
  FORCE_SYNC_INTERVAL_MS,
  getEditorSchema,
  installProviderObserverCounter,
  type PoolEntry,
} from './provider-pool-contracts';
import { TAB_REPLAY_ORIGIN, takeBufferedReplay } from './provider-pool-replay';
import { ProviderPoolSignals } from './provider-pool-signals';
import { BridgeSetupError, rejectSyncPromise } from './sync-promise';

/** Provider construction and its protocol/event bindings for one document. */
export abstract class ProviderPoolConnection extends ProviderPoolSignals {
  open(docName: string): PoolEntry | null {
    if (isSystemDoc(docName)) return null;

    const existing = this.entries.get(docName);
    if (existing) {
      const previousAccessedAt = existing.lastAccessedAt;
      existing.lastAccessedAt = Date.now();
      this.touch(docName);
      this.notify();
      mark('ok/pool/open', {
        docName,
        hit: true,
        lastAccessedAt: previousAccessedAt,
        poolEventId: existing.poolEventId,
      });
      mark.count('ok/pool/open', { hit: true });
      return existing;
    }

    const openStartMs = Date.now();

    if (this.entries.size >= this.maxSize) {
      this.evictLru();
    }

    const expectedServerInstanceId = this.cachedServerInstanceId;
    const lineageEpochRecordAtOpen = this.getRecordedLineageEpoch(docName);
    const token = buildAuthToken(
      this.tabIdentity,
      expectedServerInstanceId,
      this.getOrInitObservedBranch(),
      expectedServerInstanceId !== null && expectedServerInstanceId.length > 0
        ? lineageEpochRecordAtOpen
        : null,
    );
    const provider = new HocuspocusProvider({
      url: appendTraceContextToCollabUrl(this.wsUrl),
      name: docName,
      forceSyncInterval: FORCE_SYNC_INTERVAL_MS,
      token,
    });

    const persistenceServerInstanceId = this.cachedServerInstanceId;
    if (this.clearFailures.has(docName)) {
      void this.runCloseAndClearPersistence(docName);
    }
    const pendingClearForDocName = this.pendingClears.get(docName);
    const idbAttachStart = import.meta.env.PROD === true ? 0 : performance.now();
    const persistence: ClientPersistenceProvider | null =
      persistenceServerInstanceId !== null &&
      persistenceServerInstanceId.length > 0 &&
      pendingClearForDocName === undefined &&
      lineageEpochRecordAtOpen !== null
        ? this.buildPersistence(persistenceServerInstanceId, docName, provider.document)
        : null;
    if (import.meta.env.PROD !== true) {
      if (persistence !== null) {
        mark(
          'ok/pool/idb-attach',
          { docName, serverInstanceId: persistenceServerInstanceId ?? '' },
          { startTime: idbAttachStart, duration: 0 },
        );
        persistence.whenSynced.then(() => {
          const now = performance.now();
          mark(
            'ok/pool/synced-after-idb',
            { docName, durationMs: Math.round((now - idbAttachStart) * 1000) / 1000 },
            { startTime: idbAttachStart, duration: now - idbAttachStart },
          );
        });
      } else {
        mark(
          'ok/pool/idb-bypass-no-epoch',
          {
            docName,
            reason:
              persistenceServerInstanceId === null || persistenceServerInstanceId.length === 0
                ? 'no-epoch'
                : pendingClearForDocName !== undefined
                  ? 'pending-clear'
                  : 'stored-state-validation',
          },
          { startTime: idbAttachStart, duration: 0 },
        );
      }
    }

    const poolEventId = crypto.randomUUID();
    const entry: ActivePoolEntry = {
      kind: 'active',
      provider,
      persistence,
      lastServerSyncedSV: null,
      lastDiskAckedSV: null,
      observerCleanup: null,
      observerFireCounterCleanup: installProviderObserverCounter(provider.document, docName),
      syncState: 'connecting',
      docName,
      lastAccessedAt: Date.now(),
      poolEventId,
      hasSynced: false,
      pendingRecycleTimer: null,
      bridgeSetupFailed: false,
      serverDrivenCloseReauthInFlight: false,
      persistenceAttachOwned: false,
      lineageEpochRecordAtOpen,
    };
    mark('ok/pool/open', { docName, hit: false, poolEventId });
    mark.count('ok/pool/open', { hit: false });

    const onStatus = ({ status }: { status: string }) => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
      }
    };
    const onSynced = () => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      entry.syncState = 'synced';
      entry.hasSynced = true;
      entry.lastServerSyncedSV = captureStateVector(provider.document);
      const syncedLineageEpoch = provider.document.getMap('lifecycle').get(LINEAGE_EPOCH_KEY);
      if (typeof syncedLineageEpoch === 'string' && syncedLineageEpoch.length > 0) {
        this.recordLineageEpoch(docName, syncedLineageEpoch);
      }
      if (entry.pendingRecycleTimer) {
        clearTimeout(entry.pendingRecycleTimer);
        entry.pendingRecycleTimer = null;
      }
      this.markServerRestartRecoverySynced(docName);
      this.notify();

      if (!entry.observerCleanup) {
        try {
          const doc = provider.document;
          const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
          entry.observerCleanup = setupObservers({
            doc,
            xmlFragment: doc.getXmlFragment('default'),
            ytext: doc.getText('source'),
            mdManager: mdMgr,
            schema: getEditorSchema(),
            onSyncError: (direction, error) => {
              console.warn(`[Sync] ${direction} failed for ${docName}:`, error.message);
            },
          });
        } catch (err) {
          console.error(`[ProviderPool] setupObservers init failed for ${docName}:`, err);
          entry.bridgeSetupFailed = true;
          rejectSyncPromise(docName, new BridgeSetupError(docName, err));
        }
      }
    };
    const onDisconnect = () => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      entry.syncState = 'disconnected';
      this.notify();

      if (entry.hasSynced && provider.unsyncedChanges === 0 && !entry.pendingRecycleTimer) {
        entry.pendingRecycleTimer = setTimeout(() => {
          if (entry.kind !== 'active') return;
          entry.pendingRecycleTimer = null;
          if (this.entries.get(docName) !== entry) return;
          this.recycleDisconnectedEntry(docName);
        }, this.recycleDebounceMs);
      }
    };

    const onAuthenticationFailed = ({ reason }: { reason: string }): void => {
      const KNOWN = [
        'server-instance-mismatch',
        'branch-mismatch',
        'rename-redirect',
        'doc-deleted',
        'doc-lineage-mismatch',
      ] as const satisfies readonly HocuspocusAuthRejectionReason[];
      type _AssertCovers = HocuspocusAuthRejectionReason extends (typeof KNOWN)[number]
        ? true
        : never;
      const _assertCovers: _AssertCovers = true;
      void _assertCovers;
      const colonIdx = reason.indexOf(':');
      const candidateKind = colonIdx === -1 ? reason : reason.slice(0, colonIdx);
      if (!(KNOWN as readonly string[]).includes(candidateKind)) {
        console.warn(JSON.stringify({ event: 'ok-auth-failed-unknown-reason', reason }));
        return;
      }
      const rawPayload = colonIdx === -1 ? '' : reason.slice(colonIdx + 1);
      const payload: string | undefined = rawPayload.length > 0 ? rawPayload : undefined;
      const typed = candidateKind as HocuspocusAuthRejectionReason;
      if (typed === 'server-instance-mismatch') {
        if (expectedServerInstanceId === null) {
          return;
        }
        if (this.cachedServerInstanceId !== expectedServerInstanceId) {
          return;
        }
        const staleClaimFromToken = expectedServerInstanceId;
        this.cachedServerInstanceId = null;
        this.handleServerInstanceMismatch(staleClaimFromToken);
        return;
      }
      if (typed === 'branch-mismatch') {
        this.onBranchMismatch?.();
        return;
      }
      if (typed === 'rename-redirect') {
        if (payload === undefined || payload.length === 0) {
          console.warn(
            JSON.stringify({
              event: 'rename-redirect-missing-payload',
              fromDocName: docName,
            }),
          );
          return;
        }
        const fromDocName = docName;
        const toDocName = payload;
        this.deleteLineageEpochRecord(fromDocName);
        const existing = this.entries.get(fromDocName);
        const hadOpenProvider = existing !== undefined && existing.kind === 'active';
        this.onRenameRedirect?.({
          fromDocName,
          toDocName,
          hadOpenProvider,
        });
        return;
      }
      if (typed === 'doc-deleted') {
        this.deleteLineageEpochRecord(docName);
        const existing = this.entries.get(docName);
        const hadOpenProvider = existing !== undefined && existing.kind === 'active';
        this.onDocDeleted?.({ docName, hadOpenProvider });
        return;
      }
      if (typed === 'doc-lineage-mismatch') {
        if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
        this.deleteLineageEpochRecord(docName);
        this.emitStructuredClientRecoveryEvent({
          event: 'ok-doc-lineage-mismatch',
          ...this.recoveryTelemetryBase(docName),
          via: 'auth-rejection',
          staleEpoch: entry.lineageEpochRecordAtOpen ?? '',
        });
        const wasActive = this.activeDocName === docName;
        void this.runCloseAndClearPersistence(docName);
        const reopened = this.open(docName);
        if (reopened !== null && wasActive) this.setActive(docName);
        return;
      }
      const _never: never = typed;
      void _never;
    };

    const onServerDrivenClose = ({ event }: { event?: { code?: number; reason?: string } }) => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      if (entry.serverDrivenCloseReauthInFlight) return;
      entry.serverDrivenCloseReauthInFlight = true;
      provider
        .sendToken()
        .catch((err: unknown) => {
          console.warn(
            JSON.stringify({
              event: 'ok-provider-server-driven-close-reauth-failed',
              docName,
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        })
        .finally(() => {
          if (entry.kind === 'active' && this.entries.get(docName) === entry) {
            entry.serverDrivenCloseReauthInFlight = false;
          }
        });
      const reason = event?.reason ?? '<unknown>';
      console.info(
        JSON.stringify({
          event: 'ok-provider-server-driven-close-reauth',
          docName,
          reason,
        }),
      );
    };

    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('disconnect', onDisconnect);
    provider.on('authenticationFailed', onAuthenticationFailed);
    provider.on('close', onServerDrivenClose);

    const buffered = this.bufferedUpdates.get(docName);
    if (buffered !== undefined) {
      const staleClaimAtReplayInstall = this.recoveryMismatchStaleClaim;
      const replayOnce = (): void => {
        provider.off('synced', replayOnce);
        if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
        const current = takeBufferedReplay(this.bufferedUpdates, docName);
        if (current === undefined) return;
        try {
          Y.applyUpdate(provider.document, current, TAB_REPLAY_ORIGIN);
        } catch (err: unknown) {
          const errorName = err instanceof Error ? err.name : 'non-error-throw';
          this.emitStructuredClientRecoveryEvent({
            event: 'ok-buffer-replay-failed',
            ...this.recoveryTelemetryBase(docName, staleClaimAtReplayInstall),
            replayByteLength: current.byteLength,
            errorName,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      };
      provider.on('synced', replayOnce);
    }

    this._entries.set(docName, entry);
    this.touch(docName);
    this.notify();

    if (
      persistence === null &&
      persistenceServerInstanceId !== null &&
      persistenceServerInstanceId.length > 0 &&
      pendingClearForDocName === undefined
    ) {
      void this.validateStoredStateThenAttach(entry, persistenceServerInstanceId);
    }

    if (
      pendingClearForDocName !== undefined &&
      persistenceServerInstanceId !== null &&
      persistenceServerInstanceId.length > 0
    ) {
      const stableServerInstanceId = persistenceServerInstanceId;
      void pendingClearForDocName.then(
        () => {
          this.attachDeferredPersistenceForEntry(entry, stableServerInstanceId);
        },
        (err: unknown) => {
          console.warn(
            JSON.stringify({
              event: 'ok-pool-deferred-persistence-attach-skipped',
              docName,
              reason: 'pending-clear-failed',
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        },
      );
    }

    const openMountId = getMountId(docName);
    if (openMountId !== undefined) {
      emitColdMountChild(
        openMountId,
        'ok.provider-pool.open',
        { 'doc.name': docName },
        openStartMs,
        Date.now(),
      );
    }

    return entry;
  }
}
