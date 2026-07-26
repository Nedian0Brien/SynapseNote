import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  buildServerTestManifest,
  createBalancedShards,
  discoverServerTestFiles,
  SERVER_TEST_CATEGORIES,
  validateServerTestManifest,
} from './server-test-manifest.ts';

describe('server test manifest', () => {
  test('assigns every discovered test file exactly once', () => {
    const manifest = buildServerTestManifest();
    validateServerTestManifest(manifest);

    const assigned = SERVER_TEST_CATEGORIES.flatMap((category) => manifest[category]);
    expect(assigned.length).toBe(discoverServerTestFiles().length);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  test('keeps process-sensitive files out of the unit task', () => {
    const manifest = buildServerTestManifest();
    const forbidden =
      /(?:^|\/)(?:git|shadow|worktree|spawn|subprocess|process|port|lock|socket)(?:[-/.]|$)|(?:^|\/)server-(?:factory|observer|lock)(?:[-/.]|$)/i;
    expect(manifest.unit.filter((file) => forbidden.test(file))).toEqual([]);

    const forbiddenSource =
      /(?:simple-git|child_process|Bun\.spawn|spawnSync|process\.execPath|createGitTriangle|git-fixture|\.listen\()/;
    const unitSources = manifest.unit
      .filter((file) => file !== 'scripts/server-test-manifest.test.ts')
      .filter((file) =>
        forbiddenSource.test(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')),
      );
    expect(unitSources).toEqual([]);
  });

  test('creates deterministic, lossless time-balanced shards', () => {
    const files = ['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts', 'src/d.test.ts'];
    const timings = {
      files: { 'src/a.test.ts': 40, 'src/b.test.ts': 30, 'src/c.test.ts': 20, 'src/d.test.ts': 20 },
    };
    const first = createBalancedShards(files, 2, 'git', timings);
    const second = createBalancedShards([...files].reverse(), 2, 'git', timings);

    expect(second).toEqual(first);
    expect(first.flat().sort()).toEqual(files.sort());
    expect(first.every((shard) => shard.length > 0)).toBe(true);

    const loads = first.map((shard) =>
      shard.reduce((total, file) => total + (timings.files[file] ?? 0), 0),
    );
    expect((Math.max(...loads) - Math.min(...loads)) / Math.max(...loads)).toBeLessThanOrEqual(0.3);
  });

  test('uses a deterministic fallback weight for files without timings', () => {
    const shards = createBalancedShards(['src/a.test.ts', 'src/b.test.ts'], 4, 'unit');
    expect(shards).toEqual([['src/a.test.ts'], ['src/b.test.ts'], [], []]);
  });
});
