import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useTheme } from 'next-themes';
import { useEffect, useLayoutEffect } from 'react';
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
import { useFileTreeDocumentState } from './file-tree/useFileTreeDocumentState';
import { useFileTreeDragAndDrop } from './file-tree/useFileTreeDragAndDrop';
import { useFileTreeEventBindings } from './file-tree/useFileTreeEventBindings';
import { useFileTreeImperativeHandle } from './file-tree/useFileTreeImperativeHandle';
import { useFileTreeInteractionState } from './file-tree/useFileTreeInteractionState';
import { useFileTreeModel } from './file-tree/useFileTreeModel';
import { useFileTreeMutationActions } from './file-tree/useFileTreeMutationActions';
import { useFileTreeNavigation } from './file-tree/useFileTreeNavigation';
import { useFileTreeRefresh } from './file-tree/useFileTreeRefresh';
import { createFileTreeTrashHandlers } from './file-tree/useFileTreeTrash';
import { useFileTreeTreeState } from './file-tree/useFileTreeTreeState';
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
  const listing = useFileTreeDocumentState();
  const navigation = useFileTreeNavigation({
    documents: listing.documents,
    sidebarDocumentTabBehavior,
  });
  // Tracks the project-level conflict list so delete/move-to-trash can refuse
  // up front when a target (or any child of a target folder) is conflicted.
  // The HTTP `handleDeletePath` already gates conflicts; the Electron Move-
  // to-Trash flow does NOT (Step 1 is `shell.trashItem`, an OS call), so we
  // refuse here before the file leaves disk.
  const { conflicts: activeConflicts } = useConflicts();
  const workspace = useFileTreeWorkspace();
  const interaction = useFileTreeInteractionState({
    pageMeta: navigation.pageMeta,
    activeDocName: navigation.activeDocName,
    activeTarget: navigation.activeTarget,
  });

  const {
    reconnecting,
    relaunchInFlight,
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
  } = useFileTreeConnectivity({
    refreshDocsScheduleRef: listing.refreshDocsScheduleRef,
    setError: listing.setError,
    unreachableMessage: t`Could not reach server`,
  });

  useFileTreeDragAndDrop({
    fileTreeHostRef: interaction.fileTreeHostRef,
    documents: listing.documents,
    documentsRef: listing.documentsRef,
    pageMetaRef: interaction.pageMetaRef,
    loading: listing.loading,
    sidebarDragInProgressRef: interaction.sidebarDragInProgressRef,
    sidebarDragClearTimerRef: interaction.sidebarDragClearTimerRef,
    externalFileDropTargetRef: interaction.externalFileDropTargetRef,
    uploadExternalFilesRef: interaction.uploadExternalFilesRef,
  });

  // When the user has cleared the creation target (empty-space click), drop the
  // row highlight without disturbing the editor. `useSelectionMirror` keys off
  // this null to deselect; the reset effect below re-couples on any nav change.
  const activeTreePath = interaction.creationDirCleared ? null : navigation.baseActiveTreePath;

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
    documentsRef: listing.documentsRef,
    busyPathRef: listing.busyPathRef,
    selectionChangeRef: interaction.handleSelectionChangeRef,
    renameRef: interaction.handleRenameRef,
    renameErrorRef: interaction.handleRenameErrorRef,
    dropCompleteRef: interaction.handleDropCompleteRef,
  });

  const tree = useFileTreeTreeState({
    model,
    documents: listing.documents,
    documentsRef: listing.documentsRef,
    showOkFolders,
    showOkFoldersRef: listing.showOkFoldersRef,
    selectedFolderPath: navigation.selectedFolderPath,
    activeTreePath,
    activeNavigationPath: navigation.activeNavigationPath,
    userCollapsedActiveAncestorPaths: interaction.userCollapsedActiveAncestorPaths,
    userCollapsedActiveAncestorPathsRef: interaction.userCollapsedActiveAncestorPathsRef,
  });

  const {
    handleDuplicateTarget,
    handleDuplicateTargetRef,
    newItemRequest,
    setNewItemRequest,
    pendingCreateRef,
    clearPendingCreate,
    cleanupPendingCreateRef,
    startCreating,
    startCreatingFromTemplate,
    handleTreeRename,
    handleDropComplete,
    recoverMarkdownRenameConflict,
    uploadExternalFilesToTarget,
    expandSubtree,
    collapseSubtree,
  } = useFileTreeMutationActions({
    model,
    documentsRef: listing.documentsRef,
    treePaths: tree.treePaths,
    treePathsRef: tree.treePathsRef,
    folderTreePathsRef: tree.folderTreePathsRef,
    assetTreePathsRef: listing.assetTreePathsRef,
    activeDocNameRef: interaction.activeDocNameRef,
    activeTargetRef: interaction.activeTargetRef,
    busyPathRef: listing.busyPathRef,
    recentLocalAddsRef: listing.recentLocalAddsRef,
    refreshDocsScheduleRef: listing.refreshDocsScheduleRef,
    setBusyPath: listing.setBusyPath,
    setError: listing.setError,
    setDocuments: listing.setDocuments,
    resetModelToDocuments: tree.resetModelToDocuments,
    markNextDocumentsAsApplied: tree.markNextDocumentsAsApplied,
    addPage: navigation.addPage,
    navigateToWithPulse: navigation.navigateToWithPulse,
    navigateToFolderWithPulse: navigation.navigateToFolderWithPulse,
    navigateToAssetWithPulse: navigation.navigateToAssetWithPulse,
    closeDocument,
    closeTabs,
    getPoolActiveDocName,
    poolHas,
    closeAndClearForRename,
    remapTabsForRename,
  });

  useFileTreeRefresh({
    model,
    documentsRef: listing.documentsRef,
    setDocuments: listing.setDocuments,
    setLoading: listing.setLoading,
    setError: listing.setError,
    setTruncatedShownCount: listing.setTruncatedShownCount,
    setUnfilteredRootEntryCount: listing.setUnfilteredRootEntryCount,
    recentLocalAddsRef: listing.recentLocalAddsRef,
    lazyLoadedDirTreePathsRef: listing.lazyLoadedDirTreePathsRef,
    lazyChildFetchControllersRef: listing.lazyChildFetchControllersRef,
    lazyChildFetchGenerationRef: listing.lazyChildFetchGenerationRef,
    prevExpandedFolderTreePathsRef: listing.prevExpandedFolderTreePathsRef,
    showOkFoldersRef: listing.showOkFoldersRef,
    treeVisibilityFromRefs: listing.treeVisibilityFromRefs,
    collectExpandedFolderTreePaths: tree.collectExpandedFolderTreePaths,
    refreshDocsScheduleRef: listing.refreshDocsScheduleRef,
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
    showHiddenFiles,
    showOnlyMarkdownFiles,
    showOkFolders,
    treePathsSignature: tree.treePathsSignature,
    treePathsRef: tree.treePathsRef,
    skipNextResetSignatureRef: tree.skipNextResetSignatureRef,
    expandedPathsForReset: tree.expandedPathsForReset,
  });

  const {
    cancelCurrentHoverPrewarm,
    handleTreeMouseMove,
    handleTreeClickCapture,
    handleEmptyExternalFileDragOver,
    handleEmptyExternalFileDragLeave,
    handleEmptyExternalFileDrop,
  } = useFileTreeEventBindings({
    model,
    documentCount: listing.documents.length,
    activeTreePath,
    baseActiveTreePath: navigation.baseActiveTreePath,
    treePathsSignature: tree.treePathsSignature,
    loading: listing.loading,
    activeAncestorTreePathsSignature: tree.activeAncestorTreePathsSignature,
    autoRevealActiveAncestorTreePathsSignature: tree.autoRevealActiveAncestorTreePathsSignature,
    suppressSelectionRef: interaction.suppressSelectionRef,
    sidebarDragInProgressRef: interaction.sidebarDragInProgressRef,
    pendingExactFileSelectionRef: interaction.pendingExactFileSelectionRef,
    activeAncestorTreePathsRef: tree.activeAncestorTreePathsRef,
    hostRef: interaction.fileTreeHostRef,
    selectionChangeRef: interaction.handleSelectionChangeRef,
    documentsRef: listing.documentsRef,
    setCreationDirCleared: interaction.setCreationDirCleared,
    setUserCollapsedActiveAncestorPaths: interaction.setUserCollapsedActiveAncestorPaths,
    normalizeSelectionPath: tree.normalizeSelectionPath,
    activateTreePath: navigation.activateTreePath,
    assetTreePathsRef: listing.assetTreePathsRef,
    folderTreePathsRef: tree.folderTreePathsRef,
    treePathsRef: tree.treePathsRef,
    busyPathRef: listing.busyPathRef,
    copiedTargetRef: interaction.copiedKeyboardTargetRef,
    duplicateTargetRef: handleDuplicateTargetRef,
    setDeleteRequest: interaction.setDeleteRequest,
    hoveredPrewarmDocRef: interaction.hoveredPrewarmDocRef,
    sidebarDocumentTabBehavior,
    setEmptyExternalFileDropActive: interaction.setEmptyExternalFileDropActive,
    navigateToFolderWithPulse: navigation.navigateToFolderWithPulse,
    navigateToWithPulse: navigation.navigateToWithPulse,
    prewarm,
    uploadExternalFilesToTarget,
  });

  // Bridge `creationDirCleared` (React state) to the imperative handle's
  // subscribers (FileSidebar) — Pierre's model.subscribe doesn't observe React
  // state, so notify the handle listeners explicitly on change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: both refs are stable lifecycle holders returned by the interaction-state hook.
  useEffect(() => {
    interaction.creationDirClearedRef.current = interaction.creationDirCleared;
    for (const listener of interaction.handleListenersRef.current) listener();
  }, [interaction.creationDirCleared]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pending-create and cleanup callbacks flow through stable refs; listener lifecycle follows the tree model.
  useEffect(() => {
    return model.onMutation('remove', (event) => {
      const pending = pendingCreateRef.current;
      if (!pending || event.path !== pending.renamePath) return;
      void cleanupPendingCreateRef.current(pending);
    });
  }, [model]);

  useLayoutEffect(() => {
    listing.documentsRef.current = listing.documents;
    interaction.pageMetaRef.current = navigation.pageMeta;
    interaction.activeDocNameRef.current = navigation.activeDocName;
    interaction.activeTargetRef.current = navigation.activeTarget;
    listing.assetTreePathsRef.current = listing.assetTreePaths;
    listing.busyPathRef.current = listing.busyPath;
    listing.showHiddenFilesRef.current = showHiddenFiles;
    listing.showOnlyMarkdownFilesRef.current = showOnlyMarkdownFiles;
    listing.showOkFoldersRef.current = showOkFolders;
    tree.treePathsRef.current = tree.treePaths;
    tree.folderTreePathsRef.current = tree.folderTreePaths;
    tree.activeAncestorTreePathsRef.current = tree.activeAncestorTreePaths;
    interaction.userCollapsedActiveAncestorPathsRef.current =
      interaction.userCollapsedActiveAncestorPaths;
    interaction.uploadExternalFilesRef.current = (files, parentDir, uploadBusyPath) => {
      void uploadExternalFilesToTarget(files, parentDir, uploadBusyPath);
    };
    interaction.handleRenameErrorRef.current = (message) => {
      if (recoverMarkdownRenameConflict(message)) return;
      toast.error(message);
    };
    interaction.handleRenameRef.current = handleTreeRename;
    interaction.handleDropCompleteRef.current = handleDropComplete;
  });

  useFileTreeImperativeHandle({
    ref,
    model,
    folderTreePathsRef: tree.folderTreePathsRef,
    creationDirClearedRef: interaction.creationDirClearedRef,
    handleListenersRef: interaction.handleListenersRef,
    setCreationDirCleared: interaction.setCreationDirCleared,
    startCreating,
    startCreatingFromTemplate,
  });

  const { handleDeleteTargets, handleTrashFailureDeletePermanently, handleTrashFailureRetry } =
    createFileTreeTrashHandlers({
      documents: () => listing.documentsRef.current,
      folderTreePaths: () => tree.folderTreePathsRef.current,
      activeConflicts: () => activeConflicts,
      workspace: () => workspace,
      desktopBridge: () => (typeof window !== 'undefined' ? window.okDesktop : undefined),
      pendingCreate: () => pendingCreateRef.current,
      setDeleteRequest: interaction.setDeleteRequest,
      trashFailure: () => interaction.trashFailure,
      setTrashFailure: interaction.setTrashFailure,
      setBusyPath: listing.setBusyPath,
      resetModelToDocuments: tree.resetModelToDocuments,
      clearPendingCreate,
      closeTabs,
      docTabId,
      folderTabId,
      assetTabId,
      coerceTrashFailureReason,
      closeAndClearForRename,
      model,
      setDocuments: listing.setDocuments,
      markNextDocumentsAsApplied: tree.markNextDocumentsAsApplied,
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
    documentsRef: listing.documentsRef,
    onDeleteTargets: handleDeleteTargets,
    duplicateTargetRef: handleDuplicateTargetRef,
    renameRef: interaction.handleRenameRef,
  });

  return (
    <FileTreeSurface
      loading={listing.loading}
      documents={listing.documents}
      error={listing.error}
      reconnecting={reconnecting}
      relaunchInFlight={relaunchInFlight}
      truncatedShownCount={listing.truncatedShownCount}
      showHiddenFiles={showHiddenFiles}
      showOnlyMarkdownFiles={showOnlyMarkdownFiles}
      unfilteredRootEntryCount={listing.unfilteredRootEntryCount}
      pageCount={navigation.pages?.size ?? 0}
      emptyExternalFileDropActive={interaction.emptyExternalFileDropActive}
      onEmptyExternalFileDragOver={handleEmptyExternalFileDragOver}
      onEmptyExternalFileDragLeave={handleEmptyExternalFileDragLeave}
      onEmptyExternalFileDrop={handleEmptyExternalFileDrop}
      onCreateFirstFile={() => startCreating('file', '')}
      hostRef={interaction.fileTreeHostRef}
      model={model}
      resolvedTheme={resolvedTheme}
      creationDirCleared={interaction.creationDirCleared}
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
      onDelete={(targets) => interaction.setDeleteRequest({ targets })}
      onExpandSubtree={expandSubtree}
      onCollapseSubtree={collapseSubtree}
      folderTreePaths={tree.folderTreePaths}
      assetTreePaths={listing.assetTreePaths}
      anyActionBusy={listing.busyPath !== null}
      dialogs={
        <FileTreeDialogs
          deleteRequest={interaction.deleteRequest}
          busy={listing.busyPath !== null}
          onCloseDelete={() => interaction.setDeleteRequest(null)}
          onDelete={handleDeleteTargets}
          trashFailure={interaction.trashFailure}
          onCloseTrashFailure={() => interaction.setTrashFailure(null)}
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
