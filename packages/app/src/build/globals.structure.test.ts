/**
 * Structural regression guards for the global stylesheet contract.
 *
 * These checks deliberately inspect the import manifest rather than a
 * generated bundle: the manifest is the reviewable owner of cascade order and
 * the leaf files are the units that should stay small and independently owned.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStyleManifest } from './style-manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SRC = resolveAppSrc();
const ENTRY = join(APP_SRC, 'globals.css');
const LOCAL_IMPORT_RE = /^\s*@import\s+["'](\.[^"']+)["']\s*;\s*$/gm;

const EXPECTED_LOCAL_IMPORTS = [
  './cmd-f.css',
  './styles/shell/activity-panel.css',
  './styles/foundation/tokens.css',
  './styles/foundation/accessibility.css',
  './styles/foundation/base.css',
  './styles/shell/feedback-and-mascot.css',
  './styles/editor/collaboration.css',
  './styles/shell/editor-layout.css',
  './styles/editor/prose-base.css',
  './styles/editor/code-block.css',
  './styles/editor/links.css',
  './styles/editor/media.css',
  './styles/editor/tables.css',
  './styles/editor/interaction-handles.css',
  './styles/editor/codemirror-base.css',
  './styles/shell/interaction-motion.css',
  './styles/foundation/platform-electron.css',
  './styles/editor/component-chrome.css',
  './styles/components/callout-footnotes.css',
  './styles/components/video.css',
  './styles/components/pdf.css',
  './styles/components/file.css',
  './styles/components/code-editors.css',
  './styles/components/tabs-accordion.css',
  './styles/components/database.css',
  './styles/overrides/dark.css',
  './styles/editor/source-mode.css',
  './styles/editor/tags.css',
  './styles/editor/large-document.css',
  './styles/shell/page-header.css',
  './styles/overrides/third-party.css',
  './styles/editor/inline-code.css',
  './styles/print/pdf-export.css',
] as const;

function resolveAppSrc(): string {
  return join(HERE, '..');
}

function relativeToAppSrc(file: string): string {
  return relative(APP_SRC, file).replaceAll('\\', '/');
}

describe('globals.css import manifest contract', () => {
  const source = readFileSync(ENTRY, 'utf8');
  const manifest = loadStyleManifest(ENTRY);
  const localImports = [...source.matchAll(LOCAL_IMPORT_RE)].map((match) => match[1]);

  test('keeps the public entrypoint small', () => {
    expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(120);
  });

  test('owns the complete cascade order in one flat local-import list', () => {
    expect(localImports).toEqual([...EXPECTED_LOCAL_IMPORTS]);
    expect(manifest.files.map(relativeToAppSrc)).toEqual([
      'globals.css',
      ...EXPECTED_LOCAL_IMPORTS.map((specifier) => specifier.slice(2)),
    ]);
  });

  test('keeps every style leaf under the 800-line temporary ceiling', () => {
    for (const file of manifest.files.filter((candidate) => candidate.includes('/styles/'))) {
      const lineCount = readFileSync(file, 'utf8').split(/\r?\n/).length;
      if (lineCount > 800) {
        throw new Error(`${relativeToAppSrc(file)} has ${lineCount} lines (maximum 800)`);
      }
    }
  });

  test('forbids nested local imports in leaf files', () => {
    for (const file of manifest.files.slice(1)) {
      const nested = [...readFileSync(file, 'utf8').matchAll(LOCAL_IMPORT_RE)].map(
        (match) => match[1],
      );
      if (nested.length > 0) {
        throw new Error(`${relativeToAppSrc(file)} imports leaf CSS: ${nested.join(', ')}`);
      }
    }
  });

  test('keeps print overrides last and token ownership explicit', () => {
    expect(localImports.at(-1)).toBe('./styles/print/pdf-export.css');
    const tokenSource = readFileSync(join(APP_SRC, 'styles/foundation/tokens.css'), 'utf8');
    expect(tokenSource).toContain('@source "../../**/*.{tsx,ts,jsx,js}";');
    expect(tokenSource).toContain('@theme');
    expect(tokenSource).toContain(':root');
    expect(tokenSource).toContain('.dark');
  });
});
