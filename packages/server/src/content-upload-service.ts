import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  openSync,
  readSync,
  unlinkSync,
} from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { extname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ASSET_EXTENSIONS } from '@nedian0brien/synapsenote-core';
import busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import { sanitizeFilename } from './content-upload-policy.ts';
import { getLogger } from './logger.ts';
import { classifyUploadErrno, UploadWriteError, type UploadWriteReason } from './upload-errors.ts';
import { HashingPassThrough, mintTempUploadPath } from './upload-streaming.ts';

export interface UploadResult {
  filename: string;
  mimeType: string;
  parentDocName: string;
  placement: string;
  tempPath: string;
  sha: string;
  byteLength: number;
}

export const UPLOAD_FILE_MAX_BYTES = 100 * 1024 * 1024;
export const DATABASE_FORM_UPLOAD_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** Streams a single multipart file to a tempfile while computing its sha256. */
export function readUploadBody(
  req: IncomingMessage,
  projectDir: string,
  maxFileBytes: number = UPLOAD_FILE_MAX_BYTES,
): Promise<UploadResult> {
  return new Promise((resolveResult, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { files: 1, fields: 10, fieldSize: 2 * 1024, fileSize: maxFileBytes },
      });
    } catch (err) {
      reject(new UploadWriteError('urn:ok:error:malformed-upload', err));
      return;
    }

    let settled = false;
    let filename = 'upload';
    let mimeType = '';
    let parentDocName = '';
    let placement = '';
    let tempPath: string | undefined;
    let pipelineError: unknown;
    let fileEventFired = false;
    const fail = (reason: UploadWriteReason, cause: unknown) => {
      if (settled) return;
      settled = true;
      if (tempPath) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Orphan cleanup at boot is the fallback for an unlink race.
        }
      }
      reject(cause instanceof UploadWriteError ? cause : new UploadWriteError(reason, cause));
    };

    parser.on('field', (name, value) => {
      if (name === 'parentDocName') parentDocName = value;
      if (name === 'placement') placement = value;
    });
    parser.on('file', (_fieldName, file, info) => {
      fileEventFired = true;
      filename = info.filename || 'upload';
      mimeType = info.mimeType || '';
      let path: string;
      try {
        path = mintTempUploadPath(projectDir);
      } catch (err) {
        fail(classifyUploadErrno(err as NodeJS.ErrnoException), err);
        file.resume();
        return;
      }
      tempPath = path;
      const hasher = new HashingPassThrough();
      file.once('limit', () => {
        fail(
          'urn:ok:error:payload-too-large',
          new Error(`Upload file exceeded ${maxFileBytes} bytes`),
        );
      });
      pipeline(file, hasher, createWriteStream(path))
        .then(() => {
          if (settled) return;
          settled = true;
          resolveResult({
            filename,
            mimeType,
            parentDocName,
            placement,
            tempPath: path,
            sha: hasher.digest(),
            byteLength: hasher.byteLength(),
          });
        })
        .catch((err) => {
          pipelineError = err;
          fail(classifyUploadErrno(err as NodeJS.ErrnoException), err);
        });
    });
    parser.on('error', (err) => fail('urn:ok:error:malformed-upload', err));
    parser.on('close', () => {
      if (settled || pipelineError || fileEventFired) return;
      settled = true;
      resolveResult({
        filename: '',
        mimeType: '',
        parentDocName,
        placement,
        tempPath: '',
        sha: '',
        byteLength: 0,
      });
    });
    req.on('close', () => {
      if (!settled && !pipelineError && !req.complete) {
        fail('urn:ok:error:malformed-upload', new Error('client disconnected'));
      }
    });
    req.pipe(parser);
  });
}

function readTempFileHead(path: string, size: number): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(size);
    return buffer.subarray(0, readSync(fd, buffer, 0, size, 0));
  } finally {
    closeSync(fd);
  }
}

/** Identifies image metadata from a bounded file head, including BOM-prefixed SVG. */
export async function sniffUpload(tempPath: string): Promise<{ mime?: string; ext?: string }> {
  const head = readTempFileHead(tempPath, 4100);
  const detected = await fileTypeFromBuffer(head);
  if (detected) return { mime: detected.mime, ext: detected.ext };
  const text = head.subarray(0, 256).toString('utf-8').replace(/^﻿/, '').trimStart();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) {
    return { mime: 'image/svg+xml', ext: 'svg' };
  }
  return {};
}

async function streamingHashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Finds an equal-sized asset with the same sha256 in the destination directory. */
export async function findDuplicateAsset(
  destDir: string,
  sha: string,
  expectedSize: number,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(destDir);
  } catch {
    return null;
  }
  let scanned = 0;
  for (const entry of entries) {
    if (!ASSET_EXTENSIONS.has(extname(entry).slice(1).toLowerCase())) continue;
    const fullPath = resolve(destDir, entry);
    let entryStat: Awaited<ReturnType<typeof stat>>;
    try {
      entryStat = await stat(fullPath);
    } catch {
      continue;
    }
    if (!entryStat.isFile() || entryStat.size !== expectedSize) continue;
    if (++scanned > 1000) {
      getLogger('upload').warn(
        {
          event: 'upload-dedup-skip',
          reason: 'scan-cap-exceeded',
          destDir,
          scanned: 1000,
          expectedSize,
        },
        '[upload-dedup] candidate scan exceeded 1000 same-size siblings — degrading to no-dedup for this upload',
      );
      return null;
    }
    try {
      if ((await streamingHashFile(fullPath)) === sha) return entry;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        getLogger('upload').warn(
          { event: 'upload-dedup-skip', reason: 'read-failed', entry },
          '[upload-dedup] skipped candidate — read failed',
        );
      }
    }
  }
  return null;
}

/** Chooses the final display filename after sniffing generic clipboard uploads. */
export function chooseUploadFilename({
  filename,
  detectedExt,
  now = new Date(),
}: {
  filename: string;
  detectedExt?: string;
  now?: Date;
}): string {
  const generic =
    !filename ||
    filename === 'upload' ||
    /^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i.test(filename);
  if (!generic) return sanitizeFilename(filename);
  const timestamp = now
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
    .replace(/(\d{8})(\d{6})/, '$1-$2');
  const ext = detectedExt ?? (filename ? extname(filename).slice(1) : '');
  return ext === '' ? `pasted-${timestamp}` : `pasted-${timestamp}.${ext}`;
}
