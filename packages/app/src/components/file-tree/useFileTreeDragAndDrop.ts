import { type RefObject, useEffect } from 'react';
import {
  filesFromExternalDrop,
  folderPathToTreeDirectoryPath,
  isExternalFileDrag,
  parentFolderPathForTreeItemDropTarget,
} from '@/components/file-tree-adapter';
import type { FileEntry } from '@/components/file-tree-utils';
import { sidebarDragPayloadForTreePath } from '@/components/sidebar-drag-payload';
import { OK_SIDEBAR_DRAG_MIME, serializeSidebarDragPayload } from '@/lib/sidebar-drag';

/** Owns native drag listeners and external-file target affordances for the FileTree shadow DOM. */
export const FILE_TREE_EXTERNAL_FILE_DROP_TARGET_ATTR = 'data-ok-external-file-drop-target';
export const FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR = 'data-ok-external-file-drop-root-target';
export const FILE_TREE_EXTERNAL_FILE_DROP_BUSY_PATH = '__external-file-drop__';

type ExternalFileDropTarget = {
  parentDir: string;
  row: HTMLElement | null;
  root: HTMLElement | null;
  busyPath: string;
};

type ExternalFileDropAffordanceRef = {
  current: { row: HTMLElement | null; root: HTMLElement | null };
};

export function findTreeItemElement(event: MouseEvent): HTMLElement | null {
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement && entry.dataset.itemPath) return entry;
  }
  return null;
}

export function findTreeItemPath(event: MouseEvent): string | null {
  return findTreeItemElement(event)?.dataset.itemPath ?? null;
}

function eventIsInTreeItemSection(event: MouseEvent, section: string): boolean {
  return event
    .composedPath()
    .some((entry) => entry instanceof HTMLElement && entry.dataset.itemSection === section);
}

export function clickIsInTreeContentArea(event: MouseEvent): boolean {
  return event
    .composedPath()
    .some(
      (entry) =>
        entry instanceof HTMLElement && entry.matches('[data-file-tree-virtualized-scroll]'),
    );
}

export function clickIsInTreeItemSection(event: MouseEvent, section: string): boolean {
  return eventIsInTreeItemSection(event, section);
}

function findTreeVirtualizedRootElement(event: MouseEvent): HTMLElement | null {
  return (
    event
      .composedPath()
      .find(
        (entry): entry is HTMLElement =>
          entry instanceof HTMLElement && entry.matches('[data-file-tree-virtualized-root]'),
      ) ?? null
  );
}

function resolveExternalFileDropTarget(event: MouseEvent): ExternalFileDropTarget | null {
  const item = findTreeItemElement(event);
  if (item) {
    const rawPath = item.dataset.itemPath;
    if (!rawPath) return null;
    const isFolder = item.dataset.itemType === 'folder';
    const parentDir = parentFolderPathForTreeItemDropTarget(rawPath, isFolder);
    return {
      parentDir,
      row: item,
      root: null,
      busyPath: isFolder ? folderPathToTreeDirectoryPath(parentDir) : rawPath,
    };
  }
  if (!clickIsInTreeContentArea(event)) return null;
  return {
    parentDir: '',
    row: null,
    root: findTreeVirtualizedRootElement(event),
    busyPath: FILE_TREE_EXTERNAL_FILE_DROP_BUSY_PATH,
  };
}

function clearExternalFileDropAffordance(ref: ExternalFileDropAffordanceRef) {
  ref.current.row?.removeAttribute(FILE_TREE_EXTERNAL_FILE_DROP_TARGET_ATTR);
  ref.current.root?.removeAttribute(FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR);
  ref.current = { row: null, root: null };
}

function setExternalFileDropAffordance(
  ref: ExternalFileDropAffordanceRef,
  target: ExternalFileDropTarget,
) {
  if (ref.current.row === target.row && ref.current.root === target.root) return;
  clearExternalFileDropAffordance(ref);
  target.row?.setAttribute(FILE_TREE_EXTERNAL_FILE_DROP_TARGET_ATTR, 'true');
  target.root?.setAttribute(FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR, 'true');
  ref.current = { row: target.row, root: target.root };
}

type UseFileTreeDragAndDropInput = {
  fileTreeHostRef: RefObject<HTMLDivElement | null>;
  documents: readonly FileEntry[];
  documentsRef: RefObject<FileEntry[]>;
  pageMetaRef: RefObject<ReadonlyMap<string, { size?: number | null }>>;
  loading: boolean;
  sidebarDragInProgressRef: RefObject<boolean>;
  sidebarDragClearTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  externalFileDropTargetRef: RefObject<{ row: HTMLElement | null; root: HTMLElement | null }>;
  uploadExternalFilesRef: RefObject<
    (files: readonly File[], parentDir: string, busyPath: string) => void
  >;
};

