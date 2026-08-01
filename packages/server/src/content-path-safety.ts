import { realpathSync } from 'node:fs';
import { dirname, sep } from 'node:path';
import { isWithinContentDir } from './persistence.ts';

/** Shared identity for content-root symlink escapes across uploads and renames. */
export class SymlinkEscapeError extends Error {
  constructor(message: string) {
    super(`symlink-escape: ${message}`);
    this.name = 'SymlinkEscapeError';
  }
}

/** Rejects a path that resolves outside its content root through a symlink. */
export function assertNoSymlinkEscape(fullPath: string, resolvedContentDir: string): void {
  let contentRoot: string;
  try {
    contentRoot = realpathSync(resolvedContentDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SymlinkEscapeError('content directory does not exist');
    }
    throw err;
  }

  let current = fullPath;
  for (;;) {
    try {
      const canonical = realpathSync(current);
      if (!isWithinContentDir(canonical, contentRoot)) {
        throw new SymlinkEscapeError('path resolves outside content directory');
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') throw new SymlinkEscapeError('symlink cycle in path');
      if (code !== 'ENOENT') throw err;
      const parent = dirname(current);
      if (parent === current) throw err;
      if (parent !== resolvedContentDir && !parent.startsWith(`${resolvedContentDir}${sep}`)) {
        throw err;
      }
      current = parent;
    }
  }
}
