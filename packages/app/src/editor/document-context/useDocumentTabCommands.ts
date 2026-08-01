import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { docNameFromHash } from '@/lib/doc-hash';
import {
  addOpenTab,
  addPinnedTab,
  applyDragPinMutation,
  docNameForTabId,
  docTabId,
  filterClosableTabIds,
  filterOpenTabsForKnownTargets,
  nextActiveTabAfterCloseMany,
  normalizePinnedTabIds,
  remapOpenTabs,
  remapVisibleTabsForRename,
  removeOpenTab,
  removePinnedTab,
  tabIdForNavigationTarget,
} from '../editor-tabs';
import { MAX_POOL } from '../provider-pool';
import type { CloseTabsOptions, DocumentContextValue } from './document-context-types';
import {
  activeTabIdForTarget,
  getPool,
  hashFromTabId,
  hasOpenDocTab,
  sameTabIds,
  tabIdFromHash,
} from './runtime-helpers';
import type { useDocumentCommands } from './useDocumentCommands';
import type { useDocumentProviderState } from './useDocumentProviderState';

export function useDocumentTabCommands(
  state: ReturnType<typeof useDocumentProviderState>,
  commands: ReturnType<typeof useDocumentCommands>,
): Pick<
  DocumentContextValue,
  | 'clearTarget'
  | 'closeDocument'
  | 'closeActiveTabOrWindow'
  | 'closeTab'
  | 'pinTab'
  | 'unpinTab'
  | 'activateTab'
  | 'reorderTabs'
  | 'openNewTab'
  | 'activateNewTab'
  | 'closeNewTab'
  | 'reopenClosedTab'
  | 'closeTabs'
  | 'syncOpenTabsWithKnownTargets'
  | 'remapTabsForRename'
  | 'newTabIds'
  | 'activeNewTabId'
  | 'isNewTabActive'
  | 'closeAndClearForRename'
  | 'getPoolActiveDocName'
  | 'poolHas'
  | 'recycleDocument'
  | 'prewarm'
