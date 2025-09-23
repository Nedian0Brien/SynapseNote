import { getFileLegacyUrl, getFileUrl } from '@/utils/file-storage-url';
import isURL from 'validator/lib/isURL';

/**
 * Constructs the appropriate URL for file/image blocks
 *
 * Handles three cases:
 * 1. Full URLs (http/https) - returned as-is
 * 2. Relative API paths (/api/file_storage/...) - prepends base URL
 * 3. Legacy file IDs - constructs full path with workspace and view IDs
 *
 * @param dataUrl - The URL/path/ID from the block data
 * @param workspaceId - Current workspace ID
 * @param viewId - Current view ID (parent_dir for file storage)
 * @returns Complete URL for accessing the file
 */
export function constructFileUrl(
  dataUrl: string | undefined,
  workspaceId: string,
  viewId?: string
): string {
  if (!dataUrl) return '';
  console.log('dataUrl', dataUrl);

  // Case 1: Already a full URL (http/https)
  // This is the format returned by uploadFile() function
  if (isURL(dataUrl)) {
    return dataUrl;
  }

  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    // workaround for this case:http://localhost:8000/api/file_storage/06b1b077-1042-4c5f-8bd4-774c71e27a0c/v1/blob/103df21d-c365-4b2c-87f1-80d64e956603/ea47M1S0xOXE5jIti4H3QSHAAZvoF8BOpFzRHApzc4U=
    // when isURL(dataUrl) is false
    return dataUrl;
  }

  const fileId = dataUrl;
  if (viewId) {
    return getFileUrl(workspaceId, viewId, fileId);
  }

  // Fallback without viewId - this will likely fail to load
  console.warn('File URL construction: viewId not available, file may not load correctly', { fileId });
  return getFileLegacyUrl(workspaceId, fileId);
}