export function openTabState(tabs, activeTabId, path) {
  const existing = tabs.find((tab) => tab.path === path);
  if (existing) {
    return { tabs, activeTabId: existing.id };
  }

  const nextTab = { id: path, path };
  return {
    tabs: [...tabs, nextTab],
    activeTabId: nextTab.id,
  };
}

export function closeTabState(tabs, activeTabId, tabId) {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) {
    return { tabs, activeTabId };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  if (!nextTabs.length) {
    return { tabs: [], activeTabId: null };
  }

  if (activeTabId !== tabId) {
    return { tabs: nextTabs, activeTabId };
  }

  const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? null;
  return {
    tabs: nextTabs,
    activeTabId: fallback?.id ?? null,
  };
}

export function renameTabState(tabs, oldPath, newPath, activeTabId) {
  const nextTabs = tabs.map((tab) => (
    tab.path === oldPath
      ? { id: newPath, path: newPath }
      : tab
  ));

  return {
    tabs: dedupeTabs(nextTabs),
    activeTabId: activeTabId === oldPath ? newPath : activeTabId,
  };
}

export function deleteTabState(tabs, deletedPath, activeTabId) {
  const matchingTab = tabs.find((tab) => tab.path === deletedPath);
  if (!matchingTab) {
    return { tabs, activeTabId };
  }

  return closeTabState(tabs, activeTabId, matchingTab.id);
}

export function replaceActiveTabState(tabs, activeTabId, nextPath) {
  const existing = tabs.find((tab) => tab.path === nextPath);
  if (existing) {
    return { tabs, activeTabId: existing.id };
  }

  if (!activeTabId) {
    return openTabState(tabs, activeTabId, nextPath);
  }

  const nextTabs = tabs.map((tab) => (
    tab.id === activeTabId
      ? { id: nextPath, path: nextPath }
      : tab
  ));

  return {
    tabs: dedupeTabs(nextTabs),
    activeTabId: nextPath,
  };
}

export function normalizeLayout(layout, isMobile, preferredSingle = 'graph') {
  if (!isMobile || layout !== 'split') return layout;
  return preferredSingle === 'editor' ? 'editor' : 'graph';
}

function dedupeTabs(tabs) {
  const seen = new Set();
  return tabs.filter((tab) => {
    if (seen.has(tab.path)) return false;
    seen.add(tab.path);
    return true;
  });
}
