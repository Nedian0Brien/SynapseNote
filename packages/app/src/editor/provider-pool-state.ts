import { createClientPersistence, peekStoredLineageEpoch } from './client-persistence';
import {
  CLEAR_DATA_TIMEOUT_MS,
  type ClientPersistenceFactory,
  IDLE_SERVER_RESTART_RECOVERY,
  type PeekStoredLineageEpoch,
  type PoolChangeCallback,
  type PoolEntry,
  RECYCLE_DEBOUNCE_MS,
  type RenameRedirectHandler,
  type ServerRestartRecoveryState,
} from './provider-pool-contracts';

/** Durable pool state plus the small cross-capability seams it owns. */
export abstract class ProviderPoolState {
  /**
   * Internal mutable map. External callers see the read-only `entries`
   * getter below — `readonly` on the field would prevent reassignment
   * but not Map-level mutation (`set`/`delete`/`clear`). The getter
   * widens the type to `ReadonlyMap` so accidental external writes fail
   * compile.
   */
  protected readonly _entries = new Map<string, PoolEntry>();

  /**
   * Read-only view of the live pool. Returned snapshot is the same Map
   * instance — iteration and reads stay zero-copy. Compile-time
   * `ReadonlyMap` typing prevents external `.set` / `.delete` /
   * `.clear` calls; runtime bypass via type-cast is theoretically
   * possible but requires deliberate effort.
   */
  get entries(): ReadonlyMap<string, PoolEntry> {
    return this._entries;
  }
  protected lruOrder: string[] = [];
  protected activeDocName: string | null = null;
  protected readonly maxSize: number;
  protected readonly wsUrl: string;
  protected readonly recycleDebounceMs: number;
  protected readonly clearDataTimeoutMs: number;
  protected onChange: PoolChangeCallback | null = null;
  protected tabIdentity: { principalId: string; tabSessionId: string } | null = null;
  protected serverRestartRecoveryState: ServerRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;

  /**
   * Live server instance ID observed from `/api/server-info` or CC1
   * `server-info`. Drives the auth-token claim and the
   * `serverInstanceId` segment of the IndexedDB DB name. Cleared on
   * mismatch so the next epoch cleanly transitions through
   * `whenServerInstanceKnown()` + `attachDeferredPersistence`.
   */
  protected cachedServerInstanceId: string | null = null;

  /**
   * One-shot promise handle for callers waiting on a known server epoch.
   * Allocated lazily by `whenServerInstanceKnown()` and resolved (then
   * cleared) the next time `setExpectedServerInstanceId` is called with a
   * non-null id. Once resolved, future `whenServerInstanceKnown()` calls
   * allocate a fresh handle bound to the next epoch transition.
   *
   * `null` arg to `setExpectedServerInstanceId` does NOT reject — the
   * pending handle stays alive until a real epoch lands. This matches the
   * mismatch-recycle path: the handler clears `cachedServerInstanceId` to
   * null mid-recovery, then the boot/refresh fetch races the new id back
   * into place.
   */
  protected pendingServerInstanceKnown: {
    promise: Promise<string>;
    resolve: (id: string) => void;
  } | null = null;

  /**
   * Claimed server epoch carried on mismatch auth tokens until recovery
   * reaches a terminal `idle` or `failed` state. Used solely for bounded
   * structured client telemetry alongside `docName` / `branch`.
   */
  protected recoveryMismatchStaleClaim: string | undefined;

  /**
   * Unsynced-edit buffer captured per-doc during a `server-instance-mismatch`
   * recycle. Populated right before `clearData()` wipes IDB; drained at the
   * fresh provider's FIRST post-recycle `synced` event when the replay
   * listener applies the bytes back to the Y.Doc. In-memory only — a tab
   * crash inside the recycle window loses the buffer (accepted trade-off).
   */
  protected readonly bufferedUpdates = new Map<string, Uint8Array>();

  /**
   * Per-docName `closeAndClearPersistence` in-flight tracking. Drives the
   * delete-then-recreate-same-docname coordination: while a clear is in
   * flight for `docName`, any concurrent `pool.open(docName)` MUST defer
   * its `IndexeddbPersistence` attach. The fresh provider's connection
   * would otherwise be a blocker for the in-flight `deleteDatabase`
   * request (firing `onblocked` on the same dbName, leaving stale rows
   * for the new Y.Doc to hydrate from — exactly the content-duplication
   * bug class clearData is supposed to prevent).
   *
   * Map entries are deleted via a `.then`/`.catch` epilogue when the work
   * settles; the public `closeAndClearPersistence` still swallows the
   * rejection so legacy callers (FileTree bulk rename, EditorTabs
   * cleanup) don't need to handle per-docName failures inside Promise.all
   * batches. The deferred-attach scheduler subscribes to this promise
   * directly (see `open`) and observes both resolve and reject, attaching
   * persistence on success and skipping on failure (entry runs without
   * IDB cache for the rest of the session; the next cold-load retries
   * the clear via the same auth-rejection flow).
   */
  protected readonly pendingClears = new Map<string, Promise<void>>();

