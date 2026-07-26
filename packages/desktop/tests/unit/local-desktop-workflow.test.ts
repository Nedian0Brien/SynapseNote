import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAppleDevelopmentIdentity } from '../../scripts/build-local-app.mjs';
import { parseInstallPath } from '../../scripts/install-local-app.mjs';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(desktopRoot, '../..');

describe('local desktop build and install workflow', () => {
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
    expect(parseInstallPath([])).toBe('/Applications/SynapseNote.app');
    expect(parseInstallPath(['--target', '/tmp/Local SynapseNote.app'])).toBe(
      '/tmp/Local SynapseNote.app',
    );
    expect(() => parseInstallPath(['--target', '/tmp/not-an-app'])).toThrow(
      '--target must point to a .app bundle',
    );
    expect(() => parseInstallPath(['--unknown'])).toThrow('Usage:');
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
