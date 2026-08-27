#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getRawHeader } from '@electron/asar';

export const LOCAL_OUTPUT_DIRECTORY_NAME = 'dist-desktop-local';
export const PRODUCT_NAME = 'SynapseNote';

const desktopRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopRoot, '..', '..');

export function localAppPath(arch = process.arch, platform = process.platform) {
  if (platform === 'win32') {
    return resolve(desktopRoot, LOCAL_OUTPUT_DIRECTORY_NAME, 'win-unpacked');
  }
  return resolve(desktopRoot, LOCAL_OUTPUT_DIRECTORY_NAME, `mac-${arch}`, `${PRODUCT_NAME}.app`);
}

function appPathIn(outputDirectory, arch = process.arch) {
  return resolve(outputDirectory, `mac-${arch}`, `${PRODUCT_NAME}.app`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: desktopRoot,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
}

export function parseAppleDevelopmentIdentity(output) {
  return output.match(/^\s*\d+\)\s+([0-9A-F]{40})\s+"Apple Development:/m)?.[1] ?? null;
}

function resolveLocalSigningIdentity() {
  const configured = process.env.SYNAPSENOTE_LOCAL_CODESIGN_IDENTITY?.trim();
  if (configured) return configured;
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
    capture: true,
  });
  return parseAppleDevelopmentIdentity(identities);
}

function digestStream(stream) {
  return new Promise((resolveDigest, reject) => {
    const digest = createHash('sha256');
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveDigest(digest.digest('hex')));
  });
}

function collectIntegrityEntries(node, parentPath = '', entries = []) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const entryPath = parentPath ? join(parentPath, name) : name;
    if (child.files) collectIntegrityEntries(child, entryPath, entries);
    else if (child.integrity?.hash) entries.push({ path: entryPath, ...child });
  }
  return entries;
}

export async function validateLocalAsarIntegrity(appPath) {
  const windowsBundle = existsSync(resolve(appPath, `${PRODUCT_NAME}.exe`));
  const asarPath = windowsBundle
    ? resolve(appPath, 'resources', 'app.asar')
    : resolve(appPath, 'Contents', 'Resources', 'app.asar');
  const infoPlistPath = resolve(appPath, 'Contents', 'Info.plist');
  const { header, headerString, headerSize } = getRawHeader(asarPath);
  if (windowsBundle) {
    const { validateWindowsExecutable } = await import('./windows-local-app.mjs');
    await validateWindowsExecutable(appPath, headerString);
  }
  if (!windowsBundle) {
    const infoPlist = JSON.parse(
      run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPlistPath], { capture: true }),
    );
    const recordedHeaderHash = infoPlist.ElectronAsarIntegrity?.['Resources/app.asar']?.hash;
    const actualHeaderHash = createHash('sha256').update(headerString).digest('hex');
    if (recordedHeaderHash !== actualHeaderHash) {
      throw new Error(
        `ASAR header integrity mismatch (${actualHeaderHash} != ${recordedHeaderHash ?? 'missing'})`,
      );
    }
  }

  const dataOffset = 8 + headerSize;
  const mismatches = [];
  for (const entry of collectIntegrityEntries(header)) {
    const actualHash =
      entry.size === 0
        ? createHash('sha256').digest('hex')
        : await digestStream(
            entry.unpacked
              ? createReadStream(resolve(`${asarPath}.unpacked`, entry.path))
              : createReadStream(asarPath, {
                  start: dataOffset + Number(entry.offset),
                  end: dataOffset + Number(entry.offset) + entry.size - 1,
                }),
          );
    if (actualHash !== entry.integrity.hash) {
      mismatches.push(entry.path);
      if (mismatches.length === 5) break;
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `ASAR payload integrity mismatch: ${mismatches.join(', ')}. ` +
        'Another build may have changed packaging inputs; retry after it finishes.',
    );
  }
}

