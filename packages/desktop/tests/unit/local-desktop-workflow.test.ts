import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackage } from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { getNodeModuleFileMatcher } from 'app-builder-lib/out/fileMatcher.js';
import { parse } from 'yaml';
import afterPack from '../../scripts/afterPack.mjs';
import {
  localAppPath,
  parseAppleDevelopmentIdentity,
  validateLocalAsarIntegrity,
} from '../../scripts/build-local-app.mjs';
import { parseInstallPath } from '../../scripts/install-local-app.mjs';
import {
  currentPackagingState,
  currentSourceRevision,
} from '../../scripts/packaging-freshness.mjs';
import { expectedFuseState, targetFuses } from '../../scripts/target-fuses.mjs';
import { verifyLocalAppRevision } from '../../scripts/verify-local-app-revision.mjs';
import {
  assertWindowsInstallNotRunning,
  windowsBuilderConfig,
} from '../../scripts/windows-local-app.mjs';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(desktopRoot, '../..');

describe('local desktop build and install workflow', () => {
  test('excludes Rust build intermediates while keeping the native Windows runtime', () => {
    const base = parse(readFileSync(resolve(desktopRoot, 'electron-builder.yml'), 'utf8'));
    const config = windowsBuilderConfig(base);
    const filter = getNodeModuleFileMatcher(desktopRoot, 'output', (value) => value, config.win, {
      config,
      debugLogger: { isEnabled: false },
    } as never).createFilter();
    const accepts = (relative: string, directory = false) =>
      filter(resolve(desktopRoot, relative), {
        isDirectory: () => directory,
        moduleFullFilePath: relative,
      } as never);
    const native = 'node_modules/@nedian0brien/synapsenote-native-config';
    expect(accepts(`${native}/target`, true)).toBe(false);
    expect(accepts(`${native}/target/release/.fingerprint/crate/dep-lib`)).toBe(false);
    expect(accepts(`${native}/index.js`)).toBe(true);
    expect(accepts(`${native}/native-config.win32-x64-msvc.node`)).toBe(true);
  });
  test('refuses to install over running Windows app and utility processes', () => {
    const target = 'C:\\Users\\Test\\Programs\\SynapseNote';
    expect(() => assertWindowsInstallNotRunning(target, [`${target}\\SynapseNote.exe`])).toThrow(
      'Close SynapseNote',
    );
    expect(() =>
      assertWindowsInstallNotRunning(target, [`${target}\\resources\\helper.exe`]),
    ).toThrow('Close SynapseNote');
    expect(() =>
      assertWindowsInstallNotRunning(target, [`${target}-other\\SynapseNote.exe`]),
    ).not.toThrow();
  });
  test('verifies revision and version from a Windows bundle', async () => {
    const output = mkdtempSync(resolve(tmpdir(), 'synapsenote-win-revision-'));
    try {
      const source = resolve(output, 'source');
      mkdirSync(resolve(source, 'out'), { recursive: true });
      mkdirSync(resolve(output, 'resources'));
      writeFileSync(resolve(output, 'SynapseNote.exe'), 'fixture');
      const version = JSON.parse(
        readFileSync(resolve(desktopRoot, 'package.json'), 'utf8'),
      ).version;
      const revision = {
        version: 1,
        bundleVersion: version,
        source: currentSourceRevision(),
        packaging: currentPackagingState(),
      };
      writeFileSync(resolve(source, 'package.json'), JSON.stringify({ version }));
      writeFileSync(resolve(source, 'out/app-revision.json'), JSON.stringify(revision));
      await createPackage(source, resolve(output, 'resources/app.asar'));
      expect(verifyLocalAppRevision(output).embedded.bundleVersion).toBe(version);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
  test.skipIf(process.platform !== 'win32')(
    'rejects a Windows archive with no executable-bound integrity hash',
    async () => {
      const output = mkdtempSync(resolve(tmpdir(), 'synapsenote-win-integrity-'));
      try {
        const source = resolve(output, 'source');
        const resources = resolve(output, 'resources');
        mkdirSync(source);
        mkdirSync(resources);
        writeFileSync(resolve(source, 'index.js'), 'console.log("fixture")');
        copyFileSync(
          resolve(repoRoot, 'node_modules/electron/dist/electron.exe'),
          resolve(output, 'SynapseNote.exe'),
        );
        await createPackage(source, resolve(resources, 'app.asar'));
        await expect(validateLocalAsarIntegrity(output)).rejects.toThrow('ASAR header integrity');
      } finally {
        rmSync(output, { recursive: true, force: true });
      }
    },
  );
  test.skipIf(process.platform !== 'win32')(
    'hardens the Windows executable before installation',
    async () => {
      const output = mkdtempSync(resolve(tmpdir(), 'synapsenote-win-fuses-'));
      try {
        const executable = resolve(output, 'SynapseNote.exe');
        copyFileSync(resolve(repoRoot, 'node_modules/electron/dist/electron.exe'), executable);
        await afterPack({
          appOutDir: output,
          electronPlatformName: 'win32',
          packager: { appInfo: { productFilename: 'SynapseNote' } },
        });
        const wire = await getCurrentFuseWire(executable);
        expect(wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(
          expectedFuseState(false),
        );
        for (const [key, enabled] of Object.entries(targetFuses)) {
          expect(wire[Number(key) as FuseV1Options]).toBe(expectedFuseState(enabled));
        }
      } finally {
        rmSync(output, { recursive: true, force: true });
      }
    },
  );
  test('locates the Windows x64 unpacked app independently of macOS bundles', () => {
    expect(localAppPath('x64', 'win32')).toBe(
      resolve(desktopRoot, 'dist-desktop-local', 'win-unpacked'),
    );
    expect(localAppPath('arm64', 'darwin')).toBe(
      resolve(desktopRoot, 'dist-desktop-local', 'mac-arm64', 'SynapseNote.app'),
    );
  });

  test('keeps local packaging separate from release output and certificate signing', () => {
    const desktopPackage = JSON.parse(
      readFileSync(resolve(desktopRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const buildScript = readFileSync(resolve(desktopRoot, 'scripts/build-local-app.mjs'), 'utf8');

    expect(desktopPackage.scripts['build:dir']).not.toContain('build-local-app');
    expect(desktopPackage.scripts['build:dir:local']).toContain('build-local-app.mjs');
    expect(buildScript).toContain("LOCAL_OUTPUT_DIRECTORY_NAME = 'dist-desktop-local'");
    expect(buildScript).toContain("'-c.mac.identity=null'");
    expect(buildScript).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(buildScript).toContain('validateLocalAsarIntegrity(stagedAppPath)');
    expect(buildScript).toContain('ASAR payload integrity mismatch');
    expect(buildScript).toContain('renameSync(stagingDirectory, outputDirectory)');
    expect(buildScript).toContain("'--sign'");
    expect(buildScript).toContain('SYNAPSENOTE_LOCAL_CODESIGN_IDENTITY');
    expect(buildScript).toContain('signing with stable Apple Development identity');
    expect(buildScript).not.toContain('EnableEmbeddedAsarIntegrityValidation]: false');
    expect(buildScript).toContain("'--verify', '--deep', '--strict'");
  });

  test('selects a stable Apple Development identity for local TCC permissions', () => {
    expect(
      parseAppleDevelopmentIdentity(
        '  1) 4D5BDD0BCDA9594CDF79058D7884E6758BD5EA41 "Apple Development: Dev (TEAMID)"',
      ),
    ).toBe('4D5BDD0BCDA9594CDF79058D7884E6758BD5EA41');
    expect(parseAppleDevelopmentIdentity('  0 valid identities found')).toBeNull();
  });

  test('excludes the generated local bundle from repository checks', () => {
    const gitignore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8');
    const biomeConfig = readFileSync(resolve(repoRoot, 'biome.jsonc'), 'utf8');

    expect(gitignore).toContain('packages/desktop/dist-desktop-local/');
    expect(biomeConfig).toContain('!packages/desktop/dist-desktop-local');
  });

  test('exposes root commands for building and installing the local bundle', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(rootPackage.scripts['build:desktop:local']).toContain('build:dir:local');
    expect(rootPackage.scripts['install:desktop:local']).toContain('install:local');
    expect(rootPackage.scripts['check:desktop:local']).toContain('local-desktop-workflow.test.ts');
    expect(rootPackage.scripts['check:desktop:local']).not.toContain('bun run check');
    expect(rootPackage.scripts['check:database:interaction']).toContain(
      'database-record-open-command.dom.test.tsx',
    );
    expect(rootPackage.scripts['check:desktop:database']).toContain('database-open-page.e2e.ts');
  });

  test('defaults to Applications and validates explicit targets', () => {
    expect(parseInstallPath([], 'darwin')).toBe('/Applications/SynapseNote.app');
    expect(parseInstallPath(['--target', '/tmp/Local SynapseNote.app'], 'darwin')).toBe(
      '/tmp/Local SynapseNote.app',
    );
    expect(() => parseInstallPath(['--target', '/tmp/not-an-app'], 'darwin')).toThrow(
      '--target must point to a .app bundle',
    );
    expect(() => parseInstallPath(['--unknown'])).toThrow('Usage:');
  });

  test('installs Windows per user and rejects drive roots and executable targets', () => {
    expect(
      parseInstallPath([], 'win32', { LOCALAPPDATA: 'C:\\Users\\Test User\\AppData\\Local' }),
    ).toBe('C:\\Users\\Test User\\AppData\\Local\\Programs\\SynapseNote');
    expect(parseInstallPath(['--target', 'D:\\Apps\\SynapseNote'], 'win32')).toBe(
      'D:\\Apps\\SynapseNote',
    );
    expect(() => parseInstallPath(['--target', 'D:\\'], 'win32')).toThrow();
    expect(() => parseInstallPath(['--target', 'D:\\Apps\\SynapseNote.exe'], 'win32')).toThrow();
  });

  test('backs up and verifies the installed app before relaunching it', () => {
    const installScript = readFileSync(
      resolve(desktopRoot, 'scripts/install-local-app.mjs'),
      'utf8',
    );

    expect(installScript).toContain("mkdtempSync(join(tmpdir(), 'synapsenote-local-install-'))");
    expect(installScript).toContain("run('/usr/bin/ditto', [sourcePath, targetPath])");
    expect(installScript).toContain('await validateLocalAsarIntegrity(sourcePath)');
    expect(installScript).toContain("run('/usr/sbin/lsof', ['-t', '--', executablePath]");
    expect(installScript).toContain('Installed server did not exit cleanly');
    expect(installScript).toContain("run('/usr/bin/codesign', ['--verify', '--deep', '--strict'");
    expect(installScript).toContain("run('/usr/bin/open', [targetPath])");
    expect(installScript).toContain('setTimeout(resolveWait, 1_500)');
    expect(installScript).toContain('previous app restored');
    expect(installScript).toContain(
      'rmSync(dirname(backupPath), { recursive: true, force: true })',
    );
  });

  test('uses the local bundle for packaged multi-instance launches', () => {
    const launchInstancesScript = readFileSync(
      resolve(desktopRoot, 'scripts/launch-instances.mjs'),
      'utf8',
    );

    expect(launchInstancesScript).toContain(
      "join(pkgRoot, 'dist-desktop-local', 'mac-arm64', 'SynapseNote.app')",
    );
    expect(launchInstancesScript).toContain('bun run build:dir:local');
  });
});
