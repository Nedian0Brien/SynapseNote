import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStyleManifest, StyleManifestError } from './style-manifest.ts';

function withTempStyles(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'synapsenote-style-manifest-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('style manifest', () => {
  test('expands local imports in source order and leaves package imports intact', () => {
    withTempStyles((dir) => {
      writeFileSync(
        join(dir, 'entry.css'),
        '@import "tailwindcss";\n@import "./a.css";\nentry {}\n',
      );
      writeFileSync(join(dir, 'a.css'), 'a {}\n@import "./b.css";\n');
      writeFileSync(join(dir, 'b.css'), 'b {}\n');

      const result = loadStyleManifest(join(dir, 'entry.css'));
      expect(result.files).toEqual([
        join(dir, 'entry.css'),
        join(dir, 'a.css'),
        join(dir, 'b.css'),
      ]);
      expect(result.css.indexOf('a {}')).toBeLessThan(result.css.indexOf('entry {}'));
      expect(result.css.indexOf('b {}')).toBeGreaterThan(result.css.indexOf('a {}'));
      expect(result.css).toContain('@import "tailwindcss";');
    });
  });

  test('rejects a missing local import with importer and target paths', () => {
    withTempStyles((dir) => {
      const entry = join(dir, 'entry.css');
      writeFileSync(entry, '@import "./missing.css";\n');
      expect(() => loadStyleManifest(entry)).toThrow(StyleManifestError);
      try {
        loadStyleManifest(entry);
      } catch (error) {
        expect(error).toMatchObject({ code: 'missing', importer: entry });
        expect(error).toMatchObject({ line: 1 });
        expect(String(error)).toContain('missing.css');
        expect(String(error)).toContain(`${entry}:1`);
      }
    });
  });

  test('rejects duplicate and cyclic local imports', () => {
    withTempStyles((dir) => {
      const entry = join(dir, 'entry.css');
      writeFileSync(entry, '@import "./a.css";\n@import "./a.css";\n');
      writeFileSync(join(dir, 'a.css'), 'a {}\n');
      expect(() => loadStyleManifest(entry)).toThrow(/duplicate/);

      writeFileSync(entry, '@import "./a.css";\n');
      writeFileSync(join(dir, 'a.css'), '@import "./entry.css";\n');
      expect(() => loadStyleManifest(entry)).toThrow(/cycle/);
    });
  });
});
