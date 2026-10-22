export const DOCUMENT_OPEN_BYTE_LIMIT = 512 * 1024;

export function isDocumentOverOpenByteLimit(
  bytes: number | null | undefined,
  limit = DOCUMENT_OPEN_BYTE_LIMIT,
): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > limit;
}
