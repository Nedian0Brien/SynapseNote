import { use } from 'react';
import { DocumentContext } from './context';
import type { DocumentContextValue } from './document-context-types';

export type DocumentCollaboration = Pick<
  DocumentContextValue,
  | 'principal'
  | 'activeProvider'
  | 'syncState'
  | 'serverRestartRecovery'
  | 'poolEntries'
  | 'systemProvider'
  | 'setSystemProvider'
  | 'updateServerInstanceId'
  | 'onBranchSwitched'
  | 'observeBranch'
  | 'observeDiskAck'
  | 'refreshServerInfo'
  | 'collabUrl'
  | 'collabTerminal'
  | 'collabLastError'
  | 'retryCollab'
  | 'closeAndClearForRename'
  | 'getPoolActiveDocName'
  | 'poolHas'
  | 'recycleDocument'
  | 'prewarm'
>;

/** Provider/pool contract. UI surfaces should not own or recreate providers. */
export function useDocumentCollaboration(): DocumentCollaboration {
  const context = use(DocumentContext);
  if (!context)
    throw new Error('useDocumentCollaboration must be used within <DocumentProvider />');
  return {
    principal: context.principal,
    activeProvider: context.activeProvider,
    syncState: context.syncState,
    serverRestartRecovery: context.serverRestartRecovery,
    poolEntries: context.poolEntries,
    systemProvider: context.systemProvider,
    setSystemProvider: context.setSystemProvider,
    updateServerInstanceId: context.updateServerInstanceId,
    onBranchSwitched: context.onBranchSwitched,
    observeBranch: context.observeBranch,
    observeDiskAck: context.observeDiskAck,
    refreshServerInfo: context.refreshServerInfo,
    collabUrl: context.collabUrl,
    collabTerminal: context.collabTerminal,
    collabLastError: context.collabLastError,
    retryCollab: context.retryCollab,
    closeAndClearForRename: context.closeAndClearForRename,
    getPoolActiveDocName: context.getPoolActiveDocName,
    poolHas: context.poolHas,
    recycleDocument: context.recycleDocument,
    prewarm: context.prewarm,
  };
}
