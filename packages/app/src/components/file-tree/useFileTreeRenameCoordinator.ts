import { useLingui } from '@lingui/react/macro';
import type { FileTreeRenameEvent, FileTree as PierreFileTreeModel } from '@pierre/trees';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { docNameToTreePath, folderPathToTreeDirectoryPath } from '@/components/file-tree-adapter';
import type {
  RenamedAssetMapping,
  RenamedDocExtensionMapping,
  RenamedDocMapping,
  RenamedFolderMapping,
} from '@/components/file-tree-operations';
import { getFileExtension } from '@/components/file-tree-rename-validation';
import { type DocumentEntry, type FileEntry, isDocumentEntry } from '@/components/file-tree-utils';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { getEditorForDoc } from '@/editor/active-editor';
import { captureRenameSnapshots } from '@/editor/editor-cache';
import { remapPathForFolderRenames } from '@/editor/editor-tabs';
import { emitDocumentsChanged } from '@/lib/documents-events';
import type { ApplyRenamedDocumentsInput } from './apply-renamed-documents';
import { applyRenamedDocuments as reconcileRenamedDocuments } from './apply-renamed-documents';
import type { PendingCreate } from './useFileTreeCreation';
import { createFileTreeRenameHandlers } from './useFileTreeRename';

type ActiveTarget = ResolvedNavigationTarget | null;

type Input = {
  model: PierreFileTreeModel;
  documentsRef: MutableRefObject<FileEntry[]>;
  activeDocNameRef: MutableRefObject<string | null>;
  activeTargetRef: MutableRefObject<ActiveTarget>;
  assetTreePathsRef: MutableRefObject<Set<string>>;
  folderTreePathsRef: MutableRefObject<string[]>;
  treePathsRef: MutableRefObject<string[]>;
  pendingCreateRef: MutableRefObject<PendingCreate | null>;
  setBusyPath: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setDocuments: ApplyRenamedDocumentsInput['setDocuments'];
  resetModelToDocuments: () => void;
  markNextDocumentsAsApplied: (documents: readonly FileEntry[]) => void;
  cleanupPendingCreate: (pending: PendingCreate) => Promise<void>;
  clearPendingCreate: () => void;
  getPoolActiveDocName: ApplyRenamedDocumentsInput['getPoolActiveDocName'];
  poolHas: ApplyRenamedDocumentsInput['poolHas'];
  closeAndClearForRename: ApplyRenamedDocumentsInput['closeAndClearForRename'];
  addPage: ApplyRenamedDocumentsInput['addPage'];
  remapTabsForRename: ApplyRenamedDocumentsInput['remapTabsForRename'];
  navigateToWithPulse: ApplyRenamedDocumentsInput['navigateToWithPulse'];
  navigateToFolderWithPulse: ApplyRenamedDocumentsInput['navigateToFolderWithPulse'];
  navigateToAssetWithPulse: ApplyRenamedDocumentsInput['navigateToAssetWithPulse'];
};

const MARKDOWN_TREE_EXTENSION_PATTERN = /\.(md|mdx)$/i;

function parseAlreadyExistsRenamePath(message: string): string | null {
  const match = message.match(/^"(.+)" already exists\.$/);
  return match ? match[1] : null;
}

function markdownTreeExtension(path: string): string | null {
  const match = path.match(MARKDOWN_TREE_EXTENSION_PATTERN);
  return match ? match[0] : null;
}

function focusEditorAfterRename(docName: string): void {
  window.requestAnimationFrame(() => {
    const editor = getEditorForDoc(docName);
    if (!editor || editor.isDestroyed) return;
    try {
      editor.commands.focus();
    } catch {
      // Editor view may be mid-transition; focus is best-effort.
    }
  });
}

