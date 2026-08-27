import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('build:app replaces stale assets and copies nested renderer assets on Windows and macOS', () => {
  const root = mkdtempSync(join(tmpdir(), 'synapsenote-build-assets-'));
  try {
    const cli = join(root, 'cli');
    mkdirSync(join(root, 'app', 'dist', 'assets'), { recursive: true });
    mkdirSync(join(cli, 'dist', 'public'), { recursive: true });
    writeFileSync(join(root, 'app', 'dist', 'assets', '한글.js'), 'renderer');
    writeFileSync(join(cli, 'dist', 'public', 'stale.js'), 'stale');
    const { scripts } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    writeFileSync(
      join(cli, 'package.json'),
      JSON.stringify({ scripts: { 'build:app': scripts['build:app'] } }),
    );
    const result = Bun.spawnSync([process.execPath, 'run', 'build:app'], { cwd: cli });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readFileSync(join(cli, 'dist', 'public', 'assets', '한글.js'), 'utf8')).toBe('renderer');
    expect(existsSync(join(cli, 'dist', 'public', 'stale.js'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
