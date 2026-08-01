import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { UploadAssetSuccessSchema, WorkspaceSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { FileTreeDropResult, FileTreeRenameEvent } from '@pierre/trees';
import { useFileTree } from '@pierre/trees/react';
import { useTheme } from 'next-themes';
import {
  startTransition,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { FileTreeFilteredToZeroNotice } from '@/components/FileTreeFilteredToZeroNotice';
import {
  appendSidebarUploadFields,
  collectTreeFolderPathsFromDocuments,
  computeTreeAncestorPaths,
  docNameToTreePath,
  documentsToTreePaths,
  documentsTreePathSignature,
  fileEntryFromUploadedPath,
  fileEntryToTreePath,
  folderPathToTreeDirectoryPath,
  treeDirectoryPathToFolderPath,
  treePathSignature,
  treePathToAppPath,
  uploadedPathForSidebarDrop,
} from '@/components/file-tree-adapter';
import type {
  FileTreeTarget,
  RenamedAssetMapping,
  RenamedDocExtensionMapping,
  RenamedDocMapping,
  RenamedFolderMapping,
} from '@/components/file-tree-operations';
import {
  getFileExtension,
  hasSupportedDocumentExtension,
} from '@/components/file-tree-rename-validation';
import {
  resolveFileTreeSelection,
  resolveFileTreeSelectionAction,
} from '@/components/file-tree-selection';
import { selectTrashConfirmCopy, trashTargetDisplayName } from '@/components/file-tree-trash-copy';
import {
  classifyEmptyTree,
  type DocumentEntry,
  type FileEntry,
  type FolderEntry,
  isAssetEntry,
  isDocumentEntry,
  isFolderEntry,
} from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import {
  largeFileNavigationTarget,
  okContentNavigationTarget,
  type ResolvedNavigationTarget,
} from '@/components/navigation-targets';
import { usePageList } from '@/components/PageListContext';
import {
  coerceTrashFailureReason,
  type TrashFailedTarget,
  TrashFailureModal,
} from '@/components/TrashFailureModal';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { asDirectoryHandle } from '@/components/use-selection-mirror';
import { getEditorForDoc } from '@/editor/active-editor';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { useDocumentTabs } from '@/editor/document-context/useDocumentTabs';
import { captureRenameSnapshots } from '@/editor/editor-cache';
import { assetTabId, docTabId, folderTabId, remapPathForFolderRenames } from '@/editor/editor-tabs';
import { useConflicts } from '@/hooks/use-conflicts';
import { useConfigContext } from '@/lib/config-provider';
import {
  hashFromAssetPath,
  hashFromDocName,
  hashFromFolderPath,
  replaceHashWithoutNavigation,
} from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import {
  subscribeToFileTreeMenuActionDelete,
  subscribeToFileTreeMenuActionDuplicate,
  subscribeToFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import {
  type PageHeaderRenameResult,
  subscribeToPageHeaderRename,
} from '@/lib/page-header-rename-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import { getRelaunchInFlightSnapshot, useRelaunchInFlight } from '@/lib/relaunch-store';
import { cn } from '@/lib/utils';
import { applyRenamedDocuments as reconcileRenamedDocuments } from './file-tree/apply-renamed-documents';
import { FileTreeMenu } from './file-tree/FileTreeMenu';
import {
  AGENT_DECORATION_ICON_ID,
  FILE_TREE_DECORATION_SPRITE_SHEET,
  FILE_TREE_DENSITY_OPTIONS,
  FILE_TREE_UNSAFE_CSS,
  FileTreeHeaderNotice,
  FileTreeSkeleton,
  isAgentTreePath,
  LINK_DECORATION_ICON_ID,
  MARKDOWN_FILE_ICON_ID,
  MARKDOWN_FILE_ICON_VIEWBOX,
} from './file-tree/FileTreePresentation';
import { FileTreeViewport } from './file-tree/FileTreeViewport';
import type { FileTreeProps } from './file-tree/file-tree-types';
import { useFileTreeCreation } from './file-tree/useFileTreeCreation';
import { useFileTreeDragAndDrop } from './file-tree/useFileTreeDragAndDrop';
import { useFileTreeKeyboard } from './file-tree/useFileTreeKeyboard';
import { createDuplicateFileTreeMutation } from './file-tree/useFileTreeMutations';
import { useFileTreePointerInteractions } from './file-tree/useFileTreePointerInteractions';
import { createFileTreeRenameHandlers } from './file-tree/useFileTreeRename';
import { useFileTreeRowPresentation } from './file-tree/useFileTreeRowPresentation';
import { useFileTreeSelection } from './file-tree/useFileTreeSelection';
import { useFileTreeShowAll } from './file-tree/useFileTreeShowAll';
import { createFileTreeTrashHandlers } from './file-tree/useFileTreeTrash';
import { useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';
import { useSidebar } from './ui/sidebar';

export type { FileTreeHandle } from './file-tree/file-tree-types';

const MARKDOWN_TREE_EXTENSION_PATTERN = /\.(md|mdx)$/i;

function parseAlreadyExistsRenamePath(message: string): string | null {
  const match = message.match(/^"(.+)" already exists\.$/);
  return match ? match[1] : null;
}

function markdownTreeExtension(path: string): string | null {
  const match = path.match(MARKDOWN_TREE_EXTENSION_PATTERN);
  return match ? match[0] : null;
}

function focusEditorAfterRename(docName: string): void {
  window.requestAnimationFrame(() => {
    const editor = getEditorForDoc(docName);
    if (!editor || editor.isDestroyed) return;
    try {
      editor.commands.focus();
    } catch {
      // Editor view may be mid-transition; focus is best-effort.
    }
  });
}

const CONNECTIVITY_RECONNECT_RETRY_MS = 2000;

interface FileTreeDeleteRequest {
  targets: FileTreeTarget[];
}

/**
 * Per-target state retained across a failed Trash IPC so the
 * `TrashFailureModal` can offer Retry — re-runs Step 1 against the original
 * targets — and Delete Permanently — calls today's `POST /api/delete-path`
 * hard-delete against the targets that failed.
 *
 * The full original target shape is preserved (not just the path) so the
 * fallback hard-delete + tab-close cascade has the same data shape today's
 * single-step delete uses. Cancel dismisses without action; the user's
 * editor tabs are still open (tab-close only fires after a successful Step 1
 * trash).
 */
interface TrashFailureRequest {
  failed: TrashFailedTarget[];
  /** Originals — re-fed to Retry; failed targets re-fed to Delete Permanently. */
  originalTargets: FileTreeTarget[];
}

interface WorkspaceInfo {
  contentDir: string;
  pathSeparator: '/' | '\\';
}

/**
 * Must be mounted inside a `SidebarProvider` — `useSidebar()` throws otherwise.
 * Today only `FileSidebar` mounts it, which is always inside the provider.
 */
export function FileTree({ ref, onContentHeightChange }: FileTreeProps) {
  const { t, i18n } = useLingui();
  const { activeDocName, activeTarget, isNewTabActive, openTarget } = useDocumentNavigation();
  const { closeTabs, closeDocument, remapTabsForRename } = useDocumentTabs();
  const { closeAndClearForRename, getPoolActiveDocName, poolHas, prewarm } =
    useDocumentCollaboration();
  const { notifySidebarFileSelected } = useSidebar();
  const { resolvedTheme } = useTheme();
  const { addPage, pageMeta, pages } = usePageList();
  const { okignoreBinding, merged } = useConfigContext();
  const sidebarDocumentTabBehavior =
    merged?.editor?.sidebarOpenBehavior === 'current-tab' ? 'replace-active' : 'append';
  function navigationTargetForDocument(
    docName: string,
    size: number | null | undefined,
  ): ResolvedNavigationTarget {
    return (
      largeFileNavigationTarget(docName, size ?? pageMeta.get(docName)?.size) ?? {
        kind: 'doc',
        target: docName,
        docName,
      }
    );
  }
  function navigateToWithPulse(
    targetPath: string,
    size?: number,
    options?: { registerPage?: boolean; tabBehavior?: 'append' | 'replace-active' },
  ) {
    if (options?.registerPage) addPage(targetPath);
    openTarget(navigationTargetForDocument(targetPath, size), {
      tabBehavior: options?.tabBehavior ?? 'replace-active',
    });
    replaceHashWithoutNavigation(hashFromDocName(targetPath));
    notifySidebarFileSelected();
  }
  function navigateToFolderWithPulse(folderPath: string) {
    const nextHash = hashFromFolderPath(folderPath);
    openTarget(
      { kind: 'folder', target: folderPath, folderPath },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(nextHash);
    notifySidebarFileSelected();
  }
  const [documents, setDocuments] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True while the listing is being silently re-attempted after a reachability
  // failure that coincides with a known desktop auto-update relaunch. Drives a
  // calm "Relaunching…" notice in place of the red "Could not reach server"
  // error, and is cleared the moment a fetch succeeds (self-heal) or the
  // reachability failure outlives the relaunch (then the honest error wins).
  const [reconnecting, setReconnecting] = useState(false);
  // Drives the render copy + the start/abort flip effect. The fetch closures
  // read the live value via `getRelaunchInFlightSnapshot()` at failure time
  // (always current — no effect-synced ref needed).
  const relaunchInFlight = useRelaunchInFlight();
  const connectivityRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Count of entries the server returned when the showAll walk hit its entry
  // cap (so the list is a partial prefix); null when the list is complete.
  const [truncatedShownCount, setTruncatedShownCount] = useState<number | null>(null);
  // Pre-filter size of the most recent depth-1 root listing, captured where
  // the listing lands. The filtered `documents` state can't distinguish an
  // empty project from filters hiding everything (raw listings aren't
  // retained), so the empty slot's classifier reads this signal instead.
  const [unfilteredRootEntryCount, setUnfilteredRootEntryCount] = useState(0);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<FileTreeDeleteRequest | null>(null);
  /**
   * Set when `shell.trashItem` returns `{ ok: false }` for one or more
   * targets during the Step 1 trash flow. Drives the rendering of
   * `TrashFailureModal`. Cleared on Cancel; cleared on Delete Permanently /
   * Retry after the follow-up flow completes.
   */
  const [trashFailure, setTrashFailure] = useState<TrashFailureRequest | null>(null);
  // Tracks the project-level conflict list so delete/move-to-trash can refuse
  // up front when a target (or any child of a target folder) is conflicted.
  // The HTTP `handleDeletePath` already gates conflicts; the Electron Move-
  // to-Trash flow does NOT (Step 1 is `shell.trashItem`, an OS call), so we
  // refuse here before the file leaves disk.
  const { conflicts: activeConflicts } = useConflicts();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  // Clicking the tree's empty content area "deselects" the active row *for
  // creation purposes only*: New file / New folder land at the project root
  // instead of next to the open doc, while the editor keeps showing whatever
  // was open (activeTarget is untouched). When set, `activeTreePath` resolves
  // to null so `useSelectionMirror` drops the row highlight; it re-couples the
  // moment the active target changes (open a row / navigate elsewhere) or the
  // user selects another row. FileSidebar reads this via the imperative handle
  // to route the create parent dir to ''.
  const [creationDirCleared, setCreationDirCleared] = useState(false);
  const creationDirClearedRef = useRef(creationDirCleared);
  // Active-document ancestors expand automatically when navigation reveals a
  // document, but a later disclosure click is authoritative: the user may
  // collapse that ancestor without changing the open document. Remember only
  // collapsed *active* ancestors so refreshes do not immediately reopen them;
  // navigation clears this set and reveals the next active target normally.
  const [userCollapsedActiveAncestorPaths, setUserCollapsedActiveAncestorPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const userCollapsedActiveAncestorPathsRef = useRef<ReadonlySet<string>>(new Set());
  // Imperative-handle subscribers (FileSidebar) that need to react to
  // `creationDirCleared` changes — Pierre's `model.subscribe` only fires on
  // tree-model mutations, not React state, so the handle multiplexes both.
  const handleListenersRef = useRef<Set<() => void>>(new Set());

  const documentsRef = useRef(documents);
  const pageMetaRef = useRef(pageMeta);
  const pendingExactFileSelectionRef = useRef<string | null>(null);
  function activateTreePath(treePath: string, entries: readonly FileEntry[] = documents) {
    const action = resolveFileTreeSelectionAction(treePath, entries);
    if (action.kind === 'none') {
      console.debug(
        '[FileTree] Dropped selection for unknown docName:',
        treePathToAppPath(treePath),
      );
      return;
    }
    if (action.kind === 'asset') {
      openTarget(
        {
          kind: 'asset',
          target: action.path,
          assetPath: action.path,
          mediaKind: action.mediaKind,
        },
        { tabBehavior: 'replace-active' },
      );
      replaceHashWithoutNavigation(action.hash);
      notifySidebarFileSelected();
      return;
    }
    if (action.kind === 'folder') {
      navigateToFolderWithPulse(action.path);
      return;
    }
    const docEntry = entries.find(
      (item): item is DocumentEntry => isDocumentEntry(item) && item.docName === action.path,
    );
    // Revealed `.ok` document rows never open the raw editable editor: the
    // shared routing sends template files to the template editor, keeps
    // indexed skill docs on the normal doc flow (null), and lands everything
    // else on the read-only text viewer — same rule the hash resolver's
    // doc-open guard applies.
    const okTarget = okContentNavigationTarget(action.path, {
      pages,
      docExt: docEntry?.docExt,
    });
    if (okTarget?.kind === 'asset') {
      openTarget(okTarget, { tabBehavior: 'replace-active' });
      replaceHashWithoutNavigation(hashFromAssetPath(okTarget.assetPath));
      notifySidebarFileSelected();
      return;
    }
    if (okTarget?.kind === 'doc') {
      navigateToWithPulse(okTarget.docName, undefined, {
        tabBehavior: sidebarDocumentTabBehavior,
      });
      return;
    }
    navigateToWithPulse(action.path, docEntry?.size, {
      registerPage: hasSupportedDocumentExtension(action.path),
      tabBehavior: sidebarDocumentTabBehavior,
    });
  }
  function navigateToAssetWithPulse(assetPath: string, entries?: readonly FileEntry[]) {
    const currentEntries = entries ?? documentsRef.current;
    const entry = currentEntries.find(
      (item): item is Extract<FileEntry, { kind: 'asset' }> =>
        isAssetEntry(item) && item.path === assetPath,
    );
    openTarget(
      {
        kind: 'asset',
        target: assetPath,
        assetPath,
        mediaKind: entry?.mediaKind ?? null,
      },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(hashFromAssetPath(assetPath));
    notifySidebarFileSelected();
  }
  const activeDocNameRef = useRef(activeDocName);
  const assetTreePaths = new Set(
    documents.filter(isAssetEntry).map((entry) => fileEntryToTreePath(entry)),
  );
  const assetTreePathsRef = useRef(assetTreePaths);
  const activeAncestorTreePathsRef = useRef<string[]>([]);
  const skipNextResetSignatureRef = useRef<string | null>(null);
  const hoveredPrewarmDocRef = useRef<string | null>(null);
  const suppressSelectionRef = useRef(false);
  const sidebarDragInProgressRef = useRef(false);
  const sidebarDragClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const externalFileDropTargetRef = useRef<{ row: HTMLElement | null; root: HTMLElement | null }>({
    row: null,
    root: null,
  });
  const uploadExternalFilesRef = useRef<
    (files: readonly File[], parentDir: string, busyPath: string) => void
  >(() => {});
  const busyPathRef = useRef<string | null>(null);
  const copiedKeyboardTargetRef = useRef<FileTreeTarget | null>(null);
  // Tracks locally-added tree paths (file/folder creates) with the timestamp
  // when they were optimistically inserted into `documents` state. Used by
  // `refreshDocs` to preserve entries the server's file-watcher index has not
  // yet picked up — without this, the `setDocuments(serverResponse)` call below
  // overwrites local optimistic state, dropping the new entry and breaking the
  // adjacent right-click context-menu flow. The underlying race class is
  // parcel-watcher inotify-event delivery lag on Linux CI. Entries expire
  // after STALE_REFRESH_PRESERVE_WINDOW_MS or when the server confirms.
  const recentLocalAddsRef = useRef<Map<string, number>>(new Map());
  // Lazy Show All expansion (client half): folders fetch their
  // children on first expand via `?showAll=true&dir=<folder>&depth=1`. All
  // three refs key by folder TREE path ('team/'). The loaded-dirs cache and
  // any in-flight child fetches are scoped to one refresh cycle — refreshDocs
  // aborts the fetches, clears the cache, and bumps the generation stamp so a
  // child response racing a root re-seed is discarded instead of splicing
  // stale entries.
  const lazyLoadedDirTreePathsRef = useRef<Set<string>>(new Set());
  const lazyChildFetchControllersRef = useRef<Map<string, AbortController>>(new Map());
  const lazyChildFetchGenerationRef = useRef(0);
  // Snapshot the expanded-folder diff compares against to detect newly
  // expanded folders. Pierre has no expand callback, so the model-subscribe
  // diff is the one mechanism covering row clicks, ArrowRight, drag-hover
  // auto-open, and programmatic expansion alike.
  const prevExpandedFolderTreePathsRef = useRef<ReadonlySet<string>>(new Set());
  // The async fetch closures in the docs refresh effect are created once at
  // mount; reading the visibility toggles directly would capture their
  // mount-time values. The refs let a closure read the latest toggle state
  // when the response actually lands. Initialized to `false` (matches the
  // cold-start defaults before config loads); synced in the bulk
  // useLayoutEffect below.
  const showHiddenFilesRef = useRef<boolean>(false);
  const showOnlyMarkdownFilesRef = useRef<boolean>(false);
  const showOkFoldersRef = useRef<boolean>(false);
  const treeVisibilityFromRefs = () => ({
    showHiddenFiles: showHiddenFilesRef.current,
    showOnlyMarkdownFiles: showOnlyMarkdownFilesRef.current,
    showOkFolders: showOkFoldersRef.current,
  });
  // Hoists the docs scheduler's `request()` out of its effect closure so
  // the showHiddenFiles-flip effect can re-fetch without re-mounting the
  // listener / scheduler. Set to a callable in the docs effect; cleared on
  // unmount.
  const refreshDocsScheduleRef = useRef<(() => void) | null>(null);
  const fileTreeHostRef = useRef<HTMLDivElement | null>(null);
  const handleSelectionChangeRef = useRef<(selectedPaths: readonly string[]) => void>(() => {});
  const handleRenameRef = useRef<(event: FileTreeRenameEvent) => Promise<PageHeaderRenameResult>>(
    async () => ({ ok: false, message: 'Rename is unavailable' }),
  );
  const handleRenameErrorRef = useRef<(message: string) => void>((message) => toast.error(message));
  const handleDropCompleteRef = useRef<(event: FileTreeDropResult) => void>(() => {});
  const activeTargetRef = useRef(activeTarget);
  const [emptyExternalFileDropActive, setEmptyExternalFileDropActive] = useState(false);

  // --- Reachability handling (desktop auto-update relaunch self-heal) ------
  // The file tree owns the global "Could not reach server" signal the other
  // sidebar sections defer to. During a desktop relaunch the server is
  // intentionally torn down (up to 10s) before `quitAndInstall`, so route
  // reachability failures through these helpers: stay calm and keep retrying
  // while a relaunch is in flight, but surface the honest error immediately for
  // a real outage (unchanged behavior).
  function clearConnectivityRetry() {
    if (connectivityRetryTimerRef.current !== null) {
      clearTimeout(connectivityRetryTimerRef.current);
      connectivityRetryTimerRef.current = null;
    }
  }
  function noteConnectivityRecovered() {
    clearConnectivityRetry();
    setReconnecting(false);
  }
  // An HTTP response (4xx/5xx, shape mismatch, mid-stream error) proves the
  // server WAS reachable — drop any calm-reconnect state so the genuine error
  // is shown, never masked behind the spinner. HTTP errors don't reschedule a
  // retry, so without this the spinner could latch with the error invisible.
  function reportServerReachableError(title: string) {
    noteConnectivityRecovered();
    setError(title);
  }
  function reportConnectivityFailure() {
    clearConnectivityRetry();
    // Read the live store snapshot (always current) rather than an effect-synced
    // ref, so an in-flight fetch failing before a render commits still sees the
    // relaunch and stays calm.
    if (getRelaunchInFlightSnapshot()) {
      setError(null);
      setReconnecting(true);
      connectivityRetryTimerRef.current = setTimeout(() => {
        connectivityRetryTimerRef.current = null;
        refreshDocsScheduleRef.current?.();
      }, CONNECTIVITY_RECONNECT_RETRY_MS);
      return;
    }
    setReconnecting(false);
    setError(t`Could not reach server`);
  }

  // Re-attempt the listing whenever a relaunch starts or aborts: starting → the
  // failing fetch flips the banner from red to the calm "Relaunching…" copy;
  // aborting → a successful fetch self-heals the panel without waiting for the
  // next focus / CC1 refresh. Skips the initial render.
  const isFirstRelaunchEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: relaunchInFlight is a transition trigger, not a read — the body calls the hoisted scheduler ref only. Sibling pattern at the visibility-toggle flip effect below.
  useEffect(() => {
    if (isFirstRelaunchEffectRunRef.current) {
      isFirstRelaunchEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [relaunchInFlight]);

  // Drop a pending reconnect retry on unmount so a late timer can't touch state
  // after teardown. `clearConnectivityRetry` only reads a stable ref; it is
  // intentionally NOT a dep — listing it would re-run this effect (and fire its
  // cleanup) every render, cancelling live retries.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount/unmount-only; see comment above.
  useEffect(() => clearConnectivityRetry, []);

  useFileTreeDragAndDrop({
    fileTreeHostRef,
    documents,
    documentsRef,
    pageMetaRef,
    loading,
    sidebarDragInProgressRef,
    sidebarDragClearTimerRef,
    externalFileDropTargetRef,
    uploadExternalFilesRef,
  });

  const {
    selectedFilePath,
    selectedFolderPath,
    navigationPath: activeNavigationPath,
  } = resolveFileTreeSelection(activeTarget, isNewTabActive ? null : activeDocName);
  const baseActiveTreePath = selectedFilePath
    ? docNameToTreePath(
        selectedFilePath,
        documents.find(
          (d): d is DocumentEntry => isDocumentEntry(d) && d.docName === selectedFilePath,
        )?.docExt,
      )
    : selectedFolderPath
      ? folderPathToTreeDirectoryPath(selectedFolderPath)
      : activeTarget?.kind === 'asset'
        ? activeTarget.assetPath
        : null;
  // When the user has cleared the creation target (empty-space click), drop the
  // row highlight without disturbing the editor. `useSelectionMirror` keys off
  // this null to deselect; the reset effect below re-couples on any nav change.
  const activeTreePath = creationDirCleared ? null : baseActiveTreePath;

  const handoffInstallStates = useInstalledAgents().states;
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoff = {
    installStates: handoffInstallStates,
    isElectronHost: typeof window !== 'undefined' && window.okDesktop != null,
    dispatch: dispatchHandoff,
  };
  const showHiddenFiles = merged?.appearance?.sidebar?.showHiddenFiles ?? false;
  const showOnlyMarkdownFiles = merged?.appearance?.sidebar?.showOnlyMarkdownFiles ?? false;
  const showOkFolders = merged?.appearance?.sidebar?.showOkFolders ?? false;

  const isAvailable = () => busyPathRef.current === null;

  const { model } = useFileTree({
    paths: [],
    initialExpansion: 'closed',
    fileTreeSearchMode: 'hide-non-matches',
    initialVisibleRowCount: 18,
    stickyFolders: true,
    ...FILE_TREE_DENSITY_OPTIONS,
    icons: {
      set: 'complete',
      spriteSheet: FILE_TREE_DECORATION_SPRITE_SHEET,
      byFileExtension: {
        md: { name: MARKDOWN_FILE_ICON_ID, viewBox: MARKDOWN_FILE_ICON_VIEWBOX },
        mdx: { name: MARKDOWN_FILE_ICON_ID, viewBox: MARKDOWN_FILE_ICON_VIEWBOX },
      },
    },
    unsafeCSS: FILE_TREE_UNSAFE_CSS,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: 'both',
        buttonVisibility: 'when-needed',
      },
    },
    dragAndDrop: {
      canDrag: isAvailable,
      canDrop: isAvailable,
      onDropComplete: (event) => handleDropCompleteRef.current(event),
      onDropError: (message) => {
        toast.error(message);
      },
    },
    renaming: {
      canRename: isAvailable,
      onRename: (event) => handleRenameRef.current(event),
      onError: (message) => handleRenameErrorRef.current(message),
    },
    onSelectionChange: (selectedPaths) => handleSelectionChangeRef.current(selectedPaths),
    renderRowDecoration: ({ item }) => {
      if (item.kind === 'file') {
        const doc = documentsRef.current.find(
          (entry): entry is DocumentEntry =>
            isDocumentEntry(entry) && docNameToTreePath(entry.docName, entry.docExt) === item.path,
        );
        if (doc?.isSymlink) {
          const targetPath = doc.targetPath;
          return {
            icon: LINK_DECORATION_ICON_ID,
            title: targetPath ? t`Symlink to ${targetPath}` : t`Symlink`,
          };
        }
        if (isAgentTreePath(item.path)) {
          return {
            icon: AGENT_DECORATION_ICON_ID,
            title: t`Agent configuration file`,
          };
        }
        return null;
      }
      // Symlinked directories carry isSymlink on their FolderEntry. Badge the
      // alias folder itself (Finder-style — its contents are not separately
      // marked, since they live behind the one symlink).
      const folder = documentsRef.current.find(
        (entry): entry is FolderEntry =>
          isFolderEntry(entry) &&
          folderPathToTreeDirectoryPath(entry.path) === folderPathToTreeDirectoryPath(item.path),
      );
      if (folder?.isSymlink) {
        const targetPath = folder.targetPath;
        return {
          icon: LINK_DECORATION_ICON_ID,
          title: targetPath ? t`Symlink to ${targetPath}` : t`Symlink`,
        };
      }
      return null;
    },
  });

  function normalizeSelectionPath(treePath: string): string {
    const item = model.getItem(treePath) ?? model.getItem(folderPathToTreeDirectoryPath(treePath));
    if (item?.isDirectory()) {
      return folderPathToTreeDirectoryPath(treeDirectoryPathToFolderPath(item.getPath()));
    }
    return treePath;
  }

  const treePaths = documentsToTreePaths(documents);
  const treePathsSignature = treePathSignature(treePaths);
  const treePathsRef = useRef(treePaths);
  const folderTreePaths = collectTreeFolderPathsFromDocuments(documents, {
    includeOkFolders: showOkFolders,
  });
  const folderTreePathsRef = useRef(folderTreePaths);

  // Keep parents visible without forcing the selected folder itself open.
  const activeAncestorTreePaths = selectedFolderPath
    ? computeTreeAncestorPaths(folderPathToTreeDirectoryPath(selectedFolderPath)).slice(0, -1)
    : computeTreeAncestorPaths(activeTreePath ?? activeNavigationPath);
  const activeAncestorTreePathsSignature = activeAncestorTreePaths.join('\0');
  const autoRevealActiveAncestorTreePathsSignature = activeAncestorTreePaths
    .filter((path) => !userCollapsedActiveAncestorPaths.has(path))
    .join('\0');

  const collectExpandedFolderTreePaths = () => {
    const expanded = new Set<string>();
    for (const folderPath of folderTreePathsRef.current) {
      const item = asDirectoryHandle(model.getItem(folderPath));
      if (item?.isExpanded()) {
        expanded.add(folderPath);
      }
    }
    return expanded;
  };

  const expandedPathsForReset = (nextDocuments?: readonly FileEntry[]) => {
    const nextFolderPaths = new Set(
      collectTreeFolderPathsFromDocuments(nextDocuments ?? documentsRef.current, {
        includeOkFolders: showOkFoldersRef.current,
      }),
    );
    const expanded = collectExpandedFolderTreePaths();
    for (const ancestor of activeAncestorTreePathsRef.current) {
      if (userCollapsedActiveAncestorPathsRef.current.has(ancestor)) continue;
      expanded.add(ancestor);
    }
    return [...expanded].filter((path) => nextFolderPaths.has(path));
  };

  const resetModelToDocuments = (nextDocuments?: readonly FileEntry[]) => {
    const nextPaths = documentsToTreePaths(nextDocuments ?? documentsRef.current);
    model.resetPaths(nextPaths, {
      initialExpandedPaths: expandedPathsForReset(nextDocuments),
    });
  };

  // Invariant: Pierre's `#focusedPath` and `#selectedPaths` reference paths
  // in `documentsToTreePaths(documents)`. If the user deletes the suffix
  // before committing an inline rename, Pierre can leave the store keyed by
  // the extensionless basename ('bar'), while React documents hold the
  // canonical 'bar.md' / 'bar.png'. Reconcile by moving Pierre's leftover to
  // canonical before the natural `resetPaths` gets suppressed by
  // `markNextDocumentsAsApplied`.
  const reconcileModelAfterExtensionlessRename = (
    current: readonly FileEntry[],
    next: readonly FileEntry[],
    renamed: readonly RenamedDocMapping[],
    renamedAssets: readonly RenamedAssetMapping[] = [],
  ): void => {
    let reconciledCount = 0;
    let lastCanonical: string | null = null;
    for (const { fromDocName, toDocName } of renamed) {
      const source = current.find(
        (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === fromDocName,
      );
      if (source == null) continue;
      // Positive selector for the extensionless commit condition. Drag/drop
      // + folder-cascade have canonical paths already, so `getItem(toDocName)`
      // returns null and we skip (which also avoids Pierre's `movePath` throw
      // on missing source). Idempotent under React StrictMode double-invocation.
      if (model.getItem(toDocName) == null) continue;
      const destination = next.find(
        (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === toDocName,
      );
      const canonicalTreePath = docNameToTreePath(toDocName, destination?.docExt ?? source.docExt);
      // `move()` atomically remaps `#focusedPath` AND `#selectedPaths` via
      // `#applyMutationState` — selection reconciliation depends on this.
      model.move(toDocName, canonicalTreePath);
      lastCanonical = canonicalTreePath;
      reconciledCount += 1;
    }
    for (const { toPath } of renamedAssets) {
      const ext = getFileExtension(toPath);
      if (ext === '') continue;
      const extensionlessTreePath = toPath.slice(0, -ext.length);
      if (model.getItem(extensionlessTreePath) == null) continue;
      if (model.getItem(toPath) == null) {
        model.move(extensionlessTreePath, toPath);
      }
      lastCanonical = toPath;
      reconciledCount += 1;
    }
    if (reconciledCount === 0) return;
    resetModelToDocuments(next);
    // Focus is singular — Pierre's commit invariant means at most one
    // extensionless inline rename, so `reconciledCount` is ~always 1.
    // The explicit focus call hedges against `resetPaths` clearing the
    // in-memory focus state (no-op when already focused or absent).
    if (lastCanonical != null) {
      model.focusPath(lastCanonical);
    }
  };

  const markNextDocumentsAsApplied = (nextDocuments: readonly FileEntry[]) => {
    skipNextResetSignatureRef.current = documentsTreePathSignature(nextDocuments);
  };

  const isAssetTreePath = (treePath: string) => assetTreePathsRef.current.has(treePath);

  const handleDuplicateTarget = createDuplicateFileTreeMutation({
    busyPathRef,
    setBusyPath,
    setError,
    setDocuments,
    resetModelToDocuments,
    markNextDocumentsAsApplied,
    addPage,
    navigateToFile: navigateToWithPulse,
    navigateToFolder: navigateToFolderWithPulse,
    failedTitle: t`Failed to duplicate path`,
    resyncMessage: t`Duplicate succeeded but the sidebar may be out of date — refresh to resync`,
    duplicateLabel: t`File duplicated`,
    folderDuplicateLabel: t`Folder duplicated`,
    networkMessage: t`Could not duplicate item`,
  });

  const handleDuplicateTargetRef = useRef(handleDuplicateTarget);
  useEffect(() => {
    handleDuplicateTargetRef.current = handleDuplicateTarget;
  });

  const {
    newItemRequest,
    setNewItemRequest,
    pendingCreateRef,
    clearPendingCreate,
    cleanupPendingCreate,
    cleanupPendingCreateRef,
    startCreating,
    startCreatingFromTemplate,
  } = useFileTreeCreation({
    model,
    treePaths,
    folderTreePathsRef,
    busyPathRef,
    recentLocalAddsRef,
    setBusyPath,
    setDocuments,
    resetModelToDocuments,
    markNextDocumentsAsApplied,
    addPage,
    navigateToFile: navigateToWithPulse,
    navigateToFolder: navigateToFolderWithPulse,
    closeDocument,
    closeTabs,
  });

  function recoverMarkdownRenameConflict(message: string): boolean {
    const bareDestinationPath = parseAlreadyExistsRenamePath(message);
    if (!bareDestinationPath || markdownTreeExtension(bareDestinationPath)) return false;

    const sourceTreePath = model.getFocusedPath() ?? model.getSelectedPaths()[0] ?? null;
    if (!sourceTreePath || sourceTreePath.endsWith('/') || isAssetTreePath(sourceTreePath)) {
      return false;
    }

    const sourceExtension = markdownTreeExtension(sourceTreePath);
    if (!sourceExtension) return false;

    const folderTreePath = folderPathToTreeDirectoryPath(bareDestinationPath);
    if (!folderTreePathsRef.current.includes(folderTreePath)) return false;

    const destinationTreePath = `${bareDestinationPath}${sourceExtension}`;
    if (treePathsRef.current.includes(destinationTreePath)) return false;

    const event = {
      sourcePath: sourceTreePath,
      destinationPath: destinationTreePath,
      isFolder: false,
    } satisfies FileTreeRenameEvent;

    void handleTreeRename(event);
    model.move(sourceTreePath, destinationTreePath);
    return true;
  }

  useFileTreeShowAll({
    model,
    documentsRef,
    setDocuments,
    setLoading,
    setError,
    setTruncatedShownCount,
    setUnfilteredRootEntryCount,
    recentLocalAddsRef,
    lazyLoadedDirTreePathsRef,
    lazyChildFetchControllersRef,
    lazyChildFetchGenerationRef,
    prevExpandedFolderTreePathsRef,
    showOkFoldersRef,
    treeVisibilityFromRefs,
    collectExpandedFolderTreePaths,
    refreshDocsScheduleRef,
    failedTitle: t`Failed to load documents`,
    mismatchTitle: t`Documents response did not match expected shape.`,
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
  });

  // Re-fetch + re-filter when the user flips a sidebar visibility toggle.
  // Hidden files and only-markdown are pure client-side filters (the server
  // response doesn't depend on them); Show .ok folders parameterizes the
  // request itself (the listing URL carries `showOk`). Either way the flip
  // reuses the scheduler's in-flight coalescing, and the fetch closures read
  // the flipped values through the refs. Skips on first render to avoid
  // double-fetching on mount.
  const isFirstVisibilityFlipEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the visibility toggles are flip-detection triggers, not reads — the effect body reads refs only. Sibling pattern at the treePathsSignature reset effect above.
  useEffect(() => {
    if (isFirstVisibilityFlipEffectRunRef.current) {
      isFirstVisibilityFlipEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [showHiddenFiles, showOnlyMarkdownFiles, showOkFolders]);

  useEffect(() => {
    let active = true;
    fetch('/api/workspace')
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) return;
        const parsed = parseSuccessOrWarn(WorkspaceSuccessSchema, data, 'workspace', null);
        if (!parsed) return;
        setWorkspace({
          contentDir: parsed.contentDir,
          pathSeparator: parsed.pathSeparator,
        });
      })
      .catch((err) => {
        console.warn('[FileTree] /api/workspace fetch failed:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedPathsForReset reads refs; model + treePathsSignature are the reset triggers.
  useEffect(() => {
    if (skipNextResetSignatureRef.current === treePathsSignature) {
      skipNextResetSignatureRef.current = null;
      return;
    }
    model.resetPaths(treePathsRef.current, {
      initialExpandedPaths: expandedPathsForReset(),
    });
  }, [model, treePathsSignature]);

  useFileTreeSelection({
    model,
    activeTreePath,
    baseActiveTreePath,
    treePathsSignature,
    loading,
    activeAncestorTreePathsSignature,
    autoRevealActiveAncestorTreePathsSignature,
    suppressSelectionRef,
    sidebarDragInProgressRef,
    pendingExactFileSelectionRef,
    activeAncestorTreePathsRef,
    fileTreeHostRef,
    handleSelectionChangeRef,
    documentsRef,
    setCreationDirCleared,
    setUserCollapsedActiveAncestorPaths,
    normalizeSelectionPath,
    activateTreePath,
  });

  // Bridge `creationDirCleared` (React state) to the imperative handle's
  // subscribers (FileSidebar) — Pierre's model.subscribe doesn't observe React
  // state, so notify the handle listeners explicitly on change.
  useEffect(() => {
    creationDirClearedRef.current = creationDirCleared;
    for (const listener of handleListenersRef.current) listener();
  }, [creationDirCleared]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pending-create and cleanup callbacks flow through stable refs; listener lifecycle follows the tree model.
  useEffect(() => {
    return model.onMutation('remove', (event) => {
      const pending = pendingCreateRef.current;
      if (!pending || event.path !== pending.renamePath) return;
      void cleanupPendingCreateRef.current(pending);
    });
  }, [model]);

  const applyRenamedDocuments = async (
    renamed: RenamedDocMapping[],
    renamedFolders: RenamedFolderMapping[] = [],
    renamedAssets: RenamedAssetMapping[] = [],
    activeBeforeRename?: {
      docName: string | null;
      folderPath: string | null;
      assetPath: string | null;
    },
    renamedDocExtensions: RenamedDocExtensionMapping[] = [],
  ) => {
    await reconcileRenamedDocuments({
      documents: documentsRef.current,
      renamed,
      renamedFolders,
      renamedAssets,
      renamedDocExtensions,
      activeBeforeRename,
      activeDocName: activeDocNameRef.current,
      activeFolderPath:
        activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
      activeAssetPath:
        activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null,
      getPoolActiveDocName,
      poolHas,
      captureRenameSnapshots,
      closeAndClearForRename,
      addPage,
      remapTabsForRename,
      remapPathForFolderRenames,
      setDocuments,
      reconcileModelAfterExtensionlessRename,
      markNextDocumentsAsApplied,
      navigateToWithPulse,
      navigateToFolderWithPulse,
      navigateToAssetWithPulse,
      focusEditorAfterRename,
      emitDocumentsChanged,
    });
  };

  const { handleTreeRename, handleDropComplete } = createFileTreeRenameHandlers({
    documents: documentsRef.current,
    activeBeforeRename: () => ({
      docName: activeDocNameRef.current,
      folderPath:
        activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
      assetPath:
        activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null,
    }),
    isAssetTreePath,
    fetch,
    setBusyPath,
    setError,
    resetModelToDocuments,
    pendingCreate: () => pendingCreateRef.current,
    cleanupPendingCreate,
    clearPendingCreate,
    applyRenamedDocuments,
    toastError: toast.error,
    messages: {
      failedRename: t`Failed to rename path`,
      failedMove: t`Failed to move`,
      renameResync: t`Rename succeeded but the sidebar may be out of date — refresh to resync`,
      moveResync: t`Move succeeded but the sidebar may be out of date — refresh to resync`,
      networkError: t`Network error — please try again`,
    },
  });

  async function uploadExternalFilesToTarget(
    files: readonly File[],
    parentDir: string,
    uploadBusyPath: string,
  ) {
    if (files.length === 0 || busyPathRef.current !== null) return;

    const clearBusyState = () => {
      busyPathRef.current = null;
      setBusyPath(null);
    };
    busyPathRef.current = uploadBusyPath;
    setBusyPath(uploadBusyPath);
    setError(null);

    const uploadedEntries: FileEntry[] = [];
    let uploadedCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      appendSidebarUploadFields(formData, parentDir, file.name || 'upload');

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const parsed = await parseServerResponse(res, t`Failed to upload file`);
        if (!parsed.ok) {
          failedCount += 1;
          toast.error(parsed.title, { description: file.name });
          continue;
        }

        const success = parseSuccessOrWarn(
          UploadAssetSuccessSchema,
          parsed.body,
          'upload:drop',
          null,
        );
        if (success === null) {
          failedCount += 1;
          toast.error(t`Failed to upload file`, { description: file.name });
          continue;
        }
        const uploadedPath = uploadedPathForSidebarDrop(parentDir, success);
        if (success.deduped === true) {
          failedCount += 1;
          toast.error(t`File already exists`, { description: uploadedPath });
          continue;
        }
        uploadedCount += 1;
        const entry = fileEntryFromUploadedPath(uploadedPath, file);
        if (entry) uploadedEntries.push(entry);
      } catch (err) {
        failedCount += 1;
        console.warn('[FileTree] external file upload failed:', err);
        toast.error(
          err instanceof TypeError ? t`Network error — please try again` : t`Failed to upload file`,
          {
            description: file.name,
          },
        );
      }
    }

    try {
      if (uploadedEntries.length > 0) {
        for (const entry of uploadedEntries) {
          if (isDocumentEntry(entry)) addPage(entry.docName);
        }
        setDocuments((current) => {
          const existing = new Set(current.map(fileEntryToTreePath));
          let changed = false;
          const next = [...current];
          for (const entry of uploadedEntries) {
            const treePath = fileEntryToTreePath(entry);
            recentLocalAddsRef.current.set(treePath, Date.now());
            if (existing.has(treePath)) continue;
            existing.add(treePath);
            next.push(entry);
            changed = true;
          }
          if (!changed) return current;
          resetModelToDocuments(next);
          markNextDocumentsAsApplied(next);
          return next;
        });
      }

      if (uploadedCount > 0) {
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        refreshDocsScheduleRef.current?.();
        toast.success(
          plural(uploadedCount, {
            one: 'Uploaded one file',
            other: `Uploaded ${uploadedCount} files`,
          }),
          { description: parentDir || t`Project root` },
        );
      }

      if (failedCount > 0) {
        setError(
          uploadedCount > 0
            ? plural(failedCount, {
                one: '1 file failed to upload',
                other: `${failedCount} files failed to upload`,
              })
            : t`Failed to upload file`,
        );
      }
      clearBusyState();
    } catch (err) {
      const message = t`Upload may have succeeded but the sidebar is out of date — refresh to resync`;
      console.warn('[FileTree] upload post-upload reconciliation failed:', err);
      toast.error(message);
      setError(message);
      clearBusyState();
    }
  }

  function expandSubtree(treePath: string) {
    const root = folderPathToTreeDirectoryPath(treePath);
    startTransition(() => {
      for (const folderPath of folderTreePathsRef.current) {
        if (folderPath === root || folderPath.startsWith(root)) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) {
            item.expand();
          }
        }
      }
    });
  }

  function collapseSubtree(treePath: string) {
    const root = folderPathToTreeDirectoryPath(treePath);
    startTransition(() => {
      for (const folderPath of [...folderTreePathsRef.current].reverse()) {
        if (folderPath === root || folderPath.startsWith(root)) {
          const item = asDirectoryHandle(model.getItem(folderPath));
          if (item) {
            item.collapse();
          }
        }
      }
    });
  }

  useLayoutEffect(() => {
    documentsRef.current = documents;
    pageMetaRef.current = pageMeta;
    activeDocNameRef.current = activeDocName;
    activeTargetRef.current = activeTarget;
    assetTreePathsRef.current = assetTreePaths;
    busyPathRef.current = busyPath;
    showHiddenFilesRef.current = showHiddenFiles;
    showOnlyMarkdownFilesRef.current = showOnlyMarkdownFiles;
    showOkFoldersRef.current = showOkFolders;
    treePathsRef.current = treePaths;
    folderTreePathsRef.current = folderTreePaths;
    activeAncestorTreePathsRef.current = activeAncestorTreePaths;
    userCollapsedActiveAncestorPathsRef.current = userCollapsedActiveAncestorPaths;
    uploadExternalFilesRef.current = (files, parentDir, uploadBusyPath) => {
      void uploadExternalFilesToTarget(files, parentDir, uploadBusyPath);
    };
    handleRenameErrorRef.current = (message) => {
      if (recoverMarkdownRenameConflict(message)) return;
      toast.error(message);
    };
    handleRenameRef.current = handleTreeRename;
    handleDropCompleteRef.current = handleDropComplete;
  });

  useFileTreeKeyboard({
    model,
    hostRef: fileTreeHostRef,
    documentsRef,
    assetTreePathsRef,
    folderTreePathsRef,
    treePathsRef,
    busyPathRef,
    copiedTargetRef: copiedKeyboardTargetRef,
    duplicateTargetRef: handleDuplicateTargetRef,
    suppressSelectionRef,
    setDeleteRequest,
  });

  useFileTreeRowPresentation({
    hostRef: fileTreeHostRef,
    loading,
    documentCount: documents.length,
  });

  // Snapshot cache for getFolderState() — keeps the returned object
  // reference-stable when {folderCount, expandedCount} are unchanged so
  // FileSidebar's `setFolderState(tree.getFolderState())` calls bail
  // out via React's `Object.is` instead of triggering redundant
  // re-renders. Allocates a fresh object only when values genuinely
  // shifted.
  const folderStateCacheRef = useRef<{ folderCount: number; expandedCount: number }>({
    folderCount: 0,
    expandedCount: 0,
  });

  // Stash the inline imperative closures in refs so useImperativeHandle's
  // deps array can stay `[model]` only. Without this, Biome's
  // useExhaustiveDependencies forces those identifiers into the deps and then
  // immediately complains they "change on every re-render" — a no-win box
  // because manual memoization (useCallback / useMemo) is banned in this
  // codebase per CLAUDE.md.
  //
  // Refs are synced in a useEffect (not during render) — React Compiler
  // disallows mutating `.current` during render. Effects run after commit
  // and before paint; by the time the handle methods fire on user
  // interaction (click), the ref is current.
  const startCreatingRef = useRef(startCreating);
  const startCreatingFromTemplateRef = useRef(startCreatingFromTemplate);
  useEffect(() => {
    startCreatingRef.current = startCreating;
    startCreatingFromTemplateRef.current = startCreatingFromTemplate;
  });

  useImperativeHandle(
    ref,
    () => ({
      startCreating(kind, parentDir) {
        void startCreatingRef.current(kind, parentDir);
      },
      startCreatingFromTemplate(parentDir) {
        startCreatingFromTemplateRef.current(parentDir);
      },
      createFromTemplate(parentDir, templateName) {
        void startCreatingRef.current('file', parentDir, { template: templateName });
      },
      expandAll() {
        startTransition(() => {
          for (const folderPath of folderTreePathsRef.current) {
            const item = asDirectoryHandle(model.getItem(folderPath));
            if (item) {
              item.expand();
            }
          }
        });
      },
      collapseAll() {
        startTransition(() => {
          for (const folderPath of [...folderTreePathsRef.current].reverse()) {
            const item = asDirectoryHandle(model.getItem(folderPath));
            if (item) {
              item.collapse();
            }
          }
        });
      },
      getFolderState() {
        // Read fresh from the model on every call — paths reflect any
        // pending /api/documents update via folderTreePathsRef, isExpanded()
        // reflects pending tree-model mutations from the current frame.
        const paths = folderTreePathsRef.current;
        let expandedCount = 0;
        for (const p of paths) {
          if (asDirectoryHandle(model.getItem(p))?.isExpanded()) expandedCount++;
        }
        const folderCount = paths.length;
        const cached = folderStateCacheRef.current;
        if (cached.folderCount === folderCount && cached.expandedCount === expandedCount) {
          return cached;
        }
        const next = { folderCount, expandedCount };
        folderStateCacheRef.current = next;
        return next;
      },
      isCreationTargetCleared() {
        return creationDirClearedRef.current;
      },
      clearCreationTarget() {
        setCreationDirCleared(true);
      },
      subscribe(listener: () => void) {
        // The Pierre tree model's subscribe fires on ALL tree-state changes:
        // expand, collapse, focus, AND resetPaths (which is invoked from the
        // documents-update effect at the resetPaths call site). One
        // subscription covers both the per-folder expand/collapse path AND
        // the folder-list-changed path that documents-fetched triggers. The
        // local listener set adds `creationDirCleared` (React state) changes,
        // which Pierre's model never observes.
        handleListenersRef.current.add(listener);
        const unsubscribeModel = model.subscribe(listener);
        return () => {
          handleListenersRef.current.delete(listener);
          unsubscribeModel();
        };
      },
    }),
    [model],
  );

  const { handleDeleteTargets, handleTrashFailureDeletePermanently, handleTrashFailureRetry } =
    createFileTreeTrashHandlers({
      documents: () => documentsRef.current,
      folderTreePaths: () => folderTreePathsRef.current,
      activeConflicts: () => activeConflicts,
      workspace: () => workspace,
      desktopBridge: () => (typeof window !== 'undefined' ? window.okDesktop : undefined),
      pendingCreate: () => pendingCreateRef.current,
      setDeleteRequest,
      trashFailure: () => trashFailure,
      setTrashFailure,
      setBusyPath,
      resetModelToDocuments,
      clearPendingCreate,
      closeTabs,
      docTabId,
      folderTabId,
      assetTabId,
      coerceTrashFailureReason,
      closeAndClearForRename,
      model,
      setDocuments,
      markNextDocumentsAsApplied,
      emitDocumentsChanged,
      fetch,
      toastError: toast.error,
      messages: {
        failedDelete: t`Failed to delete path`,
        failedCleanup: t`Failed to clean up after trash`,
        cleanupFailed: (count) =>
          t`Server-side cleanup failed for ${plural(count, { one: '# item', other: '# items' })}`,
        cleanupDescription: t`The file is in your Trash; the file-watcher will reconcile.`,
        conflict: t`Cannot delete files with unresolved conflicts`,
        couldNotComplete: t`Could not complete delete`,
      },
    });

  // Hold a ref to handleDeleteTargets so the menu-action subscription
  // effect below can keep its closure off the latest function identity
  // without forcing the effect to re-bind on every render. Declared after
  // the function declaration to keep React Compiler's
  // `PruneHoistedContexts` pass from tripping on the forward-reference
  // pattern the earlier startCreating refs benefit from (those functions
  // are declared above their refs).
  const handleDeleteTargetsRef = useRef(handleDeleteTargets);
  useEffect(() => {
    handleDeleteTargetsRef.current = handleDeleteTargets;
  });

  // Subscribe to the macOS File menu's `move-to-trash` request bus. The
  // FileSidebar menu-action handler emits when the user picks File → Move
  // to Trash; we convert the navigation-target snapshot to the same
  // `FileTreeTarget` shape the row context menu produces and route through
  // the existing 2-step Trash spine. One subscription owns the
  // surface so a hot-reload / remount tears down cleanly.
  //
  // docExt is looked up from `documentsRef` (the in-memory document list)
  // at fire-time so document trash flow + downstream rename hints render the
  // real `.md` / `.mdx` rather than guessing. Assets remain first-class
  // `kind: 'asset'` targets and share the same delete spine.
  useEffect(() => {
    return subscribeToFileTreeMenuActionDelete((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void handleDeleteTargetsRef.current([
          {
            kind: 'file',
            path: docName,
            name: docName.split('/').pop() ?? docName,
            docExt: docEntry?.docExt,
          },
        ]);
        return;
      }
      if (target.kind === 'folder') {
        void handleDeleteTargetsRef.current([
          {
            kind: 'folder',
            path: target.folderPath,
            name: target.folderPath.split('/').pop() ?? target.folderPath,
          },
        ]);
        return;
      }
      if (target.kind === 'asset') {
        void handleDeleteTargetsRef.current([
          {
            kind: 'asset',
            path: target.assetPath,
            name: target.assetPath.split('/').pop() ?? target.assetPath,
          },
        ]);
        return;
      }
      // missing — File menu's Move to Trash is disabled for this scope
      // upstream; the emit shouldn't fire. Logging the event so a future
      // drift between the menu-enable gate and the emitter is caught.
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-delete-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, []);

  // macOS File menu's `duplicate` item bridges to the same HTTP duplicate
  // spine the row context menu uses. Path resolution mirrors Rename/Delete:
  // doc + folder-index duplicate the file, folder duplicates the folder, and
  // asset + missing are guarded upstream by menu enablement.
  useEffect(() => {
    return subscribeToFileTreeMenuActionDuplicate((target: ResolvedNavigationTarget) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void handleDuplicateTargetRef.current({
          kind: 'file',
          path: docName,
          name: docName.split('/').pop() ?? docName,
          docExt: docEntry?.docExt,
        });
        return;
      }
      if (target.kind === 'folder') {
        void handleDuplicateTargetRef.current({
          kind: 'folder',
          path: target.folderPath,
          name: target.folderPath.split('/').pop() ?? target.folderPath,
        });
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-duplicate-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, []);

  // macOS File menu's `rename` item bridges to Pierre's inline-rename via
  // the model API. Path resolution per kind: doc + folder-index use
  // `docNameToTreePath(docName, docExt)` (extension lookup from documentsRef
  // mirrors the delete subscriber); folder uses folderPath directly.
  // asset uses the raw asset path; missing falls through to a structured
  // warn because the menu enable gate disables rename for that scope.
  useEffect(() => {
    return subscribeToFileTreeMenuActionRename((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        const treePath = docNameToTreePath(docName, docEntry?.docExt);
        model.startRenaming(treePath);
        return;
      }
      if (target.kind === 'folder') {
        model.startRenaming(target.folderPath);
        return;
      }
      if (target.kind === 'asset') {
        model.startRenaming(target.assetPath);
        return;
      }
      console.warn(
        JSON.stringify({
          event: 'file-tree-menu-action-rename-unsupported-kind',
          kind: target.kind,
        }),
      );
    });
  }, [model]);

  // The page header edits the extensionless basename in place, but FileTree
  // owns the managed rename transaction and all post-rename reconciliation.
  // Bridge the request here and preserve the document's current extension and
  // parent directory when constructing Pierre's raw rename event.
  useEffect(() => {
    return subscribeToPageHeaderRename(async ({ docName, docExt, nextTitle }) => {
      const sourcePath = docNameToTreePath(docName, docExt);
      const lastSlash = sourcePath.lastIndexOf('/');
      const parent = lastSlash < 0 ? '' : sourcePath.slice(0, lastSlash + 1);
      const extension = getFileExtension(sourcePath) || docExt;
      const destinationPath = `${parent}${nextTitle}${extension}`;
      const outcome = await handleRenameRef.current({
        sourcePath,
        destinationPath,
        isFolder: false,
      });
      return outcome;
    });
  }, []);

  const {
    cancelCurrentHoverPrewarm,
    handleTreeMouseMove,
    handleTreeClickCapture,
    handleEmptyExternalFileDragOver,
    handleEmptyExternalFileDragLeave,
    handleEmptyExternalFileDrop,
  } = useFileTreePointerInteractions({
    model,
    hostRef: fileTreeHostRef,
    documentsRef,
    treePathsRef,
    pendingExactFileSelectionRef,
    hoveredPrewarmDocRef,
    sidebarDocumentTabBehavior,
    setCreationDirCleared,
    setEmptyExternalFileDropActive,
    activateTreePath,
    navigateToFolderWithPulse,
    navigateToWithPulse,
    prewarm,
    uploadExternalFilesToTarget,
  });

  if (loading) {
    return <FileTreeSkeleton />;
  }

  // Calm reconnect copy shown in place of the red "Could not reach server"
  // error while the listing is silently re-attempted across a relaunch's full
  // lifecycle: "Relaunching…" while the relaunch is in flight, and (after an
  // aborted relaunch clears `relaunchInFlight` while a retry is still settling)
  // the honest "Reconnecting…".
  const reconnectNotice = reconnecting
    ? relaunchInFlight
      ? t`Relaunching to install the update…`
      : t`Reconnecting…`
    : null;

  if (documents.length === 0) {
    // The empty tree is the most likely state during a relaunch (zero docs
    // while the server is down), so both notices carry their live-region role
    // here too — matching `FileTreeHeaderNotice` on the populated path.
    if (reconnectNotice !== null) {
      return (
        <div className="flex flex-1 items-center justify-center py-8">
          <span role="status" className="select-none text-sidebar-foreground/50 text-sm">
            {reconnectNotice}
          </span>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center py-8">
          <span role="alert" className="select-none text-sidebar-foreground/50 text-sm">
            {error}
          </span>
        </div>
      );
    }
    if (
      classifyEmptyTree({
        visibility: { showHiddenFiles, showOnlyMarkdownFiles },
        unfilteredRootEntryCount,
        knownPageCount: pages.size,
      }) === 'filtered-to-zero'
    ) {
      return <FileTreeFilteredToZeroNotice />;
    }
    return (
      <section
        aria-label={t`File drop zone`}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-3 rounded-md py-8',
          emptyExternalFileDropActive && 'bg-primary/5 ring-2 ring-primary/70 ring-inset',
        )}
        onDragOver={handleEmptyExternalFileDragOver}
        onDragLeave={handleEmptyExternalFileDragLeave}
        onDrop={handleEmptyExternalFileDrop}
      >
        <span className="select-none text-sidebar-foreground/30 text-sm">
          <Trans>No files yet.</Trans>
        </span>
        <Button
          variant="link"
          size="sm"
          className="font-mono uppercase"
          onClick={() => startCreating('file', '')}
        >
          <Trans>Create your first file</Trans>
        </Button>
      </section>
    );
  }

  const anyActionBusy = busyPath !== null;
  const primaryDeleteTarget = deleteRequest?.targets[0] ?? null;
  // Sidebar files come from the disk walk, not the search index, so the
  // guidance must not point at search. Under lazy depth-1 loading the cap
  // applies per fetched level, so the count describes the truncated folder's
  // level — not the whole tree, which can legitimately show more rows than
  // the count.
  let truncationNotice: string | null = null;
  if (truncatedShownCount !== null) {
    const formattedCount = new Intl.NumberFormat(i18n.locale).format(truncatedShownCount);
    truncationNotice = plural(truncatedShownCount, {
      one: 'Showing the first item in one folder — the rest of that folder is hidden.',
      other: `Showing the first ${formattedCount} items in one folder — the rest of that folder is hidden.`,
    });
  }
  return (
    <>
      <FileTreeViewport
        hostRef={fileTreeHostRef}
        model={model}
        resolvedTheme={resolvedTheme}
        creationDirCleared={creationDirCleared}
        onContentHeightChange={onContentHeightChange}
        header={
          (error || reconnectNotice !== null || truncationNotice !== null) && (
            <>
              {reconnectNotice !== null ? (
                <FileTreeHeaderNotice kind="reconnecting">{reconnectNotice}</FileTreeHeaderNotice>
              ) : (
                error && <FileTreeHeaderNotice kind="error">{error}</FileTreeHeaderNotice>
              )}
              {truncationNotice !== null && (
                <FileTreeHeaderNotice kind="info">{truncationNotice}</FileTreeHeaderNotice>
              )}
            </>
          )
        }
        onClickCapture={handleTreeClickCapture}
        onMouseMove={handleTreeMouseMove}
        onMouseLeave={cancelCurrentHoverPrewarm}
        renderContextMenu={(item, context) => (
          <FileTreeMenu
            item={item}
            context={context}
            anyActionBusy={anyActionBusy}
            workspace={workspace}
            handoff={handoff}
            model={model}
            okignoreBinding={okignoreBinding}
            onStartCreating={startCreating}
            onCreateFromTemplate={(parentDir, templateName) =>
              startCreating('file', parentDir, { template: templateName })
            }
            onDuplicate={handleDuplicateTarget}
            onDelete={(targets) => setDeleteRequest({ targets })}
            onExpandSubtree={expandSubtree}
            onCollapseSubtree={collapseSubtree}
            folderTreePaths={folderTreePaths}
            isAsset={assetTreePaths.has(item.path)}
            documents={documents}
          />
        )}
      />
      <Dialog
        open={!!deleteRequest}
        onOpenChange={(open) => {
          if (!open && !busyPath) setDeleteRequest(null);
        }}
      >
        {deleteRequest && primaryDeleteTarget && (
          <DeleteConfirmationDialog
            // Trash flow on Electron uses VSCode-verbatim copy;
            // web mode (no OS Trash) keeps today's hard-delete copy.
            {...(() => {
              const variant: 'electron' | 'web' =
                typeof window !== 'undefined' && window.okDesktop != null ? 'electron' : 'web';
              const copy = selectTrashConfirmCopy(variant, deleteRequest.targets);
              if (copy) {
                return {
                  customTitle: copy.title,
                  customDescription: '',
                  customDetail: copy.detail,
                  customConfirmLabel: copy.confirmLabel,
                  customConfirmLabelBusy: copy.confirmLabelBusy,
                  children: copy.listedTargets ? (
                    <ul className="flex flex-col gap-1 font-mono text-foreground text-xs">
                      {copy.listedTargets.map((target) => (
                        <li key={`${target.kind}:${target.path}`} data-testid="delete-target-row">
                          {trashTargetDisplayName(target)}
                        </li>
                      ))}
                    </ul>
                  ) : null,
                };
              }
              // Web mode — preserve today's copy.
              const targetCount = deleteRequest.targets.length;
              const folderName = primaryDeleteTarget.name;
              return {
                itemName:
                  targetCount === 1
                    ? primaryDeleteTarget.kind === 'folder'
                      ? `${primaryDeleteTarget.name}/`
                      : primaryDeleteTarget.kind === 'file'
                        ? `${primaryDeleteTarget.name}${primaryDeleteTarget.docExt ?? '.md'}`
                        : primaryDeleteTarget.name
                    : undefined,
                customTitle: targetCount > 1 ? t`Delete selected items` : undefined,
                customDescription:
                  targetCount > 1
                    ? t`Are you sure you want to delete ${targetCount} selected items? Folders and all files inside them will be deleted. This action cannot be undone.`
                    : primaryDeleteTarget.kind === 'folder'
                      ? t`Are you sure you want to delete ${folderName}/ and all files inside? This action cannot be undone.`
                      : undefined,
              };
            })()}
            isSubmitting={busyPath !== null}
            onDelete={() => handleDeleteTargets(deleteRequest.targets)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!trashFailure}
        onOpenChange={(open) => {
          if (!open && !busyPath) setTrashFailure(null);
        }}
      >
        {trashFailure && (
          <TrashFailureModal
            failedTargets={trashFailure.failed}
            isSubmitting={busyPath !== null}
            onDeletePermanently={handleTrashFailureDeletePermanently}
            onRetry={handleTrashFailureRetry}
            onCancel={() => setTrashFailure(null)}
          />
        )}
      </Dialog>
      <NewItemDialog
        open={newItemRequest !== null}
        onOpenChange={(open) => {
          if (!open) setNewItemRequest(null);
        }}
        kind="file"
        initialDir={newItemRequest?.parentDir ?? ''}
        // This dialog is only opened via `startCreatingFromTemplate` (the
        // native macOS File → "New from Template…" item), so default the
        // picker to the first resolved template rather than Blank note.
        defaultToTemplate
      />
    </>
  );
}
