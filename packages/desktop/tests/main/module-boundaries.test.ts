import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertModuleSizeBudgets,
  DESKTOP_MODULE_SIZE_BUDGETS,
  desktopSourceRoot,
  moduleLineCount,
  resolveDesktopModule,
} from '../../src/main/module-boundaries.ts';

const DESKTOP_IPC_SINGLETON_BOUNDARIES = new Set([
  'desktop-ipc-composition.ts',
  'desktop-integrations-ipc.ts',
]);

function functionLineCount(source: string, name: string): number {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(start, cursor + 1).split('\n').length;
  }
  throw new Error(`${name} has unbalanced braces`);
}

describe('RFC 0011 desktop module boundary guard', () => {
  let fixtureRoot: string | undefined;

  afterEach(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  });

  test('current desktop boundaries exist and stay within their budgets', () => {
    const src = desktopSourceRoot(import.meta.filename);
    assertModuleSizeBudgets(src, DESKTOP_MODULE_SIZE_BUDGETS);
  });

  test('main index budget equals its current split-line count', () => {
    const src = desktopSourceRoot(import.meta.filename);
    const budget = DESKTOP_MODULE_SIZE_BUDGETS.find((candidate) => candidate.path === 'index.ts');
    if (!budget) throw new Error('index.ts budget must exist');
    expect(moduleLineCount(resolveDesktopModule(src, budget.path))).toBe(budget.maxLines);
  });

  test('main index budget rejects one additional source line', () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'synapsenote-desktop-boundaries-'));
    const indexBudget = DESKTOP_MODULE_SIZE_BUDGETS.find(
      (candidate) => candidate.path === 'index.ts',
    );
    if (!indexBudget) throw new Error('index.ts budget must exist');

    const oversizedSource = `${'line\n'.repeat(indexBudget.maxLines)}extra`;
    writeFileSync(join(fixtureRoot, indexBudget.path), oversizedSource);
    const root = fixtureRoot;
    if (!root) throw new Error('synthetic fixture root must exist');

    expect(() => assertModuleSizeBudgets(root, [indexBudget])).toThrow(
      `index.ts exceeds ${indexBudget.maxLines} lines`,
    );
  });

  test('extracted leaves do not import main/index or renderer-owned modules', () => {
    const src = desktopSourceRoot(import.meta.filename);
    const mainIndexImport = /\b(?:from|import)\s*(?:\(\s*)?['"][^'"]*\/index(?:\.ts)?['"]/;
    const rendererImport =
      /\b(?:from|import)\s*(?:\(\s*)?['"][^'"]*(?:renderer\/|\/renderer(?:\/|['"]))/;

    for (const budget of DESKTOP_MODULE_SIZE_BUDGETS.filter(({ path }) => path !== 'index.ts')) {
      const source = readFileSync(resolveDesktopModule(src, budget.path), 'utf8');
      expect(source, `${budget.path} must not import main/index.ts`).not.toMatch(mainIndexImport);
      expect(source, `${budget.path} must not import renderer-owned modules`).not.toMatch(
        rendererImport,
      );
    }
  });

  test('registrars depend on injected composition ports and ipcMain stays at boundaries', () => {
    const src = desktopSourceRoot(import.meta.filename);
    const registrarPaths = DESKTOP_MODULE_SIZE_BUDGETS.filter(({ path }) =>
      path.startsWith('ipc/'),
    );
    const runtimeCompositionImport = /^\s*import\s+(?!type\b)[^;\n]*desktop-ipc-composition\.ts/m;
    const runtimeIpcMainImport =
      /^\s*import\s+\{[^;\n]*\bipcMain\b[^;\n]*\}\s+from\s+['"]electron['"]/m;

    for (const budget of registrarPaths) {
      const source = readFileSync(resolveDesktopModule(src, budget.path), 'utf8');
      expect(source, `${budget.path} must use type-only composition imports`).not.toMatch(
        runtimeCompositionImport,
      );
      expect(source, `${budget.path} must not acquire ipcMain directly`).not.toMatch(
        runtimeIpcMainImport,
      );
    }

    const compositionSource = readFileSync(
      resolveDesktopModule(src, 'desktop-ipc-composition.ts'),
      'utf8',
    );
    expect(compositionSource).toContain('createHandler(ipcMain)');
    for (const budget of DESKTOP_MODULE_SIZE_BUDGETS.filter(({ path }) => path !== 'index.ts')) {
      if (DESKTOP_IPC_SINGLETON_BOUNDARIES.has(budget.path)) continue;
      const source = readFileSync(resolveDesktopModule(src, budget.path), 'utf8');
      expect(source, `${budget.path} must not hide an ipcMain singleton`).not.toMatch(
        runtimeIpcMainImport,
      );
    }
  });

  test('main registerIpcHandlers remains a small structural seam', () => {
    const source = readFileSync(
      resolveDesktopModule(desktopSourceRoot(import.meta.filename), 'index.ts'),
      'utf8',
    );
    expect(functionLineCount(source, 'registerIpcHandlers')).toBeLessThanOrEqual(150);
  });
});
