import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Principal } from '@nedian0brien/synapsenote-core';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import type { ServerRestartRecoveryState, SyncState } from '../provider-pool';

/** Immutable React projection of mutable provider-pool entries. */
export interface PoolEntrySnapshot {
  docName: string;
  provider: HocuspocusProvider;
  lastAccessedAt: number;
  poolEventId: string;
}

export interface OpenTargetOptions {
  tabBehavior?: 'append' | 'replace-active';
}

export interface CloseTabsOptions {
  force?: boolean;
}

/**
 * Public document shell contract. State owner: document-context runtime.
 * Render owner: `DocumentProvider` in `../DocumentContext`.
 */
export interface DocumentContextValue {
  principal: Principal | null;
  activeTarget: ResolvedNavigationTarget | null;
  activeTabId: string | null;
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  openTabs: ReadonlyArray<string>;
  pinnedTabIds: ReadonlyArray<string>;
  visibleTabIds: ReadonlyArray<string>;
  tabSessionLoaded: boolean;
  syncState: SyncState;
  serverRestartRecovery: ServerRestartRecoveryState;
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
  openDocument: (docName: string) => void;
  openDocumentTransition: (docName: string) => void;
  openTarget: (target: ResolvedNavigationTarget, options?: OpenTargetOptions) => void;
  openTargetTransition: (target: ResolvedNavigationTarget, options?: OpenTargetOptions) => void;
  clearTarget: () => void;
  closeDocument: (docName: string) => void;
  closeActiveTabOrWindow: () => boolean;
  closeTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  reorderTabs: (newOrder: readonly string[], draggedTabId: string) => void;
  newTabIds: ReadonlyArray<string>;
  activeNewTabId: string | null;
  isNewTabActive: boolean;
  openNewTab: () => void;
  activateNewTab: (tabId: string) => void;
  closeNewTab: (tabId: string) => void;
  reopenClosedTab: () => void;
  closeTabs: (tabIds: readonly string[], options?: CloseTabsOptions) => void;
  syncOpenTabsWithKnownTargets: (targets: {
    pages: ReadonlySet<string>;
    folderPaths: ReadonlySet<string>;
    assetPaths: ReadonlySet<string>;
    filePaths?: ReadonlySet<string>;
  }) => void;
  remapTabsForRename: (
    renamed: readonly { fromDocName: string; toDocName: string }[],
    renamedFolders?: readonly { fromPath: string; toPath: string }[],
    renamedAssets?: readonly { fromPath: string; toPath: string }[],
  ) => void;
  closeAndClearForRename: (docName: string) => Promise<void>;
  getPoolActiveDocName: () => string | null;
  poolHas: (docName: string) => boolean;
  recycleDocument: (docName: string) => void;
  prewarm: (docName: string) => string | null;
  systemProvider: HocuspocusProvider | null;
  setSystemProvider: (provider: HocuspocusProvider | null) => void;
  updateServerInstanceId: (id: string | null) => void;
  onBranchSwitched: (branch: string) => Promise<void>;
  observeBranch: (branch: string) => Promise<void>;
  observeDiskAck: (docName: string, sv: Uint8Array) => void;
  refreshServerInfo: () => Promise<void>;
  collabUrl: string | null;
  collabTerminal: boolean;
  collabLastError:
    | { kind: 'error'; code: number | 'network' | 'invalid-body' }
    | { kind: 'null-collab' }
    | null;
  retryCollab: () => void;
  docPanelMode: 'doc' | 'agent';
  docPanelAgentId: string | null;
  docPanelExpandSignal: number;
  openActivityPanel: (connectionId: string, targetDoc: string | null) => void;
  closeActivityPanel: () => void;
}
