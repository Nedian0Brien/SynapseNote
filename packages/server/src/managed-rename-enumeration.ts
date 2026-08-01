import { type Dirent, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { LINKABLE_ASSET_EXTENSIONS } from '@nedian0brien/synapsenote-core';
import { isReservedProjectStatePath, resolveContentEntryPath } from './content-path-policy.ts';
import {
  isSupportedAssetFile,
  isSupportedDocFile,
  registerDocExtension,
  SUPPORTED_DOC_EXTENSIONS,
  stripDocExtension,
} from './doc-extensions.ts';
import type { ManagedRenameRuntime, RenamedAssetMapping } from './managed-rename-content.ts';

/** Disk-authoritative folder enumeration for managed rename. */
export function createManagedRenameEnumeration(runtime: ManagedRenameRuntime) {
  function docNameForFileOperationPath(relPath: string): string {
    const extensionless = stripDocExtension(relPath);
    if (!isSupportedDocFile(relPath)) return extensionless;
    const sibling = SUPPORTED_DOC_EXTENSIONS.some((extension) => {
      if (extension === extname(relPath).toLowerCase()) return false;
      return statExists(resolve(runtime.contentDir, `${extensionless}${extension}`));
    });
    return sibling ? relPath : extensionless;
  }

  function listManagedDocNamesUnderFolderFromDisk(sourcePathRoot: string): string[] {
    const docNames: string[] = [];
    try {
      if (!statSync(sourcePathRoot).isDirectory()) return docNames;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return docNames;
      throw error;
    }
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = resolve(dir, entry.name);
        const relPath = relative(runtime.contentDir, fullPath).split(sep).join('/');
        if (isReservedProjectStatePath(relPath)) continue;
        if (entry.isDirectory()) {
          if (!runtime.contentFilter?.isDirExcluded(relPath)) walk(fullPath);
          continue;
        }
        if (
          !entry.isFile() ||
          !isSupportedDocFile(relPath) ||
          runtime.contentFilter?.isExcluded(relPath)
        ) {
          continue;
        }
        registerDocExtension(stripDocExtension(relPath), extname(relPath));
        docNames.push(docNameForFileOperationPath(relPath));
      }
    }
    walk(sourcePathRoot);
    return docNames.sort((a, b) => a.localeCompare(b));
  }

  function listRenamedAssetsForFolderMove(
    sourcePathRoot: string,
    fromPath: string,
    toPath: string,
  ): RenamedAssetMapping[] {
    const renamedAssets: RenamedAssetMapping[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = resolve(dir, entry.name);
        const relPath = relative(runtime.contentDir, fullPath).split(sep).join('/');
        if (isReservedProjectStatePath(relPath)) continue;
        if (entry.isDirectory()) {
          if (!runtime.contentFilter?.isDirExcluded(relPath)) walk(fullPath);
          continue;
        }
        if (
          !entry.isFile() ||
          isSupportedDocFile(relPath) ||
          runtime.contentFilter?.isExcluded(relPath)
        ) {
          continue;
        }
        if (relPath === fromPath) renamedAssets.push({ fromPath: relPath, toPath });
        else if (relPath.startsWith(`${fromPath}/`)) {
          renamedAssets.push({
            fromPath: relPath,
            toPath: `${toPath}${relPath.slice(fromPath.length)}`,
          });
        }
      }
    }
    walk(sourcePathRoot);
    return renamedAssets.sort((a, b) => a.fromPath.localeCompare(b.fromPath));
  }

  function resolveExtensionlessAssetPath(assetPath: string): { path: string; ambiguous: boolean } {
    if (extname(assetPath)) return { path: assetPath, ambiguous: false };
    const slash = assetPath.lastIndexOf('/');
    const parent = slash === -1 ? '' : assetPath.slice(0, slash);
    const stem = slash === -1 ? assetPath : assetPath.slice(slash + 1);
    const parentPath = parent
      ? resolveContentEntryPath(runtime.contentDir, 'folder', parent)
      : runtime.contentDir;
    let entries: Dirent[];
    try {
      entries = readdirSync(parentPath, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return { path: assetPath, ambiguous: false };
      throw error;
    }
    const candidates = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${stem}.`))
      .map((entry) => (parent ? `${parent}/${entry.name}` : entry.name))
      .filter((candidate) => isSupportedAssetFile(candidate, LINKABLE_ASSET_EXTENSIONS));
    return candidates.length === 1
      ? { path: candidates[0], ambiguous: false }
      : { path: assetPath, ambiguous: candidates.length > 1 };
  }

  return {
    docNameForFileOperationPath,
    listManagedDocNamesUnderFolderFromDisk,
    listRenamedAssetsForFolderMove,
    resolveExtensionlessAssetPath,
  };
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
