import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import type { FileEntry } from '@/components/file-tree-utils';
import {
  isEditableKeyboardTarget,
  resolveDuplicableKeyboardTarget,
  resolveKeyboardDeleteTargets,
} from './file-tree-commands';

type Input = {
  model: PierreFileTreeModel;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  documentsRef: MutableRefObject<FileEntry[]>;
  assetTreePathsRef: MutableRefObject<Set<string>>;
  folderTreePathsRef: MutableRefObject<string[]>;
  treePathsRef: MutableRefObject<string[]>;
  busyPathRef: MutableRefObject<string | null>;
  copiedTargetRef: MutableRefObject<FileTreeTarget | null>;
  duplicateTargetRef: MutableRefObject<(target: FileTreeTarget) => void>;
  suppressSelectionRef: MutableRefObject<boolean>;
  setDeleteRequest: Dispatch<SetStateAction<{ targets: FileTreeTarget[] } | null>>;
};

/** Owns tree-scoped copy, duplicate, delete, and select-all keyboard policy. */
export function useFileTreeKeyboard({
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
}: Input): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: listener lifetime follows the Pierre model; mutable tree state is intentionally read through refs.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPlatformShortcut = (event.metaKey || event.ctrlKey) && !event.altKey;
      const key = event.key.toLowerCase();
      const isSelectAll = isPlatformShortcut && key === 'a';
      const isDuplicate = isPlatformShortcut && !event.shiftKey && key === 'd';
      const isCopy = isPlatformShortcut && !event.shiftKey && key === 'c';
      const isPaste = isPlatformShortcut && !event.shiftKey && key === 'v';
      const isDelete =
        !event.altKey &&
        !event.shiftKey &&
        ((event.metaKey && !event.ctrlKey && key === 'backspace') ||
          (!event.metaKey && !event.ctrlKey && key === 'delete'));
      if (!isSelectAll && !isDuplicate && !isCopy && !isPaste && !isDelete) return;
      if (isEditableKeyboardTarget(event.target)) return;

      const host = hostRef.current;
      const activeElement = document.activeElement;
      const eventStartedInTree = event.target instanceof Node && host?.contains(event.target);
      const focusIsInTree = activeElement instanceof Node && host?.contains(activeElement);
      if (!eventStartedInTree && !focusIsInTree) return;

      if (isCopy) {
        const copiedTarget = resolveDuplicableKeyboardTarget(
          model,
          documentsRef.current,
          assetTreePathsRef.current,
        );
        if (!copiedTarget) return;
        copiedTargetRef.current = copiedTarget;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isPaste) {
        const copiedTarget = copiedTargetRef.current;
        if (!copiedTarget) return;
        duplicateTargetRef.current(copiedTarget);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isDuplicate) {
        const duplicateTarget = resolveDuplicableKeyboardTarget(
          model,
          documentsRef.current,
          assetTreePathsRef.current,
        );
        if (!duplicateTarget) return;
        duplicateTargetRef.current(duplicateTarget);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isDelete) {
        if (busyPathRef.current !== null) return;
        const targets = resolveKeyboardDeleteTargets(model, documentsRef.current);
        if (targets.length === 0) return;
        setDeleteRequest({ targets });
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const selectedPaths = new Set([...folderTreePathsRef.current, ...treePathsRef.current]);
      suppressSelectionRef.current = true;
      for (const treePath of selectedPaths) {
        if (treePath) model.getItem(treePath)?.select();
      }
      queueMicrotask(() => {
        suppressSelectionRef.current = false;
      });
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [model]);
}
