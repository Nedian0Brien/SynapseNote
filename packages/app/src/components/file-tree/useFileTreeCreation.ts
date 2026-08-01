import { t } from '@lingui/core/macro';
import { CreateFolderSuccessSchema, CreatePageSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  createPagePathFromTreeDestination,
  createTreePlaceholder,
  fileEntryToTreePath,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocName,
} from '@/components/file-tree-adapter';
import { applyDeleteToDocuments } from '@/components/file-tree-operations';
import { type FileEntry, isDocumentEntry, isFolderEntry } from '@/components/file-tree-utils';
import { folderTabId } from '@/editor/editor-tabs';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';

export type PendingCreate = {
  kind: 'file' | 'folder';
  renamePath: string;
  createdPath: string;
  previousHash: string;
  disposeCommitListener: () => void;
};

export type PendingCreateCleanupOptions = {
  updateUi?: boolean;
  restoreLocation?: boolean;
};

type Input = {
  model: PierreFileTreeModel;
  treePaths: readonly string[];
  folderTreePathsRef: MutableRefObject<readonly string[]>;
  busyPathRef: MutableRefObject<string | null>;
  recentLocalAddsRef: MutableRefObject<Map<string, number>>;
  setBusyPath: Dispatch<SetStateAction<string | null>>;
  setDocuments: Dispatch<SetStateAction<FileEntry[]>>;
  resetModelToDocuments: () => void;
  markNextDocumentsAsApplied: (entries: readonly FileEntry[]) => void;
  addPage: (docName: string) => void;
  navigateToFile: (docName: string) => void;
  navigateToFolder: (folderPath: string) => void;
  closeDocument: (docName: string) => void;
  closeTabs: (tabIds: string[], options: { force: boolean }) => void;
};

export function createOptimisticFileTreeEntry(
  kind: 'file' | 'folder',
  createdPath: string,
  createPath: string,
  modified: string,
): FileEntry {
  if (kind === 'folder') {
    return { kind: 'folder', path: createdPath, modified, size: 0 };
  }
  return {
    kind: 'document',
    docName: createdPath,
    docExt: createPath.toLowerCase().endsWith('.mdx') ? '.mdx' : '.md',
    modified,
    size: 0,
  };
}