/** Coordinates rename reconciliation and conflict recovery across the tree, tabs, and editor. */
export function useFileTreeRenameCoordinator({
  model,
  documentsRef,
  activeDocNameRef,
  activeTargetRef,
  assetTreePathsRef,
  folderTreePathsRef,
  treePathsRef,
  pendingCreateRef,
  setBusyPath,
  setError,
  setDocuments,
  resetModelToDocuments,
  markNextDocumentsAsApplied,
  cleanupPendingCreate,
  clearPendingCreate,
  getPoolActiveDocName,
  poolHas,
  closeAndClearForRename,
  addPage,
  remapTabsForRename,
  navigateToWithPulse,
  navigateToFolderWithPulse,
  navigateToAssetWithPulse,
}: Input) {
  const { t } = useLingui();
  const reconcileModelAfterExtensionlessRename = (
    current: readonly FileEntry[],
    next: readonly FileEntry[],
    renamed: readonly RenamedDocMapping[],
    renamedAssets: readonly RenamedAssetMapping[] = [],
  ): void => {
    let reconciledCount = 0;
    let lastCanonical: string | null = null;
    for (const { fromDocName, toDocName } of renamed) {
      const source = current.find(
        (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === fromDocName,
      );
      if (source == null || model.getItem(toDocName) == null) continue;
      const destination = next.find(
        (entry): entry is DocumentEntry => isDocumentEntry(entry) && entry.docName === toDocName,
      );
      const canonicalTreePath = docNameToTreePath(toDocName, destination?.docExt ?? source.docExt);
      model.move(toDocName, canonicalTreePath);
      lastCanonical = canonicalTreePath;
      reconciledCount += 1;
    }
    for (const { toPath } of renamedAssets) {
      const ext = getFileExtension(toPath);
      if (ext === '') continue;
      const extensionlessTreePath = toPath.slice(0, -ext.length);
      if (model.getItem(extensionlessTreePath) == null) continue;
      if (model.getItem(toPath) == null) model.move(extensionlessTreePath, toPath);
      lastCanonical = toPath;
      reconciledCount += 1;
    }
    if (reconciledCount === 0) return;
    resetModelToDocuments(next);
    if (lastCanonical != null) model.focusPath(lastCanonical);
  };

  const applyRenamedDocuments = async (
    renamed: RenamedDocMapping[],
    renamedFolders: RenamedFolderMapping[] = [],
    renamedAssets: RenamedAssetMapping[] = [],
    activeBeforeRename?: {
      docName: string | null;
      folderPath: string | null;
      assetPath: string | null;
    },
    renamedDocExtensions: RenamedDocExtensionMapping[] = [],
  ) => {
    await reconcileRenamedDocuments({
      documents: documentsRef.current,
      renamed,
      renamedFolders,
      renamedAssets,
      renamedDocExtensions,
      activeBeforeRename,
      activeDocName: activeDocNameRef.current,
      activeFolderPath:
        activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
      activeAssetPath:
        activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null,
      getPoolActiveDocName,
      poolHas,
      captureRenameSnapshots,
      closeAndClearForRename,
      addPage,
      remapTabsForRename,
      remapPathForFolderRenames,
      setDocuments,
      reconcileModelAfterExtensionlessRename,
      markNextDocumentsAsApplied,
      navigateToWithPulse,
      navigateToFolderWithPulse,
      navigateToAssetWithPulse,
      focusEditorAfterRename,
      emitDocumentsChanged,
    });
  };

  const isAssetTreePath = (treePath: string) => assetTreePathsRef.current.has(treePath);
  const { handleTreeRename, handleDropComplete } = createFileTreeRenameHandlers({
    documents: documentsRef.current,
    activeBeforeRename: () => ({
      docName: activeDocNameRef.current,
      folderPath:
        activeTargetRef.current?.kind === 'folder' ? activeTargetRef.current.folderPath : null,
      assetPath:
        activeTargetRef.current?.kind === 'asset' ? activeTargetRef.current.assetPath : null,
    }),
    isAssetTreePath,
    fetch,
    setBusyPath,
    setError,
    resetModelToDocuments,
    pendingCreate: () => pendingCreateRef.current,
    cleanupPendingCreate,
    clearPendingCreate,
    applyRenamedDocuments,
    toastError: toast.error,
    messages: {
      failedRename: t`Failed to rename path`,
      failedMove: t`Failed to move`,
      renameResync: t`Rename succeeded but the sidebar may be out of date — refresh to resync`,
      moveResync: t`Move succeeded but the sidebar may be out of date — refresh to resync`,
      networkError: t`Network error — please try again`,
    },
  });

  const recoverMarkdownRenameConflict = (message: string): boolean => {
    const bareDestinationPath = parseAlreadyExistsRenamePath(message);
    if (!bareDestinationPath || markdownTreeExtension(bareDestinationPath)) return false;
    const sourceTreePath = model.getFocusedPath() ?? model.getSelectedPaths()[0] ?? null;
    if (!sourceTreePath || sourceTreePath.endsWith('/') || isAssetTreePath(sourceTreePath)) {
      return false;
    }
    const sourceExtension = markdownTreeExtension(sourceTreePath);
    if (!sourceExtension) return false;
    const folderTreePath = folderPathToTreeDirectoryPath(bareDestinationPath);
    if (!folderTreePathsRef.current.includes(folderTreePath)) return false;
    const destinationTreePath = `${bareDestinationPath}${sourceExtension}`;
    if (treePathsRef.current.includes(destinationTreePath)) return false;
    void handleTreeRename({
      sourcePath: sourceTreePath,
      destinationPath: destinationTreePath,
      isFolder: false,
    } satisfies FileTreeRenameEvent);
    model.move(sourceTreePath, destinationTreePath);
    return true;
  };

  return { handleTreeRename, handleDropComplete, recoverMarkdownRenameConflict };
}
