import { UNKNOWN_BRANCH_SENTINEL } from './client-persistence';
import { DOC_LINEAGE_EPOCHS_KEY, LAST_OBSERVED_BRANCH_KEY } from './provider-pool-contracts';
import { ProviderPoolState } from './provider-pool-state';

/** Branch and per-document lineage records used to fence stale persistence. */
export abstract class ProviderPoolLineage extends ProviderPoolState {
  /**
   * Lazy-init the in-memory cache from `this.storage`. Idempotent.
   * Tolerant of missing storage (Node tests, SSR) — falls back to the
   * initial null value.
   */
  protected getOrInitObservedBranch(): string | null {
    if (this.lastObservedBranchInitialized) return this.lastObservedBranch;
    this.lastObservedBranchInitialized = true;
    try {
      const stored = this.storage?.getItem(LAST_OBSERVED_BRANCH_KEY) ?? null;
      if (stored !== null && stored.length > 0) {
        this.lastObservedBranch = stored;
      }
    } catch {
      // Storage access can throw in private-mode browsers / sandboxed
      // iframes — fall back to in-memory only.
    }
    return this.lastObservedBranch;
  }

  /**
   * Persist the observed branch alongside the in-memory cache. Tolerant
   * of storage failures (private browsing, quota exceeded) — the
   * in-memory cache always succeeds.
   */
  protected persistObservedBranch(branch: string | null): void {
    this.lastObservedBranch = branch;
    this.lastObservedBranchInitialized = true;
    try {
      if (branch === null || branch.length === 0) {
        this.storage?.removeItem(LAST_OBSERVED_BRANCH_KEY);
      } else {
        this.storage?.setItem(LAST_OBSERVED_BRANCH_KEY, branch);
      }
    } catch {
      // Storage write failures are non-fatal — see read-side comment.
    }
  }

  /**
   * The branch scope lineage records (and the IDB DB names built by
   * `buildPersistence`) live under when no branch has been observed.
   * Envelope writers and validators must agree on this normalization —
   * a fresh tab that never observes a branch still produces/consumes a
   * consistent envelope.
   */
  protected normalizedObservedBranch(): string {
    return this.getOrInitObservedBranch() ?? UNKNOWN_BRANCH_SENTINEL;
  }

  /**
   * Fold the persisted envelope into the in-memory records, at most once
   * per pool lifetime, and only when it validates against the live
   * instance id + observed branch. Called lazily from the read path —
   * validation needs `cachedServerInstanceId`, which is unknown at
   * construction. An envelope that fails validation is permanently
   * stale (its epochs identify lineages of a dead instance or another
   * branch) and is treated as empty.
   */
  protected consumeLineageEpochEnvelopeIfValid(): void {
    if (this.docLineageEpochsEnvelopeConsumed) return;
    const instanceId = this.cachedServerInstanceId;
    if (instanceId === null || instanceId.length === 0) return;
    this.docLineageEpochsEnvelopeConsumed = true;
    try {
      const raw = this.storage?.getItem(DOC_LINEAGE_EPOCHS_KEY) ?? null;
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const envelope = parsed as { branch?: unknown; serverInstanceId?: unknown; epochs?: unknown };
      if (envelope.branch !== this.normalizedObservedBranch()) return;
      if (envelope.serverInstanceId !== instanceId) return;
      if (typeof envelope.epochs !== 'object' || envelope.epochs === null) return;
      for (const [docName, epoch] of Object.entries(envelope.epochs as Record<string, unknown>)) {
        if (typeof epoch === 'string' && epoch.length > 0 && !this.docLineageEpochs.has(docName)) {
          this.docLineageEpochs.set(docName, epoch);
        }
      }
    } catch (err: unknown) {
      // Storage access throws in private-mode browsers / sandboxed iframes
      // surface as DOMException and are expected — stay silent. Any other
      // throw (malformed envelope, JSON.parse failure) is unexpected: warn
      // once (the envelope-consumed flag set above makes this at-most-once
      // per pool lifetime). In-memory records still work either way.
      if (!(err instanceof DOMException)) {
        console.warn(
          JSON.stringify({
            event: 'ok-lineage-epoch-envelope-read-error',
            errorName: err instanceof Error ? err.name : typeof err,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }
  protected getRecordedLineageEpoch(docName: string): string | null {
    const inMemory = this.docLineageEpochs.get(docName);
    if (inMemory !== undefined) return inMemory;
    this.consumeLineageEpochEnvelopeIfValid();
    return this.docLineageEpochs.get(docName) ?? null;
  }

  /**
   * Persist the full record map as the storage envelope. Skipped while
   * the instance id is unknown — the envelope must be instance-stamped
   * to be validatable, and an unstamped write would let a later pool
   * claim epochs against the wrong instance. In-memory records written
   * during that window still drive this pool's own claims and the
   * deferred-attach guard.
   */
  protected persistLineageEpochEnvelope(): void {
    const instanceId = this.cachedServerInstanceId;
    if (instanceId === null || instanceId.length === 0) return;
    try {
      this.storage?.setItem(
        DOC_LINEAGE_EPOCHS_KEY,
        JSON.stringify({
          branch: this.normalizedObservedBranch(),
          serverInstanceId: instanceId,
          epochs: Object.fromEntries(this.docLineageEpochs),
        }),
      );
    } catch {
      // Storage write failures are non-fatal — mirrors persistObservedBranch.
    }
  }
  protected recordLineageEpoch(docName: string, epoch: string): void {
    if (this.docLineageEpochs.get(docName) === epoch) return;
    this.docLineageEpochs.set(docName, epoch);
    this.persistLineageEpochEnvelope();
  }
  protected deleteLineageEpochRecord(docName: string): void {
    if (this.docLineageEpochs.delete(docName)) {
      this.persistLineageEpochEnvelope();
    }
  }

  /**
   * Update the observed branch without triggering invalidation. Called by
   * `handleBranchSwitched` after the live broadcast has already fired the
   * recycle, so the comparison path on the next `server-info` frame
   * doesn't double-invalidate.
   */
  setObservedBranch(branch: string): void {
    this.persistObservedBranch(branch);
  }

  /**
   * Compare-and-set the observed branch. Returns `true` when the supplied
   * branch differs from the prior observed value (signalling the caller
   * should run `handleBranchSwitched`); returns `false` on first
   * observation or matching branch. Always advances `lastObservedBranch`
   * to the supplied value.
   */
  compareAndUpdateObservedBranch(branch: string): boolean {
    const prior = this.getOrInitObservedBranch();
    this.persistObservedBranch(branch);
    return prior !== null && prior !== branch;
  }
}
