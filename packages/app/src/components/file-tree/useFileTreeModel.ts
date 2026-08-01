import { useLingui } from '@lingui/react/macro';
import type { FileTreeDropResult, FileTreeRenameEvent } from '@pierre/trees';
import { useFileTree } from '@pierre/trees/react';
import type { MutableRefObject } from 'react';
import { toast } from 'sonner';
import { docNameToTreePath, folderPathToTreeDirectoryPath } from '@/components/file-tree-adapter';
import {
  type DocumentEntry,
  type FileEntry,
  type FolderEntry,
  isDocumentEntry,
  isFolderEntry,
} from '@/components/file-tree-utils';
import type { PageHeaderRenameResult } from '@/lib/page-header-rename-events';
import {
  AGENT_DECORATION_ICON_ID,
  FILE_TREE_DECORATION_SPRITE_SHEET,
  FILE_TREE_DENSITY_OPTIONS,
  FILE_TREE_UNSAFE_CSS,
  isAgentTreePath,
  LINK_DECORATION_ICON_ID,
  MARKDOWN_FILE_ICON_ID,
  MARKDOWN_FILE_ICON_VIEWBOX,
} from './FileTreePresentation';

type Input = {
  documentsRef: MutableRefObject<FileEntry[]>;
  busyPathRef: MutableRefObject<string | null>;
  selectionChangeRef: MutableRefObject<(paths: readonly string[]) => void>;
  renameRef: MutableRefObject<(event: FileTreeRenameEvent) => Promise<PageHeaderRenameResult>>;
  renameErrorRef: MutableRefObject<(message: string) => void>;
  dropCompleteRef: MutableRefObject<(event: FileTreeDropResult) => void>;
};

/** Configures the Pierre tree model and keeps rendering decoration policy beside its model contract. */
export function useFileTreeModel({
  documentsRef,
  busyPathRef,
  selectionChangeRef,
  renameRef,
  renameErrorRef,
  dropCompleteRef,
}: Input) {
  const { t } = useLingui();
  const isAvailable = () => busyPathRef.current === null;
  return useFileTree({
    paths: [],
    initialExpansion: 'closed',
    fileTreeSearchMode: 'hide-non-matches',
    initialVisibleRowCount: 18,
    stickyFolders: true,
    ...FILE_TREE_DENSITY_OPTIONS,
    icons: {
      set: 'complete',
      spriteSheet: FILE_TREE_DECORATION_SPRITE_SHEET,
      byFileExtension: {
        md: { name: MARKDOWN_FILE_ICON_ID, viewBox: MARKDOWN_FILE_ICON_VIEWBOX },
        mdx: { name: MARKDOWN_FILE_ICON_ID, viewBox: MARKDOWN_FILE_ICON_VIEWBOX },
      },
    },
    unsafeCSS: FILE_TREE_UNSAFE_CSS,
    composition: {
      contextMenu: { enabled: true, triggerMode: 'both', buttonVisibility: 'when-needed' },
    },
    dragAndDrop: {
      canDrag: isAvailable,
      canDrop: isAvailable,
      onDropComplete: (event) => dropCompleteRef.current(event),
      onDropError: (message) => toast.error(message),
    },
    renaming: {
      canRename: isAvailable,
      onRename: (event) => renameRef.current(event),
      onError: (message) => renameErrorRef.current(message),
    },
    onSelectionChange: (paths) => selectionChangeRef.current(paths),
    renderRowDecoration: ({ item }) => {
      if (item.kind === 'file') {
        const doc = documentsRef.current.find(
          (entry): entry is DocumentEntry =>
            isDocumentEntry(entry) && docNameToTreePath(entry.docName, entry.docExt) === item.path,
        );
        if (doc?.isSymlink) {
          return {
            icon: LINK_DECORATION_ICON_ID,
            title: doc.targetPath ? t`Symlink to ${doc.targetPath}` : t`Symlink`,
          };
        }
        if (isAgentTreePath(item.path)) {
          return { icon: AGENT_DECORATION_ICON_ID, title: t`Agent configuration file` };
        }
        return null;
      }
      const folder = documentsRef.current.find(
        (entry): entry is FolderEntry =>
          isFolderEntry(entry) &&
          folderPathToTreeDirectoryPath(entry.path) === folderPathToTreeDirectoryPath(item.path),
      );
      if (!folder?.isSymlink) return null;
      return {
        icon: LINK_DECORATION_ICON_ID,
        title: folder.targetPath ? t`Symlink to ${folder.targetPath}` : t`Symlink`,
      };
    },
  });
}
