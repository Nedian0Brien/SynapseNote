import { sanitizeFolderName } from '../utils/sanitize-folder-name.ts';

const DEFAULT_DATABASE_TITLE = 'Untitled database';
const DEFAULT_RECORD_TITLE = 'Untitled';
const MAX_PATH_SEGMENT_BYTES = 180;

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let truncated = value;
  while (truncated && encoder.encode(truncated).length > maxBytes) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.trim().replace(/[.\s]+$/g, '');
}

/**
 * Convert a visible database/page title into one portable path segment while
 * preserving human-readable Unicode and spaces. Stable IDs deliberately do
 * not participate in this name; they remain canonical in the manifest and
 * record frontmatter.
 */
export function databaseTitlePathSegment(title: string, fallback: string): string {
  const sanitized = sanitizeFolderName(title.normalize('NFC')) || fallback;
  return truncateUtf8(sanitized, MAX_PATH_SEGMENT_BYTES) || fallback;
}

export function databaseFolderNameFromTitle(title: string): string {
  return databaseTitlePathSegment(title, DEFAULT_DATABASE_TITLE);
}

export function databaseRecordNameFromTitle(title: unknown): string {
  return databaseTitlePathSegment(typeof title === 'string' ? title : '', DEFAULT_RECORD_TITLE);
}

export function databaseManagedSourceFolder(parentFolder: string, title: string): string {
  const name = databaseFolderNameFromTitle(title);
  const normalizedParent = parentFolder
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/');
  return normalizedParent ? `${normalizedParent}/${name}` : name;
}

export function databasePathNameWithCollisionSuffix(name: string, index: number): string {
  if (index <= 1) return name;
  const suffix = ` (${index})`;
  const stem = truncateUtf8(name, MAX_PATH_SEGMENT_BYTES - new TextEncoder().encode(suffix).length);
  return `${stem}${suffix}`;
}
