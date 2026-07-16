#!/usr/bin/env node
/**
 * Smoke-test the native-config addon from a built CLI directory, a packaged
 * SynapseNote app, or a DMG containing the app.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv) {
  const positional = argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (positional.length !== 1 || !positional[0]) {
    throw new Error(
      'Usage: verify-native-config-in-packaged-dmg.mjs <dmg-path | app-path | build-dir>',
    );
  }
  return { inputPath: positional[0] };
}

export function classifyInputPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.dmg')) return 'dmg';
  if (lower.endsWith('.app')) return 'app';
  return 'dir';
}

export function resolveBundledNativeDirInDir(dir, deps = {}) {
  const pathExists = deps.existsSync ?? existsSync;
  const candidates = [dir, join(dir, 'native'), join(dir, 'dist', 'native')];
  return candidates.find((candidate) => pathExists(join(candidate, 'index.js'))) ?? null;
}

export function loadAndRoundTrip(nativeDir, deps = {}) {
  const startedAt = deps.now?.() ?? Date.now();
  try {
    const requireModule = deps.requireModule ?? createRequire(import.meta.url);
    const binding = requireModule(join(nativeDir, 'index.js'));

    const parsed = binding.parseTomlToJson('probe = 1\n');
    if (typeof parsed !== 'string' || JSON.parse(parsed).probe !== 1) {
      throw new Error('parseTomlToJson returned an unexpected result');
    }

    const edited = binding.upsertMcpServer(
      '',
      'synapsenote',
      JSON.stringify({ command: 'synapsenote', args: ['start'] }),
    );
    if (!edited || typeof edited.text !== 'string' || typeof edited.changed !== 'boolean') {
      throw new Error('upsertMcpServer returned an unexpected result');
    }

    const probePath = join(tmpdir(), 'synapsenote-native-config-probe.toml');
    const resolvedPath = binding.resolveSymlinkWritePath(probePath);
    if (!resolvedPath || typeof resolvedPath.writePath !== 'string') {
      throw new Error('resolveSymlinkWritePath returned an unexpected result');
    }

    const endedAt = deps.now?.() ?? Date.now();
    return { ok: true, backend: 'native', nativeDir, durationMs: endedAt - startedAt };
  } catch (error) {
    return {
      ok: false,
      nativeDir,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function defaultRunCommand(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    const stderr = [];
    child.stderr?.on('data', (chunk) => stderr.push(chunk.toString('utf8')));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited ${code}: ${stderr.join('').trim()}`));
    });
  });
}

async function defaultListAppsInMount(mountDir) {
  return (await readdir(mountDir)).filter((entry) => entry.toLowerCase().endsWith('.app'));
}

function nativeDirInApp(appPath, pathExists) {
  const nativeDir = join(appPath, 'Contents', 'Resources', 'cli', 'dist', 'native');
  return pathExists(join(nativeDir, 'index.js')) ? nativeDir : null;
}

export async function runDriver(argv, deps = {}) {
  const writeStream = deps.writeStream ?? ((text) => process.stdout.write(text));
  const errStream = deps.errStream ?? ((text) => process.stderr.write(text));
  const pathExists = deps.existsSync ?? existsSync;
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const copy = deps.cp ?? cp;
  const makeTempDir = deps.mkdtemp ?? mkdtemp;
  const remove = deps.rm ?? rm;
  const listAppsInMount = deps.listAppsInMount ?? defaultListAppsInMount;
  const smoke = deps.loadAndRoundTrip ?? loadAndRoundTrip;

  let inputPath;
  try {
    ({ inputPath } = parseArgs(argv));
  } catch (error) {
    errStream(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const absoluteInput = resolve(inputPath);
  const kind = classifyInputPath(absoluteInput);
  let nativeDir = null;
  let mountDir;
  let copyDir;
  let mounted = false;

  try {
    if (kind === 'dir') {
      nativeDir = resolveBundledNativeDirInDir(absoluteInput, { existsSync: pathExists });
    } else if (kind === 'app') {
      nativeDir = nativeDirInApp(absoluteInput, pathExists);
    } else {
      mountDir = await makeTempDir(join(tmpdir(), 'synapsenote-dmg-mount-'));
      copyDir = await makeTempDir(join(tmpdir(), 'synapsenote-app-copy-'));
      await runCommand('hdiutil', [
        'attach',
        '-nobrowse',
        '-readonly',
        '-mountpoint',
        mountDir,
        absoluteInput,
      ]);
      mounted = true;
      const apps = await listAppsInMount(mountDir);
      if (apps.length === 0) throw new Error('no .app bundle found in mounted DMG');
      const copiedApp = join(copyDir, apps[0]);
      await copy(join(mountDir, apps[0]), copiedApp, { recursive: true });
      await runCommand('hdiutil', ['detach', '-quiet', mountDir]);
      mounted = false;
      nativeDir = nativeDirInApp(copiedApp, pathExists);
    }

    if (!nativeDir) {
      errStream(`verify-native-config: no bundled native loader found in ${absoluteInput}\n`);
      return 3;
    }

    const result = smoke(nativeDir);
    if (!result.ok) {
      errStream(`verify-native-config: ${result.error ?? 'native round-trip failed'}\n`);
      return 1;
    }
    writeStream(
      `verify-native-config: OK — backend=${result.backend} durationMs=${result.durationMs ?? '?'}\n`,
    );
    return 0;
  } catch (error) {
    errStream(`verify-native-config: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    if (mountDir && mounted) {
      await runCommand('hdiutil', ['detach', '-quiet', mountDir]).catch(() => {});
    }
    if (copyDir) await remove(copyDir, { recursive: true, force: true }).catch(() => {});
    if (mountDir) await remove(mountDir, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runDriver(process.argv);
}
