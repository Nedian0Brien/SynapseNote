import { isDocumentOverOpenByteLimit } from '@nedian0brien/synapsenote-core';
import { FILE_TREE_TAG_NAME, type FileTree as PierreFileTreeModel } from '@pierre/trees';
import type {
  Dispatch,
  MutableRefObject,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from 'react';
import {
  fileEntryToTreePath,
  filesFromExternalDrop,
  folderPathToTreeDirectoryPath,
  isExternalFileDrag,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocumentDocName,
} from '@/components/file-tree-adapter';
import type { FileEntry } from '@/components/file-tree-utils';
import { isAssetEntry, isDocumentEntry } from '@/components/file-tree-utils';
import { asDirectoryHandle } from '@/components/use-selection-mirror';
import { hashFromDocName, hashFromFolderPath } from '@/lib/doc-hash';
import { cancelHoverPrewarm, scheduleHoverPrewarm } from '../sidebar-hover-prewarm';
import {
  alternateMarkdownTreePath,
  hasSameStemMarkdownSiblingTreePath,
} from './file-tree-commands';
import {
  clickIsInTreeContentArea,
  clickIsInTreeItemSection,
  FILE_TREE_EXTERNAL_FILE_DROP_BUSY_PATH,
  findTreeItemElement,
  findTreeItemPath,
} from './useFileTreeDragAndDrop';

type Input = {
  model: PierreFileTreeModel;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  documentsRef: MutableRefObject<FileEntry[]>;
  treePathsRef: MutableRefObject<string[]>;
  pendingExactFileSelectionRef: MutableRefObject<string | null>;
  hoveredPrewarmDocRef: MutableRefObject<string | null>;
  sidebarDocumentTabBehavior: 'append' | 'replace-active';
  setCreationDirCleared: Dispatch<SetStateAction<boolean>>;
  setEmptyExternalFileDropActive: Dispatch<SetStateAction<boolean>>;
  activateTreePath: (treePath: string) => void;
  navigateToFolderWithPulse: (folderPath: string) => void;
  navigateToWithPulse: (
    targetPath: string,
    size?: number,
    options?: { registerPage?: boolean; tabBehavior?: 'append' | 'replace-active' },
  ) => void;
  prewarm: (docName: string) => string | null;
  uploadExternalFilesToTarget: (
    files: readonly File[],
    parentDir: string,
    busyPath: string,
  ) => void | Promise<void>;
};

/** Owns pointer-driven row navigation, hover prewarm, and empty-tree file drops. */
export function useFileTreePointerInteractions({
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
}: Input) {
  const cancelCurrentHoverPrewarm = () => {
    const current = hoveredPrewarmDocRef.current;
    if (current) cancelHoverPrewarm(current);
    hoveredPrewarmDocRef.current = null;
  };
  const hasSameStemMarkdownSiblingRendered = (treePath: string): boolean => {
    const alternate = alternateMarkdownTreePath(treePath);
    if (!alternate) return false;
    const shadow = hostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return false;
    for (const row of shadow.querySelectorAll<HTMLElement>('[data-item-path]')) {
      if (row.dataset.itemPath === alternate) return true;
    }
    return false;
  };
  const handleTreeMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    const path = findTreeItemPath(event.nativeEvent);
    if (!path || path.endsWith('/')) {
      cancelCurrentHoverPrewarm();
      return;
    }
    const entry = documentsRef.current.find((item) => fileEntryToTreePath(item) === path);
    if (entry && isAssetEntry(entry)) {
      cancelCurrentHoverPrewarm();
      return;
    }
    const docName =
      entry && isDocumentEntry(entry)
        ? entry.docName
        : treeFilePathToDocumentDocName(path, documentsRef.current);
    if (entry && isDocumentEntry(entry) && isDocumentOverOpenByteLimit(entry.size)) {
      cancelCurrentHoverPrewarm();
      return;
    }
    if (hoveredPrewarmDocRef.current === docName) return;
    cancelCurrentHoverPrewarm();
    hoveredPrewarmDocRef.current = docName;
    scheduleHoverPrewarm(docName, prewarm);
  };
  const handleTreeClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const item = findTreeItemElement(event.nativeEvent);
    if (!item) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (clickIsInTreeContentArea(event.nativeEvent)) setCreationDirCleared(true);
      return;
    }
    const wasSelected = item.getAttribute('aria-selected') === 'true';
    const rawPath = item.dataset.itemPath;
    if (!rawPath) return;
    const path =
      item.dataset.itemType === 'folder' ? folderPathToTreeDirectoryPath(rawPath) : rawPath;
    if (item.dataset.itemType === 'folder') {
      const folderPath = treeDirectoryPathToFolderPath(path);
      const folderItem = asDirectoryHandle(model.getItem(path));
      if (clickIsInTreeItemSection(event.nativeEvent, 'icon')) {
        event.preventDefault();
        event.stopPropagation();
        if (!folderItem) return;
        if (folderItem.isExpanded()) folderItem.collapse();
        else folderItem.expand();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (!wasSelected) {
        queueMicrotask(() => navigateToFolderWithPulse(folderPath));
        return;
      }
      if (model.getSelectedPaths().length !== 1) return;
      if (window.location.hash === hashFromFolderPath(folderPath)) return;
      queueMicrotask(() => navigateToFolderWithPulse(folderPath));
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!wasSelected) {
      if (
        hasSameStemMarkdownSiblingTreePath(path, treePathsRef.current) ||
        hasSameStemMarkdownSiblingRendered(path)
      ) {
        pendingExactFileSelectionRef.current = path;
        setTimeout(
          () =>
            navigateToWithPulse(path, undefined, {
              registerPage: true,
              tabBehavior: sidebarDocumentTabBehavior,
            }),
          0,
        );
        return;
      }
      queueMicrotask(() => activateTreePath(path));
      return;
    }
    const docName = treeFilePathToDocumentDocName(path, documentsRef.current);
    if (model.getSelectedPaths().length !== 1) return;
    if (window.location.hash === hashFromDocName(docName)) return;
    queueMicrotask(() => activateTreePath(path));
  };
  const handleEmptyExternalFileDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event.nativeEvent)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setEmptyExternalFileDropActive(true);
  };
  const handleEmptyExternalFileDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related)) return;
    setEmptyExternalFileDropActive(false);
  };
  const handleEmptyExternalFileDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event.nativeEvent)) return;
    const files = filesFromExternalDrop(event.nativeEvent);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setEmptyExternalFileDropActive(false);
    void uploadExternalFilesToTarget(files, '', FILE_TREE_EXTERNAL_FILE_DROP_BUSY_PATH);
  };
  return {
    cancelCurrentHoverPrewarm,
    handleTreeMouseMove,
    handleTreeClickCapture,
    handleEmptyExternalFileDragOver,
    handleEmptyExternalFileDragLeave,
    handleEmptyExternalFileDrop,
  };
}
