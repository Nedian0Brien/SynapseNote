import type { HocuspocusProvider } from '@hocuspocus/provider';
import { mediaKindForSidebarAssetExtension } from '@nedian0brien/synapsenote-core';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import {
  assetPathFromHash,
  docNameFromHash,
  hashFromAssetPath,
  hashFromDocName,
  hashFromFolderPath,
  hashFromSkillFile,
  skillFileFromHash,
} from '@/lib/doc-hash';
import { subscribePoolEviction } from '../editor-cache';
import {
  assetTabId,
  docNameForTabId,
  docTabId,
  folderTabId,
  localTabSessionStorageKey,
  parseEditorTabId,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  skillFileTabId,
  tabIdForNavigationTarget,
} from '../editor-tabs';
import {
  MAX_POOL,
  ProviderPool,
  type ServerRestartRecoveryState,
  type SyncState,
} from '../provider-pool';
import type { PoolEntrySnapshot } from './document-context-types';

const MARKDOWN_EXTENSION_QUALIFIED_DOC_PATTERN = /\.(md|mdx)$/i;

// Module-level singleton — survives React re-renders and StrictMode double-mount.
// Same pattern the old singleton HocuspocusProvider used. Instantiated lazily
// when `collabUrl` resolves — not at module load.
//
// Under Vite HMR the binding resets on module reload; the `import.meta.hot.dispose`
// handler at the bottom of this file disposes the previous pool before the new
// module instance takes over so WebSocket / observer / timer state doesn't leak.
let pool: ProviderPool | null = null;

export function getPool(collabUrl: string): ProviderPool {
  if (!pool) {
    pool = new ProviderPool(MAX_POOL, collabUrl);
    // Wire the editor cache to the pool's eviction events. Without this
    // subscription, cached `Editor` / `EditorView` instances would
    // outlive the Y.Doc they're bound to. Single subscription per pool
    // lifetime; the unsubscribe handle is intentionally dropped — the
    // pool is a module-level singleton and only torn down on HMR/dispose,
    // at which point its listener Set is GC'd along with the pool.
    subscribePoolEviction(pool);
  }
  return pool;
}

export function disposeDocumentPool(): void {
  pool?.dispose();
  pool = null;
}

export interface Snapshot {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;
  serverRestartRecovery: ServerRestartRecoveryState;
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  activeDocName: null,
  activeProvider: null,
  syncState: 'connecting',
  serverRestartRecovery: { kind: 'idle' },
  poolEntries: [],
};

export function getDesktopBridge() {
  if (typeof window === 'undefined') return null;
  const bridge = window.okDesktop;
  if (bridge?.config.mode !== 'editor') return null;
  return bridge;
}

export function getLocalTabSessionKey(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.okDesktop?.config.mode === 'editor') return null;
  return localTabSessionStorageKey(window.location.origin);
}

export function readInitialLocalTabSession() {
  if (typeof window === 'undefined') return parseEditorTabSessionState(null, MAX_POOL);
  const key = getLocalTabSessionKey();
  if (!key) return parseEditorTabSessionState(null, MAX_POOL);
  const storage = typeof window.localStorage !== 'undefined' ? window.localStorage : null;
  return readLocalTabSessionState(storage, key, MAX_POOL);
}

export function readInitialLocalTabs(): string[] {
  return readInitialLocalTabSession().openTabs;
}

export function readInitialLocalPinnedTabIds(): string[] {
  return readInitialLocalTabSession().pinnedTabIds;
}

export function readInitialLocalActiveTabId(): string | null {
  // Hydrate the active-tab selection synchronously from localStorage so the
  // tab UI highlights the correct tab on first paint. A non-empty URL hash
  // is a deep-link and takes precedence — the async hydration effect handles
  // the hash-matches-saved-active case after the desktop bridge resolves.
  if (typeof window === 'undefined') return null;
  if (window.location.hash.length > 0) return null;
  const session = readInitialLocalTabSession();
  return (
    session.activeTabId ??
    (session.activeDocName ? docTabId(session.activeDocName) : null) ??
    session.openTabs[0] ??
    null
  );
}

