import { useEffect } from 'react';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { consumePrewarmClick } from '@/components/prewarm-correlation';
import {
  hashFromAssetPath,
  hashFromDocName,
  hashFromFolderPath,
  hashFromSkillFile,
} from '@/lib/doc-hash';
import { mark } from '@/lib/perf';
import {
  addOpenTab,
  docNameForTabId,
  docTabId,
  nextActiveTabAfterClose,
  openDocTab,
  openTab,
  parseEditorTabId,
  removeOpenTab,
  tabIdForNavigationTarget,
} from '../editor-tabs';
import { MAX_POOL } from '../provider-pool';

import type { OpenTargetOptions } from './document-context-types';

let principalFetchWarned = false;
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
  assetTargetForPath,
  getDesktopBridge,
  getPool,
  hashFromTabId,
  hasOpenDocTab,
  sameNavigationTarget,
} from './runtime-helpers';

import type { useDocumentProviderState } from './useDocumentProviderState';

export function useDocumentCommands(state: ReturnType<typeof useDocumentProviderState>) {
  const {
    snapshot,
    setActiveTarget,
    activeTabId,
    activeTarget,
    collabUrl,
    activeTabIdRef,
    openTabsRef,
    pinnedTabIdsRef,
    activeNewTabIdRef,
    newTabIdsRef,
    visibleTabIdsRef,
    nextNewTabOrdinalRef,
    recentlyClosedTabsRef,
    commitActiveTabId,
    commitActiveNewTabId,
    commitOpenTabs,
    updateOpenTabs,
    commitNewTabIds,
    removeActiveNewTab,
    markTabSessionClosedDuringRestore,
  } = state;
  const openDocument = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    if (collabUrl === null) return;
    const p = getPool(collabUrl);
    const entry = p.open(docName);
    if (!entry) return; // reserved doc (e.g. __system__) — pool refused admission
    consumePrewarmClick(docName, entry.poolEventId);
    const nextTabId = docTabId(docName);
    updateOpenTabs((current) => addOpenTab(current, nextTabId, MAX_POOL, pinnedTabIdsRef.current));
    removeActiveNewTab(nextTabId);
    commitActiveTabId(nextTabId);
    p.setActive(docName);
    setActiveTarget({ kind: 'doc', target: docName, docName });
  };
  const openDocumentTransition = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    openDocument(docName);
  };

  const openTargetWithOptions = (
    target: ResolvedNavigationTarget,
    options: OpenTargetOptions = {},
  ) => {
    if (collabUrl === null) return;
    if (options.tabBehavior === 'replace-active') {
      markTabSessionClosedDuringRestore();
    }
    const p = getPool(collabUrl);
    const docName = docNameForNavigationTarget(target);
    const activeBlankTabId = activeNewTabIdRef.current;
    const replacingBlankTab = activeBlankTabId !== null && options.tabBehavior === 'replace-active';
    const currentActiveTabId = activeBlankTabId
      ? null
      : (activeTabIdRef.current ?? activeTabIdForTarget(activeTarget, snapshot.activeDocName));
    const hasCurrentActiveTab =
      currentActiveTabId !== null && openTabsRef.current.includes(currentActiveTabId);
    const currentActiveTabIsPinned =
      currentActiveTabId !== null && pinnedTabIdsRef.current.includes(currentActiveTabId);
    const behavior =
      options.tabBehavior === 'replace-active' && currentActiveTabIsPinned
        ? 'append'
        : options.tabBehavior === 'replace-active' && !replacingBlankTab && !hasCurrentActiveTab
          ? 'append'
          : (options.tabBehavior ?? 'append');
    if (docName && target.kind !== 'large-file') {
      const entry = p.open(docName);
      if (!entry) return;
      consumePrewarmClick(docName, entry.poolEventId);
      const opened = openDocTab(openTabsRef.current, docName, {
        behavior,
        currentTabId: currentActiveTabId,
        limit: MAX_POOL,
        pinnedTabIds: pinnedTabIdsRef.current,
      });
      commitOpenTabs(opened.tabs);
      removeActiveNewTab(opened.activeTabId);
      commitActiveTabId(opened.activeTabId);
      p.setActive(docName);
    } else {
      p.clearActive();
      const nextTabId = tabIdForNavigationTarget(target);
      if (nextTabId) {
        const opened = openTab(openTabsRef.current, nextTabId, {
          behavior,
          currentTabId: currentActiveTabId,
          limit: MAX_POOL,
          pinnedTabIds: pinnedTabIdsRef.current,
        });
        commitOpenTabs(opened.tabs);
        commitActiveTabId(opened.activeTabId);
        removeActiveNewTab(opened.activeTabId);
      } else {
        removeActiveNewTab(nextTabId);
      }
    }
    setActiveTarget((current) => (sameNavigationTarget(current, target) ? current : target));
  };
  const openTarget = (target: ResolvedNavigationTarget, options: OpenTargetOptions = {}) => {
    openTargetWithOptions(target, options);
  };
  const openTargetTransition = (
    target: ResolvedNavigationTarget,
    options: OpenTargetOptions = {},
  ) => {
    const docName = docNameForNavigationTarget(target);
    mark('ok/nav/open-target', { docName, kind: target.kind, transition: false });
    openTargetWithOptions(target, options);
  };

  function pushRecentlyClosedTabs(tabIds: readonly string[]) {
    if (tabIds.length === 0) return;
    recentlyClosedTabsRef.current = [...recentlyClosedTabsRef.current, ...tabIds].slice(-50);
  }

  const activateTabById = (tabId: string) => {
    const tab = parseEditorTabId(tabId);
    commitActiveNewTabId(null);
    commitActiveTabId(tabId);
    if (tab.kind === 'doc') {
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        const entry = p.open(tab.docName);
        if (!entry) return;
        p.setActive(tab.docName);
      }
      setActiveTarget({ kind: 'doc', target: tab.docName, docName: tab.docName });
      const nextHash = hashFromDocName(tab.docName);
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      return;
    }
    if (collabUrl !== null) {
      const p = getPool(collabUrl);
      p.clearActive();
    }
    if (tab.kind === 'asset') {
      setActiveTarget(assetTargetForPath(tab.assetPath));
      const nextHash = hashFromAssetPath(tab.assetPath);
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      return;
    }
    if (tab.kind === 'skill-file') {
      setActiveTarget({
        kind: 'skill-file',
        target: `${tab.scope}/${tab.name}/${tab.path}`,
        scope: tab.scope,
        name: tab.name,
        path: tab.path,
      });
      const nextHash = hashFromSkillFile({ scope: tab.scope, name: tab.name, path: tab.path });
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      return;
    }
    setActiveTarget({ kind: 'folder', target: tab.folderPath, folderPath: tab.folderPath });
    const nextHash = hashFromFolderPath(tab.folderPath);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  };

  const openNewTabById = () => {
    const nextNewTabId = `new-tab:${nextNewTabOrdinalRef.current}`;
    nextNewTabOrdinalRef.current += 1;
    commitNewTabIds([...newTabIdsRef.current, nextNewTabId]);
    commitActiveNewTabId(nextNewTabId);
    if (collabUrl !== null) {
      const p = getPool(collabUrl);
      p.clearActive();
    }
    setActiveTarget(null);
    commitActiveTabId(null);
    if (window.location.hash !== '') {
      window.location.hash = '';
    }
  };

  const closeTabById = (tabId: string) => {
    if (pinnedTabIdsRef.current.includes(tabId)) return;
    if (!openTabsRef.current.includes(tabId)) return;
    markTabSessionClosedDuringRestore();
    let nextActiveTabId: string | null = null;
    const closingDocName = docNameForTabId(tabId);
    pushRecentlyClosedTabs([tabId]);
    if (collabUrl !== null) {
      const p = getPool(collabUrl);
      if (closingDocName && !hasOpenDocTab(openTabsRef.current, closingDocName, new Set([tabId]))) {
        p.close(closingDocName);
      }
    }
    const currentActiveTabId =
      activeTabId ?? activeTabIdForTarget(activeTarget, snapshot.activeDocName);
    updateOpenTabs((current) => {
      nextActiveTabId = nextActiveTabAfterClose(current, currentActiveTabId, tabId);
      return removeOpenTab(current, tabId);
    });
    if (currentActiveTabId !== tabId) return;
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
  };

  const closeNewTabById = (tabId: string) => {
    markTabSessionClosedDuringRestore();
    const currentNewTabIds = newTabIdsRef.current;
    if (!currentNewTabIds.includes(tabId)) return;
    const nextNewTabIds = currentNewTabIds.filter((id) => id !== tabId);
    commitNewTabIds(nextNewTabIds);
    if (activeNewTabIdRef.current !== tabId) return;

    const closedIndex = currentNewTabIds.indexOf(tabId);
    const nextNewTabId = nextNewTabIds[closedIndex] ?? nextNewTabIds[closedIndex - 1] ?? null;
    if (nextNewTabId) {
      commitActiveNewTabId(nextNewTabId);
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      commitActiveTabId(null);
      if (window.location.hash !== '') {
        window.location.hash = '';
      }
      return;
    }

    commitActiveNewTabId(null);
    const nextActiveTabId = openTabsRef.current[openTabsRef.current.length - 1] ?? null;
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
  };

  const closeActiveTabOrWindow = (): boolean => {
    const activeNewTab = activeNewTabIdRef.current;
    if (activeNewTab) {
      closeNewTabById(activeNewTab);
      return true;
    }

    const pinnedTabSet = new Set(pinnedTabIdsRef.current);
    const openTabSet = new Set(openTabsRef.current.filter((id) => !pinnedTabSet.has(id)));
    const activeOpenTab =
      activeTabIdRef.current && openTabSet.has(activeTabIdRef.current)
        ? activeTabIdRef.current
        : null;
    const targetTabId = activeOpenTab ?? visibleTabIdsRef.current.find((id) => openTabSet.has(id));
    if (targetTabId) {
      closeTabById(targetTabId);
      return true;
    }

    const newTabSet = new Set(newTabIdsRef.current);
    const targetNewTabId = visibleTabIdsRef.current.find((id) => newTabSet.has(id));
    if (targetNewTabId) {
      closeNewTabById(targetNewTabId);
      return true;
    }

    return false;
  };

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onMenuAction((action) => {
      if (action !== 'close-active-tab-or-window') return;
      if (!closeActiveTabOrWindow()) window.close();
    });
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: the desktop callback deliberately re-subscribes with the current closure.
    closeActiveTabOrWindow,
  ]);

  return {
    openDocument,
    openDocumentTransition,
    openTarget,
    openTargetTransition,
    activateTabById,
    openNewTabById,
    closeTabById,
    closeNewTabById,
    closeActiveTabOrWindow,
    pushRecentlyClosedTabs,
  };
}