  /**
   * Per-docName retention of `closeAndClearPersistence` failures across the
   * pendingClears finalize window. The public wrapper swallows clear
   * failures so legacy batch callers (FileTree bulk rename, EditorTabs
   * cleanup) don't see partial-failure rejections, and the in-flight
   * Promise drops out of `pendingClears` once its .then/.catch finalize
   * epilogue runs. Without this set, a non-concurrent reopen of the same
   * docName afterwards (delete → time passes → recreate) observes no
   * in-flight clear and constructs fresh `IndexeddbPersistence` directly
   * against the still-stale IDB rows — hydrating the new Y.Doc with
   * prior-doc content. That's the exact bug class the rename clear flow
   * exists to prevent; `pendingClears` covers the concurrent-race case,
   * but the non-concurrent case slips through unless the failure is
   * durable across the finalize window.
   *
   * Entries are added in the catches of `executeCloseAndClearPersistence`
   * before re-throwing. `pool.open(docName)` re-runs the clear via
   * `runCloseAndClearPersistence` and clears the entry on retry success
   * via `executeCloseAndClearPersistence`'s post-clear cleanup. `dispose()`
   * drops the set wholesale.
   */
  protected readonly clearFailures = new Set<string>();
  protected readonly persistenceFactory: ClientPersistenceFactory;

  /**
   * Injectable read of the stored rows' in-band lineage epoch (see
   * `peekStoredLineageEpoch`). Same DI rationale as `persistenceFactory`:
   * unit tests stage stored-state shapes without a real IndexedDB.
   */
  protected readonly peekStoredEpoch: PeekStoredLineageEpoch;

  /**
   * Storage handle the pool reads/writes `lastObservedBranch` through.
   * Defaults to `globalThis.localStorage` in browser bundles; tests pass
   * a `Map`-backed stub. `null` disables persistence entirely (the
   * in-memory cache still works). Mirrors the DI pattern used by
   * `use-editor-mode.ts` so the Bun test runner — which has no DOM
   * globals — can exercise the persistence code path directly.
   */
  protected readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

  /**
   * Last-observed git branch reported by the server (via `/api/server-info`
   * boot fetch + CC1 `server-info` broadcasts).
   *
   * Persisted to `localStorage` so cold-boot tabs claim the correct branch
   * in their first auth token. Without persistence the in-memory cache is
   * empty on a fresh tab → `expectedBranch` claim is omitted → server
   * accepts unconditionally → the IndexeddbPersistence then hydrates
   * stale-branch Y.Doc state, which Yjs sync union-merges with the
   * server's current-branch state (ghost items, the exact bug class this
   * defense exists to prevent). The persisted value lets the very first
   * post-restore connect's auth-token claim be checked against the
   * server's current branch, so a fresh tab against a switched branch
   * gets rejected → recycled → IDB cleared before sync runs.
   *
   * Lazily seeded from localStorage on first read (see
   * `getOrInitObservedBranch` below) — `localStorage` access at module
   * load would break SSR / Node test environments where `localStorage`
   * is undefined.
   *
   * **Co-eviction assumption.** This defense relies on `localStorage` and
   * IDB staying in sync as a unit. Modern browsers evict both together
   * (same "best-effort" eviction bucket), but a manual mismatch — e.g.
   * DevTools → Application → "Clear storage" with IDB unchecked,
   * profile import/export, custom storage tooling — re-opens the
   * cross-branch ghost-item scenario: localStorage cleared → empty
   * claim → server accepts → stale IDB hydrates → sync union-merge.
   * Recovery requires `provider.clearData()` or a full storage clear.
   * A future structural fix (branch-prefixed IDB names) would remove
   * the assumption; tracked in the spec's deferred-scope list.
   */
  protected lastObservedBranch: string | null = null;
  protected lastObservedBranchInitialized = false;