export async function buildLocalApp() {
  if (process.platform === 'win32') {
    const { buildWindowsLocalApp } = await import('./windows-local-app.mjs');
    return buildWindowsLocalApp(validateLocalAsarIntegrity);
  }
  if (process.platform !== 'darwin') {
    throw new Error('build-local-app is macOS only');
  }

  const outputDirectory = resolve(desktopRoot, LOCAL_OUTPUT_DIRECTORY_NAME);
  const stagingDirectory = resolve(
    desktopRoot,
    `${LOCAL_OUTPUT_DIRECTORY_NAME}-staging-${process.pid}`,
  );
  const electronBuilder = resolve(repoRoot, 'node_modules', '.bin', 'electron-builder');
  rmSync(stagingDirectory, { recursive: true, force: true });

  try {
    run(
      electronBuilder,
      [
        '--dir',
        '--publish',
        'never',
        '-c.mac.identity=null',
        `-c.directories.output=${stagingDirectory}`,
      ],
      {
        env: {
          ...process.env,
          CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        },
      },
    );

    const stagedAppPath = appPathIn(stagingDirectory);
    const serverHelperPath = resolve(
      stagedAppPath,
      'Contents',
      'Frameworks',
      `${PRODUCT_NAME} Server.app`,
    );
    if (!existsSync(stagedAppPath) || !existsSync(serverHelperPath)) {
      throw new Error(`Local desktop bundle was not created at ${stagedAppPath}`);
    }

    // electron-builder hashes inputs before it streams their payloads into the
    // archive. If another build rewrites one in that interval, the bundle can
    // be code-signable yet abort during Electron bootstrap. Validate every
    // ASAR entry before signing or replacing the last known-good local output.
    await validateLocalAsarIntegrity(stagedAppPath);

    const signingIdentity = resolveLocalSigningIdentity();
    const codesignIdentity = signingIdentity ?? '-';
    if (signingIdentity) {
      console.log(
        `[local desktop] signing with stable Apple Development identity ${signingIdentity}`,
      );
    } else {
      console.warn(
        '[local desktop] no Apple Development identity found; using ad-hoc signing. ' +
          'macOS protected-folder approvals may be requested again after rebuilds.',
      );
    }

    // electron-builder intentionally skips its expensive full signing pass.
    // Sign the filesystem-owning helper and outer bundle with the same stable
    // development identity so macOS TCC keeps Documents/Desktop approvals when
    // app contents change between local builds. Standalone contributors without
    // a development identity retain the previous ad-hoc fallback.
    run('/usr/bin/codesign', [
      '--force',
      '--sign',
      codesignIdentity,
      '--timestamp=none',
      '--options',
      'runtime',
      '--entitlements',
      resolve(desktopRoot, 'build', 'entitlements.mac.inherit.plist'),
      serverHelperPath,
    ]);
    run('/usr/bin/codesign', [
      '--force',
      '--sign',
      codesignIdentity,
      '--timestamp=none',
      '--options',
      'runtime',
      '--entitlements',
      resolve(desktopRoot, 'build', 'entitlements.mac.plist'),
      stagedAppPath,
    ]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=1', stagedAppPath]);

    const previousDirectory = `${outputDirectory}-previous-${process.pid}`;
    rmSync(previousDirectory, { recursive: true, force: true });
    if (existsSync(outputDirectory)) renameSync(outputDirectory, previousDirectory);
    try {
      renameSync(stagingDirectory, outputDirectory);
    } catch (error) {
      if (existsSync(previousDirectory)) renameSync(previousDirectory, outputDirectory);
      throw error;
    }
    rmSync(previousDirectory, { recursive: true, force: true });

    const appPath = localAppPath();
    console.log('[local desktop] ASAR integrity verified');
    console.log(`[local desktop] ready: ${appPath}`);
    return appPath;
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    await buildLocalApp();
  } catch (error) {
    console.error(
      `[local desktop] build failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
