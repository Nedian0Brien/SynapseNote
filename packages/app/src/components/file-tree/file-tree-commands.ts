import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import {
  folderPathToTreeDirectoryPath,
  treeDirectoryPathToFolderPath,
  treeItemToTarget,
} from '@/components/file-tree-adapter';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import type { FileEntry } from '@/components/file-tree-utils';
import { hasOkPathSegment, isAssetEntry, isDocumentEntry } from '@/components/file-tree-utils';

export function treePathToTarget(
  treePath: string,
  documents: readonly FileEntry[],
): FileTreeTarget {
  return treeItemToTarget(
    {
      kind: treePath.endsWith('/') ? 'directory' : 'file',
      name: treePath,
      path: treePath,
    },
    documents,
  );
}

export function alternateMarkdownTreePath(treePath: string): string | null {
  const match = treePath.match(/\.(md|mdx)$/i);
  if (!match) return null;
  const ext = match[0].toLowerCase();
  const alternateExt = ext === '.md' ? '.mdx' : '.md';
  return `${treePath.slice(0, -match[0].length)}${alternateExt}`;
}

export function hasSameStemMarkdownSiblingTreePath(
  treePath: string,
  treePaths: readonly string[],
): boolean {
  const alternate = alternateMarkdownTreePath(treePath);
  return alternate !== null && treePaths.includes(alternate);
}

export function isTreePathInsideFolder(treePath: string, folderTreePath: string): boolean {
  return treePath !== folderTreePath && treePath.startsWith(folderTreePath);
}

export function selectedTreePathsToDeleteTargets(
  selectedTreePaths: readonly string[],
  documents: readonly FileEntry[],
): FileTreeTarget[] {
  const uniqueDeletablePaths = [...new Set(selectedTreePaths)].filter(
    (treePath) => !hasOkPathSegment(treePath),
  );
  const selectedFolderPaths = uniqueDeletablePaths.filter((treePath) => treePath.endsWith('/'));
  return uniqueDeletablePaths
    .filter(
      (treePath) =>
        !selectedFolderPaths.some((folderPath) => isTreePathInsideFolder(treePath, folderPath)),
    )
    .map((treePath) => treePathToTarget(treePath, documents));
}

export function normalizeTreePathFromModel(model: PierreFileTreeModel, treePath: string): string {
  const selectedItem =
    model.getItem(treePath) ?? model.getItem(folderPathToTreeDirectoryPath(treePath));
  return selectedItem?.isDirectory()
    ? folderPathToTreeDirectoryPath(treeDirectoryPathToFolderPath(selectedItem.getPath()))
    : treePath;
}

export function focusedOrFirstSelectedTreePath(model: PierreFileTreeModel): string | null {
  const selectedPath = model.getFocusedPath() ?? model.getSelectedPaths()[0] ?? null;
  return selectedPath ? normalizeTreePathFromModel(model, selectedPath) : null;
}

export function resolveDuplicableKeyboardTarget(
  model: PierreFileTreeModel,
  documents: readonly FileEntry[],
  assetTreePaths: ReadonlySet<string>,
): FileTreeTarget | null {
  const selectedPath = focusedOrFirstSelectedTreePath(model);
  if (!selectedPath || assetTreePaths.has(selectedPath) || hasOkPathSegment(selectedPath)) {
    return null;
  }
  return treePathToTarget(selectedPath, documents);
}

export function resolveKeyboardDeleteTargets(
  model: PierreFileTreeModel,
  documents: readonly FileEntry[],
): FileTreeTarget[] {
  const selectedPaths = model.getSelectedPaths();
  const focusedPath = focusedOrFirstSelectedTreePath(model);
  const paths =
    selectedPaths.length > 0
      ? selectedPaths.map((treePath) => normalizeTreePathFromModel(model, treePath))
      : focusedPath
        ? [focusedPath]
        : [];
  return selectedTreePathsToDeleteTargets(paths, documents);
}

export function isPathAtOrInsideFolder(path: string, folderPath: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

export function collectTabsToCloseForDelete(
  targets: readonly FileTreeTarget[],
  documents: readonly FileEntry[],
  folderTreePaths: readonly string[],
): { docNames: Set<string>; folderPaths: Set<string>; assetPaths: Set<string> } {
  const docNames = new Set<string>();
  const folderPaths = new Set<string>();
  const assetPaths = new Set<string>();

  for (const target of targets) {
    if (target.kind === 'file') {
      docNames.add(target.path);
      continue;
    }
    if (target.kind === 'asset') {
      assetPaths.add(target.path);
      continue;
    }

    folderPaths.add(target.path);
    for (const entry of documents) {
      if (isDocumentEntry(entry) && entry.docName.startsWith(`${target.path}/`)) {
        docNames.add(entry.docName);
      } else if (isAssetEntry(entry) && entry.path.startsWith(`${target.path}/`)) {
        assetPaths.add(entry.path);
      }
    }
    for (const treePath of folderTreePaths) {
      const folderPath = treeDirectoryPathToFolderPath(treePath);
      if (isPathAtOrInsideFolder(folderPath, target.path)) folderPaths.add(folderPath);
    }
  }

  return { docNames, folderPaths, assetPaths };
}

export interface PendingCreateShape {
  kind: 'file' | 'folder';
  createdPath: string;
}

export function deleteTargetCoversPendingCreate(
  target: FileTreeTarget,
  pending: PendingCreateShape,
): boolean {
  if (target.kind === 'file') {
    return pending.kind === 'file' && target.path === pending.createdPath;
  }
  if (target.kind === 'asset') return false;
  return isPathAtOrInsideFolder(pending.createdPath, target.path);
}
