import type { HocuspocusProvider } from '@hocuspocus/provider';
import { getSchema } from '@tiptap/core';
import type * as Y from 'yjs';
import { readNumericOverride } from '../lib/perf/env-override';
import type { ClientPersistenceProvider, PeekStoredLineageEpochArgs } from './client-persistence';
import { sharedExtensions } from './extensions/shared.ts';

/**
 * Opaque Y.Doc transaction origin applied when the pool replays a buffered
 * update onto a freshly-recycled provider. Lets tests and future observers
 * distinguish replay writes from user edits / server sync deliveries.
 */
export { TAB_REPLAY_ORIGIN } from './provider-pool-replay';

export type SyncState = 'connecting' | 'synced' | 'disconnected';
export type ServerRestartRecoveryState =
  | { kind: 'idle' }
  | {
      kind: 'recovering';
      phase: 'clearing-local-cache' | 'reconnecting';
      docNames: readonly string[];
      failedDocNames: readonly string[];
      startedAt: number;
      /** Present when `failedDocNames` is non-empty — survives until active doc syncs. */
      clearFailureReason?: 'clear-data-failed' | 'clear-data-timeout';
    }
  | {
      kind: 'failed';
      reason: 'clear-data-failed' | 'clear-data-timeout';
      docNames: readonly string[];
      failedDocNames: readonly string[];
      startedAt: number;
    };

export const IDLE_SERVER_RESTART_RECOVERY: ServerRestartRecoveryState = Object.freeze({
  kind: 'idle',
});

/**
 * Pool entries follow a two-state lifecycle modeled as a discriminated
 * union: `Active` (the normal case — provider live, persistence attached)
 * and `TearingDown` (transient, inside `destroyEntry` after the kind flip
 * but before the entry is removed from `entries`).
 *
 * The discriminator narrows `persistence`, `observerCleanup`, and
 * `pendingRecycleTimer` to their non-transient shapes when consumers know
 * the entry is Active — replaces the implicit-invariant pattern of
 * `if (entry.tearingDown || entry.persistence === null) continue;`.
 *
 * Note on `bridgeSetupFailed`: kept as a flag on `Active` rather than a
 * third variant. A bridge-failed entry stays pool-resident with
 * persistence still attached and the recycle-on-disconnect path still
 * functional — the only narrowing benefit of a separate variant would be
 * `observerCleanup === null`, which doesn't earn its variant weight.
 *
 * Note on stale-closure checks: variants don't subsume the
 * `this.entries.get(docName) !== entry` guard in event handlers. That
 * check answers "is my closure stale?" — orthogonal to the entry's
 * lifecycle state. Both checks remain.
 */
export interface PoolEntryBase {
  provider: HocuspocusProvider;
  docName: string;
  lastAccessedAt: number;
  /**
   * Deterministic correlation seed minted at fresh-construct time.
   * Joins the pool warm-back / open trace to the activity-list mount
   * cycle that adopts it as `mountId`, replacing a timestamp-window
   * join that would otherwise be needed to follow one logical
   * cold-mount cycle across namespaces.
   */
  poolEventId: string;
  syncState: SyncState;
  hasSynced: boolean;
  /**
   * True when `setupObservers` threw during initial sync. The provider
   * stays pool-resident so `EditorArea` keeps rendering the boundary
   * subtree (which shows `DocumentErrorBoundary`'s `BridgeSetupError`
   * UI), but the entry is inert — observers not wired, no further writes
   * will land. The user's "Try again" path calls `pool.recycle(docName)`
   * which destroys + recreates the entry to retry from a clean slate.
   */
  bridgeSetupFailed: boolean;
  /**
   * Server state vector captured after every Y.js `synced` event ("server
   * has accepted your update into its in-memory Y.Doc"). The delta
   * between this and the doc's current state is the unsynced buffer
   * captured before `clearData` on a `server-instance-mismatch` recycle.
   * `handleServerInstanceMismatch` falls back to this when
   * `lastDiskAckedSV` is null (no disk-ack received yet).
   */
  lastServerSyncedSV: Uint8Array | null;
  /**
   * Stricter watermark advanced by the server's CC1 `disk-ack` channel
   * after L1 markdown flush ("server has durably persisted your update
   * to disk"). `handleServerInstanceMismatch` prefers this over
   * `lastServerSyncedSV` when present — disk-ack'd updates will survive
   * the markdown rebuild on a server-restart, so the recycle buffer
   * doesn't need to replay them. Closes the mid-drain duplication
   * bug class.
   */
  lastDiskAckedSV: Uint8Array | null;
  /**
   * The pool's per-doc lineage-epoch record snapshotted at `open()` time,
   * BEFORE this entry's own sync could re-record a fresher value. The
   * deferred-persistence-attach guard compares this against the live
   * doc's epoch once the server instance id becomes known: the IDB rows
   * a late attach would hydrate were written under the lineage recorded
   * at open — comparing against the record map's CURRENT value would see
   * the fresh epoch this entry's `synced` handler just recorded and wave
   * the stale rows through. `null` when no record existed at open — that
   * population is fenced by the stored-state validation spine, which
   * reads the epoch carried in-band by the rows themselves.
   */
  lineageEpochRecordAtOpen: string | null;
}

