import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dir, '..', '..', 'package.json'), 'utf8'),
) as {
  scripts: Record<string, string>;
};

describe('production translation build contract', () => {
  test('extracts source messages before compiling the production app', () => {
    expect(pkg.scripts.build?.startsWith('bun run i18n &&')).toBe(true);
    expect(pkg.scripts.build).not.toContain('bun run i18n:compile &&');
  });

  test('the full i18n command extracts and then compiles catalogs', () => {
    expect(pkg.scripts.i18n).toBe('lingui extract --clean && bun run i18n:compile');
  });
});
