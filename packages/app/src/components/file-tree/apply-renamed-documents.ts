/** Owns post-rename client reconciliation while FileTree retains React and Pierre wiring. */

import { docNameToTreePath, treeFilePathToDocName } from '@/components/file-tree-adapter';
import {
  applyRenameToDocuments,
  planRenameCleanupCalls,
  type RenamedAssetMapping,
  type RenamedDocExtensionMapping,
  type RenamedDocMapping,
  type RenamedFolderMapping,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { hasSupportedDocumentExtension } from '@/components/file-tree-rename-validation';
import { type FileEntry, isAssetEntry, isDocumentEntry } from '@/components/file-tree-utils';

type ActiveBeforeRename = {
  docName: string | null;
  folderPath: string | null;
  assetPath: string | null;
};

export interface ApplyRenamedDocumentsInput {
  documents: readonly FileEntry[];
  renamed: readonly RenamedDocMapping[];
  renamedFolders?: readonly RenamedFolderMapping[];
  renamedAssets?: readonly RenamedAssetMapping[];
  renamedDocExtensions?: readonly RenamedDocExtensionMapping[];
  activeBeforeRename?: ActiveBeforeRename;
  activeDocName: string | null;
  activeFolderPath: string | null;
  activeAssetPath: string | null;
  getPoolActiveDocName: () => string | null;
  poolHas: (docName: string) => boolean;
  captureRenameSnapshots: (renamed: readonly RenamedDocMapping[]) => void;
  closeAndClearForRename: (docName: string) => Promise<void>;
  addPage: (docName: string) => void;
  remapTabsForRename: (
    renamed: readonly RenamedDocMapping[],
    renamedFolders: readonly RenamedFolderMapping[],
    renamedAssets: readonly RenamedAssetMapping[],
  ) => void;
  remapPathForFolderRenames: (
    path: string,
    renamedFolders: readonly RenamedFolderMapping[],
  ) => string;
  setDocuments: (updater: (current: FileEntry[]) => FileEntry[]) => unknown;
  reconcileModelAfterExtensionlessRename: (
    current: readonly FileEntry[],
    next: readonly FileEntry[],
    renamed: readonly RenamedDocMapping[],
    renamedAssets: readonly RenamedAssetMapping[],
  ) => void;
  markNextDocumentsAsApplied: (documents: readonly FileEntry[]) => void;
  navigateToWithPulse: (docName: string) => void;
  navigateToFolderWithPulse: (folderPath: string) => void;
  navigateToAssetWithPulse: (assetPath: string, documents: readonly FileEntry[]) => void;
  focusEditorAfterRename: (docName: string) => void;
  emitDocumentsChanged: (domains: ('files' | 'backlinks' | 'graph')[]) => void;
}

export async function applyRenamedDocuments({
  renamedFolders = [],
  renamedAssets = [],
  renamedDocExtensions = [],
  ...input
}: ApplyRenamedDocumentsInput): Promise<void> {
  const currentActiveDocName = input.activeBeforeRename?.docName ?? input.activeDocName;
  const docToAssetRenames = new Map<string, string>();
  const assetToDocRenames = new Map<string, string>();
  for (const entry of input.documents) {
    if (isDocumentEntry(entry)) {
      const assetPath = renamedAssets.find(
        (renamedAsset) => renamedAsset.fromPath === docNameToTreePath(entry.docName, entry.docExt),
      )?.toPath;
      if (assetPath) docToAssetRenames.set(entry.docName, assetPath);
    } else if (isAssetEntry(entry)) {
      const docPath = renamedAssets.find(
        (renamedAsset) => renamedAsset.fromPath === entry.path,
      )?.toPath;
      if (docPath && hasSupportedDocumentExtension(docPath)) {
        assetToDocRenames.set(entry.path, treeFilePathToDocName(docPath));
      }
    }
  }
  const activeDocToAssetPath = currentActiveDocName
    ? (docToAssetRenames.get(currentActiveDocName) ?? null)
    : null;
  const currentActiveFolderPath = input.activeBeforeRename?.folderPath ?? input.activeFolderPath;
  const nextActiveFolderPath = currentActiveFolderPath
    ? input.remapPathForFolderRenames(currentActiveFolderPath, renamedFolders)
    : null;
  const currentActiveAssetPath = input.activeBeforeRename?.assetPath ?? input.activeAssetPath;
  const activeAssetToDoc = currentActiveAssetPath
    ? (assetToDocRenames.get(currentActiveAssetPath) ?? null)
    : null;
  const nextActiveDocName = activeDocToAssetPath
    ? null
    : (activeAssetToDoc ?? remapActiveDocName(currentActiveDocName, [...input.renamed]));
  const nextActiveAssetPath =
    activeDocToAssetPath ??
    (currentActiveAssetPath
      ? activeAssetToDoc
        ? null
        : (renamedAssets.find((entry) => entry.fromPath === currentActiveAssetPath)?.toPath ??
          input.remapPathForFolderRenames(currentActiveAssetPath, renamedFolders))
      : null);

  input.captureRenameSnapshots(input.renamed);
  const cleanupDocNames = [
    ...planRenameCleanupCalls(input.renamed, input.getPoolActiveDocName(), input.poolHas),
    ...docToAssetRenames.keys(),
  ];
  await Promise.all(cleanupDocNames.map((docName) => input.closeAndClearForRename(docName)));
  for (const entry of input.renamed) input.addPage(entry.toDocName);
  for (const entry of assetToDocRenames.values()) input.addPage(entry);
  input.remapTabsForRename(input.renamed, renamedFolders, renamedAssets);

  let nextDocumentsForRename: FileEntry[] | null = null;
  input.setDocuments((current) => {
    const next = applyRenameToDocuments(
      current,
      [...input.renamed],
      [...renamedFolders],
      [...renamedAssets],
      [...renamedDocExtensions],
    );
    nextDocumentsForRename = next;
    input.reconcileModelAfterExtensionlessRename(current, next, input.renamed, renamedAssets);
    input.markNextDocumentsAsApplied(next);
    return next;
  });

  if (
    currentActiveFolderPath &&
    nextActiveFolderPath &&
    nextActiveFolderPath !== currentActiveFolderPath
  ) {
    input.navigateToFolderWithPulse(nextActiveFolderPath);
  } else if (nextActiveDocName && nextActiveDocName !== currentActiveDocName) {
    input.navigateToWithPulse(nextActiveDocName);
    input.focusEditorAfterRename(nextActiveDocName);
  } else if (
    nextActiveAssetPath &&
    (activeDocToAssetPath || nextActiveAssetPath !== currentActiveAssetPath)
  ) {
    input.navigateToAssetWithPulse(nextActiveAssetPath, nextDocumentsForRename ?? input.documents);
  }
  input.emitDocumentsChanged(['files', 'backlinks', 'graph']);
}
