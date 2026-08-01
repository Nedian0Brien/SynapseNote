import { mergeStateVectors } from './client-persistence';
import {
  ClientPersistenceClearTimeoutError,
  IDLE_SERVER_RESTART_RECOVERY,
  type ServerRestartRecoveryState,
} from './provider-pool-contracts';
import { ProviderPoolLineage } from './provider-pool-lineage';
import { invalidateSyncPromise } from './sync-promise';

/** Server-restart recovery state, bounded clear waits, and disk-ack watermarks. */
export abstract class ProviderPoolRecovery extends ProviderPoolLineage {
  getServerRestartRecoveryState(): ServerRestartRecoveryState {
    return this.serverRestartRecoveryState;
  }

  /**
   * Advance the entry's `lastDiskAckedSV` watermark via element-wise
   * max-merge with any prior value. Called by `SystemDocSubscriber`
   * for every CC1 `disk-ack` payload AND by every `/api/server-info`
   * batch refresh — the server has just durably written the doc up to
   * this state vector. `handleServerInstanceMismatch` prefers
   * `lastDiskAckedSV` over `lastServerSyncedSV` when computing the
   * recycle buffer baseline: disk-ack'd updates will survive the
   * markdown rebuild on server-restart, so they don't need to be
   * replayed (and replaying them is what causes the mid-drain
   * duplication bug).
   *
   * **Why merge, not overwrite.** Disk-ack updates flow over two
   * independent channels (CC1 stateless WS + `/api/server-info` HTTP)
   * that aren't ordered relative to each other. The server's per-doc
   * SV is monotonic at emit time, but a slow HTTP response can land
   * AFTER a newer WS broadcast — a pure overwrite would regress
   * `lastDiskAckedSV` from the newer to the older value, reopening
   * the disk-ack-staleness duplication path on the next
   * mismatch-recycle. Element-wise max-merge is conservative across
   * out-of-order receives: the merged SV is at least as advanced as
   * either input in every clientID dimension.
   *
   * No-op when no entry exists for `docName` or the entry is
   * tearing-down — both signal "this doc isn't an active part of the
   * pool right now," and a stale watermark on a future entry would
   * be incorrect anyway (each fresh entry starts at null).
   */
  observeDiskAck(docName: string, sv: Uint8Array): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.kind !== 'active') return;
    entry.lastDiskAckedSV = mergeStateVectors(entry.lastDiskAckedSV, sv);
  }

  /**
   * Refresh the `lastDiskAckedSV` watermark for every doc named in the
   * batch via the same element-wise max-merge as `observeDiskAck`.
   * Called by the boot fetch + every `__system__` reconnect via
   * `GET /api/server-info`'s `currentDiskAckSVs` field — closes the
   * missed-frame gap that CC1 stateless broadcasts leave open (no
   * replay; a brief `__system__` WS drop during a write burst would
   * otherwise leave `lastDiskAckedSV` permanently stale and reopen
   * the disk-ack-staleness duplication path on server-restart).
   *
   * Per-doc semantics match `observeDiskAck`: skip when no entry
   * exists for the doc or when the entry is tearing-down. Docs in the
   * batch that the client doesn't have open are silently ignored.
   * The merge protects against the WS+HTTP cross-over window where
   * a slow batch response could otherwise overwrite a newer
   * live-broadcast SV.
   */
  observeDiskAckBatch(svsByDocName: Record<string, Uint8Array>): void {
    for (const [docName, sv] of Object.entries(svsByDocName)) {
      this.observeDiskAck(docName, sv);
    }
  }
  protected withClearDataTimeout(docName: string, promise: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ClientPersistenceClearTimeoutError(docName, this.clearDataTimeoutMs));
      }, this.clearDataTimeoutMs);
      promise.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (err: unknown) => {
          clearTimeout(timeout);
          reject(err);
        },
      );
    });
  }
  protected recoveryTelemetryBase(
    docName: string,
    staleClaimOverride?: string | undefined,
  ): { docName: string; branch: string; serverInstanceId?: string } {
    const branch = this.normalizedObservedBranch();
    const base: { docName: string; branch: string; serverInstanceId?: string } = {
      docName,
      branch,
    };
    const stale =
      staleClaimOverride !== undefined ? staleClaimOverride : this.recoveryMismatchStaleClaim;
    if (stale !== undefined && stale.length > 0) {
      base.serverInstanceId = stale;
    }
    return base;
  }
  protected emitStructuredClientRecoveryEvent(parts: Record<string, string | number>): void {
    console.warn(JSON.stringify(parts));
  }
  protected clearRecoveryMismatchStaleClaimIfTerminal(): void {
    const kind = this.serverRestartRecoveryState.kind;
    if (kind === 'idle' || kind === 'failed') {
      this.recoveryMismatchStaleClaim = undefined;
    }
  }
  protected beginServerRestartRecovery(docNames: readonly string[], startedAt: number): void {
    this.serverRestartRecoveryState = {
      kind: 'recovering',
      phase: 'clearing-local-cache',
      docNames,
      failedDocNames: [],
      startedAt,
    };
    for (const docName of docNames) {
      invalidateSyncPromise(docName);
    }
    this.notify();
  }
  protected enterServerRestartReconnect(
    docNames: readonly string[],
    failedDocNames: readonly string[],
    startedAt: number,
    failureReason: 'clear-data-failed' | 'clear-data-timeout',
  ): void {
    if (docNames.length === 0) {
      this.serverRestartRecoveryState =
        failedDocNames.length === 0
          ? IDLE_SERVER_RESTART_RECOVERY
          : {
              kind: 'failed',
              reason: failureReason,
              docNames: failedDocNames,
              failedDocNames,
              startedAt,
            };
      this.clearRecoveryMismatchStaleClaimIfTerminal();
      this.notify();
      return;
    }

    this.serverRestartRecoveryState = {
      kind: 'recovering',
      phase: 'reconnecting',
      docNames,
      failedDocNames,
      startedAt,
      ...(failedDocNames.length > 0 ? { clearFailureReason: failureReason } : {}),
    };
    this.notify();
  }
  protected markServerRestartRecoverySynced(docName: string): void {
    const state = this.serverRestartRecoveryState;
    if (state.kind !== 'recovering' || state.phase !== 'reconnecting') return;
    if (!state.docNames.includes(docName)) return;

    const remaining = state.docNames.filter((candidate) => candidate !== docName);
    if (remaining.length > 0) {
      this.serverRestartRecoveryState = { ...state, docNames: remaining };
      return;
    }

    if (state.failedDocNames.length > 0) {
      this.serverRestartRecoveryState = {
        kind: 'failed',
        reason: state.clearFailureReason ?? 'clear-data-failed',
        docNames: state.failedDocNames,
        failedDocNames: state.failedDocNames,
        startedAt: state.startedAt,
      };
      this.clearRecoveryMismatchStaleClaimIfTerminal();
      return;
    }

    this.serverRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
    this.clearRecoveryMismatchStaleClaimIfTerminal();
  }
}