/**
 * Live pool entry. Most consumers narrow to this kind via
 * `if (entry.kind === 'active') { … }`.
 *
 * `persistence` is `null` only on entries opened before the live
 * server epoch (`cachedServerInstanceId`) was known. The DB-name shape
 * `ok-ydoc:${branch}:${serverInstanceId}:${docName}` carries the
 * server epoch as a structural correctness signal, so the IndexedDB
 * cache cannot be attached until the epoch is known. The
 * `HocuspocusProvider` is constructed eagerly so the WebSocket
 * handshake can begin in parallel, but no persistent IDB ever points
 * at an unknown-epoch DB name.
 */
export interface ActivePoolEntry extends PoolEntryBase {
  kind: 'active';
  /**
   * Client-side Yjs persistence attached to this entry's Y.Doc. Hydrates
   * from IndexedDB on cold mount (instant Cmd-R), persists every
   * non-self update back, and is the handle the mismatch recycle flow
   * uses to `clearData()` before destroying the provider. `null` when
   * the live server epoch was not yet known at `open()` time, or while
   * the stored-state validation spine hasn't yet admitted the rows (no
   * lineage record existed at open to claim-fence them).
   */
  persistence: ClientPersistenceProvider | null;
  /** Wired by `setupObservers` after first sync; null until then. */
  observerCleanup: (() => void) | null;
  /**
   * Cleanup for the DEV-only `ok/perf-counters` observer that tracks remote
   * Y.Doc transactions. Null in production (gated by
   * `import.meta.env.PROD === true` — installer returns a no-op).
   */
  observerFireCounterCleanup: (() => void) | null;
  /** Set when a disconnect schedules a debounced recycle; null otherwise. */
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
  /**
   * True once a stored-state-validation spine run has claimed this
   * entry's persistence attach. The deferred pass can dispatch onto the
   * same entry more than once (the instance id transitioning
   * id → null → id re-runs it), and a second spine racing an in-flight
   * one would peek and attach in parallel. One-shot per entry: every
   * terminal spine outcome (attach, refuse-and-replace, abort on a
   * stale entry, or a failed/timed-out peek that leaves the entry
   * cacheless for the session) makes a retry on the SAME entry
   * meaningless.
   */
  persistenceAttachOwned: boolean;
  /**
   * Idempotence guard for the server-driven doc-level close handler. A
   * single close can fire `'close'` once, but rapid back-to-back closes
   * (e.g., two MCP renames on the same docName before re-auth completes)
   * would otherwise issue parallel `sendToken` calls and racy
   * authenticationFailed dispatches. The flag flips true on first close,
   * resets when `sendToken` settles (success or failure).
   */
  serverDrivenCloseReauthInFlight: boolean;
}

/**
 * Transient state inside `destroyEntry` between the kind flip and
 * removal from `entries`. All cleanup-fields are nulled by the time
 * `destroyEntry` finishes; consumers that observe a `TearingDown` entry
 * via a stale event-handler closure should bail.
 */
export interface TearingDownPoolEntry extends PoolEntryBase {
  kind: 'tearing-down';
  persistence: null;
  observerCleanup: null;
  observerFireCounterCleanup: null;
  pendingRecycleTimer: null;
  serverDrivenCloseReauthInFlight: false;
}

