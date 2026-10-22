#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractFile } from '@electron/asar';
import { localAppPath } from './build-local-app.mjs';
import { currentPackagingState, currentSourceRevision } from './packaging-freshness.mjs';

function readBundleRevision(appPath) {
  const asarPath = resolve(appPath, 'Contents', 'Resources', 'app.asar');
  if (!existsSync(asarPath)) throw new Error(`app.asar is missing: ${asarPath}`);
  try {
    // electron-builder packages `packages/desktop/out` as the archive's
    // `/out` directory (the same directory that contains the main/preload
    // bundles), so keep the manifest alongside those runtime outputs.
    return JSON.parse(extractFile(asarPath, 'out/app-revision.json').toString('utf8'));
  } catch (cause) {
    throw new Error(
      `Packaged app revision manifest is missing from ${asarPath}; rebuild the app first. ${cause instanceof Error ? cause.message : cause}`,
    );
  }
}

function readBundleVersion(appPath) {
  const infoPlist = resolve(appPath, 'Contents', 'Info.plist');
  if (!existsSync(infoPlist)) return null;
  return JSON.parse(
    execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPlist], {
      encoding: 'utf8',
    }),
  ).CFBundleShortVersionString;
}

export function verifyLocalAppRevision(appPath = localAppPath()) {
  const embedded = readBundleRevision(appPath);
  // Compare the embedded source revision and generated packaging digests with
  // the current checkout before any packaged smoke is allowed to run.
  const source = currentSourceRevision();
  const packaging = currentPackagingState();
  const mismatches = [];
  if (embedded.version !== 1) mismatches.push('revision manifest version');
  if (embedded.source?.commit !== source.commit) mismatches.push('source commit');
  if (embedded.source?.dirty !== source.dirty) mismatches.push('source dirty state');
  if (embedded.packaging?.inputDigest !== packaging.inputDigest) {
    mismatches.push('packaging input digest');
  }
  // electron-builder is allowed to normalize generated output while it
  // copies files into the staging bundle (for example source maps and modes).
  // The installed ASAR is validated byte-for-byte by build-local-app, while
  // the source input digest above is the authoritative stale-source guard.
  // Comparing the post-builder `out/` tree here would reject a valid bundle
  // merely because that normalization happened after the stamp was written.
  if (embedded.packaging?.version !== packaging.version) {
    mismatches.push('packaging manifest version');
  }
  if (embedded.bundleVersion !== readBundleVersion(appPath)) mismatches.push('bundle version');
  if (mismatches.length > 0) {
    throw new Error(
      `Installed app revision mismatch (${mismatches.join(', ')}). ` +
        'Rebuild and reinstall the app before running smoke tests.',
    );
  }
  return { appPath, embedded, source, packaging };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const appPath = process.argv[2] ?? localAppPath();
    const result = verifyLocalAppRevision(appPath);
    console.log(
      `[desktop revision] ${result.source.commit ?? 'no-git-commit'} ` +
        `(dirty=${result.source.dirty}, input=${result.packaging.inputDigest.slice(0, 12)})`,
    );
  } catch (error) {
    console.error(`[desktop revision] failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
