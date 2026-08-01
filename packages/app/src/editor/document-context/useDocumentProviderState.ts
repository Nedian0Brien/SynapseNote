import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Principal } from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { docNameFromHash } from '@/lib/doc-hash';
import { useCollabUrl } from '@/lib/use-collab-url';
import {
  addOpenTab,
  createEditorTabSessionState,
  docNameForTabId,
  docTabId,
  normalizePinnedTabIds,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  reconcileVisibleTabOrder,
  writeLocalTabSessionState,
} from '../editor-tabs';
import { MAX_POOL } from '../provider-pool';
import { useDocumentPoolLifecycle } from './useDocumentPoolLifecycle';

let principalFetchWarned = false;

export function resetPrincipalFetchWarning(): void {
  principalFetchWarned = false;
}

function _warnPrincipalFetchOnce(err: unknown): void {
  if (principalFetchWarned) return;
  principalFetchWarned = true;
  console.warn(
    '[principal-fetch] failed to resolve principal — falling back to random identity.',
    err,
  );
}

import {
  activeTabIdForTarget,
  EMPTY_SNAPSHOT,
  getDesktopBridge,
  getLocalTabSessionKey,
  getPool,
  hashFromTabId,
  isBareHashForExtensionQualifiedActiveDoc,
  readInitialLocalActiveTabId,
  readInitialLocalPinnedTabIds,
  readInitialLocalTabs,
  type Snapshot,
  sameTabIds,
} from './runtime-helpers';