> {
  const {
    snapshot,
    activeTarget,
    setActiveTarget,
    activeTabId,
    setActiveTabId,
    openTabs,
    setNewTabIds,
    newTabIds,
    activeNewTabId,
    activeTabIdRef,
    isNewTabActive,
    openTabsRef,
    pinnedTabIdsRef,
    newTabIdsRef,
    visibleTabIdsRef,
    recentlyClosedTabsRef,
    collabUrl,
    commitActiveTabId,
    commitActiveNewTabId,
    commitPinnedTabIds,
    commitTabState,
    commitOpenTabs,
    updateOpenTabs,
    markTabSessionClosedDuringRestore,
  } = state;
  const {
    activateTabById,
    openNewTabById,
    closeTabById,
    closeNewTabById,
    closeActiveTabOrWindow,
    pushRecentlyClosedTabs,
  } = commands;
  return {
    clearTarget: () => {
      if (collabUrl === null) {
        setActiveTarget((current) => (current === null ? current : null));
        activeTabIdRef.current = null;
        setActiveTabId((current) => (current === null ? current : null));
        return;
      }
      const p = getPool(collabUrl);
      if (p.getActiveDocName() !== null) p.clearActive();
      setActiveTarget((current) => (current === null ? current : null));
      activeTabIdRef.current = null;
      setActiveTabId((current) => (current === null ? current : null));
    },
    closeDocument: (docName: string) => {
      if (collabUrl === null) return;
      markTabSessionClosedDuringRestore();
      const p = getPool(collabUrl);
      p.close(docName);
      updateOpenTabs((current) => removeOpenTab(current, docTabId(docName)));
      setActiveTabId((current) => {
        const next = current && docNameForTabId(current) === docName ? null : current;
        activeTabIdRef.current = next;
        return next;
      });
      setActiveTarget((current) => {
        if (!current) return current;
        return docNameForNavigationTarget(current) === docName ? null : current;
      });
    },
    closeActiveTabOrWindow,
    closeTab: closeTabById,
    pinTab: (tabId: string) => {
      const nextPinnedTabIds = addPinnedTab(pinnedTabIdsRef.current, tabId, openTabsRef.current);
      if (sameTabIds(pinnedTabIdsRef.current, nextPinnedTabIds)) return;
      commitPinnedTabIds(nextPinnedTabIds);
    },
    unpinTab: (tabId: string) => {
      const nextPinnedTabIds = removePinnedTab(pinnedTabIdsRef.current, tabId);
      if (sameTabIds(pinnedTabIdsRef.current, nextPinnedTabIds)) return;
      markTabSessionClosedDuringRestore();
      commitPinnedTabIds(nextPinnedTabIds);
    },
    activateTab: (tabId: string) => {
      activateTabById(tabId);
    },
    reorderTabs: (newOrder: readonly string[], draggedTabId: string) => {
      const openTabsSet = new Set(openTabsRef.current);
      const newTabIdsSet = new Set(newTabIdsRef.current);
      const seen = new Set<string>();
      const nextOpenTabs: string[] = [];
      const nextNewTabIds: string[] = [];
      const seedVisibleTabIds: string[] = [];
      for (const tabId of newOrder) {
        if (seen.has(tabId)) continue;
        if (openTabsSet.has(tabId)) {
          nextOpenTabs.push(tabId);
          seedVisibleTabIds.push(tabId);
          seen.add(tabId);
        } else if (newTabIdsSet.has(tabId)) {
          nextNewTabIds.push(tabId);
          seedVisibleTabIds.push(tabId);
          seen.add(tabId);
        }
      }
      for (const tabId of openTabsRef.current) {
        if (!seen.has(tabId)) {
          nextOpenTabs.push(tabId);
          seedVisibleTabIds.push(tabId);
          seen.add(tabId);
        }
      }
      for (const tabId of newTabIdsRef.current) {
        if (!seen.has(tabId)) {
          nextNewTabIds.push(tabId);
          seedVisibleTabIds.push(tabId);
          seen.add(tabId);
        }
      }
      const sameOpenOrder = sameTabIds(openTabsRef.current, nextOpenTabs);
      const sameNewOrder = sameTabIds(newTabIdsRef.current, nextNewTabIds);
      const sameVisibleOrder = sameTabIds(visibleTabIdsRef.current, seedVisibleTabIds);
      if (sameOpenOrder && sameNewOrder && sameVisibleOrder) return;
      visibleTabIdsRef.current = seedVisibleTabIds;
      if (!sameNewOrder) {
        newTabIdsRef.current = nextNewTabIds;
        setNewTabIds((current) => (sameTabIds(current, nextNewTabIds) ? current : nextNewTabIds));
      }
      const nextPinnedTabIds = applyDragPinMutation(
        nextOpenTabs,
        pinnedTabIdsRef.current,
        draggedTabId,
      );
      commitTabState(nextOpenTabs, nextPinnedTabIds);
    },
    newTabIds,
    activeNewTabId,
    isNewTabActive,
    openNewTab: openNewTabById,
    activateNewTab: (tabId: string) => {
      if (!newTabIdsRef.current.includes(tabId)) return;
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      commitActiveTabId(null);
      commitActiveNewTabId(tabId);
      if (window.location.hash !== '') {
        window.location.hash = '';
      }
    },
    closeNewTab: closeNewTabById,
    reopenClosedTab: () => {
      const stack = [...recentlyClosedTabsRef.current];
      while (stack.length > 0) {
        const tabId = stack.pop();
        if (!tabId) continue;
        if (openTabsRef.current.includes(tabId)) {
          recentlyClosedTabsRef.current = stack;
          continue;
        }
        const nextOpenTabs = addOpenTab(
          openTabsRef.current,
          tabId,
          MAX_POOL,
          pinnedTabIdsRef.current,
        );
        if (!nextOpenTabs.includes(tabId)) return;
        recentlyClosedTabsRef.current = stack;
        commitOpenTabs(nextOpenTabs);
        activateTabById(tabId);
        return;
      }
      recentlyClosedTabsRef.current = [];
    },
    closeTabs: (tabIds: readonly string[], options: CloseTabsOptions = {}) => {
      const requestedTabIds = tabIds.filter((tabId) => tabId.length > 0);
      const closingTabIds = new Set(
        options.force
          ? requestedTabIds
          : filterClosableTabIds(requestedTabIds, pinnedTabIdsRef.current),
      );
      if (closingTabIds.size === 0) return;
      markTabSessionClosedDuringRestore();
      if (!options.force) {
        pushRecentlyClosedTabs(openTabsRef.current.filter((tabId) => closingTabIds.has(tabId)));
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        const closingByDocName = new Map<string, Set<string>>();
        for (const tabId of closingTabIds) {
          const docName = docNameForTabId(tabId);
          if (!docName) continue;
          const tabsForDoc = closingByDocName.get(docName) ?? new Set<string>();
          tabsForDoc.add(tabId);
          closingByDocName.set(docName, tabsForDoc);
        }
        for (const [docName, tabsForDoc] of closingByDocName) {
          if (!hasOpenDocTab(openTabsRef.current, docName, tabsForDoc)) p.close(docName);
        }
      }

      let nextActiveTabId: string | null = null;
      const currentActiveTabId =
        activeTabId ?? activeTabIdForTarget(activeTarget, snapshot.activeDocName);
      updateOpenTabs((current) => {
        nextActiveTabId = nextActiveTabAfterCloseMany(current, currentActiveTabId, closingTabIds);
        return current.filter((tabId) => !closingTabIds.has(tabId));
      });

      if (!currentActiveTabId || !closingTabIds.has(currentActiveTabId)) {
        if (!currentActiveTabId) {
          setActiveTarget((current) => {
            if (!current) return current;
            const targetTabId = tabIdForNavigationTarget(current);
            return targetTabId && closingTabIds.has(targetTabId) ? null : current;
          });
        }
        return;
      }
      if (nextActiveTabId) {
        commitActiveTabId(nextActiveTabId);
        window.location.hash = hashFromTabId(nextActiveTabId);
        return;
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      commitActiveTabId(null);
      window.location.hash = '';
    },
    syncOpenTabsWithKnownTargets: ({ pages, folderPaths, assetPaths, filePaths }) => {
      const keepMissingDocName = activeTarget?.kind === 'missing' ? activeTarget.target : null;
      const keepHashDocName =
        typeof window !== 'undefined' ? docNameFromHash(window.location.hash) : null;
      const nextOpenTabs = filterOpenTabsForKnownTargets(openTabs, {
        pages,
        folderPaths,
        assetPaths,
        filePaths,
        keepMissingDocName,
        keepHashDocName,
      });
      if (nextOpenTabs.length === openTabs.length) return;

      const nextTabIds = new Set(nextOpenTabs);
      const staleTabIds = openTabs.filter((tabId) => !nextTabIds.has(tabId));
      const staleTabIdSet = new Set(staleTabIds);
      markTabSessionClosedDuringRestore();

      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        for (const tabId of staleTabIds) {
          const docName = docNameForTabId(tabId);
          if (docName) p.close(docName);
        }
      }

      commitOpenTabs(nextOpenTabs);

      const hashTabId = typeof window !== 'undefined' ? tabIdFromHash(window.location.hash) : null;
      const currentActiveTabId =
        activeTabId ?? activeTabIdForTarget(activeTarget, snapshot.activeDocName);
      const tabToReplace =
        hashTabId && staleTabIdSet.has(hashTabId)
          ? hashTabId
          : currentActiveTabId && staleTabIdSet.has(currentActiveTabId)
            ? currentActiveTabId
            : null;

      if (!tabToReplace) {
        setActiveTarget((current) => {
          if (!current) return current;
          const targetTabId = tabIdForNavigationTarget(current);
          return targetTabId && staleTabIdSet.has(targetTabId) ? null : current;
        });
        return;
      }

      const nextActiveTabId = nextActiveTabAfterCloseMany(openTabs, tabToReplace, staleTabIds);
      if (nextActiveTabId) {
        commitActiveTabId(nextActiveTabId);
        window.location.hash = hashFromTabId(nextActiveTabId);
        return;
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      commitActiveTabId(null);
      window.location.hash = '';
    },
    remapTabsForRename: (renamed, renamedFolders = [], renamedAssets = []) => {
      markTabSessionClosedDuringRestore();
      const next = remapOpenTabs(
        openTabsRef.current,
        renamed,
        MAX_POOL,
        renamedFolders,
        pinnedTabIdsRef.current,
        renamedAssets,
      );
      const nextPinnedTabIds = normalizePinnedTabIds(
        remapOpenTabs(
          pinnedTabIdsRef.current,
          renamed,
          Number.MAX_SAFE_INTEGER,
          renamedFolders,
          [],
          renamedAssets,
        ),
        next,
      );
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        for (const tabId of next) {
          const docName = docNameForTabId(tabId);
          if (docName) p.open(docName);
        }
      }
      visibleTabIdsRef.current = remapVisibleTabsForRename(
        visibleTabIdsRef.current,
        renamed,
        renamedFolders,
        renamedAssets,
      );
      commitTabState(next, nextPinnedTabIds);
      const currentActiveTabId = activeTabIdRef.current;
      if (currentActiveTabId) {
        const remappedActiveTabId = remapOpenTabs(
          [currentActiveTabId],
          renamed,
          1,
          renamedFolders,
          [],
          renamedAssets,
        )[0];
        if (remappedActiveTabId && next.includes(remappedActiveTabId)) {
          commitActiveTabId(remappedActiveTabId);
        }
      }
    },
    closeAndClearForRename: async (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      await p.closeAndClearPersistence(docName);
      setActiveTarget((current) => {
        if (!current) return current;
        return docNameForNavigationTarget(current) === docName ? null : current;
      });
    },
    getPoolActiveDocName: () => {
      if (collabUrl === null) return null;
      return getPool(collabUrl).getActiveDocName();
    },
    poolHas: (docName: string) => {
      if (collabUrl === null) return false;
      return getPool(collabUrl).has(docName);
    },
    recycleDocument: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.recycle(docName);
    },
    prewarm: (docName: string): string | null => {
      if (collabUrl === null) return null;
      const p = getPool(collabUrl);
      const entry = p.prewarm(docName);
      return entry?.poolEventId ?? null;
    },
  };
}
