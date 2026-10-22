import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  type DatabaseMarkdownImportDraft,
  type DatabaseMarkdownImportFile,
  inferDatabaseFromMarkdown,
} from '@nedian0brien/synapsenote-core/server';

export interface PreviewMarkdownFolderDatabaseInput {
  folder: string;
  includeSubfolders?: boolean;
  maxEntries?: number;
}

export interface MarkdownFolderDatabasePreview extends DatabaseMarkdownImportDraft {
  folder: string;
}

function contentPath(contentDir: string, path: string): string {
  const absolute = resolve(contentDir, path);
  const rel = relative(contentDir, absolute);
  if (!path || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Markdown import folder escapes the content directory');
  }
  return absolute;
}

/** Safely scans a content folder and returns a non-mutating inference draft. */
export async function previewMarkdownFolderDatabase(
  contentDir: string,
  input: PreviewMarkdownFolderDatabaseInput,
): Promise<MarkdownFolderDatabasePreview> {
  const maxEntries = input.maxEntries ?? 100_000;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100_000) {
    throw new Error('Markdown import maxEntries must be from 1 to 100000');
  }
  const root = contentPath(resolve(contentDir), input.folder);
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Markdown import folder must be a safe regular directory');
  }
  const [contentReal, rootReal] = await Promise.all([realpath(contentDir), realpath(root)]);
  const escaped = relative(contentReal, rootReal);
  if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
    throw new Error('Markdown import folder resolves outside the content directory');
  }
  const files: DatabaseMarkdownImportFile[] = [];
  let visited = 0;
  const walk = async (directory: string): Promise<void> => {
    const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      visited += 1;
      if (visited > maxEntries) throw new Error('Markdown import entry limit exceeded');
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Markdown import refuses symbolic links');
      if (entry.isDirectory()) {
        if (input.includeSubfolders !== false) await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !/\.(?:md|mdx)$/i.test(entry.name)) continue;
      const path = relative(contentDir, absolute).split(sep).join('/');
      files.push({ path, markdown: await readFile(absolute, 'utf8') });
    }
  };
  await walk(root);
  return { ...inferDatabaseFromMarkdown(files), folder: input.folder };
}
