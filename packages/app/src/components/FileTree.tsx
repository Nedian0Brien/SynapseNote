import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useTheme } from 'next-themes';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';
import { coerceTrashFailureReason } from '@/components/TrashFailureModal';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentTabs } from '@/editor/document-context/useDocumentTabs';
import { assetTabId, docTabId, folderTabId } from '@/editor/editor-tabs';
import { useConflicts } from '@/hooks/use-conflicts';
import { useConfigContext } from '@/lib/config-provider';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { FileTreeDialogs } from './file-tree/FileTreeDialogs';
import { FileTreeSurface } from './file-tree/FileTreeSurface';
import type { FileTreeProps } from './file-tree/file-tree-types';
import { useFileTreeCommandSubscriptions } from './file-tree/useFileTreeCommandSubscriptions';
import { useFileTreeConnectivity } from './file-tree/useFileTreeConnectivity';
import { useFileTreeCreation } from './file-tree/useFileTreeCreation';
import { useFileTreeDocumentState } from './file-tree/useFileTreeDocumentState';
import { useFileTreeDragAndDrop } from './file-tree/useFileTreeDragAndDrop';
import { useFileTreeFolderActions } from './file-tree/useFileTreeFolderActions';
import { useFileTreeImperativeHandle } from './file-tree/useFileTreeImperativeHandle';
import { useFileTreeInteractionState } from './file-tree/useFileTreeInteractionState';
import { useFileTreeKeyboard } from './file-tree/useFileTreeKeyboard';
import { useFileTreeModel } from './file-tree/useFileTreeModel';
import { createDuplicateFileTreeMutation } from './file-tree/useFileTreeMutations';
import { useFileTreeNavigation } from './file-tree/useFileTreeNavigation';
import { useFileTreePointerInteractions } from './file-tree/useFileTreePointerInteractions';
import { useFileTreeRefresh } from './file-tree/useFileTreeRefresh';
import { useFileTreeRenameCoordinator } from './file-tree/useFileTreeRenameCoordinator';
import { useFileTreeRowPresentation } from './file-tree/useFileTreeRowPresentation';
import { useFileTreeSelection } from './file-tree/useFileTreeSelection';
import { createFileTreeTrashHandlers } from './file-tree/useFileTreeTrash';
import { useFileTreeTreeState } from './file-tree/useFileTreeTreeState';
import { useFileTreeUploads } from './file-tree/useFileTreeUploads';
import { useFileTreeWorkspace } from './file-tree/useFileTreeWorkspace';
import { useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';

export type { FileTreeHandle } from './file-tree/file-tree-types';

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
  const {
    documents,
    setDocuments,
    loading,
    setLoading,
    error,
    setError,
    truncatedShownCount,
    setTruncatedShownCount,
    unfilteredRootEntryCount,
    setUnfilteredRootEntryCount,
    busyPath,
    setBusyPath,
    documentsRef,
    assetTreePaths,
    assetTreePathsRef,
    busyPathRef,
    recentLocalAddsRef,
    lazyLoadedDirTreePathsRef,
    lazyChildFetchControllersRef,
    lazyChildFetchGenerationRef,
    prevExpandedFolderTreePathsRef,
    showHiddenFilesRef,
    showOnlyMarkdownFilesRef,
    showOkFoldersRef,
    treeVisibilityFromRefs,
    refreshDocsScheduleRef,
  } = useFileTreeDocumentState();
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
  // Tracks the project-level conflict list so delete/move-to-trash can refuse
  // up front when a target (or any child of a target folder) is conflicted.
  // The HTTP `handleDeletePath` already gates conflicts; the Electron Move-
  // to-Trash flow does NOT (Step 1 is `shell.trashItem`, an OS call), so we
  // refuse here before the file leaves disk.
  const { conflicts: activeConflicts } = useConflicts();
  const workspace = useFileTreeWorkspace();
  const {
    deleteRequest,
    setDeleteRequest,
    trashFailure,
    setTrashFailure,
    creationDirCleared,
    setCreationDirCleared,
    creationDirClearedRef,
    userCollapsedActiveAncestorPaths,
    setUserCollapsedActiveAncestorPaths,
    userCollapsedActiveAncestorPathsRef,
    handleListenersRef,
    pageMetaRef,
    pendingExactFileSelectionRef,
    activeDocNameRef,
    hoveredPrewarmDocRef,
    suppressSelectionRef,
    sidebarDragInProgressRef,
    sidebarDragClearTimerRef,
    externalFileDropTargetRef,
    uploadExternalFilesRef,
    copiedKeyboardTargetRef,
    fileTreeHostRef,
    handleSelectionChangeRef,
    handleRenameRef,
    handleRenameErrorRef,
    handleDropCompleteRef,
    activeTargetRef,
    emptyExternalFileDropActive,
    setEmptyExternalFileDropActive,
  } = useFileTreeInteractionState({ pageMeta, activeDocName, activeTarget });

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

  useFileTreeRefresh({
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
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
    showHiddenFiles,
    showOnlyMarkdownFiles,
    showOkFolders,
    treePathsSignature,
    treePathsRef,
    skipNextResetSignatureRef,
    expandedPathsForReset,
  });

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: both refs are stable lifecycle holders returned by the interaction-state hook.
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

  const { expandSubtree, collapseSubtree } = useFileTreeFolderActions({
    model,
    folderTreePathsRef,
  });

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
