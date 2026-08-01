import { FILE_TREE_TAG_NAME, type FileTree as PierreFileTreeModel } from '@pierre/trees';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
} from 'react';
import { treeFilePathToDocName } from '@/components/file-tree-adapter';
import { revealActiveRow } from '@/components/file-tree-reveal';
import type { FileEntry } from '@/components/file-tree-utils';
import { asDirectoryHandle, useSelectionMirror } from '@/components/use-selection-mirror';

type Input = {
  model: PierreFileTreeModel;
  activeTreePath: string | null;
  baseActiveTreePath: string | null;
  treePathsSignature: string;
  loading: boolean;
  activeAncestorTreePathsSignature: string;
  autoRevealActiveAncestorTreePathsSignature: string;
  suppressSelectionRef: MutableRefObject<boolean>;
  sidebarDragInProgressRef: MutableRefObject<boolean>;
  pendingExactFileSelectionRef: MutableRefObject<string | null>;
  activeAncestorTreePathsRef: MutableRefObject<string[]>;
  fileTreeHostRef: MutableRefObject<HTMLDivElement | null>;
  handleSelectionChangeRef: MutableRefObject<(selectedPaths: readonly string[]) => void>;
  documentsRef: MutableRefObject<FileEntry[]>;
  setCreationDirCleared: Dispatch<SetStateAction<boolean>>;
  setUserCollapsedActiveAncestorPaths: Dispatch<SetStateAction<ReadonlySet<string>>>;
  normalizeSelectionPath: (path: string) => string;
  activateTreePath: (path: string, entries: readonly FileEntry[]) => void;
};

/** Owns active-path mirroring, reveal, and selection reconciliation for the tree model. */
export function useFileTreeSelection({
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
}: Input): void {
  useSelectionMirror(
    model,
    activeTreePath,
    autoRevealActiveAncestorTreePathsSignature,
    suppressSelectionRef,
    treePathsSignature,
  );

  // Re-couple the creation target only for real navigation changes. The base
  // path intentionally excludes the empty-space selection override.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the transition trigger; setters are stable.
  useEffect(() => {
    setCreationDirCleared(false);
    setUserCollapsedActiveAncestorPaths(new Set());
  }, [baseActiveTreePath]);

  // Declared after the selection mirror so a programmatic navigation first
  // updates Pierre's focused row, then asks its virtualizer to reveal it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: both signatures are re-run triggers for row visibility after reset/ancestor expansion.
  useEffect(() => {
    if (loading || !activeTreePath) return;
    revealActiveRow(model, activeTreePath);
  }, [activeTreePath, activeAncestorTreePathsSignature, treePathsSignature, loading, model]);

  // A disclosure click on an active ancestor is authoritative. Retain that
  // collapse across refreshes until the application navigates somewhere else.
  // biome-ignore lint/correctness/useExhaustiveDependencies: subscription lifetime follows the model; the current ancestors are intentionally read through a stable ref.
  useEffect(() => {
    return model.subscribe(() => {
      if (model.isSearchOpen()) return;
      if (activeAncestorTreePathsRef.current.length === 0) return;
      setUserCollapsedActiveAncestorPaths((current) => {
        const next = new Set(current);
        let changed = false;
        for (const ancestor of activeAncestorTreePathsRef.current) {
          const item = asDirectoryHandle(model.getItem(ancestor));
          if (!item) continue;
          if (item.isExpanded()) {
            if (next.delete(ancestor)) changed = true;
          } else if (!next.has(ancestor)) {
            next.add(ancestor);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });
  }, [model]);

  // The model emits raw paths for both files and folders. Resolve folder
  // aliases and the same-stem markdown click marker before the queued
  // navigation reads the latest document list.
  useLayoutEffect(() => {
    handleSelectionChangeRef.current = (selectedPaths) => {
      if (suppressSelectionRef.current || sidebarDragInProgressRef.current) return;
      if (selectedPaths.length !== 1) return;
      const selected = selectedPaths[0];
      if (!selected) return;
      setCreationDirCleared(false);
      const selectedTreePath = normalizeSelectionPath(selected);
      const pendingExactFileSelection = pendingExactFileSelectionRef.current;
      const hasPendingExactFileSelection =
        pendingExactFileSelection !== null &&
        treeFilePathToDocName(pendingExactFileSelection) ===
          treeFilePathToDocName(selectedTreePath);
      const targetTreePath = hasPendingExactFileSelection
        ? pendingExactFileSelection
        : selectedTreePath;
      pendingExactFileSelectionRef.current = null;
      queueMicrotask(() => {
        const shadow = fileTreeHostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
        const renderedTreePath = hasPendingExactFileSelection
          ? null
          : (shadow?.querySelector<HTMLElement>('[aria-selected="true"][data-item-path]')?.dataset
              .itemPath ?? null);
        activateTreePath(
          normalizeSelectionPath(renderedTreePath ?? targetTreePath),
          documentsRef.current,
        );
      });
    };
  }, [
    activateTreePath,
    documentsRef,
    fileTreeHostRef,
    handleSelectionChangeRef,
    normalizeSelectionPath,
    pendingExactFileSelectionRef,
    setCreationDirCleared,
    sidebarDragInProgressRef,
    suppressSelectionRef,
  ]);
}
