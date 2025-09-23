import { getConfigValue } from '@/utils/runtime-config';

/**
 * Constructs file storage URLs for the AppFlowy API
 * Centralizes URL construction logic to reduce code duplication
 */

/**
 * Gets the base URL for file storage API
 */
function getFileStorageBaseUrl(): string {
  return getConfigValue('APPFLOWY_BASE_URL', '') + '/api/file_storage';
}

/**
 * Constructs URL for file upload endpoint
 * @param workspaceId - The workspace ID
 * @param viewId - The view ID (used as parent_dir)
 * @returns Complete upload URL
 */
export function getFileUploadUrl(workspaceId: string, viewId: string): string {
  return `${getFileStorageBaseUrl()}/${workspaceId}/v1/blob/${viewId}`;
}

/**
 * Constructs URL for file retrieval
 * @param workspaceId - The workspace ID
 * @param viewId - The view ID (parent directory)
 * @param fileId - The file ID
 * @returns Complete file URL
 */
export function getFileUrl(workspaceId: string, viewId: string, fileId: string): string {
  return `${getFileStorageBaseUrl()}/${workspaceId}/v1/blob/${viewId}/${fileId}`;
}

/**
 * Constructs URL for file retrieval (legacy fallback without viewId)
 * @param workspaceId - The workspace ID
 * @param fileId - The file ID
 * @returns Complete file URL (may not work properly without viewId)
 */
export function getFileLegacyUrl(workspaceId: string, fileId: string): string {
  return `${getFileStorageBaseUrl()}/${workspaceId}/v1/blob/${fileId}`;
}

/**
 * General purpose file storage URL constructor
 * @param workspaceId - The workspace ID
 * @param viewId - Optional view ID
 * @param fileId - Optional file ID
 * @returns Complete file storage URL
 */
export function constructFileStorageUrl(
  workspaceId: string,
  viewId?: string,
  fileId?: string
): string {
  const base = `${getFileStorageBaseUrl()}/${workspaceId}/v1/blob`;

  if (viewId && fileId) {
    return `${base}/${viewId}/${fileId}`;
  }

  if (viewId) {
    return `${base}/${viewId}`;
  }

  if (fileId) {
    return `${base}/${fileId}`;
  }

  return base;
}