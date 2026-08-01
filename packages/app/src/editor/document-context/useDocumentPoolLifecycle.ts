import { PrincipalSuccessSchema } from '@nedian0brien/synapsenote-core';
import { useEffect } from 'react';
import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { hashFromDocName } from '@/lib/doc-hash';
import { refreshServerInfo } from '@/lib/server-info-refresh';
import { getEditorForDoc } from '../active-editor';
import { captureRenameSnapshots } from '../editor-cache';
import {
  normalizePinnedTabIds,
  reconcileVisibleTabOrder,
  remapOpenTabs,
  remapVisibleTabsForRename,
  removeOpenTab,
} from '../editor-tabs';
import { MAX_POOL } from '../provider-pool';
import { __rejectSyncPromise, __test_armPendingRejection } from '../sync-promise';
import { tabSessionId } from '../tab-identity';

let principalFetchWarned = false;
function warnPrincipalFetchOnce(err: unknown): void {
  if (principalFetchWarned) return;
  principalFetchWarned = true;
  console.warn(
    '[principal-fetch] failed to resolve principal — falling back to random identity.',
    err,
  );
}

import { getPool, sameTabIds, takeSnapshot } from './runtime-helpers';

import type { useDocumentProviderState } from './useDocumentProviderState';

export function useDocumentPoolLifecycle(
  state: Pick<
    ReturnType<typeof useDocumentProviderState>,
    | 'collabUrl'
    | 'setTabIdentityResolved'
    | 'setSnapshot'
    | 'openTabsRef'
    | 'pinnedTabIdsRef'
    | 'newTabIdsRef'
    | 'visibleTabIdsRef'
    | 'setOpenTabs'
    | 'setPinnedTabIds'
    | 'setVisibleTabIds'
    | 'setActiveTarget'
    | 'setPrincipal'
  >,
) {
  const {
    collabUrl,
    setTabIdentityResolved,
    setSnapshot,
    openTabsRef,
    pinnedTabIdsRef,
    newTabIdsRef,
    visibleTabIdsRef,
    setOpenTabs,
    setPinnedTabIds,
    setVisibleTabIds,
    setActiveTarget,
    setPrincipal,
  } = state;
  useEffect(() => {
    if (collabUrl === null) return;
    let cancelled = false;
    setTabIdentityResolved(false);
    const p = getPool(collabUrl);

    // Sync initial state
    setSnapshot(takeSnapshot(p));

    function commitTabsFromPoolCallback(
      nextOpenTabs: string[],
      nextPinnedTabIds: readonly string[],
    ) {
      const normalizedPinnedTabIds = normalizePinnedTabIds(nextPinnedTabIds, nextOpenTabs);
      openTabsRef.current = nextOpenTabs;
      pinnedTabIdsRef.current = normalizedPinnedTabIds;
      setOpenTabs((current) => (sameTabIds(current, nextOpenTabs) ? current : nextOpenTabs));
      setPinnedTabIds((current) =>
        sameTabIds(current, normalizedPinnedTabIds) ? current : normalizedPinnedTabIds,
      );
      const nextVisibleTabIds = reconcileVisibleTabOrder(
        visibleTabIdsRef.current,
        nextOpenTabs,
        newTabIdsRef.current,
      );
      visibleTabIdsRef.current = nextVisibleTabIds;
      setVisibleTabIds((current) =>
        sameTabIds(current, nextVisibleTabIds) ? current : nextVisibleTabIds,
      );
    }

    // Late-join branch backstop. Auth-token `expectedBranch` claim
    // mismatch (server is on branch B, client claims branch A) routes
    // through the same handleBranchSwitched flow as the live CC1
    // broadcast. The fresh branch comes from /api/server-info — the
    // pool's lastObservedBranch is stale by definition (it's what the
    // failed claim was built from).
    //
    // Returning the promise (not `void`) is load-bearing: the pool's
    // in-flight gate awaits whatever the callback returns. A
    // `void`-fronted fetch resolves the gate on the next microtask
    // while the recovery is still in flight, so cross-turn mismatches
    // (N providers, N RTTs) re-fire the dispatch and double-recycle.
    p.setOnBranchMismatch(() => refreshServerInfo(p));

    // Auth-rejection cleanup arms. The pool fires these synchronously from
    // its authenticationFailed handler; we own the React-state-aware
    // cleanup (close + IDB clear via the pool, tab remap, active-tab
    // navigation, and the structured `removal.cleanup` event). Mirrors
    // the FileTree.tsx sidebar precedents (`applyRenamedDocuments` for
    // rename, `handleDelete` for delete) so a server-driven removal lands
    // through the same code shape as a sidebar-driven one.
    p.setOnRenameRedirect(({ fromDocName, toDocName, hadOpenProvider }) => {
      // Fire-and-forget: the pool's auth-failed callback is sync; the
      // React-state-aware cleanup is async. The catch surfaces failures
      // explicitly (the void IIFE would otherwise route them to the
      // window's unhandledrejection handler). The catch arm is also
      // load-bearing for React Compiler — `try/finally` without `catch`
      // is unsupported by `BuildHIR::lowerStatement`.
      void (async () => {
        let cleanupError: unknown;
        // Capture before close — closeAndClearPersistence clears the pool's
        // active slot when its argument is the active doc, so we can't read
        // this signal after the fact.
        const wasActive = p.getActiveDocName() === fromDocName;
        captureRenameSnapshots([{ fromDocName, toDocName }]);
        try {
          await Promise.all([
            p.closeAndClearPersistence(fromDocName),
            p.closeAndClearPersistence(toDocName),
          ]);
          // Open a fresh provider so the editor hydrates the new doc.
          // The hash below already points at toDocName, so a file-tree
          // re-click can't recover via `hashchange` if we skip this.
          if (wasActive) {
            p.open(toDocName);
            p.setActive(toDocName);
          }
          const nextOpenTabs = remapOpenTabs(
            openTabsRef.current,
            [{ fromDocName, toDocName }],
            MAX_POOL,
            [],
            pinnedTabIdsRef.current,
          );
          const nextPinnedTabIds = normalizePinnedTabIds(
            remapOpenTabs(
              pinnedTabIdsRef.current,
              [{ fromDocName, toDocName }],
              Number.MAX_SAFE_INTEGER,
            ),
            nextOpenTabs,
          );
          visibleTabIdsRef.current = remapVisibleTabsForRename(visibleTabIdsRef.current, [
            { fromDocName, toDocName },
          ]);
          commitTabsFromPoolCallback(nextOpenTabs, nextPinnedTabIds);
          setActiveTarget((current) => {
            if (!current) return current;
            const currentDocName = docNameForNavigationTarget(current);
            if (currentDocName === fromDocName) {
              return { kind: 'doc', target: toDocName, docName: toDocName };
            }
            return current;
          });
          if (wasActive) {
            window.location.hash = hashFromDocName(toDocName);
          }
        } catch (err) {
          cleanupError = err;
          console.warn(
            JSON.stringify({
              event: 'removal-cleanup-error',
              kind: 'renamed',
              fromDocName,
              toDocName,
              message: String(err instanceof Error ? err.message : err),
            }),
          );
        }
        console.info(
          JSON.stringify({
            event: 'removal.cleanup',
            kind: 'renamed',
            fromDocName,
            toDocName,
            hadOpenProvider,
            hadStaleIdb: !hadOpenProvider,
            source: 'auth-rejection',
            errored: cleanupError !== undefined,
          }),
        );
      })();
    });
    p.setOnDocDeleted(({ docName, hadOpenProvider }) => {
      // See comment above; same React Compiler constraint applies.
      void (async () => {
        let cleanupError: unknown;
        try {
          await p.closeAndClearPersistence(docName);
          const nextOpenTabs = removeOpenTab(openTabsRef.current, docName);
          commitTabsFromPoolCallback(nextOpenTabs, pinnedTabIdsRef.current);
          setActiveTarget((current) => {
            if (!current) return current;
            return docNameForNavigationTarget(current) === docName ? null : current;
          });
          if (p.getActiveDocName() === docName) {
            window.location.hash = '';
          }
        } catch (err) {
          cleanupError = err;
          console.warn(
            JSON.stringify({
              event: 'removal-cleanup-error',
              kind: 'deleted',
              docName,
              message: String(err instanceof Error ? err.message : err),
            }),
          );
        }
        console.info(
          JSON.stringify({
            event: 'removal.cleanup',
            kind: 'deleted',
            fromDocName: docName,
            hadOpenProvider,
            hadStaleIdb: !hadOpenProvider,
            source: 'auth-rejection',
            errored: cleanupError !== undefined,
          }),
        );
      })();
    });

    // Subscribe to pool changes
    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    // Fetch principal and wire tab identity so HocuspocusProvider includes
    // {principalId, tabSessionId} in its auth token. The server's
    // onAuthenticate hook reads this to set connection.context.principalId for
    // correct writer attribution. Also lifts the resolved principal into React
    // state so TiptapEditor can prefer real names over random animal fallbacks.
    // Silent on failure — pool uses anonymous token; presence falls back to random.
    fetch('/api/principal')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        if (cancelled) return;
        const parsed = PrincipalSuccessSchema.safeParse(json);
        if (parsed.success) {
          p.setTabIdentity({ principalId: parsed.data.id, tabSessionId });
          setPrincipal(parsed.data);
        } else {
          warnPrincipalFetchOnce(parsed.error);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        warnPrincipalFetchOnce(err);
      })
      .finally(() => {
        if (!cancelled) setTabIdentityResolved(true);
      });

    // CRDT server-restart recovery boot fetch: pull the server's
    // per-process instance ID, current git branch, and per-doc
    // disk-ack watermarks at startup, dispatch them all into the
    // pool. Subsequent provider opens claim the instance ID + branch
    // in their auth tokens so server-side enforcement can reject a
    // stale-client reconnect before Yjs sync merges ghost state. The
    // disk-ack batch refreshes per-entry `lastDiskAckedSV` so the
    // mismatch-recycle baseline-selection always operates on fresh
    // data (closes the missed-frame staleness gap that CC1 stateless
    // broadcasts otherwise leave open).
    //
    // SystemDocSubscriber re-fires this on every `__system__` reconnect
    // — same helper, same dispatch — so a brief WS drop doesn't leave
    // any of the three watermarks permanently stale.
    void refreshServerInfo(p);

    // systemProvider exposure happens in a dedicated effect below because it
    // depends on `systemProvider` state, not `collabUrl`.
    // Expose pool + test hooks on window for Playwright E2E access. Gated on
    // `import.meta.env.DEV` so production bundles don't ship a sync-promise
    // rejection trigger or a WebSocket close primitive — both useful for E2E,
    // both unsafe to leave callable from arbitrary page-context script
    // (extensions, bookmarklets, future embed consumers). Vite replaces this
    // statically at build time, so the entire branch tree-shakes out of the
    // production bundle. Mirrors the dev-only pattern already used in
    // `editor/extensions/slash-command.ts`.
    if (import.meta.env.DEV) {
      window.__providerPool = p;
      Object.defineProperty(window, '__activeProvider', {
        get: () => p.getActive()?.provider ?? null,
        configurable: true,
      });
      // Mirror of `__activeProvider` for the registered Editor instance.
      // Resolving via `getActive()?.docName` keeps the getter consistent with
      // `__activeProvider`'s active-entry semantics even when multiple editors
      // are mounted concurrently (EditorActivityPool's ACTIVITY_MOUNT_LIMIT).
      // Playwright reads this to poll PM `editor.state.selection` directly.
      // see precedent §20(a) category C.
      Object.defineProperty(window, '__activeEditor', {
        get: () => {
          const active = p.getActive();
          if (!active) return null;
          return getEditorForDoc(active.docName);
        },
        configurable: true,
      });
      window.__test_rejectSyncPromise = (docName, kind) => __rejectSyncPromise(docName, kind);
      window.__test_armPendingRejection = (docName, kind) =>
        __test_armPendingRejection(docName, kind);
      window.__test_closeActiveWebSocket = () => {
        const provider = p.getActive()?.provider;
        if (!provider) return false;
        // HocuspocusProvider wraps y-websocket internally; reach for the live WS
        // via the typed fields we can see, falling back to any-cast for the
        // nested websocketProvider (not in the provider's public TS surface).
        const cfg = provider.configuration as unknown as {
          websocketProvider?: { webSocket?: { close?: () => void } };
        };
        const ws = cfg.websocketProvider?.webSocket;
        if (ws && typeof ws.close === 'function') {
          ws.close();
          return true;
        }
        return false;
      };
    }

    return () => {
      cancelled = true;
      p.setOnChange(null);
      p.setOnRenameRedirect(null);
      p.setOnDocDeleted(null);
    };
  }, [
    collabUrl,
    visibleTabIdsRef.current,
    visibleTabIdsRef,
    setVisibleTabIds,
    setTabIdentityResolved, // Sync initial state
    setSnapshot,
    setPrincipal,
    setActiveTarget,
    setPinnedTabIds,
    pinnedTabIdsRef.current,
    newTabIdsRef.current,
    pinnedTabIdsRef,
    setOpenTabs,
    openTabsRef.current,
    openTabsRef,
  ]);
}
