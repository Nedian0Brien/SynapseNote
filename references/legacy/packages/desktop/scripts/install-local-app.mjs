#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localAppPath, PRODUCT_NAME, validateLocalAsarIntegrity } from './build-local-app.mjs';

export const DEFAULT_INSTALL_PATH = `/Applications/${PRODUCT_NAME}.app`;
const BUNDLE_IDENTIFIER = 'kr.lawdigest.synapsenote';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
}

export function parseInstallPath(argv) {
  if (argv.length === 0) return DEFAULT_INSTALL_PATH;
  if (argv.length === 2 && argv[0] === '--target') {
    const target = resolve(argv[1]);
    if (!target.endsWith('.app')) throw new Error('--target must point to a .app bundle');
    return target;
  }
  throw new Error('Usage: node scripts/install-local-app.mjs [--target /path/to/SynapseNote.app]');
}

function runningPids(executablePath) {
  const output = run('/bin/ps', ['-axo', 'pid=,command='], { capture: true });
  return output
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter((match) => match?.[2] === executablePath || match?.[2].startsWith(`${executablePath} `))
    .map((match) => Number(match[1]));
}

function serverPids(executablePath) {
  if (!existsSync(executablePath)) return [];
  try {
    return run('/usr/sbin/lsof', ['-t', '--', executablePath], { capture: true })
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

async function waitForPidsToExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isProcessRunning(pid))) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return pids.every((pid) => !isProcessRunning(pid));
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(executablePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runningPids(executablePath).length === 0) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return runningPids(executablePath).length === 0;
}

async function waitForLaunch(executablePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [pid] = runningPids(executablePath);
    if (pid) {
      // A malformed bundle can appear in ps briefly and then abort during
      // Electron bootstrap. Require a short stable window before reporting a
      // successful install so rollback still happens for that failure mode.
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
      if (runningPids(executablePath).includes(pid)) return pid;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return null;
}

function restorePreviousApp(targetPath, backupPath) {
  if (!backupPath || !existsSync(backupPath)) return;
  if (existsSync(targetPath)) {
    renameSync(targetPath, join(dirname(backupPath), `failed-new-${basename(targetPath)}`));
  }
  renameSync(backupPath, targetPath);
}

function removeBackupDirectory(backupPath) {
  if (!backupPath) return;
  rmSync(dirname(backupPath), { recursive: true, force: true });
}

export async function installLocalApp(targetPath = DEFAULT_INSTALL_PATH) {
  if (process.platform !== 'darwin') throw new Error('install-local-app is macOS only');

  const sourcePath = localAppPath();
  if (!existsSync(sourcePath)) {
    throw new Error(`Local desktop bundle not found at ${sourcePath}. Run build:dir:local first.`);
  }
  await validateLocalAsarIntegrity(sourcePath);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', sourcePath]);

  const executablePath = resolve(targetPath, 'Contents', 'MacOS', PRODUCT_NAME);
  try {
    run('/usr/bin/osascript', ['-e', `tell application id "${BUNDLE_IDENTIFIER}" to quit`], {
      capture: true,
    });
  } catch {
    // The app may not be running yet; installation can continue.
  }

  if (!(await waitForExit(executablePath, 10_000))) {
    for (const pid of runningPids(executablePath)) process.kill(pid, 'SIGTERM');
    if (!(await waitForExit(executablePath, 2_000))) {
      throw new Error(`Installed app did not exit cleanly: ${targetPath}`);
    }
  }

  // The collaboration server deliberately survives its parent app so projects
  // remain available between window restarts. During an app replacement that
  // would leave the previous bundle's code-signing identity alive and can make
  // macOS request protected-folder access again. Resolve only processes that
  // have this target bundle's server executable open, then stop them cleanly.
  const serverExecutablePath = resolve(
    targetPath,
    'Contents',
    'Frameworks',
    `${PRODUCT_NAME} Server.app`,
    'Contents',
    'MacOS',
    `${PRODUCT_NAME} Helper`,
  );
  const installedServerPids = serverPids(serverExecutablePath);
  for (const pid of installedServerPids) process.kill(pid, 'SIGTERM');
  if (!(await waitForPidsToExit(installedServerPids, 3_000))) {
    throw new Error(`Installed server did not exit cleanly: ${targetPath}`);
  }

  let backupPath = null;
  if (existsSync(targetPath)) {
    const backupDirectory = mkdtempSync(join(tmpdir(), 'synapsenote-local-install-'));
    backupPath = join(backupDirectory, basename(targetPath));
    renameSync(targetPath, backupPath);
  }

  try {
    run('/usr/bin/ditto', [sourcePath, targetPath]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', targetPath]);
  } catch (error) {
    restorePreviousApp(targetPath, backupPath);
    removeBackupDirectory(backupPath);
    throw error;
  }

  run('/usr/bin/open', [targetPath]);
  const pid = await waitForLaunch(executablePath, 10_000);
  if (!pid) {
    restorePreviousApp(targetPath, backupPath);
    if (backupPath) run('/usr/bin/open', [targetPath]);
    removeBackupDirectory(backupPath);
    throw new Error(`Local app did not launch${backupPath ? '; previous app restored' : ''}`);
  }

  removeBackupDirectory(backupPath);
  console.log(`[local desktop] installed: ${targetPath}`);
  console.log(`[local desktop] pid: ${pid}`);
  if (backupPath) console.log('[local desktop] temporary backup removed');
  return { targetPath, pid };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const targetPath = parseInstallPath(process.argv.slice(2));
    await installLocalApp(targetPath);
  } catch (error) {
    console.error(
      `[local desktop] install failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
