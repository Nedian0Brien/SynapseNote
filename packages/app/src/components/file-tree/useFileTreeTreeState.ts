import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import { type MutableRefObject, useLayoutEffect, useRef } from 'react';
import {
  collectTreeFolderPathsFromDocuments,
  computeTreeAncestorPaths,
  documentsToTreePaths,
  documentsTreePathSignature,
  folderPathToTreeDirectoryPath,
  treeDirectoryPathToFolderPath,
  treePathSignature,
} from '@/components/file-tree-adapter';
import type { FileEntry } from '@/components/file-tree-utils';
import { asDirectoryHandle } from '@/components/use-selection-mirror';

type Input = {
  model: PierreFileTreeModel;
  documents: FileEntry[];
  documentsRef: MutableRefObject<FileEntry[]>;
  showOkFolders: boolean;
  showOkFoldersRef: MutableRefObject<boolean>;
  selectedFolderPath: string | null;
  activeTreePath: string | null;
  activeNavigationPath: string | null;
  userCollapsedActiveAncestorPaths: ReadonlySet<string>;
  userCollapsedActiveAncestorPathsRef: MutableRefObject<ReadonlySet<string>>;
};

/** Owns tree path projections and reset expansion policy while preserving caller-owned document state. */
export function useFileTreeTreeState({
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
}: Input) {
  const treePaths = documentsToTreePaths(documents);
  const treePathsSignature = treePathSignature(treePaths);
  const treePathsRef = useRef(treePaths);
  const folderTreePaths = collectTreeFolderPathsFromDocuments(documents, {
    includeOkFolders: showOkFolders,
  });
  const folderTreePathsRef = useRef(folderTreePaths);
  const activeAncestorTreePaths = selectedFolderPath
    ? computeTreeAncestorPaths(folderPathToTreeDirectoryPath(selectedFolderPath)).slice(0, -1)
    : computeTreeAncestorPaths(activeTreePath ?? activeNavigationPath);
  const activeAncestorTreePathsRef = useRef<string[]>([]);
  const skipNextResetSignatureRef = useRef<string | null>(null);
  const activeAncestorTreePathsSignature = activeAncestorTreePaths.join('\0');
  const autoRevealActiveAncestorTreePathsSignature = activeAncestorTreePaths
    .filter((path) => !userCollapsedActiveAncestorPaths.has(path))
    .join('\0');
  useLayoutEffect(() => {
    treePathsRef.current = treePaths;
    folderTreePathsRef.current = folderTreePaths;
    activeAncestorTreePathsRef.current = activeAncestorTreePaths;
  }, [activeAncestorTreePaths, folderTreePaths, treePaths]);
  const normalizeSelectionPath = (treePath: string): string => {
    const item = model.getItem(treePath) ?? model.getItem(folderPathToTreeDirectoryPath(treePath));
    return item?.isDirectory()
      ? folderPathToTreeDirectoryPath(treeDirectoryPathToFolderPath(item.getPath()))
      : treePath;
  };
  const collectExpandedFolderTreePaths = () => {
    const expanded = new Set<string>();
    for (const folderPath of folderTreePathsRef.current) {
      if (asDirectoryHandle(model.getItem(folderPath))?.isExpanded()) expanded.add(folderPath);
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
      if (!userCollapsedActiveAncestorPathsRef.current.has(ancestor)) expanded.add(ancestor);
    }
    return [...expanded].filter((path) => nextFolderPaths.has(path));
  };
  const resetModelToDocuments = (nextDocuments?: readonly FileEntry[]) => {
    model.resetPaths(documentsToTreePaths(nextDocuments ?? documentsRef.current), {
      initialExpandedPaths: expandedPathsForReset(nextDocuments),
    });
  };
  const markNextDocumentsAsApplied = (nextDocuments: readonly FileEntry[]) => {
    skipNextResetSignatureRef.current = documentsTreePathSignature(nextDocuments);
  };
  return {
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
  };
}