export type PoolEntry = ActivePoolEntry | TearingDownPoolEntry;

export type RenameRedirectHandler = (args: {
  fromDocName: string;
  toDocName: string;
  hadOpenProvider: boolean;
}) => void;

/**
 * DEV-only observer-fire counter.
 *
 * Counts `afterAllTransactions` drains on `provider.document` whose
 * transactions include any non-local (remote) write. Per-docName fires
 * accumulate on `globalThis.__okPerfCounters.providerObserverFires[docName]`,
 * read by perf scenarios at start + end of each measurement window for a
 * fires-per-second delta.
 *
 * Production path: `import.meta.env.PROD === true` short-circuits both
 * the installer (returns a no-op cleanup) and the bump function. The
 * counter map is therefore never created on prod, and the call site in
 * `open()` retains a null `observerFireCounterCleanup` ref. Bundle DCE
 * removes the inner bodies; only the inert call sites remain. Pattern
 * matches `lib/perf/env-override.ts`.
 */
export type ObserverCounterMap = { providerObserverFires: Record<string, number> };
export const counterGlobal = globalThis as unknown as { __okPerfCounters?: ObserverCounterMap };

export function bumpObserverFire(docName: string): void {
  if (import.meta.env.PROD === true) return;
  let bag = counterGlobal.__okPerfCounters;
  if (!bag) {
    bag = { providerObserverFires: {} };
    counterGlobal.__okPerfCounters = bag;
  }
  bag.providerObserverFires[docName] = (bag.providerObserverFires[docName] ?? 0) + 1;
}

export function clearObserverFireCounter(docName: string): void {
  if (import.meta.env.PROD === true) return;
  const bag = counterGlobal.__okPerfCounters;
  if (!bag) return;
  delete bag.providerObserverFires[docName];
}

export function installProviderObserverCounter(doc: Y.Doc, docName: string): () => void {
  if (import.meta.env.PROD === true) return () => {};
  // Y.Doc's `afterAllTransactions` fires with `(doc, transactions)` per yjs
  // event signatures. We ignore the doc arg — the closure already captures
  // the docName key. A drain that includes any non-local (remote) transaction
  // bumps the per-docName counter once, regardless of how many remote txns
  // it contains. Per-drain semantic matches the measurement contract:
  // fire rate per measurement window via start/end deltas.
  const handler = (_doc: Y.Doc, transactions: Y.Transaction[]) => {
    if (transactions.some((tx) => !tx.local)) bumpObserverFire(docName);
  };
  doc.on('afterAllTransactions', handler);
  return () => doc.off('afterAllTransactions', handler);
}

export type PoolChangeCallback = () => void;

export let editorSchema: ReturnType<typeof getSchema> | null = null;

export function getEditorSchema(): ReturnType<typeof getSchema> {
  editorSchema ??= getSchema(sharedExtensions);
  return editorSchema;
}

/**
 * How long to wait after a disconnect before recycling the provider (ms).
 * During this window the provider's built-in exponential backoff handles
 * reconnection attempts. If it reconnects and syncs, the pending recycle is
 * cancelled. If the window expires with the provider still disconnected, a
 * single recycle fires. Rapid disconnect events (server flapping) reset the
 * timer — collapsing a flap storm into one recycle at the end.
 *
 * 4s is long enough to ride out a server restart cycle (typically 1-3s) and
 * short enough that the user doesn't stare at a stale disconnected state.
 * Validated by the Liveblocks `lostConnectionTimeout` pattern (default 5s).
 */
export const RECYCLE_DEBOUNCE_MS = 4_000;
export const CLEAR_DATA_TIMEOUT_MS = 10_000;

export type ClientPersistenceFactory = (args: {
  branch: string;
  serverInstanceId: string;
  docName: string;
  doc: Y.Doc;
}) => ClientPersistenceProvider;

export type PeekStoredLineageEpoch = (args: PeekStoredLineageEpochArgs) => Promise<string | null>;

export class ClientPersistenceClearTimeoutError extends Error {
  constructor(
    readonly docName: string,
    readonly timeoutMs: number,
  ) {
    super(`client persistence clearData timed out for ${docName} after ${timeoutMs}ms`);
    this.name = 'ClientPersistenceClearTimeoutError';
  }
}

