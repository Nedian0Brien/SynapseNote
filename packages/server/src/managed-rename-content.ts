import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Document, Hocuspocus } from '@hocuspocus/server';
import type { Span } from '@opentelemetry/api';
import type { AgentSessionManager } from './agent-sessions.ts';
import { applyRenameMap, ManagedRenameSnapshotMissingError } from './apply-managed-rename.ts';
import type { BacklinkIndex } from './backlink-index.ts';
import { DocInConflictError } from './conflict-errors.ts';
import type { ContentFilter } from './content-filter.ts';
import { resolveContentEntryPath } from './content-path-policy.ts';
import type { recordContributor as recordContributorImpl } from './contributor-tracker.ts';
import { docNameToRelativePath } from './doc-extensions.ts';
import type { DiskEvent } from './file-watcher.ts';
import { tracedMkdirSync } from './fs-traced.ts';
import type { ManagedRenameSnapshot } from './managed-rename-journal.ts';
import { rewriteAssetReferencesForRename } from './managed-rename-rewrite.ts';
import { safeContentPath } from './persistence.ts';
import type { RecentlyRemovedDocs } from './recently-removed-docs.ts';
import type { ShadowRef } from './shadow-repo.ts';

export interface RenamedDocMapping {
  fromDocName: string;
  toDocName: string;
}

export interface RenamedAssetMapping {
  fromPath: string;
  toPath: string;
}

export interface ManagedRenameRewriteSummary {
  markdown: string;
  rewrites: number;
}

export interface ManagedRenameRewrittenDoc {
  docName: string;
  rewrites: number;
}

export interface ManagedRenameActor {
  writerId: string;
  displayName: string;
  colorSeed?: string;
  actorMetadata?: {
    principalId?: string;
    agentType?: string;
    clientName?: string;
    clientVersion?: string;
    label?: string;
  };
}

/** Collaboration boundary injected by the HTTP factory; it never imports the facade. */
export interface ManagedRenameRuntime {
  contentDir: string;
  projectDir?: string;
  contentFilter?: ContentFilter;
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  forceUnloadDocument?: (document: Document) => Promise<void>;
  evictManagedArtifactLkg?: (docName: string) => void;
  backlinkIndex?: BacklinkIndex;
  getFileIndex: () => ReadonlyMap<string, unknown>;
  getSyncEngine?: () => { getConflicts(): Array<{ file: string }> } | null;
  recentlyRemovedDocs?: RecentlyRemovedDocs;
  shadowRef?: ShadowRef;
  getCurrentBranch?: () => string | null;
  signalChannel?: (channel: 'files' | 'backlinks' | 'graph') => void;
  mutateFileIndex?: (event: DiskEvent) => void;
  runSerialized: <T>(operation: () => Promise<T>) => Promise<T>;
  reconcileDiskBeforeAgentWrite: (docName: string) => void;
  renameFolderIndexEntries: (fromPath: string, toPath: string) => void;
  deleteReconciledBase: (docName: string) => void;
  setReconciledBase: (docName: string, content: string) => void;
  registerWrite: (filePath: string, hash: string) => void;
  contentHash: (content: string) => string;
  composeAndWriteRawBody: (
    document: Document,
    markdown: string,
    source: string,
    parse?: boolean,
  ) => void;
  managedRenameOrigin: unknown;
  isDocInConflict: (document: Document) => boolean;
  withSpan: <T>(
    name: string,
    options: { attributes: Record<string, string> },
    operation: (span: Span) => Promise<T>,
  ) => Promise<T>;
  withSpanSync: <T>(
    name: string,
    options: { attributes: Record<string, string> },
    operation: (span: Span) => T,
  ) => T;
  recordContributor: typeof recordContributorImpl;
  serviceWriter: { id: string; name: string };
  formatRenameSubject: (from: string, to: string) => string;
}

export interface ManagedRenameContentOperations {
  captureAndCloseDocuments(
    docNames: string[],
    lifecycleStatus: 'deleted-upstream' | 'renamed',
  ): Promise<Map<string, string>>;
  syncRenamedDocsToDisk(
    renamed: RenamedDocMapping[],
    liveContents: ReadonlyMap<string, string>,
  ): void;
  buildManagedRenameSnapshots(
    docNames: string[],
    liveContents: ReadonlyMap<string, string>,
  ): ManagedRenameSnapshot[];
  readCurrentDocumentContent(docName: string): string | null;
  writeManagedRenameDocumentToDisk(docName: string, markdown: string): void;
  applyManagedRenameMapToLoadedDocument(
    docName: string,
    renameMap: ReadonlyMap<string, string>,
    renamedAssets?: readonly RenamedAssetMapping[],
  ): ManagedRenameRewriteSummary;
  applyRenameAndAssetReferenceRewrites(
    markdown: string,
    currentDocName: string,
    rewrittenDocName: string,
    renameMap: ReadonlyMap<string, string>,
    renamedAssets: readonly RenamedAssetMapping[],
  ): ManagedRenameRewriteSummary;
  collectAssetReferenceRewritesForMappings(
    renamedAssets: readonly RenamedAssetMapping[],
  ): Array<{ docName: string; markdown: string; rewrites: number }>;
  assertRewriteTargetsNotConflicted(docNames: Iterable<string>): void;
  applyPendingAssetReferenceRewrites(
    pendingRewrites: readonly { docName: string; markdown: string; rewrites: number }[],
    renamedAssets: readonly RenamedAssetMapping[],
  ): ManagedRenameRewrittenDoc[];
}

