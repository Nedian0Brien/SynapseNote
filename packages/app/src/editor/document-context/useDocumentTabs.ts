import { use } from 'react';
import { DocumentContext } from './context';
import type { DocumentContextValue } from './document-context-types';

export type DocumentTabs = Pick<
  DocumentContextValue,
  | 'activeTabId'
  | 'openTabs'
  | 'pinnedTabIds'
  | 'visibleTabIds'
  | 'tabSessionLoaded'
  | 'newTabIds'
  | 'activeNewTabId'
  | 'isNewTabActive'
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
>;

/** Tab-strip contract kept separate from document navigation and providers. */
export function useDocumentTabs(): DocumentTabs {
  const context = use(DocumentContext);
  if (!context) throw new Error('useDocumentTabs must be used within <DocumentProvider />');
  return {
    activeTabId: context.activeTabId,
    openTabs: context.openTabs,
    pinnedTabIds: context.pinnedTabIds,
    visibleTabIds: context.visibleTabIds,
    tabSessionLoaded: context.tabSessionLoaded,
    newTabIds: context.newTabIds,
    activeNewTabId: context.activeNewTabId,
    isNewTabActive: context.isNewTabActive,
    closeDocument: context.closeDocument,
    closeActiveTabOrWindow: context.closeActiveTabOrWindow,
    closeTab: context.closeTab,
    pinTab: context.pinTab,
    unpinTab: context.unpinTab,
    activateTab: context.activateTab,
    reorderTabs: context.reorderTabs,
    openNewTab: context.openNewTab,
    activateNewTab: context.activateNewTab,
    closeNewTab: context.closeNewTab,
    reopenClosedTab: context.reopenClosedTab,
    closeTabs: context.closeTabs,
    syncOpenTabsWithKnownTargets: context.syncOpenTabsWithKnownTargets,
    remapTabsForRename: context.remapTabsForRename,
  };
}