export class StoredEpochPeekTimeoutError extends Error {
  constructor(
    readonly docName: string,
    readonly timeoutMs: number,
  ) {
    super(`stored-state epoch peek timed out for ${docName} after ${timeoutMs}ms`);
    this.name = 'StoredEpochPeekTimeoutError';
  }
}

/**
 * localStorage key for the persisted last-observed git branch. Used by
 * `ProviderPool` to seed the cross-branch defense's in-memory cache on
 * a fresh tab so the very first auth-token claim is checked against
 * the server's current branch (closes the fresh-tab-with-stale-IDB
 * gap). Single key per origin is fine — a single Hocuspocus server's
 * branch is global to the project.
 */
export const LAST_OBSERVED_BRANCH_KEY = 'ok-last-observed-branch';

/**
 * localStorage key for the persisted per-doc lineage-epoch records.
 * Single envelope per origin:
 * `{ branch, serverInstanceId, epochs: Record<docName, epoch> }` —
 * validated against the current observed branch + live instance id on
 * load, so a stale envelope (server restarted, branch switched) is
 * treated as empty rather than leaking dead-lineage claims. Mirrors the
 * `LAST_OBSERVED_BRANCH_KEY` pattern above, including its co-eviction
 * assumption: localStorage and IDB evict together; a record evicted
 * while its IDB rows survive means the claim is absent and the lineage
 * fence does not fire (accepted residual, narrowed by the next learned
 * epoch and the deferred-attach guard).
 */
export const DOC_LINEAGE_EPOCHS_KEY = 'ok-doc-lineage-epochs';

/**
 * Periodic full-sync nudge for HocuspocusProvider. Secondary defense against
 * the `synced`-never-fires edge cases documented in hocuspocus#183 and
 * y-websocket#81; the 30s syncPromise timeout is the primary safety net.
 *
 * 5000ms chosen so 0.2 msgs/sec × 10 providers × 2 directions ≈ 4 msgs/sec
 * steady-state — negligible overhead vs the 100 msgs/sec a 200ms interval
 * would generate. Still catches the never-fires edge within 5s,
 * imperceptible vs the 30s timeout.
 */
export const FORCE_SYNC_INTERVAL_MS = 5_000;

/**
 * Per-doc cap on the in-memory unsynced-update buffer captured during a
 * `server-instance-mismatch` recycle. A long disconnect window with paste-
 * heavy / agent-driven typing can produce an arbitrarily large
 * `Y.encodeStateAsUpdate(doc, lastAckedSV)` result; without a cap, the pool
 * could hold tens of MB across `MAX_POOL` entries while waiting for the
 * post-recycle `synced` event. 1 MiB matches the pattern used by
 * comparable buffer-and-replay implementations (Liveblocks, AFFiNE) and
 * comfortably fits typical session-length deltas while bounding the
 * pathological case. On overflow the buffer entry is dropped and a
 * loud-fail `mark` event fires so the user-visible "unsynced edits lost"
 * outcome is observable.
 */
export const MAX_BUFFER_BYTES = readNumericOverride('MAX_BUFFER_BYTES', 1 * 1024 * 1024);

/**
 * Default pool capacity. Exported so the single point of truth lives in this
 * module (the pool that owns the constraint), and so callers that construct
 * a `ProviderPool` can reference the same name rather than a magic literal.
 *
 * Coupled to `ACTIVITY_MOUNT_LIMIT = 3` (exported from `EditorActivityPool.tsx`)
 * per precedent #18(c): `MAX_POOL` bounds how many warm
 * providers we keep; `ACTIVITY_MOUNT_LIMIT` bounds how many editor subtrees
 * are Activity-mounted inside those providers. The two constraints are
 * intentionally independent — pool-resident-but-not-Activity-mounted docs
 * keep their warm provider (≈5–10 MB) for fast Suspense-gated remount
 * without paying per-editor memory or observer-CPU cost.
 *
 * Changing either constant is an ASK_FIRST boundary. If one moves,
 * audit the other for sympathetic impact.
 */
export const MAX_POOL = readNumericOverride('MAX_POOL', 10);
