/** Owns FileTree's rename and internal-drop mutation transport; the facade supplies UI state. */

import { RenamePathSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { FileTreeDropResult, FileTreeRenameEvent } from '@pierre/trees';
import {
  computeTreeDropDestinationPath,
  normalizeTreePathForKind,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocName,
  treeFilePathToDocumentDocName,
} from '@/components/file-tree-adapter';
import type {
  RenamedAssetMapping,
  RenamedDocExtensionMapping,
  RenamedDocMapping,
  RenamedFolderMapping,
} from '@/components/file-tree-operations';
import {
  getFileExtension,
  hasSupportedDocumentExtension,
  validateAndCoerceRenameDestination,
} from '@/components/file-tree-rename-validation';
import type { FileEntry } from '@/components/file-tree-utils';
import type { PageHeaderRenameResult } from '@/lib/page-header-rename-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import type { PendingCreate } from './useFileTreeCreation';

type ActiveBeforeRename = {
  docName: string | null;
  folderPath: string | null;
  assetPath: string | null;
};

type RenamePayload =
  | { kind: 'folder'; fromPath: string; toPath: string }
  | { kind: 'asset'; fromPath: string; toPath: string }
  | { kind: 'file'; fromPath: string; toPath: string };

interface FileTreeRenameDependencies {
  documents: readonly FileEntry[];
  activeBeforeRename: () => ActiveBeforeRename;
  isAssetTreePath: (path: string) => boolean;
  fetch: typeof globalThis.fetch;
  setBusyPath: (path: string | null) => void;
  setError: (message: string | null) => void;
  resetModelToDocuments: () => void;
  pendingCreate: () => PendingCreate | null;
  cleanupPendingCreate: (pending: PendingCreate) => Promise<void>;
  clearPendingCreate: () => void;
  applyRenamedDocuments: (
    renamed: RenamedDocMapping[],
    renamedFolders?: RenamedFolderMapping[],
    renamedAssets?: RenamedAssetMapping[],
    activeBeforeRename?: ActiveBeforeRename,
    renamedDocExtensions?: RenamedDocExtensionMapping[],
  ) => Promise<void>;
  toastError: (message: string) => void;
  messages: {
    failedRename: string;
    failedMove: string;
    renameResync: string;
    moveResync: string;
    networkError: string;
  };
}

export function createFileTreeRenameHandlers(dependencies: FileTreeRenameDependencies) {
  const requestRename = async (payload: RenamePayload, failedTitle: string) => {
    const response = await dependencies.fetch('/api/rename-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseServerResponse(response, failedTitle);
  };

  const cleanupFailedRename = async (sourceTreePath: string) => {
    const pending = dependencies.pendingCreate();
    if (pending && pending.renamePath === sourceTreePath) {
      await dependencies.cleanupPendingCreate(pending);
    } else {
      dependencies.clearPendingCreate();
    }
  };

  const handleTreeRename = async (event: FileTreeRenameEvent): Promise<PageHeaderRenameResult> => {
    const sourceIsAsset = !event.isFolder && dependencies.isAssetTreePath(event.sourcePath);
    const sourceTreePath = sourceIsAsset
      ? event.sourcePath
      : normalizeTreePathForKind(event.sourcePath, event.isFolder);
    dependencies.setBusyPath(sourceTreePath);
    dependencies.setError(null);

    try {
      const validation = validateAndCoerceRenameDestination(
        event.sourcePath,
        event.destinationPath,
        event.isFolder,
      );
      const documentBecomesFile =
        !event.isFolder &&
        !sourceIsAsset &&
        !hasSupportedDocumentExtension(validation.destinationPath);
      const destinationTreePath =
        sourceIsAsset || documentBecomesFile
          ? validation.destinationPath
          : normalizeTreePathForKind(validation.destinationPath, event.isFolder);
      const payload: RenamePayload = event.isFolder
        ? {
            kind: 'folder',
            fromPath: treeDirectoryPathToFolderPath(sourceTreePath),
            toPath: treeDirectoryPathToFolderPath(destinationTreePath),
          }
        : sourceIsAsset || documentBecomesFile
          ? { kind: 'asset', fromPath: sourceTreePath, toPath: destinationTreePath }
          : {
              kind: 'file',
              fromPath: treeFilePathToDocumentDocName(sourceTreePath, dependencies.documents),
              toPath: destinationTreePath,
            };
      const activeBeforeRename = dependencies.activeBeforeRename();
      const parsed = await requestRename(payload, dependencies.messages.failedRename);

      if (!parsed.ok) {
        dependencies.toastError(parsed.title);
        dependencies.resetModelToDocuments();
        await cleanupFailedRename(sourceTreePath);
        dependencies.setBusyPath(null);
        return { ok: false, message: parsed.title };
      }

      const success = parseSuccessOrWarn(RenamePathSuccessSchema, parsed.body, 'rename-path', {
        renamed: [],
        renamedAssets: [],
      });
      try {
        await dependencies.applyRenamedDocuments(
          success.renamed,
          event.isFolder
            ? [
                {
                  fromPath: treeDirectoryPathToFolderPath(sourceTreePath),
                  toPath: treeDirectoryPathToFolderPath(destinationTreePath),
                },
              ]
            : [],
          success.renamedAssets,
          activeBeforeRename,
          !event.isFolder && !sourceIsAsset && !documentBecomesFile
            ? success.renamed.flatMap((entry): RenamedDocExtensionMapping[] => {
                const docExt = getFileExtension(destinationTreePath);
                return docExt ? [{ toDocName: entry.toDocName, docExt }] : [];
              })
            : [],
        );
      } catch (error) {
        console.warn('[FileTree] post-rename reconciliation failed', error);
        dependencies.toastError(dependencies.messages.renameResync);
      }
      dependencies.clearPendingCreate();
      dependencies.setBusyPath(null);
      return { ok: true };
    } catch (error) {
      console.warn('[FileTree] rename failed:', error);
      const message = dependencies.messages.networkError;
      dependencies.toastError(message);
      dependencies.setError(message);
      dependencies.resetModelToDocuments();
      await cleanupFailedRename(sourceTreePath);
      dependencies.setBusyPath(null);
      return { ok: false, message };
    }
  };

  const handleDropComplete = async (event: FileTreeDropResult): Promise<void> => {
    const operations = event.draggedPaths
      .map((sourcePath) => {
        const destinationTreePath = computeTreeDropDestinationPath(sourcePath, event.target);
        return sourcePath === destinationTreePath ? null : { sourcePath, destinationTreePath };
      })
      .filter(
        (operation): operation is { sourcePath: string; destinationTreePath: string } =>
          operation !== null,
      );
    if (operations.length === 0) return;

    dependencies.setBusyPath(operations[0]?.sourcePath ?? null);
    dependencies.setError(null);
    try {
      let renamed: RenamedDocMapping[] = [];
      let renamedAssets: RenamedAssetMapping[] = [];
      const renamedFolders: RenamedFolderMapping[] = [];
      const activeBeforeRename = dependencies.activeBeforeRename();
      for (const operation of operations) {
        const isFolder = operation.sourcePath.endsWith('/');
        const sourceIsAsset = !isFolder && dependencies.isAssetTreePath(operation.sourcePath);
        const sourceDocName = sourceIsAsset
          ? null
          : treeFilePathToDocumentDocName(operation.sourcePath, dependencies.documents);
        const payload: RenamePayload = isFolder
          ? {
              kind: 'folder',
              fromPath: treeDirectoryPathToFolderPath(operation.sourcePath),
              toPath: treeDirectoryPathToFolderPath(operation.destinationTreePath),
            }
          : sourceIsAsset
            ? {
                kind: 'asset',
                fromPath: operation.sourcePath,
                toPath: operation.destinationTreePath,
              }
            : {
                kind: 'file',
                fromPath: sourceDocName ?? treeFilePathToDocName(operation.sourcePath),
                toPath:
                  sourceDocName && hasSupportedDocumentExtension(sourceDocName)
                    ? operation.destinationTreePath
                    : treeFilePathToDocName(operation.destinationTreePath),
              };
        const parsed = await requestRename(payload, dependencies.messages.failedMove);
        if (!parsed.ok) {
          dependencies.toastError(parsed.title);
          dependencies.resetModelToDocuments();
          dependencies.setBusyPath(null);
          return;
        }
        const success = parseSuccessOrWarn(
          RenamePathSuccessSchema,
          parsed.body,
          'rename-path:drop',
          {
            renamed: [],
            renamedAssets: [],
          },
        );
        renamed = renamed.concat(success.renamed);
        renamedAssets = renamedAssets.concat(success.renamedAssets);
        if (isFolder) {
          renamedFolders.push({
            fromPath: treeDirectoryPathToFolderPath(operation.sourcePath),
            toPath: treeDirectoryPathToFolderPath(operation.destinationTreePath),
          });
        }
      }
      try {
        await dependencies.applyRenamedDocuments(
          renamed,
          renamedFolders,
          renamedAssets,
          activeBeforeRename,
        );
      } catch (error) {
        console.warn('[FileTree] post-move reconciliation failed', error);
        dependencies.toastError(dependencies.messages.moveResync);
      }
      dependencies.setBusyPath(null);
    } catch (error) {
      console.warn('[FileTree] move failed:', error);
      dependencies.toastError(dependencies.messages.networkError);
      dependencies.resetModelToDocuments();
      dependencies.setBusyPath(null);
    }
  };

  return { handleTreeRename, handleDropComplete };
}
