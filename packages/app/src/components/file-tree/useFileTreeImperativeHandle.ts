import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import {
  type Dispatch,
  type MutableRefObject,
  type Ref,
  type SetStateAction,
  startTransition,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { asDirectoryHandle } from '@/components/use-selection-mirror';
import type { FileTreeHandle } from './file-tree-types';

type Input = {
  ref: Ref<FileTreeHandle | null> | undefined;
  model: PierreFileTreeModel;
  folderTreePathsRef: MutableRefObject<string[]>;
  creationDirClearedRef: MutableRefObject<boolean>;
  handleListenersRef: MutableRefObject<Set<() => void>>;
  setCreationDirCleared: Dispatch<SetStateAction<boolean>>;
  startCreating: (
    kind: 'file' | 'folder',
    parentDir: string,
    options?: { template?: string },
  ) => void | Promise<void>;
  startCreatingFromTemplate: (parentDir: string) => void;
};

/** Owns the sidebar-facing imperative tree handle while reading live model and selection refs. */
export function useFileTreeImperativeHandle({
  ref,
  model,
  folderTreePathsRef,
  creationDirClearedRef,
  handleListenersRef,
  setCreationDirCleared,
  startCreating,
  startCreatingFromTemplate,
}: Input): void {
  const folderStateCacheRef = useRef({ folderCount: 0, expandedCount: 0 });
  const startCreatingRef = useRef(startCreating);
  const startCreatingFromTemplateRef = useRef(startCreatingFromTemplate);
  useEffect(() => {
    startCreatingRef.current = startCreating;
    startCreatingFromTemplateRef.current = startCreatingFromTemplate;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: imperative methods intentionally read live folder paths through the stable tree-state ref.
  useImperativeHandle(
    ref,
    () => ({
      startCreating(kind, parentDir) {
        void startCreatingRef.current(kind, parentDir);
      },
      startCreatingFromTemplate(parentDir) {
        startCreatingFromTemplateRef.current(parentDir);
      },
      createFromTemplate(parentDir, templateName) {
        void startCreatingRef.current('file', parentDir, { template: templateName });
      },
      expandAll() {
        startTransition(() => {
          for (const folderPath of folderTreePathsRef.current) {
            asDirectoryHandle(model.getItem(folderPath))?.expand();
          }
        });
      },
      collapseAll() {
        startTransition(() => {
          for (const folderPath of [...folderTreePathsRef.current].reverse()) {
            asDirectoryHandle(model.getItem(folderPath))?.collapse();
          }
        });
      },
      getFolderState() {
        const paths = folderTreePathsRef.current;
        let expandedCount = 0;
        for (const path of paths)
          if (asDirectoryHandle(model.getItem(path))?.isExpanded()) expandedCount++;
        const cached = folderStateCacheRef.current;
        if (cached.folderCount === paths.length && cached.expandedCount === expandedCount)
          return cached;
        const next = { folderCount: paths.length, expandedCount };
        folderStateCacheRef.current = next;
        return next;
      },
      isCreationTargetCleared() {
        return creationDirClearedRef.current;
      },
      clearCreationTarget() {
        setCreationDirCleared(true);
      },
      subscribe(listener) {
        handleListenersRef.current.add(listener);
        const unsubscribeModel = model.subscribe(listener);
        return () => {
          handleListenersRef.current.delete(listener);
          unsubscribeModel();
        };
      },
    }),
    [model],
  );
}
