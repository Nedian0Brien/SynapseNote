/** Owns FileTree delete and desktop Trash effects; the facade retains only dialog rendering. */

import { DeletePathSuccessSchema, TrashCleanupSuccessSchema } from '@nedian0brien/synapsenote-core';
import {
  collectTabsToCloseForDelete,
  deleteTargetCoversPendingCreate,
} from '@/components/file-tree/file-tree-commands';
import { docNameToTreePath, folderPathToTreeDirectoryPath } from '@/components/file-tree-adapter';
import {
  applyDeleteToDocuments,
  buildTrashAbsPath,
  canonicalizeAssetTargetForDelete,
  type FileTreeTarget,
} from '@/components/file-tree-operations';
import { type FileEntry, hasOkPathSegment } from '@/components/file-tree-utils';
import type { TrashFailedTarget } from '@/components/TrashFailureModal';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';
import type { PendingCreate } from './useFileTreeCreation';

export interface FileTreeDeleteRequest {
  targets: FileTreeTarget[];
}

export interface TrashFailureRequest {
  failed: TrashFailedTarget[];
  originalTargets: FileTreeTarget[];
}

export interface WorkspaceInfo {
  contentDir: string;
  pathSeparator: '/' | '\\';
}

type DesktopBridge = {
  shell: {
    trashItem: (path: string) => Promise<{ ok: boolean; reason?: string; detail?: string }>;
  };
};

type Dependencies = {
  documents: () => readonly FileEntry[];
  folderTreePaths: () => readonly string[];
  activeConflicts: () => readonly { file: string }[];
  workspace: () => WorkspaceInfo | null;
  desktopBridge: () => DesktopBridge | undefined;
  pendingCreate: () => PendingCreate | null;
  setDeleteRequest: (request: FileTreeDeleteRequest | null) => void;
  trashFailure: () => TrashFailureRequest | null;
  setTrashFailure: (request: TrashFailureRequest | null) => void;
  setBusyPath: (path: string | null) => void;
  resetModelToDocuments: () => void;
  clearPendingCreate: (pending?: PendingCreate | null) => void;
  closeTabs: (tabIds: string[], options: { force: boolean }) => void;
  docTabId: (docName: string) => string;
  folderTabId: (folderPath: string) => string;
  assetTabId: (assetPath: string) => string;
  coerceTrashFailureReason: (reason: string | undefined) => TrashFailedTarget['reason'];
  closeAndClearForRename: (docName: string) => Promise<void>;
  model: {
    getItem: (path: string) => unknown;
    remove: (path: string, options?: { recursive: boolean }) => void;
  };
  setDocuments: (updater: (current: FileEntry[]) => FileEntry[]) => unknown;
  markNextDocumentsAsApplied: (documents: readonly FileEntry[]) => void;
  emitDocumentsChanged: (channels: ('files' | 'backlinks' | 'graph')[]) => void;
  fetch: typeof globalThis.fetch;
  toastError: (message: string, options?: { description?: string }) => void;
  messages: {
    failedDelete: string;
    failedCleanup?: string;
    cleanupFailed?: (count: number) => string;
    cleanupDescription?: string;
    conflict?: string;
    couldNotComplete: string;
  };
};

