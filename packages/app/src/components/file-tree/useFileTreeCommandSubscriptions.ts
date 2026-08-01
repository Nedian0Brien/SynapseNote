import type { FileTreeRenameEvent, FileTree as PierreFileTreeModel } from '@pierre/trees';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { docNameToTreePath } from '@/components/file-tree-adapter';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import { getFileExtension } from '@/components/file-tree-rename-validation';
import { type DocumentEntry, type FileEntry, isDocumentEntry } from '@/components/file-tree-utils';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import {
  subscribeToFileTreeMenuActionDelete,
  subscribeToFileTreeMenuActionDuplicate,
  subscribeToFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import {
  type PageHeaderRenameResult,
  subscribeToPageHeaderRename,
} from '@/lib/page-header-rename-events';

type Input = {
  model: PierreFileTreeModel;
  documentsRef: MutableRefObject<FileEntry[]>;
  onDeleteTargets: (targets: FileTreeTarget[]) => void | Promise<void>;
  duplicateTargetRef: MutableRefObject<(target: FileTreeTarget) => void | Promise<void>>;
  renameRef: MutableRefObject<(event: FileTreeRenameEvent) => Promise<PageHeaderRenameResult>>;
};

/** Bridges native File and page-header commands into the tree's existing mutation ports. */
export function useFileTreeCommandSubscriptions({
  model,
  documentsRef,
  onDeleteTargets,
  duplicateTargetRef,
  renameRef,
}: Input): void {
  const deleteTargetsRef = useRef(onDeleteTargets);
  useEffect(() => {
    deleteTargetsRef.current = onDeleteTargets;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: native command subscriptions read current document and callback ports through stable refs.
  useEffect(() => {
    return subscribeToFileTreeMenuActionDelete((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void deleteTargetsRef.current([
          {
            kind: 'file',
            path: docName,
            name: docName.split('/').pop() ?? docName,
            docExt: docEntry?.docExt,
          },
        ]);
        return;
      }
      if (target.kind === 'folder') {
        void deleteTargetsRef.current([
          {
            kind: 'folder',
            path: target.folderPath,
            name: target.folderPath.split('/').pop() ?? target.folderPath,
          },
        ]);
        return;
      }
      if (target.kind === 'asset') {
        void deleteTargetsRef.current([
          {
            kind: 'asset',
            path: target.assetPath,
            name: target.assetPath.split('/').pop() ?? target.assetPath,
          },
        ]);
      }
    });
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: native command subscription reads the latest document list through a stable ref.
  useEffect(() => {
    return subscribeToFileTreeMenuActionDuplicate((target: ResolvedNavigationTarget) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        void duplicateTargetRef.current({
          kind: 'file',
          path: docName,
          name: docName.split('/').pop() ?? docName,
          docExt: docEntry?.docExt,
        });
        return;
      }
      if (target.kind === 'folder') {
        void duplicateTargetRef.current({
          kind: 'folder',
          path: target.folderPath,
          name: target.folderPath.split('/').pop() ?? target.folderPath,
        });
      }
    });
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the page-header bus reads the latest rename handler through its stable ref.
  useEffect(() => {
    return subscribeToFileTreeMenuActionRename((target) => {
      if (target.kind === 'doc' || target.kind === 'folder-index') {
        const docName = target.docName;
        const docEntry = documentsRef.current.find(
          (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === docName,
        );
        model.startRenaming(docNameToTreePath(docName, docEntry?.docExt));
        return;
      }
      if (target.kind === 'folder') {
        model.startRenaming(target.folderPath);
        return;
      }
      if (target.kind === 'asset') model.startRenaming(target.assetPath);
    });
  }, [model]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the page-header bus reads the latest rename handler through its stable ref.
  useEffect(() => {
    return subscribeToPageHeaderRename(async ({ docName, docExt, nextTitle }) => {
      const sourcePath = docNameToTreePath(docName, docExt);
      const lastSlash = sourcePath.lastIndexOf('/');
      const parent = lastSlash < 0 ? '' : sourcePath.slice(0, lastSlash + 1);
      const extension = getFileExtension(sourcePath) || docExt;
      return renameRef.current({
        sourcePath,
        destinationPath: `${parent}${nextTitle}${extension}`,
        isFolder: false,
      });
    });
  }, []);
}
