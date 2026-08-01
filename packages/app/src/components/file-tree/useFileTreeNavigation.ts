import { docNameToTreePath, folderPathToTreeDirectoryPath } from '@/components/file-tree-adapter';
import { hasSupportedDocumentExtension } from '@/components/file-tree-rename-validation';
import {
  resolveFileTreeSelection,
  resolveFileTreeSelectionAction,
} from '@/components/file-tree-selection';
import {
  type DocumentEntry,
  type FileEntry,
  isAssetEntry,
  isDocumentEntry,
} from '@/components/file-tree-utils';
import {
  largeFileNavigationTarget,
  okContentNavigationTarget,
  type ResolvedNavigationTarget,
} from '@/components/navigation-targets';
import { usePageList } from '@/components/PageListContext';
import { useSidebar } from '@/components/ui/sidebar';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import {
  hashFromAssetPath,
  hashFromDocName,
  hashFromFolderPath,
  replaceHashWithoutNavigation,
} from '@/lib/doc-hash';

type Input = {
  documents: readonly FileEntry[];
  sidebarDocumentTabBehavior: 'append' | 'replace-active';
};

/** Converts tree selection into document, folder, and asset navigation without owning tree state. */
export function useFileTreeNavigation({ documents, sidebarDocumentTabBehavior }: Input) {
  const { activeDocName, activeTarget, isNewTabActive, openTarget } = useDocumentNavigation();
  const { addPage, pageMeta, pages } = usePageList();
  const { notifySidebarFileSelected } = useSidebar();
  const navigationTargetForDocument = (
    docName: string,
    size: number | null | undefined,
  ): ResolvedNavigationTarget =>
    largeFileNavigationTarget(docName, size ?? pageMeta.get(docName)?.size) ?? {
      kind: 'doc',
      target: docName,
      docName,
    };
  const navigateToWithPulse = (
    targetPath: string,
    size?: number,
    options?: { registerPage?: boolean; tabBehavior?: 'append' | 'replace-active' },
  ) => {
    if (options?.registerPage) addPage(targetPath);
    openTarget(navigationTargetForDocument(targetPath, size), {
      tabBehavior: options?.tabBehavior ?? 'replace-active',
    });
    replaceHashWithoutNavigation(hashFromDocName(targetPath));
    notifySidebarFileSelected();
  };
  const navigateToFolderWithPulse = (folderPath: string) => {
    openTarget(
      { kind: 'folder', target: folderPath, folderPath },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(hashFromFolderPath(folderPath));
    notifySidebarFileSelected();
  };
  const navigateToAssetWithPulse = (assetPath: string, entries = documents) => {
    const entry = entries.find(
      (item): item is Extract<FileEntry, { kind: 'asset' }> =>
        isAssetEntry(item) && item.path === assetPath,
    );
    openTarget(
      {
        kind: 'asset',
        target: assetPath,
        assetPath,
        mediaKind: entry?.mediaKind ?? null,
      },
      { tabBehavior: 'replace-active' },
    );
    replaceHashWithoutNavigation(hashFromAssetPath(assetPath));
    notifySidebarFileSelected();
  };
  const activateTreePath = (treePath: string, entries: readonly FileEntry[] = documents) => {
    const action = resolveFileTreeSelectionAction(treePath, entries);
    if (action.kind === 'none') return;
    if (action.kind === 'asset') {
      openTarget(
        {
          kind: 'asset',
          target: action.path,
          assetPath: action.path,
          mediaKind: action.mediaKind,
        },
        { tabBehavior: 'replace-active' },
      );
      replaceHashWithoutNavigation(action.hash);
      notifySidebarFileSelected();
      return;
    }
    if (action.kind === 'folder') {
      navigateToFolderWithPulse(action.path);
      return;
    }
    const docEntry = entries.find(
      (item): item is DocumentEntry => isDocumentEntry(item) && item.docName === action.path,
    );
    const okTarget = okContentNavigationTarget(action.path, { pages, docExt: docEntry?.docExt });
    if (okTarget?.kind === 'asset') {
      openTarget(okTarget, { tabBehavior: 'replace-active' });
      replaceHashWithoutNavigation(hashFromAssetPath(okTarget.assetPath));
      notifySidebarFileSelected();
      return;
    }
    if (okTarget?.kind === 'doc') {
      navigateToWithPulse(okTarget.docName, undefined, {
        tabBehavior: sidebarDocumentTabBehavior,
      });
      return;
    }
    navigateToWithPulse(action.path, docEntry?.size, {
      registerPage: hasSupportedDocumentExtension(action.path),
      tabBehavior: sidebarDocumentTabBehavior,
    });
  };
  const { selectedFilePath, selectedFolderPath, navigationPath } = resolveFileTreeSelection(
    activeTarget,
    isNewTabActive ? null : activeDocName,
  );
  const baseActiveTreePath = selectedFilePath
    ? docNameToTreePath(
        selectedFilePath,
        documents.find(
          (entry): entry is DocumentEntry =>
            isDocumentEntry(entry) && entry.docName === selectedFilePath,
        )?.docExt,
      )
    : selectedFolderPath
      ? folderPathToTreeDirectoryPath(selectedFolderPath)
      : activeTarget?.kind === 'asset'
        ? activeTarget.assetPath
        : null;
  return {
    activeDocName,
    activeTarget,
    addPage,
    pageMeta,
    pages,
    selectedFolderPath,
    activeNavigationPath: navigationPath,
    baseActiveTreePath,
    navigateToWithPulse,
    navigateToFolderWithPulse,
    navigateToAssetWithPulse,
    activateTreePath,
  };
}
