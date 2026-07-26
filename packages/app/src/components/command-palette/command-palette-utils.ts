import type { DocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { hashFromDocName } from '@/lib/doc-hash';
import { runWithToast as runWithToastBase } from '@/lib/error-state';
import type { OmnibarRecentEntry } from '../command-palette-recents';
import type { WorkspaceEntry, WorkspaceSearchEntry } from '../command-palette-search';
import { defaultInitialDir } from '../file-tree-utils';

/** Command-palette scoped error boundary. */
export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'CommandPalette');

export function navigateToDocHash(docName: string): void {
  window.location.assign(hashFromDocName(docName));
}

export function resolveCreateInitialDir(
  activeTarget: DocumentNavigation['activeTarget'],
  activeDocName: string | null,
): string {
  if (activeTarget?.kind === 'folder' || activeTarget?.kind === 'folder-index') {
    return activeTarget.folderPath;
  }
  return defaultInitialDir(activeDocName);
}

/**
 * Keep stale server results visible while a search request is in flight. This
 * is a pure projection so the stale-while-revalidate contract can be tested
 * without mounting the palette or its overlays.
 */
export function computeVisibleSearchResults({
  searchResults,
  fallbackSearchResults,
  searchStatus,
}: {
  searchResults: readonly WorkspaceSearchEntry[];
  fallbackSearchResults: readonly WorkspaceEntry[];
  searchStatus: 'idle' | 'loading' | 'success' | 'error';
}): readonly (WorkspaceEntry | WorkspaceSearchEntry)[] {
  if (searchResults.length > 0) return searchResults;
  if (searchStatus === 'success') return [];
  return fallbackSearchResults;
}

export type CommandPaletteNavigationEntry = WorkspaceEntry | OmnibarRecentEntry;
