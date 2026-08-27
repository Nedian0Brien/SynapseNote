import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, win32 } from 'node:path';
import { getCurrentFuseWire } from '@electron/fuses';
import { parse } from 'yaml';
import { expectedFuseState, targetFuses } from './target-fuses.mjs';

const desktopRoot = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

export async function validateWindowsExecutable(appPath, headerString) {
  // Use the same PE reader as our pinned electron-builder resource writer.
  const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
  const { NtExecutable, NtExecutableResource } = builderRequire('resedit');
  const executablePath = resolve(appPath, 'SynapseNote.exe');
  const executable = NtExecutable.from(readFileSync(executablePath));
  const resources = NtExecutableResource.from(executable);
  const entry = resources.entries.find(
    (resource) => resource.type === 'INTEGRITY' && resource.id === 'ELECTRONASAR',
  );
  const records = entry ? JSON.parse(Buffer.from(entry.bin).toString('utf8')) : [];
  const recorded = records.find(
    (record) => record.file.replaceAll('/', '\\').toLowerCase() === 'resources\\app.asar',
  );
  const actual = createHash('sha256').update(headerString).digest('hex');
  if (recorded?.alg !== 'SHA256' || recorded.value !== actual) {
    throw new Error('ASAR header integrity mismatch in Windows executable');
  }
  const wire = await getCurrentFuseWire(executablePath);
  for (const [key, enabled] of Object.entries(targetFuses)) {
    if (wire[Number(key)] !== expectedFuseState(enabled)) {
      throw new Error(`Windows executable fuse ${key} changed after packaging`);
    }
  }
}

export function windowsBuilderConfig(base) {
  return {
    ...base,
    extraResources: base.extraResources.map((entry) => {
      if (entry.from.endsWith('/keyring-darwin-arm64')) {
        return {
          ...entry,
          from: entry.from.replace('keyring-darwin-arm64', 'keyring-win32-x64-msvc'),
          to: entry.to.replace('keyring-darwin-arm64', 'keyring-win32-x64-msvc'),
        };
      }
      if (entry.from === 'resources/cli/bin/ok.sh') {
        return { from: 'resources/cli/bin/ok.cmd', to: 'cli/bin/ok.cmd' };
      }
      return entry;
    }),
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.png' },
    nsis: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder expands these placeholders.
      artifactName: 'SynapseNote-Setup-${version}-${arch}.${ext}',
      oneClick: true,
      perMachine: false,
      runAfterFinish: false,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
    },
  };
}

export async function buildWindowsLocalApp(validateLocalAsarIntegrity) {
  if (process.arch !== 'x64') throw new Error('Local Windows builds currently require x64');
  const { build, Platform, Arch } = await import('electron-builder');
  const output = resolve(desktopRoot, 'dist-desktop-local');
  const staging = resolve(desktopRoot, `dist-desktop-local-staging-${process.pid}`);
  const previous = resolve(desktopRoot, `dist-desktop-local-previous-${process.pid}`);
  const base = parse(readFileSync(resolve(desktopRoot, 'electron-builder.yml'), 'utf8'));
  mkdirSync(staging, { recursive: true });
  const configPath = resolve(staging, 'windows-builder.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      ...windowsBuilderConfig(base),
      directories: { ...base.directories, output: staging },
    }),
  );
  try {
    await build({
      projectDir: desktopRoot,
      targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
      publish: 'never',
      // An explicit file prevents auto-discovery from merging the macOS YAML
      // arrays back into the transformed Windows resource/publish lists.
      config: configPath,
    });
    await validateLocalAsarIntegrity(resolve(staging, 'win-unpacked'));
    if (existsSync(output)) renameSync(output, previous);
    try {
      renameSync(staging, output);
    } catch (error) {
      if (existsSync(previous)) renameSync(previous, output);
      throw error;
    }
    rmSync(previous, { recursive: true, force: true });
    console.log(`[local desktop] Windows installer and verified app ready: ${output}`);
    return resolve(output, 'win-unpacked');
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function installWindowsLocalApp(targetPath, sourcePath, validateLocalAsarIntegrity) {
  const version = JSON.parse(readFileSync(resolve(desktopRoot, 'package.json'), 'utf8')).version;
  const installer = resolve(
    desktopRoot,
    'dist-desktop-local',
    `SynapseNote-Setup-${version}-x64.exe`,
  );
  if (!existsSync(installer))
    throw new Error('Windows installer missing; run build:dir:local first');
  await validateLocalAsarIntegrity(sourcePath);
  if (existsSync(targetPath)) {
    const { extractFile } = require('@electron/asar');
    const installed = JSON.parse(
      extractFile(resolve(targetPath, 'resources', 'app.asar'), 'package.json').toString('utf8'),
    );
    if (installed.name !== '@nedian0brien/synapsenote-desktop') {
      throw new Error('Refusing to replace a directory that is not a SynapseNote installation');
    }
  }
  assertWindowsInstallNotRunning(targetPath);
  // NSIS consumes the rest of the raw command line after /D=, including spaces.
  // Node's normal argument quoting would become part of that install path.
  execFileSync(installer, ['/S', `/D=${targetPath}`], {
    stdio: 'inherit',
    windowsHide: true,
    windowsVerbatimArguments: true,
  });
  await validateLocalAsarIntegrity(targetPath);
  const child = spawn(resolve(targetPath, 'SynapseNote.exe'), [], {
    detached: true,
    stdio: 'ignore',
  });
  await new Promise((resolveLaunch, reject) => {
    child.once('error', reject);
    child.once('spawn', resolveLaunch);
  });
  child.unref();
  console.log(`[local desktop] installed: ${targetPath}`);
  return { targetPath, pid: child.pid };
}

export function assertWindowsInstallNotRunning(targetPath, executablePaths) {
  const paths =
    executablePaths ??
    JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ConvertTo-Json -Compress -InputObject @(Get-Process | ForEach-Object { $_.Path } | Where-Object { $_ })',
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
      ),
    );
  const root = `${win32.resolve(targetPath).toLowerCase()}\\`;
  if (paths.some((path) => win32.resolve(path).toLowerCase().startsWith(root))) {
    throw new Error(
      'Close SynapseNote and its running terminals before reinstalling; no processes were terminated.',
    );
  }
}
