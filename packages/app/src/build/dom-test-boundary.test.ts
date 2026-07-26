import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function findFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(path));
    else files.push(path);
  }
  return files;
}

describe('app test-tier boundary', () => {
  test('does not leave legacy .dom.test.ts files in the unit source tree', () => {
    const legacyDomFiles = findFiles(join(import.meta.dir, '..')).filter((path) =>
      path.endsWith('.dom.test.ts'),
    );
    expect(legacyDomFiles).toEqual([]);
  });

  test('keeps the unit script exclusion aligned with the DOM suffix', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, '../../package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.test).toContain('**/*.dom.test.tsx');
  });
});