  /**
   * Per-doc lineage-epoch records — the client half of the doc-lineage
   * fence (third axis of the stale-client-persistence defense:
   * instance → branch → doc lineage). The server mints an epoch into the
   * doc's `lifecycle` Y.Map whenever persistence seeds it from disk; the
   * pool records the epoch it synced per doc and claims it on the next
   * open so `doc-lineage-guard` (server-side) can reject a stale rejoin
   * BEFORE Yjs sync union-merges two materializations of the same doc.
   *
   * In-memory map is authoritative within a pool lifetime (readable even
   * while the server instance id is unknown — the deferred-attach guard
   * needs the open-time snapshot during exactly that window). The
   * localStorage envelope under `DOC_LINEAGE_EPOCHS_KEY` extends records
   * across tabs/pools; it is folded into the map at most once, and only
   * after it validates against the current observed branch + live
   * instance id (stale envelope ⇒ ignored; the next record write
   * overwrites it). Records from a dead instance/branch that survive in
   * memory self-heal: a stale claim is rejected, the rejection arm drops
   * the record, and the reopen claims nothing.
   */
  protected readonly docLineageEpochs = new Map<string, string>();
  protected docLineageEpochsEnvelopeConsumed = false;

  /**
   * Handler invoked when the server rejects a connect with
   * `reason: 'branch-mismatch'`. Set by DocumentContext (which owns
   * `handleBranchSwitched` invocation) after pool construction so the
   * pool itself stays free of React/UI imports.
   *
   * Callback MUST return a Promise — the in-flight gate awaits the
   * returned promise to collapse concurrent dispatches across event-
   * loop turns. A `void`-fronted callback (e.g., `() => { void
   * fetch(...) }`) returns `undefined` synchronously; the gate clears
   * on the next microtask while the actual work is still in flight,
   * defeating the gate.
   *
   * In-flight gate: when a branch switch happens server-side that the
   * client missed (offline window, stale IDB), every open provider's
   * auth fails with `branch-mismatch` in quick succession — N parallel
   * `/api/server-info` fetches + N concurrent `handleBranchSwitched`
   * calls would otherwise fan out. The gate collapses concurrent
   * dispatches into a single in-flight promise: the first call runs
   * the user-supplied callback; subsequent calls during that window
   * are dropped (the recycle is already in progress for the whole
   * pool, so re-entry would just churn the active doc's fresh
   * provider).
   */
  // The wrapped dispatcher returns void synchronously (it just kicks off
  // the in-flight promise tracked in `branchMismatchInFlight`); the input
  // callback supplied via `setOnBranchMismatch` MUST return a Promise so
  // the gate can await it across event-loop turns.
  protected onBranchMismatch: (() => void) | null = null;
  protected branchMismatchInFlight: Promise<void> | null = null;

  /**
   * Resolves when the in-flight `server-instance-mismatch` recycle chain
   * (`handleServerInstanceMismatch`'s `Promise.allSettled` over `clearData`
   * + the trailing `recycleAllEntries`) has settled. `null` between
   * recycles. Mirrors `branchMismatchInFlight`. Tests await
   * `awaitMismatchSettled()` instead of polling on real time.
   */
  protected mismatchInFlight: Promise<void> | null = null;

  /**
   * Auth-rejection cleanup callbacks for the rename-redirect / doc-deleted
   * arms of `onAuthenticationFailed`. Pool computes `hadOpenProvider` from
   * its own entry map (the only state it can observe synchronously); the
   * React layer owns the React-state-aware cleanup (closeAndClearForRename,
   * remapTabsForRename, active-tab navigation) and emits the structured
   * `removal.cleanup` event after the awaited cleanup settles. Mirrors the
   * `setOnBranchMismatch` shape — pool stays free of React/UI knowledge.
   */
  protected onRenameRedirect: RenameRedirectHandler | null = null;
  protected onDocDeleted: ((args: { docName: string; hadOpenProvider: boolean }) => void) | null =
    null;

  /**
   * Subscribers fired when the pool evicts an entry (whether via LRU,
   * close, recycle, or dispose). The cache module subscribes to clear
   * its `Editor` / `EditorView` cache entries that hold refs to
   * `provider.document` — without this, the next mountTiptapEditor /
   * mountCmEditor call for the same docName would return a stale entry
   * bound to an orphaned Y.Doc.
   *
   * Replaces the explicit `evictTiptapEditor(docName); evictCmEditor(docName)`
   * calls that lived inline in `destroyEntry` — keeps the pool free of
   * cross-module cache knowledge.
   *
   * Subscribers fire AFTER the kind flip to 'tearing-down' but BEFORE
   * `provider.destroy()`, preserving the ordering invariant: cache
   * eviction must run before provider teardown so cached editor
   * destroy() calls operate on a still-live Y.Doc.
   */
  protected evictListeners = new Set<(docName: string) => void>();

