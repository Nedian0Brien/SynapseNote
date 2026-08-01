import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { assertNoSymlinkEscape } from './content-path-safety.ts';
import {
  docNameToRelativePath,
  isSupportedDocFile,
  registerDocExtension,
  SUPPORTED_DOC_EXTENSIONS,
  stripDocExtension,
} from './doc-extensions.ts';

export type ContentEntryKind = 'file' | 'folder';

/** Request-path admission shared by file, folder, rename, and delete routes. */
export function isValidRelativeContentPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\x00')) return false;
  return path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

/** `.ok` and `.git` are server-owned state at every nesting level. */
export function isReservedProjectStatePath(path: string): boolean {
  return path.split('/').some((segment) => {
    const normalized = segment.toLowerCase();
    return normalized === '.ok' || normalized === '.git';
  });
}

/** Resolve an admitted content entry without crossing a symlinked directory boundary. */
export function resolveContentEntryPath(
  contentDir: string,
  kind: ContentEntryKind,
  path: string,
): string {
  if (!isValidRelativeContentPath(path)) throw new Error('path must be a relative content path');
  const resolvedContentDir = resolve(contentDir);
  const relativePath = kind === 'file' ? docNameToRelativePath(path) : path;
  const fullPath = resolve(resolvedContentDir, relativePath);
  if (fullPath !== resolvedContentDir && !fullPath.startsWith(`${resolvedContentDir}${sep}`)) {
    throw new Error('path must not escape content directory');
  }
  assertNoSymlinkEscape(fullPath, resolvedContentDir);
  return fullPath;
}

/**
 * Seed the extension registry from disk before a watcher has observed a
 * source. This preserves explicit .md/.mdx handling at the route boundary.
 */
export function probeAndRegisterSourceFileExtension(contentDir: string, fromPath: string): void {
  if (!isValidRelativeContentPath(fromPath)) return;
  const resolvedContentDir = resolve(contentDir);
  if (isSupportedDocFile(fromPath)) {
    const extensionless = stripDocExtension(fromPath);
    for (const ext of SUPPORTED_DOC_EXTENSIONS) {
      const candidate = resolve(resolvedContentDir, `${extensionless}${ext}`);
      if (candidate !== resolvedContentDir && !candidate.startsWith(`${resolvedContentDir}${sep}`))
        continue;
      if (existsSync(candidate)) registerDocExtension(extensionless, ext);
    }
    const explicitCandidate = resolve(resolvedContentDir, fromPath);
    if (
      explicitCandidate !== resolvedContentDir &&
      explicitCandidate.startsWith(`${resolvedContentDir}${sep}`) &&
      existsSync(explicitCandidate)
    ) {
      registerDocExtension(extensionless, extname(fromPath));
    }
    return;
  }
  for (const ext of SUPPORTED_DOC_EXTENSIONS) {
    const candidate = resolve(resolvedContentDir, `${fromPath}${ext}`);
    if (candidate !== resolvedContentDir && !candidate.startsWith(`${resolvedContentDir}${sep}`))
      continue;
    if (existsSync(candidate)) {
      registerDocExtension(fromPath, ext);
      return;
    }
  }
}