export function useDocumentProviderState() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [activeTarget, setActiveTarget] = useState<ResolvedNavigationTarget | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(readInitialLocalActiveTabId);
  const [openTabs, setOpenTabs] = useState<string[]>(readInitialLocalTabs);
  const [pinnedTabIds, setPinnedTabIds] = useState(readInitialLocalPinnedTabIds);
  const [newTabIds, setNewTabIds] = useState<string[]>([]);
  const [visibleTabIds, setVisibleTabIds] = useState<string[]>(openTabs);
  const [activeNewTabId, setActiveNewTabId] = useState<string | null>(null);
  const [tabSessionLoaded, setTabSessionLoaded] = useState(false);
  const activeTabIdRef = useRef<string | null>(activeTabId);
  const openTabsRef = useRef<string[]>(openTabs);
  const pinnedTabIdsRef = useRef(pinnedTabIds);
  const activeNewTabIdRef = useRef<string | null>(activeNewTabId);
  const newTabIdsRef = useRef<string[]>(newTabIds);
  const visibleTabIdsRef = useRef<string[]>(visibleTabIds);
  const nextNewTabOrdinalRef = useRef(1);
  const recentlyClosedTabsRef = useRef<string[]>([]);
  const tabSessionUserClosedRef = useRef(false);
  const [tabIdentityResolved, setTabIdentityResolved] = useState(false);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [systemProvider, setSystemProvider] = useState<HocuspocusProvider | null>(null);
  const [docPanelMode, setDocPanelModeState] = useState<'doc' | 'agent'>('doc');
  const [docPanelAgentId, setDocPanelAgentId] = useState<string | null>(null);
  const [docPanelExpandSignal, setDocPanelExpandSignal] = useState<number>(0);
  const {
    collabUrl,
    terminal: collabTerminal,
    lastError: collabLastError,
    retry: retryCollab,
  } = useCollabUrl();

  function commitActiveTabId(nextActiveTabId: string | null) {
    activeTabIdRef.current = nextActiveTabId;
    setActiveTabId(nextActiveTabId);
  }

  function commitActiveNewTabId(nextActiveNewTabId: string | null) {
    activeNewTabIdRef.current = nextActiveNewTabId;
    setActiveNewTabId(nextActiveNewTabId);
  }

  function commitVisibleTabIds(nextVisibleTabIds: string[]) {
    visibleTabIdsRef.current = nextVisibleTabIds;
    setVisibleTabIds((current) =>
      sameTabIds(current, nextVisibleTabIds) ? current : nextVisibleTabIds,
    );
  }

  function commitPinnedTabIds(nextPinnedTabIds: string[]) {
    pinnedTabIdsRef.current = nextPinnedTabIds;
    setPinnedTabIds((current) =>
      sameTabIds(current, nextPinnedTabIds) ? current : nextPinnedTabIds,
    );
  }

  function commitTabState(nextOpenTabs: string[], nextPinnedTabIds: readonly string[]) {
    const normalizedPinnedTabIds = normalizePinnedTabIds(nextPinnedTabIds, nextOpenTabs);
    openTabsRef.current = nextOpenTabs;
    pinnedTabIdsRef.current = normalizedPinnedTabIds;
    setOpenTabs((current) => (sameTabIds(current, nextOpenTabs) ? current : nextOpenTabs));
    setPinnedTabIds((current) =>
      sameTabIds(current, normalizedPinnedTabIds) ? current : normalizedPinnedTabIds,
    );
    commitVisibleTabIds(
      reconcileVisibleTabOrder(visibleTabIdsRef.current, nextOpenTabs, newTabIdsRef.current),
    );
  }

  function commitOpenTabs(nextOpenTabs: string[]) {
    commitTabState(nextOpenTabs, pinnedTabIdsRef.current);
  }

  function updateOpenTabs(updater: (current: string[]) => string[]) {
    commitOpenTabs(updater(openTabsRef.current));
  }

  function commitNewTabIds(nextNewTabIds: string[]) {
    newTabIdsRef.current = nextNewTabIds;
    setNewTabIds((current) => (sameTabIds(current, nextNewTabIds) ? current : nextNewTabIds));
    commitVisibleTabIds(
      reconcileVisibleTabOrder(visibleTabIdsRef.current, openTabsRef.current, nextNewTabIds),
    );
  }

  function removeActiveNewTab(replacementTabId?: string | null) {
    const activeBlankTabId = activeNewTabIdRef.current;
    if (!activeBlankTabId) return;
    const nextNewTabIds = newTabIdsRef.current.filter((tabId) => tabId !== activeBlankTabId);
    newTabIdsRef.current = nextNewTabIds;
    setNewTabIds((current) => (sameTabIds(current, nextNewTabIds) ? current : nextNewTabIds));
    commitActiveNewTabId(null);

    const orderWithReplacement: string[] = [];
    const seen = new Set<string>();
    for (const tabId of visibleTabIdsRef.current) {
      const nextTabId = tabId === activeBlankTabId ? replacementTabId : tabId;
      if (!nextTabId || seen.has(nextTabId)) continue;
      seen.add(nextTabId);
      orderWithReplacement.push(nextTabId);
    }
    commitVisibleTabIds(
      reconcileVisibleTabOrder(orderWithReplacement, openTabsRef.current, nextNewTabIds),
    );
  }

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    pinnedTabIdsRef.current = pinnedTabIds;
  }, [pinnedTabIds]);

  useEffect(() => {
    activeNewTabIdRef.current = activeNewTabId;
  }, [activeNewTabId]);

  useEffect(() => {
    newTabIdsRef.current = newTabIds;
  }, [newTabIds]);

  useEffect(() => {
    visibleTabIdsRef.current = visibleTabIds;
  }, [visibleTabIds]);

  const isNewTabActive = activeNewTabId !== null;

  useEffect(() => {
    if (collabUrl === null || tabSessionLoaded || !tabIdentityResolved) return;
    let cancelled = false;
    const bridge = getDesktopBridge();
    const localKey = getLocalTabSessionKey();
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    const loaded = bridge
      ? bridge.project.getSessionState()
      : Promise.resolve(
          localKey
            ? readLocalTabSessionState(storage, localKey, MAX_POOL)
            : {
                openTabs: [],
                pinnedTabIds: [],
                activeDocName: null,
                activeTabId: null,
                updatedAt: null,
              },
        );

    loaded
      .then((raw) => {
        if (cancelled) return;
        const state = parseEditorTabSessionState(raw, MAX_POOL);
        if (tabSessionUserClosedRef.current) return;
        const p = getPool(collabUrl);
        for (const tabId of state.openTabs) {
          const docName = docNameForTabId(tabId);
          if (docName) p.open(docName);
        }
        const mergedPinnedTabIds = [...state.pinnedTabIds, ...pinnedTabIdsRef.current];
        let nextTabs = state.openTabs;
        for (const tabId of openTabsRef.current) {
          nextTabs = addOpenTab(nextTabs, tabId, MAX_POOL, mergedPinnedTabIds);
        }
        const normalizedPinnedTabIds = normalizePinnedTabIds(mergedPinnedTabIds, nextTabs);
        openTabsRef.current = nextTabs;
        pinnedTabIdsRef.current = normalizedPinnedTabIds;
        setOpenTabs((current) => (sameTabIds(current, nextTabs) ? current : nextTabs));
        setPinnedTabIds((current) =>
          sameTabIds(current, normalizedPinnedTabIds) ? current : normalizedPinnedTabIds,
        );
        const visibleOrderSeed = state.openTabs.length > 0 ? nextTabs : visibleTabIdsRef.current;
        const nextVisibleTabIds = reconcileVisibleTabOrder(
          visibleOrderSeed,
          nextTabs,
          newTabIdsRef.current,
        );
        visibleTabIdsRef.current = nextVisibleTabIds;
        setVisibleTabIds((current) =>
          sameTabIds(current, nextVisibleTabIds) ? current : nextVisibleTabIds,
        );
        const currentHashDoc = docNameFromHash(window.location.hash);
        const restoredActive =
          state.activeTabId ??
          (state.activeDocName ? docTabId(state.activeDocName) : null) ??
          state.openTabs[0] ??
          null;
        const restoredActiveHash = restoredActive ? hashFromTabId(restoredActive) : null;
        const restoredActiveDocName = restoredActive ? docNameForTabId(restoredActive) : null;
        const shouldRestoreActive =
          (currentHashDoc === null && window.location.hash.length === 0) ||
          (restoredActiveHash !== null && restoredActiveHash === window.location.hash) ||
          isBareHashForExtensionQualifiedActiveDoc(
            currentHashDoc,
            window.location.hash,
            restoredActiveDocName,
          );
        if (shouldRestoreActive && restoredActive) {
          activeTabIdRef.current = restoredActive;
          setActiveTabId(restoredActive);
          const nextHash = hashFromTabId(restoredActive);
          if (window.location.hash !== nextHash) window.location.hash = nextHash;
        }
      })
      .catch((err: unknown) => {
        console.warn('[editor-tabs] failed to restore tab session:', err);
      })
      .finally(() => {
        if (!cancelled) setTabSessionLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [collabUrl, tabIdentityResolved, tabSessionLoaded]);

  useEffect(() => {
    if (!tabSessionLoaded) return;
    const state = createEditorTabSessionState(
      openTabs,
      activeTabId ?? activeTabIdForTarget(activeTarget, snapshot.activeDocName),
      pinnedTabIds,
    );
    const bridge = getDesktopBridge();
    if (bridge) {
      void bridge.project.setSessionState(state).catch((err: unknown) => {
        console.warn('[editor-tabs] failed to persist tab session:', err);
      });
      return;
    }
    const localKey = getLocalTabSessionKey();
    if (!localKey) return;
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    writeLocalTabSessionState(storage, localKey, state);
  }, [activeTabId, activeTarget, openTabs, pinnedTabIds, snapshot.activeDocName, tabSessionLoaded]);
  function markTabSessionClosedDuringRestore() {
    if (!tabSessionLoaded) tabSessionUserClosedRef.current = true;
  }

  useDocumentPoolLifecycle({
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
  });

  return {
    snapshot,
    setSnapshot,
    activeTarget,
    setActiveTarget,
    activeTabId,
    setActiveTabId,
    openTabs,
    setOpenTabs,
    pinnedTabIds,
    setPinnedTabIds,
    newTabIds,
    setNewTabIds,
    visibleTabIds,
    setVisibleTabIds,
    activeNewTabId,
    setActiveNewTabId,
    tabSessionLoaded,
    setTabSessionLoaded,
    activeTabIdRef,
    openTabsRef,
    pinnedTabIdsRef,
    activeNewTabIdRef,
    newTabIdsRef,
    visibleTabIdsRef,
    nextNewTabOrdinalRef,
    recentlyClosedTabsRef,
    tabSessionUserClosedRef,
    tabIdentityResolved,
    setTabIdentityResolved,
    principal,
    setPrincipal,
    systemProvider,
    setSystemProvider,
    docPanelMode,
    setDocPanelModeState,
    docPanelAgentId,
    setDocPanelAgentId,
    docPanelExpandSignal,
    setDocPanelExpandSignal,
    collabUrl,
    collabTerminal,
    collabLastError,
    retryCollab,
    isNewTabActive,
    commitActiveTabId,
    commitActiveNewTabId,
    commitVisibleTabIds,
    commitPinnedTabIds,
    commitTabState,
    commitOpenTabs,
    updateOpenTabs,
    commitNewTabIds,
    removeActiveNewTab,
    markTabSessionClosedDuringRestore,
  };
}
