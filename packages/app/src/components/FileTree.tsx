import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { WorkspaceSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { FileTreeDropResult, FileTreeRenameEvent } from '@pierre/trees';
import { useTheme } from 'next-themes';
import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fileEntryToTreePath, folderPathToTreeDirectoryPath } from '@/components/file-tree-adapter';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import { type FileEntry, isAssetEntry } from '@/components/file-tree-utils';
import { coerceTrashFailureReason, type TrashFailedTarget } from '@/components/TrashFailureModal';
import { asDirectoryHandle } from '@/components/use-selection-mirror';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentTabs } from '@/editor/document-context/useDocumentTabs';
import { assetTabId, docTabId, folderTabId } from '@/editor/editor-tabs';
import { useConflicts } from '@/hooks/use-conflicts';
import { useConfigContext } from '@/lib/config-provider';
import { emitDocumentsChanged } from '@/lib/documents-events';
import type { PageHeaderRenameResult } from '@/lib/page-header-rename-events';
import { parseSuccessOrWarn } from '@/lib/parse-server-response';
import { FileTreeDialogs } from './file-tree/FileTreeDialogs';
import { FileTreeSurface } from './file-tree/FileTreeSurface';
import type { FileTreeProps } from './file-tree/file-tree-types';
import { useFileTreeCommandSubscriptions } from './file-tree/useFileTreeCommandSubscriptions';
import { useFileTreeConnectivity } from './file-tree/useFileTreeConnectivity';
import { useFileTreeCreation } from './file-tree/useFileTreeCreation';
import { useFileTreeDragAndDrop } from './file-tree/useFileTreeDragAndDrop';
import { useFileTreeImperativeHandle } from './file-tree/useFileTreeImperativeHandle';
import { useFileTreeKeyboard } from './file-tree/useFileTreeKeyboard';
import { useFileTreeModel } from './file-tree/useFileTreeModel';
import { createDuplicateFileTreeMutation } from './file-tree/useFileTreeMutations';
import { useFileTreeNavigation } from './file-tree/useFileTreeNavigation';
import { useFileTreePointerInteractions } from './file-tree/useFileTreePointerInteractions';
import { useFileTreeRenameCoordinator } from './file-tree/useFileTreeRenameCoordinator';
import { useFileTreeRowPresentation } from './file-tree/useFileTreeRowPresentation';
import { useFileTreeSelection } from './file-tree/useFileTreeSelection';
import { useFileTreeShowAll } from './file-tree/useFileTreeShowAll';
import { createFileTreeTrashHandlers } from './file-tree/useFileTreeTrash';
import { useFileTreeTreeState } from './file-tree/useFileTreeTreeState';
import { useFileTreeUploads } from './file-tree/useFileTreeUploads';
import { useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';

export type { FileTreeHandle } from './file-tree/file-tree-types';

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
  const { t } = useLingui();
  const { closeTabs, closeDocument, remapTabsForRename } = useDocumentTabs();
  const { closeAndClearForRename, getPoolActiveDocName, poolHas, prewarm } =
    useDocumentCollaboration();
  const { resolvedTheme } = useTheme();
  const { okignoreBinding, merged } = useConfigContext();
  const sidebarDocumentTabBehavior =
    merged?.editor?.sidebarOpenBehavior === 'current-tab' ? 'replace-active' : 'append';
  const [documents, setDocuments] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    activeDocName,
    activeTarget,
    addPage,
    pageMeta,
    pages,
    selectedFolderPath,
    activeNavigationPath,
    baseActiveTreePath,
    navigateToWithPulse,
    navigateToFolderWithPulse,
    navigateToAssetWithPulse,
    activateTreePath,
  } = useFileTreeNavigation({ documents, sidebarDocumentTabBehavior });
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
  const activeDocNameRef = useRef(activeDocName);
  const assetTreePaths = new Set(
    documents.filter(isAssetEntry).map((entry) => fileEntryToTreePath(entry)),
  );
  const assetTreePathsRef = useRef(assetTreePaths);
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

  const {
    reconnecting,
    relaunchInFlight,
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
  } = useFileTreeConnectivity({
    refreshDocsScheduleRef,
    setError,
    unreachableMessage: t`Could not reach server`,
  });

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

  const { model } = useFileTreeModel({
    documentsRef,
    busyPathRef,
    selectionChangeRef: handleSelectionChangeRef,
    renameRef: handleRenameRef,
    renameErrorRef: handleRenameErrorRef,
    dropCompleteRef: handleDropCompleteRef,
  });

  const {
    treePaths,
    treePathsSignature,
    treePathsRef,
    folderTreePaths,
    folderTreePathsRef,
    activeAncestorTreePaths,
    activeAncestorTreePathsRef,
    activeAncestorTreePathsSignature,
    autoRevealActiveAncestorTreePathsSignature,
    skipNextResetSignatureRef,
    normalizeSelectionPath,
    collectExpandedFolderTreePaths,
    expandedPathsForReset,
    resetModelToDocuments,
    markNextDocumentsAsApplied,
  } = useFileTreeTreeState({
    model,
    documents,
    documentsRef,
    showOkFolders,
    showOkFoldersRef,
    selectedFolderPath,
    activeTreePath,
    activeNavigationPath,
    userCollapsedActiveAncestorPaths,
    userCollapsedActiveAncestorPathsRef,
  });

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

  const { handleTreeRename, handleDropComplete, recoverMarkdownRenameConflict } =
    useFileTreeRenameCoordinator({
      model,
      documentsRef,
      activeDocNameRef,
      activeTargetRef,
      assetTreePathsRef,
      folderTreePathsRef,
      treePathsRef,
      pendingCreateRef,
      setBusyPath,
      setError,
      setDocuments,
      resetModelToDocuments,
      markNextDocumentsAsApplied,
      cleanupPendingCreate,
      clearPendingCreate,
      getPoolActiveDocName,
      poolHas,
      closeAndClearForRename,
      addPage,
      remapTabsForRename,
      navigateToWithPulse,
      navigateToFolderWithPulse,
      navigateToAssetWithPulse,
    });

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

  const uploadExternalFilesToTarget = useFileTreeUploads({
    busyPathRef,
    recentLocalAddsRef,
    refreshDocsScheduleRef,
    setBusyPath,
    setError,
    setDocuments,
    addPage,
    resetModelToDocuments,
    markNextDocumentsAsApplied,
  });

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

  useFileTreeImperativeHandle({
    ref,
    model,
    folderTreePathsRef,
    creationDirClearedRef,
    handleListenersRef,
    setCreationDirCleared,
    startCreating,
    startCreatingFromTemplate,
  });

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

  useFileTreeCommandSubscriptions({
    model,
    documentsRef,
    onDeleteTargets: handleDeleteTargets,
    duplicateTargetRef: handleDuplicateTargetRef,
    renameRef: handleRenameRef,
  });

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

  return (
    <FileTreeSurface
      loading={loading}
      documents={documents}
      error={error}
      reconnecting={reconnecting}
      relaunchInFlight={relaunchInFlight}
      truncatedShownCount={truncatedShownCount}
      showHiddenFiles={showHiddenFiles}
      showOnlyMarkdownFiles={showOnlyMarkdownFiles}
      unfilteredRootEntryCount={unfilteredRootEntryCount}
      pageCount={pages.size}
      emptyExternalFileDropActive={emptyExternalFileDropActive}
      onEmptyExternalFileDragOver={handleEmptyExternalFileDragOver}
      onEmptyExternalFileDragLeave={handleEmptyExternalFileDragLeave}
      onEmptyExternalFileDrop={handleEmptyExternalFileDrop}
      onCreateFirstFile={() => startCreating('file', '')}
      hostRef={fileTreeHostRef}
      model={model}
      resolvedTheme={resolvedTheme}
      creationDirCleared={creationDirCleared}
      onContentHeightChange={onContentHeightChange}
      onClickCapture={handleTreeClickCapture}
      onMouseMove={handleTreeMouseMove}
      onMouseLeave={cancelCurrentHoverPrewarm}
      workspace={workspace}
      handoff={handoff}
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
      assetTreePaths={assetTreePaths}
      anyActionBusy={busyPath !== null}
      dialogs={
        <FileTreeDialogs
          deleteRequest={deleteRequest}
          busy={busyPath !== null}
          onCloseDelete={() => setDeleteRequest(null)}
          onDelete={handleDeleteTargets}
          trashFailure={trashFailure}
          onCloseTrashFailure={() => setTrashFailure(null)}
          onDeletePermanently={handleTrashFailureDeletePermanently}
          onRetry={handleTrashFailureRetry}
          newItemOpen={newItemRequest !== null}
          newItemInitialDir={newItemRequest?.parentDir ?? ''}
          onCloseNewItem={() => setNewItemRequest(null)}
        />
      }
    />
  );
}
