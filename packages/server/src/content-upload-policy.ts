import { dirname, resolve } from 'node:path';

const SAFE_FILENAME_CHARS = /[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}.\-_ ]/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: sanitization deliberately strips controls.
const STRIP_ON_SIGHT = /[/\\\x00-\x1f\x7f]/g;

/** Makes a user-supplied filename portable without discarding Unicode names. */
export function sanitizeFilename(name: string): string {
  let stripped = name.replace(STRIP_ON_SIGHT, '');
  stripped = stripped.replace(SAFE_FILENAME_CHARS, '_');
  stripped = stripped.replace(/_+/g, '_').replace(/\.{2,}/g, '.');
  stripped = stripped.replace(/^[._]+/, '').replace(/\.+$/, '');
  if (stripped === '') return 'upload';

  const maxBytes = 255;
  const encoder = new TextEncoder();
  if (encoder.encode(stripped).length > maxBytes) {
    const dotIndex = stripped.lastIndexOf('.');
    const ext = dotIndex >= 0 ? stripped.slice(dotIndex) : '';
    let stem = dotIndex >= 0 ? stripped.slice(0, dotIndex) : stripped;
    while (encoder.encode(stem + ext).length > maxBytes && stem.length > 0) {
      stem = stem.slice(0, -1);
    }
    stripped = (stem || 'upload') + ext;
    if (encoder.encode(stripped).length > maxBytes) stripped = 'upload';
  }
  return stripped;
}

/** Resolves the documented content.attachmentFolderPath matrix. */
export function resolveUploadDestDir(
  parentDocName: string,
  attachmentFolderPath: string,
  resolvedContentDir: string,
): string {
  const trimmed = attachmentFolderPath.trim();
  if (trimmed === '' || trimmed === './') {
    return resolve(resolvedContentDir, dirname(parentDocName));
  }
  if (trimmed === '/') return resolvedContentDir;
  if (trimmed.startsWith('./')) {
    return resolve(resolvedContentDir, dirname(parentDocName), trimmed.slice(2));
  }
  return resolve(resolvedContentDir, trimmed);
}