/** Rename-only content, CRDT, and index mutation primitives. */
export function createManagedRenameContentOperations(
  runtime: ManagedRenameRuntime,
): ManagedRenameContentOperations {
  const { contentDir, hocuspocus } = runtime;

  async function captureAndCloseDocuments(
    docNames: string[],
    lifecycleStatus: 'deleted-upstream' | 'renamed',
  ): Promise<Map<string, string>> {
    const liveContents = new Map<string, string>();
    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      if (document) liveContents.set(docName, document.getText('source').toString());
    }
    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      if (document) document.getMap('lifecycle').set('status', lifecycleStatus);
    }
    for (const docName of docNames) {
      await runtime.sessionManager.closeAllForDoc(docName).catch((err: unknown) => {
        console.warn(`[file-ops] Failed to close agent session for ${docName}:`, err);
      });
    }
    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      runtime.deleteReconciledBase(docName);
      runtime.evictManagedArtifactLkg?.(docName);
      if (!document) continue;
      hocuspocus.closeConnections(docName);
      await (runtime.forceUnloadDocument ?? hocuspocus.unloadDocument.bind(hocuspocus))(document);
    }
    return liveContents;
  }

  function syncRenamedDocsToDisk(
    renamed: RenamedDocMapping[],
    liveContents: ReadonlyMap<string, string>,
  ): void {
    for (const { fromDocName, toDocName } of renamed) {
      const filePath = safeContentPath(toDocName, contentDir);
      const liveContent = liveContents.get(fromDocName);
      if (typeof liveContent === 'string') writeFileIfContentDiffers(filePath, liveContent);
      const finalContent =
        typeof liveContent === 'string'
          ? liveContent
          : existsSync(filePath)
            ? readFileSync(filePath, 'utf-8')
            : null;
      if (typeof finalContent === 'string') {
        runtime.registerWrite(filePath, runtime.contentHash(finalContent));
      }
    }
  }

  function buildManagedRenameSnapshots(
    docNames: string[],
    liveContents: ReadonlyMap<string, string>,
  ): ManagedRenameSnapshot[] {
    return docNames.map((docName) => {
      const liveContent = liveContents.get(docName);
      if (typeof liveContent === 'string') return { docName, content: liveContent };
      const filePath = safeContentPath(docName, contentDir);
      if (!existsSync(filePath)) throw new ManagedRenameSnapshotMissingError(docName);
      return { docName, content: readFileSync(filePath, 'utf-8') };
    });
  }

  function readCurrentDocumentContent(docName: string): string | null {
    const document = hocuspocus.documents.get(docName);
    if (document) return document.getText('source').toString();
    const filePath = resolveContentEntryPath(contentDir, 'file', docName);
    return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null;
  }

  function writeManagedRenameDocumentToDisk(docName: string, markdown: string): void {
    const filePath = resolveContentEntryPath(contentDir, 'file', docName);
    tracedMkdirSync(dirname(filePath), { recursive: true });
    writeFileIfContentDiffers(filePath, markdown);
    runtime.registerWrite(filePath, runtime.contentHash(markdown));
    runtime.setReconciledBase(docName, markdown);
    runtime.mutateFileIndex?.({ kind: 'update', path: filePath, docName, content: markdown });
  }

  function rewriteAssetReferencesForMappings(
    markdown: string,
    docName: string,
    renamedAssets: readonly RenamedAssetMapping[],
  ): ManagedRenameRewriteSummary {
    let nextMarkdown = markdown;
    let rewrites = 0;
    for (const { fromPath, toPath } of renamedAssets) {
      const rewritten = rewriteAssetReferencesForRename(nextMarkdown, docName, fromPath, toPath);
      nextMarkdown = rewritten.markdown;
      rewrites += rewritten.rewrites;
    }
    return { markdown: nextMarkdown, rewrites };
  }

  function applyRenameAndAssetReferenceRewrites(
    markdown: string,
    currentDocName: string,
    rewrittenDocName: string,
    renameMap: ReadonlyMap<string, string>,
    renamedAssets: readonly RenamedAssetMapping[],
  ): ManagedRenameRewriteSummary {
    const docRename = applyRenameMap(markdown, currentDocName, renameMap);
    const assetRename = rewriteAssetReferencesForMappings(
      docRename.markdown,
      rewrittenDocName,
      renamedAssets,
    );
    return {
      markdown: assetRename.markdown,
      rewrites: assetRename.markdown === markdown ? 0 : docRename.rewrites + assetRename.rewrites,
    };
  }

  function applyManagedRenameMapToLoadedDocument(
    docName: string,
    renameMap: ReadonlyMap<string, string>,
    renamedAssets: readonly RenamedAssetMapping[] = [],
  ): ManagedRenameRewriteSummary {
    const document = hocuspocus.documents.get(docName);
    if (!document) throw new Error(`Document is not loaded: ${docName}`);
    let result: ManagedRenameRewriteSummary = { markdown: '', rewrites: 0 };
    document.transact(() => {
      const ytext = document.getText('source');
      result = applyRenameAndAssetReferenceRewrites(
        ytext.toString(),
        docName,
        renameMap.get(docName) ?? docName,
        renameMap,
        renamedAssets,
      );
      if (result.rewrites > 0) {
        runtime.composeAndWriteRawBody(document, result.markdown, 'managed-rename', false);
      }
    }, runtime.managedRenameOrigin);
    return result;
  }

  function applyAssetRenamesToLoadedDocument(
    docName: string,
    renamedAssets: readonly RenamedAssetMapping[],
  ): ManagedRenameRewriteSummary {
    const document = hocuspocus.documents.get(docName);
    if (!document) throw new Error(`Document is not loaded: ${docName}`);
    let result: ManagedRenameRewriteSummary = { markdown: '', rewrites: 0 };
    document.transact(() => {
      const ytext = document.getText('source');
      result = rewriteAssetReferencesForMappings(ytext.toString(), docName, renamedAssets);
      if (result.rewrites > 0) {
        runtime.composeAndWriteRawBody(document, result.markdown, 'managed-rename', false);
      }
    }, runtime.managedRenameOrigin);
    return result;
  }

  function collectAssetReferenceRewritesForMappings(
    renamedAssets: readonly RenamedAssetMapping[],
  ): Array<{ docName: string; markdown: string; rewrites: number }> {
    if (renamedAssets.length === 0) return [];
    const rewrites: Array<{ docName: string; markdown: string; rewrites: number }> = [];
    const docNames = [...runtime.getFileIndex().keys()].sort((a, b) => a.localeCompare(b));
    for (const docName of docNames) {
      const content = readCurrentDocumentContent(docName);
      if (typeof content !== 'string') continue;
      const rewritten = rewriteAssetReferencesForMappings(content, docName, renamedAssets);
      if (rewritten.rewrites > 0) rewrites.push({ docName, ...rewritten });
    }
    return rewrites;
  }

  function assertRewriteTargetsNotConflicted(docNames: Iterable<string>): void {
    const engine = runtime.getSyncEngine?.();
    const trackedFiles = new Set(
      engine ? engine.getConflicts().map((conflict) => conflict.file) : [],
    );
    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      const file = docNameToRelativePath(docName);
      if ((document !== undefined && runtime.isDocInConflict(document)) || trackedFiles.has(file)) {
        throw new DocInConflictError({ file });
      }
    }
  }

  function applyPendingAssetReferenceRewrites(
    pendingRewrites: readonly { docName: string; markdown: string; rewrites: number }[],
    renamedAssets: readonly RenamedAssetMapping[],
  ): ManagedRenameRewrittenDoc[] {
    const rewrittenDocs: ManagedRenameRewrittenDoc[] = [];
    for (const pending of pendingRewrites) {
      const document = hocuspocus.documents.get(pending.docName);
      const rewritten = document
        ? applyAssetRenamesToLoadedDocument(pending.docName, renamedAssets)
        : pending;
      if (rewritten.rewrites === 0) continue;
      writeManagedRenameDocumentToDisk(pending.docName, rewritten.markdown);
      runtime.backlinkIndex?.updateDocumentFromMarkdown(pending.docName, rewritten.markdown);
      rewrittenDocs.push({ docName: pending.docName, rewrites: rewritten.rewrites });
    }
    return rewrittenDocs;
  }

  return {
    captureAndCloseDocuments,
    syncRenamedDocsToDisk,
    buildManagedRenameSnapshots,
    readCurrentDocumentContent,
    writeManagedRenameDocumentToDisk,
    applyManagedRenameMapToLoadedDocument,
    applyRenameAndAssetReferenceRewrites,
    collectAssetReferenceRewritesForMappings,
    assertRewriteTargetsNotConflicted,
    applyPendingAssetReferenceRewrites,
  };
}

function writeFileIfContentDiffers(filePath: string, content: string): void {
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null;
  if (current !== content) {
    // Imported lazily below to keep the public content primitive focused on content authority.
    tracedWriteFileSync(filePath, content, 'utf-8');
  }
}

import { tracedWriteFileSync } from './fs-traced.ts';