export function useFileTreeDragAndDrop({
  fileTreeHostRef,
  documents,
  documentsRef,
  pageMetaRef,
  loading,
  sidebarDragInProgressRef,
  sidebarDragClearTimerRef,
  externalFileDropTargetRef,
  uploadExternalFilesRef,
}: UseFileTreeDragAndDropInput) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: all callback data flows through stable refs; listener lifecycle follows rendered tree availability only.
  useEffect(() => {
    if (loading || documents.length === 0) return;
    const shadow = fileTreeHostRef.current?.querySelector('file-tree')?.shadowRoot;
    if (!shadow) return;

    const clearSidebarDragInProgressSoon = () => {
      if (sidebarDragClearTimerRef.current !== null) clearTimeout(sidebarDragClearTimerRef.current);
      sidebarDragClearTimerRef.current = setTimeout(() => {
        sidebarDragInProgressRef.current = false;
        sidebarDragClearTimerRef.current = null;
      }, 0);
    };
    const handleDragStart = (event: Event) => {
      if (!(event instanceof DragEvent)) return;
      const item = findTreeItemElement(event);
      const rawPath = item?.dataset.itemPath;
      if (!rawPath) return;
      const treePath =
        item.dataset.itemType === 'folder' ? folderPathToTreeDirectoryPath(rawPath) : rawPath;
      const payload = sidebarDragPayloadForTreePath(
        treePath,
        documentsRef.current,
        pageMetaRef.current,
      );
      if (!payload) return;
      if (sidebarDragClearTimerRef.current !== null) {
        clearTimeout(sidebarDragClearTimerRef.current);
        sidebarDragClearTimerRef.current = null;
      }
      sidebarDragInProgressRef.current = true;
      event.dataTransfer?.setData(OK_SIDEBAR_DRAG_MIME, serializeSidebarDragPayload(payload));
    };
    const handleExternalFileDragOver = (event: Event) => {
      if (!(event instanceof DragEvent) || !isExternalFileDrag(event)) return;
      const target = resolveExternalFileDropTarget(event);
      if (!target) return clearExternalFileDropAffordance(externalFileDropTargetRef);
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setExternalFileDropAffordance(externalFileDropTargetRef, target);
    };
    const handleExternalFileDragLeave = (event: Event) => {
      if (!(event instanceof DragEvent) || !isExternalFileDrag(event)) return;
      if (event.relatedTarget instanceof Node && shadow.contains(event.relatedTarget)) return;
      clearExternalFileDropAffordance(externalFileDropTargetRef);
    };
    const handleExternalFileDrop = (event: Event) => {
      if (!(event instanceof DragEvent) || !isExternalFileDrag(event)) return;
      const target = resolveExternalFileDropTarget(event);
      const files = filesFromExternalDrop(event);
      if (!target || files.length === 0)
        return clearExternalFileDropAffordance(externalFileDropTargetRef);
      event.preventDefault();
      event.stopPropagation();
      clearExternalFileDropAffordance(externalFileDropTargetRef);
      uploadExternalFilesRef.current(files, target.parentDir, target.busyPath);
    };

    shadow.addEventListener('dragstart', handleDragStart, { capture: true });
    shadow.addEventListener('dragover', handleExternalFileDragOver, { capture: true });
    shadow.addEventListener('dragleave', handleExternalFileDragLeave, { capture: true });
    shadow.addEventListener('drop', handleExternalFileDrop, { capture: true });
    shadow.addEventListener('dragend', clearSidebarDragInProgressSoon, { capture: true });
    window.addEventListener('drop', clearSidebarDragInProgressSoon, true);
    window.addEventListener('dragend', clearSidebarDragInProgressSoon, true);
    return () => {
      shadow.removeEventListener('dragstart', handleDragStart, { capture: true });
      shadow.removeEventListener('dragover', handleExternalFileDragOver, { capture: true });
      shadow.removeEventListener('dragleave', handleExternalFileDragLeave, { capture: true });
      shadow.removeEventListener('drop', handleExternalFileDrop, { capture: true });
      shadow.removeEventListener('dragend', clearSidebarDragInProgressSoon, { capture: true });
      window.removeEventListener('drop', clearSidebarDragInProgressSoon, true);
      window.removeEventListener('dragend', clearSidebarDragInProgressSoon, true);
      clearExternalFileDropAffordance(externalFileDropTargetRef);
      if (sidebarDragClearTimerRef.current !== null) {
        clearTimeout(sidebarDragClearTimerRef.current);
        sidebarDragClearTimerRef.current = null;
      }
      sidebarDragInProgressRef.current = false;
    };
  }, [documents.length, loading]);
}
