import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import {
  BacklinkIndexRequiredError,
  buildRenameMap,
  ManagedRenameDestinationExistsError,
  ManagedRenameMissingDocumentError,
  ManagedRenameSourceNotFoundError,
  ManagedRenameSourceTypeMismatchError,
} from './apply-managed-rename.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { type ContentEntryKind, resolveContentEntryPath } from './content-path-policy.ts';
import {
  isCaseOnlySelfCollision,
  renamePathOnDisk,
  renameTrackedPathInGit,
} from './content-rename-filesystem.ts';
import {
  forgetDocExtension,
  getDocExtension,
  isSupportedDocFile,
  registerDocExtension,
  stripDocExtension,
} from './doc-extensions.ts';
import type {
  ManagedRenameActor,
  ManagedRenameContentOperations,
  ManagedRenameRewrittenDoc,
  ManagedRenameRuntime,
  RenamedAssetMapping,
  RenamedDocMapping,
} from './managed-rename-content.ts';
import {
  createManagedRenameRecoveryJournal,
  withManagedRenameRecovery,
} from './managed-rename-journal.ts';
import { appendRenameLogEntry, getOrLoadRenameLogIndex } from './rename-log.ts';

function remapDocNameForRename(
  docName: string,
  kind: ContentEntryKind,
  fromPath: string,
  toPath: string,
): string {
  if (kind === 'file') return toPath;
  if (docName === fromPath) return toPath;
  return `${toPath}${docName.slice(fromPath.length)}`;
}

