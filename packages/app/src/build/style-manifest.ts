/**
 * Expand the application's local CSS import graph for Node-side checks.
 *
 * The browser build remains the owner of CSS parsing and Tailwind expansion;
 * this helper only makes the source contract inspectable without assuming
 * that every rule still lives in one physical file. Local imports are expanded
 * in source order, while package imports and Tailwind directives are left in
 * place for the real build pipeline.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const LOCAL_IMPORT_RE = /^\s*@import\s+["'](\.[^"']+)["']\s*;\s*$/gm;

export interface StyleManifest {
  /** Fully expanded source, preserving each import's original position. */
  css: string;
  /** Files visited in depth-first source order, including the entry file. */
  files: string[];
}

export class StyleManifestError extends Error {
  readonly code: 'cycle' | 'duplicate' | 'missing';
  readonly importer: string;
  readonly imported?: string;
  readonly line?: number;

  constructor(
    code: StyleManifestError['code'],
    importer: string,
    message: string,
    imported?: string,
    line?: number,
  ) {
    super(
      `style-manifest (${code}) ${line === undefined ? importer : `${importer}:${line}`} ${message}`,
    );
    this.name = 'StyleManifestError';
    this.code = code;
    this.importer = importer;
    this.imported = imported;
    this.line = line;
  }
}

/**
 * Expand a stylesheet's local `./…` imports and reject an unsafe graph.
 *
 * `globals.css` is intentionally the only file that owns ordering. Leaf CSS
 * files must not import one another, but the cycle/duplicate checks stay
 * generic so the invariant is enforced rather than documented only.
 */
export function loadStyleManifest(entryPath: string): StyleManifest {
  const entry = resolve(entryPath);
  const stack: string[] = [];
  const visited = new Set<string>();
  const files: string[] = [];

  function visit(filePath: string, importer?: string, importLine?: number): string {
    const file = resolve(filePath);
    if (stack.includes(file)) {
      const cycle = [...stack, file].join(' -> ');
      throw new StyleManifestError('cycle', importer ?? file, cycle, file, importLine);
    }
    if (visited.has(file)) {
      throw new StyleManifestError(
        'duplicate',
        importer ?? file,
        `local import resolves to an already visited file: ${file}`,
        file,
        importLine,
      );
    }

    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      throw new StyleManifestError(
        'missing',
        importer ?? file,
        `cannot read stylesheet ${file}${detail}`,
        file,
        importLine,
      );
    }

    stack.push(file);
    visited.add(file);
    files.push(file);
    const expanded = source.replace(LOCAL_IMPORT_RE, (_full, specifier: string, offset: number) => {
      const imported = resolve(dirname(file), specifier);
      const line = source.slice(0, offset).split(/\r?\n/).length;
      return visit(imported, file, line);
    });
    stack.pop();
    return expanded;
  }

  return { css: visit(entry), files };
}