/** Owns inline create, its optimistic row, and rollback when the rename is cancelled. */
export function useFileTreeCreation({
  model,
  treePaths,
  folderTreePathsRef,
  busyPathRef,
  recentLocalAddsRef,
  setBusyPath,
  setDocuments,
  resetModelToDocuments,
  markNextDocumentsAsApplied,
  addPage,
  navigateToFile,
  navigateToFolder,
  closeDocument,
  closeTabs,
}: Input) {
  const [newItemRequest, setNewItemRequest] = useState<{ parentDir: string } | null>(null);
  const pendingCreateRef = useRef<PendingCreate | null>(null);

  const clearPendingCreate = (pending?: PendingCreate | null) => {
    const current = pending ?? pendingCreateRef.current;
    if (!current || pendingCreateRef.current !== current) return;
    current.disposeCommitListener();
    pendingCreateRef.current = null;
  };

  const cleanupPendingCreate = async (
    pending: PendingCreate,
    options: PendingCreateCleanupOptions = {},
  ) => {
    const updateUi = options.updateUi ?? true;
    const restoreLocation = options.restoreLocation ?? updateUi;
    clearPendingCreate(pending);
    if (updateUi) setBusyPath(pending.renamePath);
    try {
      const response = await fetch('/api/delete-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: pending.kind, path: pending.createdPath }),
      });
      if (!response.ok && response.status !== 404) {
        const parsed = await parseServerResponse(
          response,
          t`Failed to clean up pending ${pending.kind}`,
        );
        if (parsed.ok) return;
        const message = t`${parsed.title} - ${pending.kind} "${pending.createdPath}" still exists on disk`;
        if (updateUi) toast.error(message);
        else console.warn(`[FileTree] cleanup pending create failed: ${message}`);
        if (updateUi) {
          setBusyPath(null);
          resetModelToDocuments();
        }
        return;
      }
    } catch (error) {
      console.warn('[FileTree] cleanup pending create failed:', error);
      if (updateUi) {
        toast.error(
          t`Network error - ${pending.kind} "${pending.createdPath}" still exists on disk`,
        );
        setBusyPath(null);
        resetModelToDocuments();
      }
      return;
    }
    if (updateUi) {
      if (pending.kind === 'file') closeDocument(pending.createdPath);
      else closeTabs([folderTabId(pending.createdPath)], { force: true });
      setDocuments((current) => {
        const next = applyDeleteToDocuments(
          current,
          pending.kind === 'file' ? [pending.createdPath] : [],
          pending.kind === 'folder' ? pending.createdPath : undefined,
        );
        markNextDocumentsAsApplied(next);
        return next;
      });
    }
    emitDocumentsChanged(['files', 'backlinks', 'graph']);
    if (restoreLocation) window.location.hash = pending.previousHash;
    if (updateUi) setBusyPath(null);
  };

  const cleanupRef = useRef(cleanupPendingCreate);
  useEffect(() => {
    cleanupRef.current = cleanupPendingCreate;
  });
  useEffect(() => {
    return () => {
      const pending = pendingCreateRef.current;
      if (!pending) return;
      void cleanupRef
        .current(pending, { restoreLocation: false, updateUi: false })
        .catch((error) => {
          console.warn('[FileTree] unmount cleanup failed:', error);
        });
    };
  }, []);

  const startCreatingFromTemplate = (parentDir: string) => setNewItemRequest({ parentDir });

  const startCreating = async (
    kind: 'file' | 'folder',
    parentDir: string,
    options?: { template?: string },
  ) => {
    if (busyPathRef.current) return;
    clearPendingCreate();
    try {
      const placeholder = createTreePlaceholder(kind, parentDir, [
        ...treePaths,
        ...folderTreePathsRef.current,
      ]);
      setBusyPath(placeholder.renamePath);
      busyPathRef.current = placeholder.renamePath;
      const previousHash = window.location.hash;
      const modified = new Date().toISOString();
      let createdPath: string;
      let optimisticEntry: FileEntry;
      if (kind === 'file') {
        const createPath = createPagePathFromTreeDestination('file', placeholder.addPath);
        const body: { path: string; template?: string } = { path: createPath };
        if (options?.template) body.template = options.template;
        const response = await fetch('/api/create-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const parsed = await parseServerResponse(response, t`Failed to create file`);
        if (!parsed.ok) {
          toast.error(parsed.title);
          setBusyPath(null);
          busyPathRef.current = null;
          return;
        }
        createdPath = parseSuccessOrWarn(CreatePageSuccessSchema, parsed.body, 'create-page', {
          docName: treeFilePathToDocName(createPath),
        }).docName;
        optimisticEntry = createOptimisticFileTreeEntry(kind, createdPath, createPath, modified);
        addPage(createdPath);
      } else {
        const folderPath = treeDirectoryPathToFolderPath(placeholder.addPath);
        const response = await fetch('/api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folderPath }),
        });
        const parsed = await parseServerResponse(response, t`Failed to create folder`);
        if (!parsed.ok) {
          toast.error(parsed.title);
          setBusyPath(null);
          busyPathRef.current = null;
          return;
        }
        createdPath = parseSuccessOrWarn(CreateFolderSuccessSchema, parsed.body, 'create-folder', {
          path: folderPath,
        }).path;
        optimisticEntry = createOptimisticFileTreeEntry(
          kind,
          createdPath,
          placeholder.addPath,
          modified,
        );
      }
      setDocuments((current) => {
        const exists =
          optimisticEntry.kind === 'document'
            ? current.some(
                (entry) => isDocumentEntry(entry) && entry.docName === optimisticEntry.docName,
              )
            : current.some((entry) => isFolderEntry(entry) && entry.path === optimisticEntry.path);
        if (exists) return current;
        const next = [...current, optimisticEntry];
        markNextDocumentsAsApplied(next);
        recentLocalAddsRef.current.set(fileEntryToTreePath(optimisticEntry), Date.now());
        return next;
      });
      emitDocumentsChanged(kind === 'file' ? ['files', 'backlinks', 'graph'] : ['files']);
      if (kind === 'file') navigateToFile(createdPath);
      else navigateToFolder(createdPath);

      let disposed = false;
      const handleCommit = (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        const pending = pendingCreateRef.current;
        if (pending?.renamePath === placeholder.renamePath)
          queueMicrotask(() => clearPendingCreate(pending));
      };
      const disposeCommitListener = () => {
        if (disposed) return;
        disposed = true;
        document.removeEventListener('keydown', handleCommit, true);
      };
      document.addEventListener('keydown', handleCommit, true);
      pendingCreateRef.current = {
        kind,
        renamePath: placeholder.renamePath,
        createdPath,
        previousHash,
        disposeCommitListener,
      };
      setBusyPath(null);
      busyPathRef.current = null;
      model.add(placeholder.addPath);
      model.startRenaming(placeholder.renamePath, { removeIfCanceled: true });
    } catch (error) {
      console.warn('[FileTree] create placeholder failed:', error);
      toast.error(t`Could not start creating a new item`);
      const pending = pendingCreateRef.current;
      if (pending) await cleanupPendingCreate(pending);
      else clearPendingCreate();
      setBusyPath(null);
      busyPathRef.current = null;
      resetModelToDocuments();
    }
  };

  return {
    newItemRequest,
    setNewItemRequest,
    pendingCreateRef,
    clearPendingCreate,
    cleanupPendingCreate,
    cleanupPendingCreateRef: cleanupRef,
    startCreating,
    startCreatingFromTemplate,
  };
}
