import { DuplicatePathSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { applyDuplicateToDocuments, type FileTreeTarget } from '@/components/file-tree-operations';
import type { FileEntry } from '@/components/file-tree-utils';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';

type DuplicateInput = {
  busyPathRef: MutableRefObject<string | null>;
  setBusyPath: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setDocuments: Dispatch<SetStateAction<FileEntry[]>>;
  resetModelToDocuments: () => void;
  markNextDocumentsAsApplied: (entries: readonly FileEntry[]) => void;
  addPage: (docName: string) => void;
  navigateToFile: (path: string) => void;
  navigateToFolder: (path: string) => void;
  failedTitle: string;
  resyncMessage: string;
  duplicateLabel: string;
  folderDuplicateLabel: string;
  networkMessage: string;
};

/** Owns the duplicate command's busy guard, server contract, optimistic state, and navigation. */
export function createDuplicateFileTreeMutation({
  busyPathRef,
  setBusyPath,
  setError,
  setDocuments,
  resetModelToDocuments,
  markNextDocumentsAsApplied,
  addPage,
  navigateToFile,
  navigateToFolder,
  failedTitle,
  resyncMessage,
  duplicateLabel,
  folderDuplicateLabel,
  networkMessage,
}: DuplicateInput) {
  return async (target: FileTreeTarget) => {
    if (target.kind === 'asset' || busyPathRef.current !== null) return;
    const clearBusy = () => {
      setBusyPath(null);
      busyPathRef.current = null;
    };
    busyPathRef.current = target.path;
    setBusyPath(target.path);
    setError(null);
    try {
      const response = await fetch('/api/duplicate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: target.kind, path: target.path }),
      });
      const parsed = await parseServerResponse(response, failedTitle);
      if (!parsed.ok) {
        toast.error(parsed.title);
        resetModelToDocuments();
        clearBusy();
        return;
      }
      const success = parseSuccessOrWarn(
        DuplicatePathSuccessSchema,
        parsed.body,
        'duplicate-path',
        null,
      );
      if (success === null) {
        toast.error(resyncMessage);
        setError(resyncMessage);
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        resetModelToDocuments();
        clearBusy();
        return;
      }
      for (const docName of success.duplicatedDocNames) addPage(docName);
      setDocuments((current) => {
        const next = applyDuplicateToDocuments(current, target, success);
        resetModelToDocuments();
        markNextDocumentsAsApplied(next);
        return next;
      });
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      if (success.path !== target.path) {
        if (success.kind === 'folder') navigateToFolder(success.path);
        else navigateToFile(success.path);
      }
      toast.success(success.kind === 'folder' ? folderDuplicateLabel : duplicateLabel, {
        description: success.path,
      });
      clearBusy();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn('[FileTree] duplicate failed:', error);
      toast.error(networkMessage, { description: detail });
      resetModelToDocuments();
      clearBusy();
    }
  };
}
