import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { UploadAssetSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  appendSidebarUploadFields,
  fileEntryFromUploadedPath,
  fileEntryToTreePath,
  uploadedPathForSidebarDrop,
} from '@/components/file-tree-adapter';
import { type FileEntry, isDocumentEntry } from '@/components/file-tree-utils';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';

type Input = {
  busyPathRef: MutableRefObject<string | null>;
  recentLocalAddsRef: MutableRefObject<Map<string, number>>;
  refreshDocsScheduleRef: MutableRefObject<(() => void) | null>;
  setBusyPath: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setDocuments: Dispatch<SetStateAction<FileEntry[]>>;
  addPage: (docName: string) => void;
  resetModelToDocuments: (documents: readonly FileEntry[]) => void;
  markNextDocumentsAsApplied: (documents: readonly FileEntry[]) => void;
};

/** Uploads external drops, applies optimistic entries, and schedules listing reconciliation. */
export function useFileTreeUploads({
  busyPathRef,
  recentLocalAddsRef,
  refreshDocsScheduleRef,
  setBusyPath,
  setError,
  setDocuments,
  addPage,
  resetModelToDocuments,
  markNextDocumentsAsApplied,
}: Input) {
  const { t } = useLingui();
  return async (files: readonly File[], parentDir: string, uploadBusyPath: string) => {
    if (files.length === 0 || busyPathRef.current !== null) return;
    const clearBusyState = () => {
      busyPathRef.current = null;
      setBusyPath(null);
    };
    busyPathRef.current = uploadBusyPath;
    setBusyPath(uploadBusyPath);
    setError(null);
    const uploadedEntries: FileEntry[] = [];
    let uploadedCount = 0;
    let failedCount = 0;
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      appendSidebarUploadFields(formData, parentDir, file.name || 'upload');
      try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        const parsed = await parseServerResponse(response, t`Failed to upload file`);
        if (!parsed.ok) {
          failedCount += 1;
          toast.error(parsed.title, { description: file.name });
          continue;
        }
        const success = parseSuccessOrWarn(
          UploadAssetSuccessSchema,
          parsed.body,
          'upload:drop',
          null,
        );
        if (success === null) {
          failedCount += 1;
          toast.error(t`Failed to upload file`, { description: file.name });
          continue;
        }
        const uploadedPath = uploadedPathForSidebarDrop(parentDir, success);
        if (success.deduped === true) {
          failedCount += 1;
          toast.error(t`File already exists`, { description: uploadedPath });
          continue;
        }
        uploadedCount += 1;
        const entry = fileEntryFromUploadedPath(uploadedPath, file);
        if (entry) uploadedEntries.push(entry);
      } catch (error) {
        failedCount += 1;
        console.warn('[FileTree] external file upload failed:', error);
        toast.error(
          error instanceof TypeError
            ? t`Network error — please try again`
            : t`Failed to upload file`,
          { description: file.name },
        );
      }
    }
    try {
      if (uploadedEntries.length > 0) {
        for (const entry of uploadedEntries) if (isDocumentEntry(entry)) addPage(entry.docName);
        setDocuments((current) => {
          const existing = new Set(current.map(fileEntryToTreePath));
          let changed = false;
          const next = [...current];
          for (const entry of uploadedEntries) {
            const treePath = fileEntryToTreePath(entry);
            recentLocalAddsRef.current.set(treePath, Date.now());
            if (existing.has(treePath)) continue;
            existing.add(treePath);
            next.push(entry);
            changed = true;
          }
          if (!changed) return current;
          resetModelToDocuments(next);
          markNextDocumentsAsApplied(next);
          return next;
        });
      }
      if (uploadedCount > 0) {
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
        refreshDocsScheduleRef.current?.();
        toast.success(
          plural(uploadedCount, {
            one: 'Uploaded one file',
            other: `Uploaded ${uploadedCount} files`,
          }),
          { description: parentDir || t`Project root` },
        );
      }
      if (failedCount > 0) {
        setError(
          uploadedCount > 0
            ? plural(failedCount, {
                one: '1 file failed to upload',
                other: `${failedCount} files failed to upload`,
              })
            : t`Failed to upload file`,
        );
      }
      clearBusyState();
    } catch (error) {
      const message = t`Upload may have succeeded but the sidebar is out of date — refresh to resync`;
      console.warn('[FileTree] upload post-upload reconciliation failed:', error);
      toast.error(message);
      setError(message);
      clearBusyState();
    }
  };
}
