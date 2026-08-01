import { useLingui } from '@lingui/react/macro';
import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from 'react';
import type { FileEntry } from '@/components/file-tree-utils';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import type { ApplyRenamedDocumentsInput } from './apply-renamed-documents';
import { useFileTreeCreation } from './useFileTreeCreation';
import { useFileTreeFolderActions } from './useFileTreeFolderActions';
import { createDuplicateFileTreeMutation } from './useFileTreeMutations';
import { useFileTreeRenameCoordinator } from './useFileTreeRenameCoordinator';
import { useFileTreeUploads } from './useFileTreeUploads';

type Input = {
  model: PierreFileTreeModel;
  documentsRef: MutableRefObject<FileEntry[]>;
  treePaths: readonly string[];
  treePathsRef: MutableRefObject<string[]>;
  folderTreePathsRef: MutableRefObject<string[]>;
  assetTreePathsRef: MutableRefObject<Set<string>>;
  activeDocNameRef: MutableRefObject<string | null>;
  activeTargetRef: MutableRefObject<ResolvedNavigationTarget | null>;
  busyPathRef: MutableRefObject<string | null>;
  recentLocalAddsRef: MutableRefObject<Map<string, number>>;
  refreshDocsScheduleRef: MutableRefObject<(() => void) | null>;
  setBusyPath: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setDocuments: Dispatch<SetStateAction<FileEntry[]>>;
  resetModelToDocuments: (documents?: readonly FileEntry[]) => void;
  markNextDocumentsAsApplied: (documents: readonly FileEntry[]) => void;
  addPage: (docName: string) => void;
  navigateToWithPulse: (docName: string) => void;
  navigateToFolderWithPulse: (folderPath: string) => void;
  navigateToAssetWithPulse: (assetPath: string, documents: readonly FileEntry[]) => void;
  closeDocument: (docName: string) => void;
  closeTabs: (tabIds: string[], options: { force: boolean }) => void;
  getPoolActiveDocName: () => string | null;
  poolHas: (docName: string) => boolean;
  closeAndClearForRename: (docName: string) => Promise<void>;
  remapTabsForRename: ApplyRenamedDocumentsInput['remapTabsForRename'];
};

/** Owns create, duplicate, rename, upload, and folder-mutation actions for a mounted tree. */
export function useFileTreeMutationActions({
  model,
  documentsRef,
  treePaths,
  treePathsRef,
  folderTreePathsRef,
  assetTreePathsRef,
  activeDocNameRef,
  activeTargetRef,
  busyPathRef,
  recentLocalAddsRef,
  refreshDocsScheduleRef,
  setBusyPath,
  setError,
  setDocuments,
  resetModelToDocuments,
  markNextDocumentsAsApplied,
  addPage,
  navigateToWithPulse,
  navigateToFolderWithPulse,
  navigateToAssetWithPulse,
  closeDocument,
  closeTabs,
  getPoolActiveDocName,
  poolHas,
  closeAndClearForRename,
  remapTabsForRename,
}: Input) {
  const { t } = useLingui();
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
  const creation = useFileTreeCreation({
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
  const rename = useFileTreeRenameCoordinator({
    model,
    documentsRef,
    activeDocNameRef,
    activeTargetRef,
    assetTreePathsRef,
    folderTreePathsRef,
    treePathsRef,
    pendingCreateRef: creation.pendingCreateRef,
    setBusyPath,
    setError,
    setDocuments,
    resetModelToDocuments,
    markNextDocumentsAsApplied,
    cleanupPendingCreate: creation.cleanupPendingCreate,
    clearPendingCreate: creation.clearPendingCreate,
    getPoolActiveDocName,
    poolHas,
    closeAndClearForRename,
    addPage,
    remapTabsForRename,
    navigateToWithPulse,
    navigateToFolderWithPulse,
    navigateToAssetWithPulse,
  });
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
  const folderActions = useFileTreeFolderActions({ model, folderTreePathsRef });
  return {
    handleDuplicateTarget,
    handleDuplicateTargetRef,
    ...creation,
    ...rename,
    uploadExternalFilesToTarget,
    ...folderActions,
  };
}