export function hashFromTabId(tabId: string): string {
  const tab = parseEditorTabId(tabId);
  switch (tab.kind) {
    case 'doc':
      return hashFromDocName(tab.docName);
    case 'folder':
      return hashFromFolderPath(tab.folderPath);
    case 'asset':
      return hashFromAssetPath(tab.assetPath);
    case 'skill-file':
      return hashFromSkillFile({ scope: tab.scope, name: tab.name, path: tab.path });
  }
}

export function tabIdFromHash(hash: string): string | null {
  const assetPath = assetPathFromHash(hash);
  if (assetPath) return assetTabId(assetPath);
  const skillFile = skillFileFromHash(hash);
  if (skillFile) return skillFileTabId(skillFile);
  const docName = docNameFromHash(hash);
  if (!docName) return null;
  const trimmed = docName.trim();
  if (/\/+$/.test(trimmed)) {
    const folderPath = trimmed.replace(/\/+$/g, '');
    return folderPath ? folderTabId(folderPath) : null;
  }
  return docTabId(docName);
}

export function isBareHashForExtensionQualifiedActiveDoc(
  hashDocName: string | null,
  hash: string,
  activeDocName: string | null,
): boolean {
  if (!hashDocName || !activeDocName) return false;
  if (hash !== hashFromDocName(hashDocName)) return false;
  if (MARKDOWN_EXTENSION_QUALIFIED_DOC_PATTERN.test(hashDocName)) return false;
  if (!MARKDOWN_EXTENSION_QUALIFIED_DOC_PATTERN.test(activeDocName)) return false;
  return activeDocName.replace(MARKDOWN_EXTENSION_QUALIFIED_DOC_PATTERN, '') === hashDocName;
}

export function assetTargetForPath(
  assetPath: string,
): Extract<ResolvedNavigationTarget, { kind: 'asset' }> {
  const assetExt = assetPath.split('.').pop() ?? '';
  return {
    kind: 'asset',
    target: assetPath,
    assetPath,
    mediaKind: mediaKindForSidebarAssetExtension(assetExt),
  };
}

export function activeTabIdForTarget(
  activeTarget: ResolvedNavigationTarget | null,
  activeDocName: string | null,
): string | null {
  if (activeTarget) return tabIdForNavigationTarget(activeTarget);
  return activeDocName ? docTabId(activeDocName) : null;
}

export function hasOpenDocTab(
  tabs: readonly string[],
  docName: string,
  excluding: ReadonlySet<string>,
): boolean {
  return tabs.some((tabId) => !excluding.has(tabId) && docNameForTabId(tabId) === docName);
}

export function sameTabIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tabId, index) => tabId === b[index]);
}

export function navigationTargetKey(target: ResolvedNavigationTarget): string {
  switch (target.kind) {
    case 'doc':
      return `doc:${target.docName}`;
    case 'folder-index':
      return `folder-index:${target.docName}:${target.folderPath}:${target.noteKind}`;
    case 'folder':
      return `folder:${target.folderPath}`;
    case 'asset':
      return `asset:${target.assetPath}:${target.mediaKind ?? ''}`;
    case 'skill-file':
      return `skill-file:${target.scope}:${target.name}:${target.path}`;
    case 'large-file':
      return `large-file:${target.docName}:${target.size}:${target.limit}`;
    case 'missing':
      return `missing:${target.target}`;
  }
}

export function sameNavigationTarget(
  a: ResolvedNavigationTarget | null,
  b: ResolvedNavigationTarget | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return navigationTargetKey(a) === navigationTargetKey(b);
}

export function takeSnapshot(p: ProviderPool): Snapshot {
  const active = p.getActive();
  // Project mutable pool entries to immutable read-only snapshots, sorted MRU-first.
  // The sort lives here (not in ProviderPool) so the pool stays a plain LRU map and
  // doesn't need to know about React-side ordering preferences.
  const poolEntries: PoolEntrySnapshot[] = [];
  for (const entry of p.entries.values()) {
    poolEntries.push({
      docName: entry.docName,
      provider: entry.provider,
      lastAccessedAt: entry.lastAccessedAt,
      poolEventId: entry.poolEventId,
    });
  }
  poolEntries.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  return {
    activeDocName: p.getActiveDocName(),
    activeProvider: active?.provider ?? null,
    syncState: active?.syncState ?? 'connecting',
    serverRestartRecovery: p.getServerRestartRecoveryState(),
    poolEntries,
  };
}
