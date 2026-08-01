import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import {
  BacklinkIndexRequiredError,
  ManagedRenameDestinationExistsError,
  ManagedRenameInvalidRequestError,
  ManagedRenameReservedPathError,
  ManagedRenameSourceNotFoundError,
  ManagedRenameSourceTypeMismatchError,
} from './apply-managed-rename.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { DocInConflictError } from './conflict-errors.ts';
import { isReservedProjectStatePath, resolveContentEntryPath } from './content-path-policy.ts';
import {
  renamePathOnDisk,
  renameTrackedPathInGit,
  stringsDifferOnlyByCase,
  writeFileIfContentDiffers,
} from './content-rename-filesystem.ts';
import { forgetDocExtension, isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';
import type {
  ManagedRenameContentOperations,
  ManagedRenameRewrittenDoc,
  ManagedRenameRuntime,
  RenamedAssetMapping,
} from './managed-rename-content.ts';
import {
  createManagedRenameRecoveryJournal,
  withManagedRenameRecovery,
} from './managed-rename-journal.ts';

export function createManagedRenameAssetExecutors(
  runtime: ManagedRenameRuntime,
  content: ManagedRenameContentOperations,
) {
  async function executeAssetRename(
    fromPath: string,
    toPath: string,
  ): Promise<{ renamedAssets: RenamedAssetMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] }> {
    return runtime.runSerialized(async () =>
      runtime.withSpan(
        'rename.executeAssetRewrites',
        { attributes: { 'rename.kind': 'asset' } },
        async (span) => {
          const backlinkIndex = runtime.backlinkIndex;
          if (!backlinkIndex) throw new BacklinkIndexRequiredError();
          const destinationAssetPath = extname(toPath) ? toPath : `${toPath}${extname(fromPath)}`;
          if (
            isReservedProjectStatePath(fromPath) ||
            isReservedProjectStatePath(destinationAssetPath)
          ) {
            throw new ManagedRenameReservedPathError('.ok and .git are reserved directories.');
          }
          if (runtime.contentFilter?.isPathIgnored(destinationAssetPath)) {
            throw new ManagedRenameInvalidRequestError(
              'Destination asset is excluded by the project content config.',
            );
          }
          const sourcePath = resolveContentEntryPath(runtime.contentDir, 'folder', fromPath);
          const destinationPath = resolveContentEntryPath(
            runtime.contentDir,
            'folder',
            destinationAssetPath,
          );
          if (sourcePath === destinationPath) return { renamedAssets: [], rewrittenDocs: [] };
          if (stringsDifferOnlyByCase(fromPath, destinationAssetPath)) {
            throw new ManagedRenameInvalidRequestError('Case-only renames are not supported.');
          }
          if (!existsSync(sourcePath)) {
            throw new ManagedRenameSourceNotFoundError('asset', 'Asset does not exist.');
          }
          if (existsSync(destinationPath)) throw new ManagedRenameDestinationExistsError();
          if (!statSync(sourcePath).isFile()) {
            throw new ManagedRenameSourceTypeMismatchError(
              'asset',
              'Source path is not an asset file.',
            );
          }
          const renamedAssets = [{ fromPath, toPath: destinationAssetPath }];
          const pendingRewrites = content.collectAssetReferenceRewritesForMappings(renamedAssets);
          span.setAttribute('rename.rewrite_candidates', pendingRewrites.length);
          content.assertRewriteTargetsNotConflicted(pendingRewrites.map((entry) => entry.docName));
          const renamedWithGit = await renameTrackedPathInGit(
            runtime.projectDir,
            sourcePath,
            destinationPath,
          );
          if (!renamedWithGit) renamePathOnDisk(sourcePath, destinationPath);
          const rewrittenDocs = content.applyPendingAssetReferenceRewrites(
            pendingRewrites,
            renamedAssets,
          );
          void backlinkIndex.saveToDisk().catch((err: unknown) => {
            console.warn(
              `[backlinks] Failed to persist asset rename cache for ${fromPath} -> ${destinationAssetPath}:`,
              err,
            );
          });
          runtime.signalChannel?.('files');
          if (rewrittenDocs.length > 0) {
            runtime.signalChannel?.('backlinks');
            runtime.signalChannel?.('graph');
          }
          rewrittenDocs.sort((a, b) => a.docName.localeCompare(b.docName));
          span.setAttribute('rename.rewrite_count', rewrittenDocs.length);
          return { renamedAssets, rewrittenDocs };
        },
      ),
    );
  }

  async function executeDocumentToFileRename(
    fromPath: string,
    toPath: string,
  ): Promise<{ renamedAssets: RenamedAssetMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] }> {
    return runtime.runSerialized(async () =>
      runtime.withSpan(
        'rename.executeDocumentToFileRewrites',
        { attributes: { 'rename.kind': 'asset', 'rename.transition': 'document-to-file' } },
        async (span) => {
          const backlinkIndex = runtime.backlinkIndex;
          if (!backlinkIndex) throw new BacklinkIndexRequiredError();
          if (!isSupportedDocFile(fromPath) || isSupportedDocFile(toPath)) {
            throw new ManagedRenameInvalidRequestError(
              'Document-to-file rename requires a markdown source and non-markdown destination.',
            );
          }
          const sourceDocName = stripDocExtension(fromPath);
          if (isSystemDoc(sourceDocName) || isConfigDoc(sourceDocName)) {
            throw new ManagedRenameReservedPathError('Reserved document names cannot be renamed.');
          }
          if (isReservedProjectStatePath(fromPath) || isReservedProjectStatePath(toPath)) {
            throw new ManagedRenameReservedPathError('.ok and .git are reserved directories.');
          }
          if (runtime.contentFilter?.isPathIgnored(toPath)) {
            throw new ManagedRenameInvalidRequestError(
              'Destination file is excluded by the project content config.',
            );
          }
          const sourcePath = resolveContentEntryPath(runtime.contentDir, 'folder', fromPath);
          const destinationPath = resolveContentEntryPath(runtime.contentDir, 'folder', toPath);
          if (sourcePath === destinationPath) return { renamedAssets: [], rewrittenDocs: [] };
          if (stringsDifferOnlyByCase(fromPath, toPath)) {
            throw new ManagedRenameInvalidRequestError('Case-only renames are not supported.');
          }
          if (!existsSync(sourcePath)) throw new ManagedRenameSourceNotFoundError('file');
          if (existsSync(destinationPath)) throw new ManagedRenameDestinationExistsError();
          if (!statSync(sourcePath).isFile()) {
            throw new ManagedRenameSourceTypeMismatchError(
              'file',
              'Source path is not a document file.',
            );
          }
          const engine = runtime.getSyncEngine?.();
          const trackedFiles = new Set(
            engine ? engine.getConflicts().map((conflict) => conflict.file) : [],
          );
          const sourceDoc = runtime.hocuspocus.documents.get(sourceDocName);
          if (
            (sourceDoc !== undefined && runtime.isDocInConflict(sourceDoc)) ||
            trackedFiles.has(fromPath)
          ) {
            throw new DocInConflictError({ file: fromPath });
          }
          const renamedAssets = [{ fromPath, toPath }];
          const pendingRewrites = content
            .collectAssetReferenceRewritesForMappings(renamedAssets)
            .filter((entry) => entry.docName !== sourceDocName);
          span.setAttribute('rename.rewrite_candidates', pendingRewrites.length);
          content.assertRewriteTargetsNotConflicted(pendingRewrites.map((entry) => entry.docName));
          runtime.reconcileDiskBeforeAgentWrite(sourceDocName);
          if (
            runtime.recentlyRemovedDocs &&
            !isSystemDoc(sourceDocName) &&
            !isConfigDoc(sourceDocName)
          ) {
            runtime.recentlyRemovedDocs.setDeleted(sourceDocName);
          }
          const liveContents = await content.captureAndCloseDocuments([sourceDocName], 'renamed');
          const sourceContent =
            liveContents.get(sourceDocName) ?? readFileSync(sourcePath, 'utf-8');
          const recoveryJournal = createManagedRenameRecoveryJournal({
            fromPath,
            toPath,
            affectedDocs: [{ from: sourceDocName, to: sourceDocName }],
            snapshots: [{ docName: sourceDocName, content: sourceContent }],
            cleanupPaths: [toPath],
          });
          let rewrittenDocs: ManagedRenameRewrittenDoc[] = [];
          await withManagedRenameRecovery(
            runtime.projectDir ?? runtime.contentDir,
            recoveryJournal,
            async () => {
              writeFileIfContentDiffers(sourcePath, sourceContent);
              runtime.registerWrite(sourcePath, runtime.contentHash(sourceContent));
              const renamedWithGit = await renameTrackedPathInGit(
                runtime.projectDir,
                sourcePath,
                destinationPath,
              );
              if (!renamedWithGit) renamePathOnDisk(sourcePath, destinationPath);
              backlinkIndex.deleteDocument(sourceDocName);
              forgetDocExtension(sourceDocName);
              runtime.mutateFileIndex?.({
                kind: 'delete',
                path: sourcePath,
                docName: sourceDocName,
              });
              const destinationStat = statSync(destinationPath);
              runtime.mutateFileIndex?.({
                kind: 'file-create',
                path: destinationPath,
                relativePath: toPath,
                size: destinationStat.size,
                modifiedTs: destinationStat.mtimeMs,
                inode: destinationStat.ino,
              });
              rewrittenDocs = content.applyPendingAssetReferenceRewrites(
                pendingRewrites,
                renamedAssets,
              );
              void backlinkIndex.saveToDisk().catch((err: unknown) => {
                console.warn(
                  `[backlinks] Failed to persist document-to-file rename cache for ${fromPath} -> ${toPath}:`,
                  err,
                );
              });
              runtime.signalChannel?.('files');
              if (rewrittenDocs.length > 0) {
                runtime.signalChannel?.('backlinks');
                runtime.signalChannel?.('graph');
              }
            },
          );
          rewrittenDocs.sort((a, b) => a.docName.localeCompare(b.docName));
          span.setAttribute('rename.rewrite_count', rewrittenDocs.length);
          return { renamedAssets, rewrittenDocs };
        },
      ),
    );
  }

  return { executeAssetRename, executeDocumentToFileRename };
}
