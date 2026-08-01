import { useLingui } from '@lingui/react/macro';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { useDocumentTabs } from '@/editor/document-context/useDocumentTabs';
import { tabIdForNavigationTarget } from '@/editor/editor-tabs';
import { EditorTabStrip } from './editor-tabs/EditorTabStrip';
import { createEditorTabModel } from './editor-tabs/editor-tab-model';
import { useEditorTabKeyboardShortcuts } from './editor-tabs/useEditorTabKeyboardShortcuts';
import { useEditorTabRename } from './editor-tabs/useEditorTabRename';
import { usePageList } from './PageListContext';

/** Context facade: compose scoped document contracts without owning tab behavior. */
export function EditorTabs() {
  const {
    activeDocName,
    activeTabId: activeContextTabId,
    activeNewTabId,
    activeTarget,
    isNewTabActive,
  } = useDocumentNavigation();
  const {
    activateTab,
    activateNewTab,
    closeNewTab,
    closeTab,
    closeTabs,
    newTabIds,
    openNewTab,
    openTabs,
    pinTab,
    pinnedTabIds,
    reopenClosedTab,
    remapTabsForRename,
    reorderTabs,
    unpinTab,
    visibleTabIds,
  } = useDocumentTabs();
  const { closeAndClearForRename, getPoolActiveDocName, poolHas } = useDocumentCollaboration();
  const { pageMeta } = usePageList();
  const { t } = useLingui();
  const model = createEditorTabModel({
    activeContextTabId,
    activeDocName,
    activeNewTabId,
    activeTargetTabId: activeTarget ? tabIdForNavigationTarget(activeTarget) : null,
    isNewTabActive,
    newTabIds,
    openTabs,
  });
  const rename = useEditorTabRename({
    activeDocName,
    closeAndClearForRename,
    getPoolActiveDocName,
    openTabs,
    pageMeta,
    poolHas,
    remapTabsForRename,
    t,
  });
  const showTabShortcutHints = useEditorTabKeyboardShortcuts({
    activeNewTabId,
    activeTabId: model.activeTabId,
    activateNewTab,
    activateTab,
    isNewTabActive,
    newTabIds,
    openNewTab,
    reopenClosedTab,
    visibleTabIds,
  });

  return (
    <EditorTabStrip
      activeNewTabId={activeNewTabId}
      activeTabId={model.activeTabId}
      activeTabScrollKey={model.activeTabScrollKey}
      activateNewTab={activateNewTab}
      activateTab={activateTab}
      closeNewTab={closeNewTab}
      closeTab={closeTab}
      closeTabs={closeTabs}
      forceTabCloseVisible={showTabShortcutHints}
      newTabIdSet={model.newTabIdSet}
      openNewTab={openNewTab}
      pageMeta={pageMeta}
      pinTab={pinTab}
      pinnedTabIds={pinnedTabIds}
      rename={rename}
      reorderTabs={reorderTabs}
      unpinTab={unpinTab}
      visibleTabIds={visibleTabIds}
    />
  );
}