export function createManagedRenameDocumentExecutor(
  runtime: ManagedRenameRuntime,
  content: ManagedRenameContentOperations,
  enumeration: {
    docNameForFileOperationPath(path: string): string;
    listManagedDocNamesUnderFolderFromDisk(path: string): string[];
    listRenamedAssetsForFolderMove(
      sourcePathRoot: string,
      fromPath: string,
      toPath: string,
    ): RenamedAssetMapping[];
  },
) {
  return async function executeManagedDocumentRename(
    fromPath: string,
    toPath: string,
    kind: ContentEntryKind,
    options?: { actor?: ManagedRenameActor },
  ): Promise<{
    renamed: RenamedDocMapping[];
    renamedAssets: RenamedAssetMapping[];
    rewrittenDocs: ManagedRenameRewrittenDoc[];
  }> {
    return runtime.runSerialized(async () =>
      runtime.withSpan(
        'rename.executeRewrites',
        { attributes: { 'rename.kind': kind } },
        async (span) => {
          const backlinkIndex = runtime.backlinkIndex;
          if (!backlinkIndex) throw new BacklinkIndexRequiredError();
          const sourcePathRoot = resolveContentEntryPath(runtime.contentDir, kind, fromPath);
          const destinationPathRoot = resolveContentEntryPath(runtime.contentDir, kind, toPath);
          if (sourcePathRoot === destinationPathRoot) {
            return { renamed: [], renamedAssets: [], rewrittenDocs: [] };
          }
          if (!existsSync(sourcePathRoot)) throw new ManagedRenameSourceNotFoundError(kind);
          if (
            existsSync(destinationPathRoot) &&
            !isCaseOnlySelfCollision(sourcePathRoot, destinationPathRoot)
          ) {
            throw new ManagedRenameDestinationExistsError();
          }
          const sourceStat = statSync(sourcePathRoot);
          if (
            (kind === 'file' && !sourceStat.isFile()) ||
            (kind === 'folder' && !sourceStat.isDirectory())
          ) {
            throw new ManagedRenameSourceTypeMismatchError(kind);
          }
          const renamedAssets =
            kind === 'folder'
              ? enumeration.listRenamedAssetsForFolderMove(sourcePathRoot, fromPath, toPath)
              : [];
          span.setAttribute('rename.affected_assets', renamedAssets.length);
          const affectedDocNames =
            kind === 'file'
              ? [enumeration.docNameForFileOperationPath(fromPath)]
              : enumeration.listManagedDocNamesUnderFolderFromDisk(sourcePathRoot);
          const affectedDocs = affectedDocNames.map((docName) => ({
            from: docName,
            to:
              kind === 'file'
                ? enumeration.docNameForFileOperationPath(toPath)
                : remapDocNameForRename(docName, kind, fromPath, toPath),
          }));
          span.setAttribute('rename.affected_docs', affectedDocs.length);
          if (affectedDocs.length === 0) {
            const pendingAssetRewrites =
              content.collectAssetReferenceRewritesForMappings(renamedAssets);
            content.assertRewriteTargetsNotConflicted(
              pendingAssetRewrites.map((entry) => entry.docName),
            );
            const rewrittenDocs: ManagedRenameRewrittenDoc[] = [];
            if (kind === 'folder') {
              const renamedWithGit = await renameTrackedPathInGit(
                runtime.projectDir,
                sourcePathRoot,
                destinationPathRoot,
              );
              if (!renamedWithGit) renamePathOnDisk(sourcePathRoot, destinationPathRoot);
              runtime.renameFolderIndexEntries(fromPath, toPath);
              runtime.signalChannel?.('files');
            }
            rewrittenDocs.push(
              ...content.applyPendingAssetReferenceRewrites(pendingAssetRewrites, renamedAssets),
            );
            if (rewrittenDocs.length > 0) {
              void backlinkIndex.saveToDisk().catch((err: unknown) => {
                console.warn(
                  `[backlinks] Failed to persist managed rename cache for ${fromPath} -> ${toPath}:`,
                  err,
                );
              });
              runtime.signalChannel?.('backlinks');
              runtime.signalChannel?.('graph');
            }
            rewrittenDocs.sort((a, b) => a.docName.localeCompare(b.docName));
            return { renamed: [], renamedAssets, rewrittenDocs };
          }
          const renameMap = buildRenameMap(affectedDocs);
          const renamed = affectedDocs.map(({ from, to }) => ({
            fromDocName: from,
            toDocName: to,
          }));
          const backlinkSourceSet = new Set<string>();
          for (const { from } of affectedDocs) {
            for (const entry of backlinkIndex.getBacklinks(from)) {
              if (!renameMap.has(entry.source)) backlinkSourceSet.add(entry.source);
            }
          }
          const backlinkSources = [...backlinkSourceSet].sort((a, b) => a.localeCompare(b));
          const snapshotContents = new Map<string, string>();
          const rewriteDocNameSet = new Set<string>();
          const assetRewriteDocNameSet = new Set<string>();
          const missingBacklinkSources: string[] = [];
          for (const docName of [...renameMap.keys(), ...backlinkSources]) {
            if (snapshotContents.has(docName)) continue;
            if (!renameMap.has(docName)) {
              const filePath = resolveContentEntryPath(runtime.contentDir, 'file', docName);
              if (!existsSync(filePath)) {
                missingBacklinkSources.push(docName);
                continue;
              }
            }
            runtime.reconcileDiskBeforeAgentWrite(docName);
            const current = content.readCurrentDocumentContent(docName);
            if (typeof current === 'string') {
              snapshotContents.set(docName, current);
              if (!renameMap.has(docName)) rewriteDocNameSet.add(docName);
            } else if (!renameMap.has(docName)) {
              missingBacklinkSources.push(docName);
            }
          }
          if (renamedAssets.length > 0) {
            const docNames = [...runtime.getFileIndex().keys()].sort((a, b) => a.localeCompare(b));
            for (const docName of docNames) {
              const current =
                snapshotContents.get(docName) ?? content.readCurrentDocumentContent(docName);
              if (typeof current !== 'string') continue;
              const rewritten = content.applyRenameAndAssetReferenceRewrites(
                current,
                docName,
                renameMap.get(docName) ?? docName,
                renameMap,
                renamedAssets,
              );
              if (rewritten.rewrites === 0) continue;
              if (!snapshotContents.has(docName)) snapshotContents.set(docName, current);
              assetRewriteDocNameSet.add(docName);
              if (!renameMap.has(docName)) rewriteDocNameSet.add(docName);
            }
          }
          content.assertRewriteTargetsNotConflicted(assetRewriteDocNameSet);
          for (const { from } of affectedDocs) {
            if (typeof snapshotContents.get(from) !== 'string') {
              throw new ManagedRenameMissingDocumentError(from);
            }
          }
          const recoveryJournal = createManagedRenameRecoveryJournal({
            fromPath,
            toPath,
            affectedDocs: [...affectedDocs],
            snapshots: content.buildManagedRenameSnapshots(
              [...snapshotContents.keys()],
              snapshotContents,
            ),
          });
          const rewrittenDocs: ManagedRenameRewrittenDoc[] = [];
          const rewriteDocNames = [...rewriteDocNameSet].sort((a, b) => a.localeCompare(b));
          await withManagedRenameRecovery(
            runtime.projectDir ?? runtime.contentDir,
            recoveryJournal,
            async () => {
              for (const docName of missingBacklinkSources) backlinkIndex.deleteDocument(docName);
              for (const docName of rewriteDocNames) {
                const document = runtime.hocuspocus.documents.get(docName);
                const rewritten = document
                  ? content.applyManagedRenameMapToLoadedDocument(docName, renameMap, renamedAssets)
                  : content.applyRenameAndAssetReferenceRewrites(
                      snapshotContents.get(docName) ?? '',
                      docName,
                      docName,
                      renameMap,
                      renamedAssets,
                    );
                if (rewritten.rewrites > 0) {
                  content.writeManagedRenameDocumentToDisk(docName, rewritten.markdown);
                  rewrittenDocs.push({ docName, rewrites: rewritten.rewrites });
                }
                backlinkIndex.updateDocumentFromMarkdown(docName, rewritten.markdown);
              }
              if (runtime.recentlyRemovedDocs) {
                for (const { from, to } of affectedDocs) {
                  if (isSystemDoc(from) || isConfigDoc(from)) continue;
                  runtime.recentlyRemovedDocs.setRenamed(from, to);
                  console.info(
                    JSON.stringify({
                      event: 'recently-removed-docs-populate',
                      from,
                      to,
                      kind: 'renamed',
                      source: 'spine',
                    }),
                  );
                }
              }
              const rootSourcePath = resolveContentEntryPath(runtime.contentDir, kind, fromPath);
              const rootDestinationPath = resolveContentEntryPath(runtime.contentDir, kind, toPath);
              const renamedWithGit = await renameTrackedPathInGit(
                runtime.projectDir,
                rootSourcePath,
                rootDestinationPath,
              );
              if (!renamedWithGit) renamePathOnDisk(rootSourcePath, rootDestinationPath);
              if (kind === 'folder') runtime.renameFolderIndexEntries(fromPath, toPath);
              const liveContents = await content.captureAndCloseDocuments(
                [...renameMap.keys()],
                'renamed',
              );
              if (
                process.env.NODE_ENV === 'test' &&
                process.env.OK_TEST_RENAME_FAULT === 'pre-append'
              ) {
                throw new Error('OK_TEST_RENAME_FAULT=pre-append');
              }
              if (runtime.shadowRef?.current) {
                const shadow = runtime.shadowRef.current;
                const loggable = affectedDocs.filter(
                  ({ from, to }) => stripDocExtension(from) !== stripDocExtension(to),
                );
                if (loggable.length > 0) {
                  runtime.withSpanSync(
                    'rename.appendLog',
                    { attributes: { 'rename.kind': kind } },
                    (logSpan) => {
                      const groupId = randomUUID();
                      const at = new Date().toISOString();
                      const branch = runtime.getCurrentBranch?.() ?? 'main';
                      const renameLogIndex = getOrLoadRenameLogIndex(shadow.gitDir);
                      const actor = options?.actor
                        ? {
                            writerId: options.actor.writerId,
                            displayName: options.actor.displayName,
                          }
                        : {
                            writerId: runtime.serviceWriter.id,
                            displayName: runtime.serviceWriter.name,
                          };
                      let entriesAppended = 0;
                      for (const { from, to } of loggable) {
                        appendRenameLogEntry(
                          shadow.gitDir,
                          { v: 1, from, to, at, commitSha: '', branch, groupId, kind, actor },
                          renameLogIndex,
                          shadow,
                        );
                        entriesAppended += 1;
                        if (options?.actor) {
                          runtime.recordContributor(
                            to,
                            options.actor.writerId,
                            options.actor.displayName,
                            options.actor.colorSeed,
                            runtime.formatRenameSubject(from, to),
                            options.actor.actorMetadata,
                            undefined,
                            [{ from, to }],
                          );
                        } else {
                          runtime.recordContributor(
                            to,
                            runtime.serviceWriter.id,
                            runtime.serviceWriter.name,
                            runtime.serviceWriter.id,
                            runtime.formatRenameSubject(from, to),
                            undefined,
                            undefined,
                            [{ from, to }],
                          );
                        }
                      }
                      logSpan.setAttribute('rename.entries_appended', entriesAppended);
                    },
                  );
                }
              }
              const explicitDestExt =
                kind === 'file' && isSupportedDocFile(toPath) ? extname(toPath) : null;
              for (const { from, to } of affectedDocs) {
                const sourceExt = isSupportedDocFile(from) ? extname(from) : getDocExtension(from);
                forgetDocExtension(from);
                registerDocExtension(to, explicitDestExt ?? sourceExt);
              }
              for (const { from: fromDocName, to: toDocName } of [...affectedDocs].sort((a, b) =>
                a.from.localeCompare(b.from),
              )) {
                const sourcePath = resolveContentEntryPath(runtime.contentDir, 'file', fromDocName);
                const destinationPath = resolveContentEntryPath(
                  runtime.contentDir,
                  'file',
                  toDocName,
                );
                const sourceCurrentContent =
                  liveContents.get(fromDocName) ??
                  snapshotContents.get(fromDocName) ??
                  readFileSync(destinationPath, 'utf-8');
                const renamedSource = content.applyRenameAndAssetReferenceRewrites(
                  sourceCurrentContent,
                  fromDocName,
                  toDocName,
                  renameMap,
                  renamedAssets,
                );
                content.syncRenamedDocsToDisk(
                  [{ fromDocName, toDocName }],
                  new Map([[fromDocName, renamedSource.markdown]]),
                );
                runtime.setReconciledBase(toDocName, renamedSource.markdown);
                runtime.mutateFileIndex?.({
                  kind: 'rename',
                  oldPath: sourcePath,
                  newPath: destinationPath,
                  oldDocName: fromDocName,
                  newDocName: toDocName,
                  content: renamedSource.markdown,
                });
                backlinkIndex.renameDocument(fromDocName, toDocName, renamedSource.markdown);
                if (renamedSource.rewrites > 0) {
                  rewrittenDocs.push({ docName: toDocName, rewrites: renamedSource.rewrites });
                }
              }
              if (
                process.env.NODE_ENV === 'test' &&
                process.env.OK_TEST_RENAME_FAULT === 'pre-journal-clear'
              ) {
                throw new Error('OK_TEST_RENAME_FAULT=pre-journal-clear');
              }
            },
          );
          void backlinkIndex.saveToDisk().catch((err: unknown) => {
            console.warn(
              `[backlinks] Failed to persist managed rename cache for ${fromPath} -> ${toPath}:`,
              err,
            );
          });
          runtime.signalChannel?.('files');
          runtime.signalChannel?.('backlinks');
          runtime.signalChannel?.('graph');
          rewrittenDocs.sort((a, b) => a.docName.localeCompare(b.docName));
          span.setAttribute('rename.rewrite_count', rewrittenDocs.length);
          return { renamed, renamedAssets, rewrittenDocs };
        },
      ),
    );
  };
}
