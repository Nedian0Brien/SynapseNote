/**
 * Persist an exported PDF back to its project asset path.
 *
 * The renderer supplies a project-relative path and PDF bytes produced by
 * EmbedPDF's export plugin. Main resolves the existing file through realpath,
 * enforces project containment, validates the payload, then replaces the file
 * through a same-directory temporary file so readers never observe a partial
 * PDF.
 */

import { randomUUID } from 'node:crypto';
import { open, realpath, rename, stat, unlink } from 'node:fs/promises';
import * as pathPosix from 'node:path/posix';
import * as pathWin32 from 'node:path/win32';
import { isPathWithinProject } from './ipc-handlers.ts';

const MAX_PDF_SAVE_BYTES = 512 * 1024 * 1024;

export type PdfAssetSaveResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'invalid-path'
        | 'not-found'
        | 'not-pdf'
        | 'invalid-pdf'
        | 'too-large'
        | 'permission-denied'
        | 'write-error';
    };

interface SavePdfAssetDeps {
  readonly projectPath: string;
  readonly platform: NodeJS.Platform;
}

function failureReason(error: unknown): PdfAssetSaveResult {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return { ok: false, reason: 'not-found' };
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return { ok: false, reason: 'permission-denied' };
  }
  return { ok: false, reason: 'write-error' };
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const headerWindow = bytes.subarray(0, Math.min(bytes.byteLength, 1024));
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  outer: for (let offset = 0; offset <= headerWindow.length - signature.length; offset += 1) {
    for (let index = 0; index < signature.length; index += 1) {
      if (headerWindow[offset + index] !== signature[index]) continue outer;
    }
    return true;
  }
  return false;
}

export async function savePdfAssetSafely(
  deps: SavePdfAssetDeps,
  relPath: string,
  bytes: Uint8Array,
): Promise<PdfAssetSaveResult> {
  const path = deps.platform === 'win32' ? pathWin32 : pathPosix;
  if (!relPath || relPath.includes('\0') || path.isAbsolute(relPath)) {
    return { ok: false, reason: 'invalid-path' };
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || !hasPdfHeader(bytes)) {
    return { ok: false, reason: 'invalid-pdf' };
  }
  if (bytes.byteLength > MAX_PDF_SAVE_BYTES) return { ok: false, reason: 'too-large' };

  let canonicalProject: string;
  let canonicalTarget: string;
  try {
    canonicalProject = await realpath(deps.projectPath);
    canonicalTarget = await realpath(path.resolve(canonicalProject, relPath));
  } catch (error) {
    return failureReason(error);
  }

  if (!isPathWithinProject(canonicalTarget, canonicalProject, deps.platform)) {
    return { ok: false, reason: 'invalid-path' };
  }
  if (path.extname(canonicalTarget).toLowerCase() !== '.pdf') {
    return { ok: false, reason: 'not-pdf' };
  }

  let targetStat: Awaited<ReturnType<typeof stat>>;
  try {
    targetStat = await stat(canonicalTarget);
  } catch (error) {
    return failureReason(error);
  }
  if (!targetStat.isFile()) return { ok: false, reason: 'not-found' };

  const tmpPath = `${canonicalTarget}.synapsenote-save-${randomUUID()}.tmp`;
  let tmpCreated = false;
  try {
    const handle = await open(tmpPath, 'wx', targetStat.mode);
    tmpCreated = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, canonicalTarget);
    tmpCreated = false;
    return { ok: true };
  } catch (error) {
    return failureReason(error);
  } finally {
    if (tmpCreated) {
      try {
        await unlink(tmpPath);
      } catch {
        // Best-effort cleanup. The original file remains untouched.
      }
    }
  }
}
