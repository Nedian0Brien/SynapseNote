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
      'build --filter=@inkeep/open-knowledge-desktop^...',
    );
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
});
