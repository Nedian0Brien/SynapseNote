import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import { type MutableRefObject, startTransition } from 'react';
import { folderPathToTreeDirectoryPath } from '@/components/file-tree-adapter';
import { asDirectoryHandle } from '@/components/use-selection-mirror';

type Input = {
  model: PierreFileTreeModel;
  folderTreePathsRef: MutableRefObject<string[]>;
};

/** Expands and collapses a context-menu folder subtree in visual tree order. */
export function useFileTreeFolderActions({ model, folderTreePathsRef }: Input) {
  const expandSubtree = (treePath: string) => {
    const root = folderPathToTreeDirectoryPath(treePath);
    startTransition(() => {
      for (const folderPath of folderTreePathsRef.current) {
        if (folderPath !== root && !folderPath.startsWith(root)) continue;
        asDirectoryHandle(model.getItem(folderPath))?.expand();
      }
    });
  };
  const collapseSubtree = (treePath: string) => {
    const root = folderPathToTreeDirectoryPath(treePath);
    startTransition(() => {
      for (const folderPath of [...folderTreePathsRef.current].reverse()) {
        if (folderPath !== root && !folderPath.startsWith(root)) continue;
        asDirectoryHandle(model.getItem(folderPath))?.collapse();
      }
    });
  };
  return { expandSubtree, collapseSubtree };
}
