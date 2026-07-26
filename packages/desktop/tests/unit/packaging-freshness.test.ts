import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('desktop packaging freshness contract', () => {
  test('build:desktop builds workspace dependencies and writes a freshness stamp', () => {
    const pkg = JSON.parse(readFileSync(resolve(desktopRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['build:packaging-inputs']).toContain(
      'build --filter=@nedian0brien/synapsenote-desktop^...',
    );
    expect(pkg.scripts['build:desktop']).toContain('clean-desktop-output.mjs');
    expect(pkg.scripts['build:desktop']).toContain('bun run build:packaging-inputs');
    expect(pkg.scripts['build:desktop']).toContain('write-packaging-stamp.mjs');
  });

  test('electron-builder refuses packaging without a matching freshness stamp', () => {
    const config = parse(readFileSync(resolve(desktopRoot, 'electron-builder.yml'), 'utf8')) as {
      beforePack?: string;
    };
    expect(config.beforePack).toBe('scripts/beforePack.mjs');
    expect(readFileSync(resolve(desktopRoot, config.beforePack), 'utf8')).toContain(
      'verifyPackagingStamp',
    );
  });

  test('embeds a source revision and exposes a fail-closed local verification command', () => {
    const pkg = JSON.parse(readFileSync(resolve(desktopRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const freshness = readFileSync(resolve(desktopRoot, 'scripts/packaging-freshness.mjs'), 'utf8');
    const verifier = readFileSync(
      resolve(desktopRoot, 'scripts/verify-local-app-revision.mjs'),
      'utf8',
    );

    expect(pkg.scripts['verify:local-revision']).toContain('verify-local-app-revision.mjs');
    expect(freshness).toContain('APP_REVISION_PATH');
    expect(freshness).toContain('currentSourceRevision');
    expect(verifier).toContain('extractFile');
    expect(verifier).toContain('input digest');
    expect(verifier).toContain('source revision');
  });
});