  constructor(
    maxSize: number,
    wsUrl: string,
    options?: {
      recycleDebounceMs?: number;
      clearDataTimeoutMs?: number;
      storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
      persistenceFactory?: ClientPersistenceFactory;
      peekStoredLineageEpoch?: PeekStoredLineageEpoch;
    },
  ) {
    this.maxSize = maxSize;
    // wsUrl is REQUIRED — resolved asynchronously by `useCollabUrl()` from
    // the `ok ui` /api/config endpoint before the pool is instantiated.
    // Callers must not pass an empty string.
    this.wsUrl = wsUrl;
    this.recycleDebounceMs = options?.recycleDebounceMs ?? RECYCLE_DEBOUNCE_MS;
    this.clearDataTimeoutMs = options?.clearDataTimeoutMs ?? CLEAR_DATA_TIMEOUT_MS;
    this.persistenceFactory = options?.persistenceFactory ?? createClientPersistence;
    this.peekStoredEpoch = options?.peekStoredLineageEpoch ?? peekStoredLineageEpoch;
    if (options?.storage !== undefined) {
      this.storage = options.storage;
    } else {
      // `globalThis.localStorage` is undefined under SSR + the Bun test
      // runner; fall back to null so the pool gracefully no-ops.
      this.storage =
        typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
    }
  }

  protected abstract attachDeferredPersistence(serverInstanceId: string): void;
  protected abstract notify(): void;
  protected abstract handleServerInstanceMismatch(staleClaimedServerInstanceId: string): void;
  protected abstract evictLru(): void;
  protected abstract recycleDisconnectedEntry(docName: string): void;
  public abstract open(docName: string): PoolEntry | null;
  public abstract setActive(docName: string): void;
  public abstract recycleAllEntries(): void;
  public abstract close(docName: string): void;
  protected abstract runCloseAndClearPersistence(docName: string): Promise<void>;

  /**
   * Set the browser tab's identity (principalId + tabSessionId) after the
   * principal has been fetched from the server. New provider opens will
   * include this as a JSON `token` in the HocuspocusProvider so the server's
   * `onAuthenticate` hook can set `connection.context.principalId` for
   * correct writer attribution.
   */
  setTabIdentity(identity: { principalId: string; tabSessionId: string }): void {
    this.tabIdentity = identity;
  }

  /**
   * Update the live server instance ID observed from `/api/server-info` or CC1
   * `server-info`. Does NOT overwrite the storage-backed IDB-associated ID:
   * a fast boot fetch after server restart must not mask stale IDB contents
   * before the first document provider opens.
   *
   * On a non-null id this also (a) resolves any pending
   * `whenServerInstanceKnown()` handle and (b) retroactively attaches
   * persistence to entries opened during the cold-boot window before the
   * epoch was known. Persistence is `IndexeddbPersistence`-backed and the
   * DB-name shape `ok-ydoc:${branch}:${serverInstanceId}:${docName}`
   * carries the epoch as a structural correctness signal; opening a
   * provider before the live epoch is known means the DB cannot be
   * attached at admission time without picking the wrong epoch.
   */
  setExpectedServerInstanceId(id: string | null): void {
    this.cachedServerInstanceId = id;
    if (id === null || id.length === 0) return;
    if (this.pendingServerInstanceKnown !== null) {
      const pending = this.pendingServerInstanceKnown;
      this.pendingServerInstanceKnown = null;
      pending.resolve(id);
    }
    this.attachDeferredPersistence(id);
  }

  /**
   * Resolve once a non-null server instance ID is known to the pool.
   *
   * - Resolves immediately when `cachedServerInstanceId` is already set.
   * - Otherwise returns a single shared pending promise; subsequent calls
   *   during the same wait window share the same handle.
   * - Resolved promises are stable: a later `setExpectedServerInstanceId`
   *   with a different id does NOT re-resolve an already-returned
   *   handle. The next fresh call observes the new id.
   * - `setExpectedServerInstanceId(null)` does NOT reject pending
   *   handles — null is a transient state during mismatch recovery, and
   *   the boot/refresh fetch is expected to land the next epoch shortly
   *   after.
   */
  whenServerInstanceKnown(): Promise<string> {
    if (this.cachedServerInstanceId !== null && this.cachedServerInstanceId.length > 0) {
      return Promise.resolve(this.cachedServerInstanceId);
    }
    if (this.pendingServerInstanceKnown !== null) {
      return this.pendingServerInstanceKnown.promise;
    }
    let resolve!: (id: string) => void;
    const promise = new Promise<string>((res) => {
      resolve = res;
    });
    this.pendingServerInstanceKnown = { promise, resolve };
    return promise;
  }
}
