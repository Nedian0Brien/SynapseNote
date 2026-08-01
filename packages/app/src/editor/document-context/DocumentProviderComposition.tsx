import type { ReactNode } from 'react';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitBranchChanged, emitDocumentsChanged } from '@/lib/documents-events';
import { refreshServerInfo } from '@/lib/server-info-refresh';
import { handleBranchSwitched } from '../branch-invalidation';
import { DocumentContext } from './context';
import type { DocumentContextValue } from './document-context-types';
import { installDocumentContextHmr } from './hmr';
import { getPool } from './runtime-helpers';
import { useDocumentCommands } from './useDocumentCommands';
import { useDocumentProviderState } from './useDocumentProviderState';
import { useDocumentTabCommands } from './useDocumentTabCommands';

installDocumentContextHmr();

export function DocumentProviderComposition({ children }: { children: ReactNode }) {
  const state = useDocumentProviderState();
  const commands = useDocumentCommands(state);
  const tabCommands = useDocumentTabCommands(state, commands);
  const {
    snapshot,
    activeTarget,
    activeTabId,
    openTabs,
    pinnedTabIds,
    visibleTabIds,
    tabSessionLoaded,
    principal,
    systemProvider,
    setSystemProvider,
    collabUrl,
    collabTerminal,
    collabLastError,
    retryCollab,
    docPanelMode,
    docPanelAgentId,
    docPanelExpandSignal,
    setDocPanelAgentId,
    setDocPanelModeState,
    setDocPanelExpandSignal,
  } = state;
  const { openDocument, openDocumentTransition, openTarget, openTargetTransition } = commands;
  const value: DocumentContextValue = {
    principal,
    activeTarget,
    activeTabId,
    activeDocName: snapshot.activeDocName,
    activeProvider: snapshot.activeProvider,
    openTabs,
    pinnedTabIds,
    visibleTabIds,
    tabSessionLoaded,
    syncState: snapshot.syncState,
    serverRestartRecovery: snapshot.serverRestartRecovery,
    poolEntries: snapshot.poolEntries,
    openDocument,
    openDocumentTransition,
    openTarget,
    openTargetTransition,
    ...tabCommands,
    systemProvider,
    setSystemProvider,
    updateServerInstanceId: (id) => {
      if (collabUrl !== null) getPool(collabUrl).setExpectedServerInstanceId(id);
    },
    onBranchSwitched: async (branch) => {
      if (collabUrl === null) return;
      const pool = getPool(collabUrl);
      pool.setObservedBranch(branch);
      await handleBranchSwitched(pool, branch);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      emitBranchChanged(branch);
    },
    observeBranch: async (branch) => {
      if (collabUrl === null) return;
      const pool = getPool(collabUrl);
      if (pool.compareAndUpdateObservedBranch(branch)) {
        await handleBranchSwitched(pool, branch);
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        emitBranchChanged(branch);
      }
    },
    observeDiskAck: (docName, sv) => {
      if (collabUrl !== null) getPool(collabUrl).observeDiskAck(docName, sv);
    },
    refreshServerInfo: async () => {
      if (collabUrl !== null) await refreshServerInfo(getPool(collabUrl));
    },
    collabUrl,
    collabTerminal,
    collabLastError,
    retryCollab,
    docPanelMode,
    docPanelAgentId,
    docPanelExpandSignal,
    openActivityPanel: (connectionId, targetDoc) => {
      if (!snapshot.activeDocName && targetDoc) {
        window.location.hash = hashFromDocName(targetDoc);
        setDocPanelAgentId(connectionId);
        setDocPanelModeState('agent');
        setDocPanelExpandSignal((value) => value + 1);
        return;
      }
      if (docPanelMode === 'agent' && docPanelAgentId === connectionId) {
        setDocPanelModeState('doc');
        return;
      }
      setDocPanelAgentId(connectionId);
      setDocPanelModeState('agent');
      setDocPanelExpandSignal((value) => value + 1);
    },
    closeActivityPanel: () => {
      setDocPanelModeState('doc');
      setDocPanelAgentId(null);
    },
  };
  return <DocumentContext value={value}>{children}</DocumentContext>;
}