export function createFileTreeTrashHandlers(dependencies: Dependencies) {
  const applyDeleteAftermath = async (
    successfulTargets: readonly FileTreeTarget[],
    deletedDocNames: readonly string[],
    deletedFolderPaths: readonly string[],
  ) => {
    const tabsToClose = collectTabsToCloseForDelete(
      successfulTargets,
      dependencies.documents(),
      dependencies.folderTreePaths(),
    );
    const pendingCreate = dependencies.pendingCreate();
    if (
      pendingCreate &&
      successfulTargets.some((target) => deleteTargetCoversPendingCreate(target, pendingCreate))
    ) {
      if (pendingCreate.kind === 'file') tabsToClose.docNames.add(pendingCreate.createdPath);
      else tabsToClose.folderPaths.add(pendingCreate.createdPath);
      dependencies.clearPendingCreate(pendingCreate);
    }
    const deleted = new Set([...tabsToClose.docNames, ...deletedDocNames]);
    const deletedFolders = new Set([...tabsToClose.folderPaths, ...deletedFolderPaths]);
    const deletedAssets = new Set([
      ...tabsToClose.assetPaths,
      ...successfulTargets.filter((target) => target.kind === 'asset').map((target) => target.path),
    ]);
    dependencies.closeTabs(
      [
        ...[...deleted].map(dependencies.docTabId),
        ...[...deletedFolders].map(dependencies.folderTabId),
        ...[...deletedAssets].map(dependencies.assetTabId),
      ],
      { force: true },
    );
    await Promise.all([...deleted].map((docName) => dependencies.closeAndClearForRename(docName)));
    for (const target of successfulTargets) {
      const treePath =
        target.kind === 'folder'
          ? folderPathToTreeDirectoryPath(target.path)
          : target.kind === 'asset'
            ? target.path
            : docNameToTreePath(target.path, target.docExt);
      if (dependencies.model.getItem(treePath)) {
        dependencies.model.remove(
          treePath,
          target.kind === 'folder' ? { recursive: true } : undefined,
        );
      }
    }
    dependencies.setDocuments((current) => {
      let next = applyDeleteToDocuments(current, [...deleted], undefined, [...deletedAssets]);
      for (const folderPath of deletedFolders) next = applyDeleteToDocuments(next, [], folderPath);
      dependencies.markNextDocumentsAsApplied(next);
      return next;
    });
    dependencies.emitDocumentsChanged(['files', 'backlinks', 'graph']);
  };

  const hardDeleteTargets = async (targets: readonly FileTreeTarget[]): Promise<boolean> => {
    const deletedDocNames: string[] = [];
    const deletedFolderPaths: string[] = [];
    const successfulTargets: FileTreeTarget[] = [];
    for (const target of targets) {
      dependencies.setBusyPath(target.path);
      const response = await dependencies.fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: target.kind, path: target.path }),
      });
      const parsed = await parseServerResponse(response, dependencies.messages.failedDelete);
      if (!parsed.ok) {
        if (successfulTargets.length > 0) {
          await applyDeleteAftermath(successfulTargets, deletedDocNames, deletedFolderPaths);
        }
        dependencies.toastError(parsed.title);
        return false;
      }
      const success = parseSuccessOrWarn(DeletePathSuccessSchema, parsed.body, 'delete-path', {
        deletedDocNames: [],
      });
      deletedDocNames.push(...success.deletedDocNames);
      if (target.kind === 'folder') deletedFolderPaths.push(target.path);
      successfulTargets.push(target);
    }
    await applyDeleteAftermath(successfulTargets, deletedDocNames, deletedFolderPaths);
    return true;
  };

  const trashTargetsViaShell = async (
    targets: readonly FileTreeTarget[],
    bridge: DesktopBridge,
    workspace: WorkspaceInfo,
  ) => {
    const trashed: FileTreeTarget[] = [];
    const failed: TrashFailedTarget[] = [];
    for (const target of targets) {
      dependencies.setBusyPath(target.path);
      const result = await bridge.shell.trashItem(buildTrashAbsPath(target, workspace));
      if (result.ok) trashed.push(target);
      else
        failed.push({
          kind: target.kind,
          path: target.path,
          name: target.name,
          reason: dependencies.coerceTrashFailureReason(result.reason),
          detail: result.detail,
        });
    }
    return { trashed, failed };
  };

  const postTrashCleanup = async (trashed: readonly FileTreeTarget[]) => {
    const deletedDocNames: string[] = [];
    const deletedFolderPaths: string[] = [];
    let failedCount = 0;
    for (const target of trashed) {
      try {
        const response = await dependencies.fetch('/api/trash/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: target.kind, path: target.path }),
        });
        const parsed = await parseServerResponse(
          response,
          dependencies.messages.failedCleanup ?? dependencies.messages.failedDelete,
        );
        if (!parsed.ok) {
          failedCount += 1;
          continue;
        }
        const success = parseSuccessOrWarn(
          TrashCleanupSuccessSchema,
          parsed.body,
          'trash-cleanup',
          { deletedDocNames: [] },
        );
        deletedDocNames.push(...success.deletedDocNames);
        if (target.kind === 'folder') deletedFolderPaths.push(target.path);
      } catch {
        failedCount += 1;
      }
    }
    if (failedCount > 0 && dependencies.messages.cleanupFailed) {
      dependencies.toastError(dependencies.messages.cleanupFailed(failedCount), {
        description: dependencies.messages.cleanupDescription,
      });
    }
    return failedCount === trashed.length && trashed.length > 0
      ? null
      : { deletedDocNames, deletedFolderPaths };
  };

  const handleDeleteTargets = async (targets: readonly FileTreeTarget[]) => {
    const deleteTargets = targets
      .filter((target) => !hasOkPathSegment(target.path))
      .map((target) => canonicalizeAssetTargetForDelete(target, [...dependencies.documents()]));
    const firstTarget = deleteTargets[0];
    if (!firstTarget) return;
    const blockingConflicts = dependencies
      .activeConflicts()
      .filter((conflict) =>
        deleteTargets.some((target) =>
          target.kind === 'file'
            ? conflict.file === `${target.path}${target.docExt ?? '.md'}`
            : target.kind === 'folder'
              ? conflict.file.startsWith(`${target.path}/`)
              : false,
        ),
      );
    if (blockingConflicts.length > 0) {
      dependencies.toastError(
        dependencies.messages.conflict ?? 'Cannot delete files with unresolved conflicts',
      );
      return;
    }
    dependencies.setBusyPath(firstTarget.path);
    dependencies.setDeleteRequest(null);
    const bridge = dependencies.desktopBridge();
    const workspace = dependencies.workspace();
    try {
      if (bridge && workspace) {
        const { trashed, failed } = await trashTargetsViaShell(deleteTargets, bridge, workspace);
        if (trashed.length > 0) {
          const cleanup = await postTrashCleanup(trashed);
          if (cleanup)
            await applyDeleteAftermath(
              trashed,
              cleanup.deletedDocNames,
              cleanup.deletedFolderPaths,
            );
          else
            await applyDeleteAftermath(
              trashed,
              trashed.filter((target) => target.kind === 'file').map((target) => target.path),
              trashed.filter((target) => target.kind === 'folder').map((target) => target.path),
            );
        }
        if (failed.length > 0)
          dependencies.setTrashFailure({ failed, originalTargets: [...deleteTargets] });
        dependencies.setBusyPath(null);
      } else {
        const ok = await hardDeleteTargets(deleteTargets);
        dependencies.setBusyPath(null);
        if (!ok) dependencies.resetModelToDocuments();
      }
    } catch (error) {
      dependencies.toastError(dependencies.messages.couldNotComplete, {
        description: error instanceof Error ? error.message : String(error),
      });
      dependencies.setBusyPath(null);
      dependencies.resetModelToDocuments();
    }
  };

  const handleTrashFailureDeletePermanently = async () => {
    const failure = dependencies.trashFailure();
    if (!failure) return;
    const failed = new Set(failure.failed.map((target) => `${target.kind}:${target.path}`));
    const targets = failure.originalTargets.filter((target) =>
      failed.has(`${target.kind}:${target.path}`),
    );
    dependencies.setTrashFailure(null);
    if (targets.length === 0) return;
    dependencies.setBusyPath(targets[0]?.path ?? null);
    try {
      const ok = await hardDeleteTargets(targets);
      dependencies.setBusyPath(null);
      if (!ok) dependencies.resetModelToDocuments();
    } catch (error) {
      dependencies.toastError(dependencies.messages.couldNotComplete, {
        description: error instanceof Error ? error.message : String(error),
      });
      dependencies.setBusyPath(null);
      dependencies.resetModelToDocuments();
    }
  };

  const handleTrashFailureRetry = async () => {
    const failure = dependencies.trashFailure();
    if (!failure) return;
    const failed = new Set(failure.failed.map((target) => `${target.kind}:${target.path}`));
    const targets = failure.originalTargets.filter((target) =>
      failed.has(`${target.kind}:${target.path}`),
    );
    dependencies.setTrashFailure(null);
    await handleDeleteTargets(targets);
  };

  return { handleDeleteTargets, handleTrashFailureDeletePermanently, handleTrashFailureRetry };
}
