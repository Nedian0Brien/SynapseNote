import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import type { FileEntry } from '@/components/file-tree-utils';
import { useFileTreeKeyboard } from './useFileTreeKeyboard';
import { useFileTreePointerInteractions } from './useFileTreePointerInteractions';
import { useFileTreeRowPresentation } from './useFileTreeRowPresentation';
import { useFileTreeSelection } from './useFileTreeSelection';

type Input = {
  model: PierreFileTreeModel;
  loading: boolean;
  documentCount: number;
  documentsRef: MutableRefObject<FileEntry[]>;
  assetTreePathsRef: MutableRefObject<Set<string>>;
  folderTreePathsRef: MutableRefObject<string[]>;
  treePathsRef: MutableRefObject<string[]>;
  busyPathRef: MutableRefObject<string | null>;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  activeTreePath: string | null;
  baseActiveTreePath: string | null;
  treePathsSignature: string;
  activeAncestorTreePathsSignature: string;
  autoRevealActiveAncestorTreePathsSignature: string;
  suppressSelectionRef: MutableRefObject<boolean>;
  sidebarDragInProgressRef: MutableRefObject<boolean>;
  pendingExactFileSelectionRef: MutableRefObject<string | null>;
  activeAncestorTreePathsRef: MutableRefObject<string[]>;
  selectionChangeRef: MutableRefObject<(selectedPaths: readonly string[]) => void>;
  setCreationDirCleared: Dispatch<SetStateAction<boolean>>;
  setUserCollapsedActiveAncestorPaths: Dispatch<SetStateAction<ReadonlySet<string>>>;
  normalizeSelectionPath: (treePath: string) => string;
  activateTreePath: (treePath: string, entries?: readonly FileEntry[]) => void;
  copiedTargetRef: MutableRefObject<FileTreeTarget | null>;
  duplicateTargetRef: MutableRefObject<(target: FileTreeTarget) => Promise<void>>;
  setDeleteRequest: Dispatch<SetStateAction<{ targets: FileTreeTarget[] } | null>>;
  hoveredPrewarmDocRef: MutableRefObject<string | null>;
  sidebarDocumentTabBehavior: 'append' | 'replace-active';
  setEmptyExternalFileDropActive: Dispatch<SetStateAction<boolean>>;
  navigateToFolderWithPulse: (folderPath: string) => void;
  navigateToWithPulse: (docName: string) => void;
  prewarm: (docName: string) => string | null;
  uploadExternalFilesToTarget: (
    files: readonly File[],
    parentDir: string,
    busyPath: string,
  ) => Promise<void>;
};

/** Binds DOM selection, keyboard, pointer, and command events to the live tree model. */
export function useFileTreeEventBindings({
  model,
  loading,
  documentCount,
  documentsRef,
  assetTreePathsRef,
  folderTreePathsRef,
  treePathsRef,
  busyPathRef,
  hostRef,
  activeTreePath,
  baseActiveTreePath,
  treePathsSignature,
  activeAncestorTreePathsSignature,
  autoRevealActiveAncestorTreePathsSignature,
  suppressSelectionRef,
  sidebarDragInProgressRef,
  pendingExactFileSelectionRef,
  activeAncestorTreePathsRef,
  selectionChangeRef,
  setCreationDirCleared,
  setUserCollapsedActiveAncestorPaths,
  normalizeSelectionPath,
  activateTreePath,
  copiedTargetRef,
  duplicateTargetRef,
  setDeleteRequest,
  hoveredPrewarmDocRef,
  sidebarDocumentTabBehavior,
  setEmptyExternalFileDropActive,
  navigateToFolderWithPulse,
  navigateToWithPulse,
  prewarm,
  uploadExternalFilesToTarget,
}: Input) {
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
    fileTreeHostRef: hostRef,
    handleSelectionChangeRef: selectionChangeRef,
    documentsRef,
    setCreationDirCleared,
    setUserCollapsedActiveAncestorPaths,
    normalizeSelectionPath,
    activateTreePath,
  });
  useFileTreeKeyboard({
    model,
    hostRef,
    documentsRef,
    assetTreePathsRef,
    folderTreePathsRef,
    treePathsRef,
    busyPathRef,
    copiedTargetRef,
    duplicateTargetRef,
    suppressSelectionRef,
    setDeleteRequest,
  });
  useFileTreeRowPresentation({ hostRef, loading, documentCount });
  return useFileTreePointerInteractions({
    model,
    hostRef,
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
}
