// replaces morrow's src/app/platform/attachments.ts, files need a vault folder, which the app does not open yet
import type { FileId, FileMeta } from '../../vendor/morrow/src/core/model';
import { toast } from '../../vendor/morrow/src/app/ui';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const ATTACHMENTS_UNAVAILABLE = 'Images and files can be added once a vault folder is open.';

export function fileUrl(_id: FileId): Promise<string | null> {
  return Promise.resolve(null);
}

export async function storeFiles(_files: File[]): Promise<FileMeta[]> {
  toast(ATTACHMENTS_UNAVAILABLE);
  return [];
}

export async function downloadFile(_id: FileId): Promise<void> {
  toast(ATTACHMENTS_UNAVAILABLE);
}

// same output as formatBytes in morrow's src/app/platform/attachments.ts
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
