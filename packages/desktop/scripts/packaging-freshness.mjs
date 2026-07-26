import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(DESKTOP_ROOT, '..', '..');
export const PACKAGING_STAMP_PATH = resolve(DESKTOP_ROOT, 'out', '.packaging-inputs.json');
export const APP_REVISION_PATH = resolve(DESKTOP_ROOT, 'out', 'app-revision.json');

// Keep this list focused on files that can affect packaged runtime behavior.
// Tests and docs deliberately stay out; generated build trees are covered by
// OUTPUT_PATHS instead of being mixed with their source inputs.
export const PACKAGING_INPUT_PATHS = [
  'package.json',
  'turbo.json',
  'packages/app/package.json',
  'packages/app/src',
  'packages/app/vite.config.ts',
  'packages/cli/package.json',
  'packages/cli/scripts',
  'packages/cli/src',
  'packages/cli/tsdown.config.ts',
  'packages/core/package.json',
  'packages/core/src',
  'packages/core/tsdown.config.ts',
  'packages/native-config/Cargo.toml',
  'packages/native-config/package.json',
  'packages/native-config/src',
  'packages/server/package.json',
  'packages/server/scripts',
  'packages/server/src',
  'packages/server/tsdown.config.ts',
  'packages/desktop/electron-builder.yml',
  'packages/desktop/electron.vite.config.ts',
  'packages/desktop/package.json',
  'packages/desktop/resources',
  'packages/desktop/scripts',
  'packages/desktop/src',
];

export const PACKAGING_OUTPUT_PATHS = [
  'packages/app/dist',
  'packages/cli/dist',
  'packages/core/dist',
  'packages/native-config/index.js',
  'packages/server/dist',
  'packages/desktop/out',
];

function hashPath(hash, absolutePath) {
  if (!existsSync(absolutePath)) {
    hash.update(`missing\0${relative(REPO_ROOT, absolutePath)}\0`);
    return;
  }
  const stat = lstatSync(absolutePath);
  const repoRelative = relative(REPO_ROOT, absolutePath);
  if (stat.isSymbolicLink()) {
    hash.update(`link\0${repoRelative}\0${readlinkSync(absolutePath)}\0`);
    return;
  }
  if (stat.isDirectory()) {
    hash.update(`dir\0${repoRelative}\0`);
    for (const entry of readdirSync(absolutePath).sort()) {
      if (
        absolutePath === resolve(DESKTOP_ROOT, 'out') &&
        (entry === '.packaging-inputs.json' || entry === 'app-revision.json')
      ) {
        continue;
      }
      hashPath(hash, resolve(absolutePath, entry));
    }
    return;
  }
  hash.update(`file\0${repoRelative}\0${stat.mode}\0${stat.size}\0`);
  hash.update(readFileSync(absolutePath));
  hash.update('\0');
}

export function digestPaths(paths) {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) hashPath(hash, resolve(REPO_ROOT, path));
  return hash.digest('hex');
}

export function currentPackagingState() {
  return {
    version: 1,
    inputDigest: digestPaths(PACKAGING_INPUT_PATHS),
    outputDigest: digestPaths(PACKAGING_OUTPUT_PATHS),
  };
}

function gitOutput(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function currentSourceRevision() {
  return {
    commit: gitOutput(['rev-parse', 'HEAD']),
    dirty: gitOutput(['status', '--porcelain']) !== '',
  };
}

export function writePackagingStamp() {
  const state = currentPackagingState();
  writeFileSync(PACKAGING_STAMP_PATH, `${JSON.stringify(state, null, 2)}\n`);
  const source = currentSourceRevision();
  writeFileSync(
    APP_REVISION_PATH,
    `${JSON.stringify(
      {
        version: 1,
        bundleVersion: JSON.parse(readFileSync(resolve(DESKTOP_ROOT, 'package.json'), 'utf8'))
          .version,
        source,
        packaging: state,
      },
      null,
      2,
    )}\n`,
  );
  return state;
}

export function verifyPackagingStamp() {
  if (!existsSync(PACKAGING_STAMP_PATH)) {
    throw new Error(
      'Desktop packaging freshness stamp is missing. Run `bun run build:desktop` before electron-builder.',
    );
  }
  const expected = JSON.parse(readFileSync(PACKAGING_STAMP_PATH, 'utf8'));
  const actual = currentPackagingState();
  const mismatches = [];
  if (expected.inputDigest !== actual.inputDigest) mismatches.push('workspace source changed');
  if (expected.outputDigest !== actual.outputDigest) mismatches.push('generated dist/out changed');
  if (expected.version !== actual.version) mismatches.push('stamp format changed');
  if (mismatches.length > 0) {
    throw new Error(
      `Stale desktop packaging inputs detected (${mismatches.join(', ')}). ` +
        'Run `bun run build:desktop` before electron-builder.',
    );
  }
  return actual;
}
