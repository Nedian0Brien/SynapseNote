import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertModuleSizeBudgets,
  findFormerServerFacadeImports,
  moduleLineCount,
  resolveServerModule,
  SERVER_MODULE_SIZE_BUDGETS,
  serverSourceRoot,
} from './module-boundaries.ts';

const DATABASE_FACADE_PATHS = [
  'database-data-plane-api.ts',
  'database-plan.ts',
  'database-data-plane.ts',
] as const;

const DATABASE_EXTRACTION_PATH = /^database-(?:data-plane-api|plan|data-plane)-.+\.ts$/;
const CONTENT_EXTRACTION_LEAVES = [
  'content-upload-policy.ts',
  'content-upload-service.ts',
  'content-path-safety.ts',
  'content-path-policy.ts',
  'content-rename-filesystem.ts',
  'managed-rename-coordinator.ts',
  'managed-rename-content.ts',
  'managed-rename-enumeration.ts',
  'managed-rename-asset-executor.ts',
  'managed-rename-document-executor.ts',
] as const;

function databaseExtractionLeaves(src: string): readonly string[] {
  return readdirSync(src)
    .filter(
      (entry) =>
        DATABASE_EXTRACTION_PATH.test(entry) &&
        !entry.endsWith('.test.ts') &&
        !DATABASE_FACADE_PATHS.includes(entry as (typeof DATABASE_FACADE_PATHS)[number]),
    )
    .sort();
}

describe('RFC 0011 server module boundary guard', () => {
  let fixtureRoot: string | undefined;

  afterEach(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  });

  test('current server boundaries exist and stay within their budgets', () => {
    const src = serverSourceRoot(import.meta.filename);
    assertModuleSizeBudgets(src, SERVER_MODULE_SIZE_BUDGETS);
  });

  test('database facade budgets equal their current split-line counts', () => {
    const src = serverSourceRoot(import.meta.filename);
    for (const path of DATABASE_FACADE_PATHS) {
      const budget = SERVER_MODULE_SIZE_BUDGETS.find((candidate) => candidate.path === path);
      if (!budget) throw new Error(`${path} budget must exist`);
      expect(moduleLineCount(resolveServerModule(src, budget.path))).toBe(budget.maxLines);
    }
  });

  test('api extension budget equals its current split-line count', () => {
    const src = serverSourceRoot(import.meta.filename);
    const budget = SERVER_MODULE_SIZE_BUDGETS.find(
      (candidate) => candidate.path === 'api-extension.ts',
    );
    if (!budget) throw new Error('api-extension.ts budget must exist');
    expect(moduleLineCount(resolveServerModule(src, budget.path))).toBe(budget.maxLines);
  });

  test('workspace search cache key boundary equals its current split-line count', () => {
    const src = serverSourceRoot(import.meta.filename);
    const budget = SERVER_MODULE_SIZE_BUDGETS.find(
      (candidate) => candidate.path === 'workspace-search-cache-key.ts',
    );
    if (!budget) throw new Error('workspace-search-cache-key.ts budget must exist');
    expect(moduleLineCount(resolveServerModule(src, budget.path))).toBe(budget.maxLines);
  });

  test('every extracted database server leaf has an exact size budget', () => {
    const src = serverSourceRoot(import.meta.filename);
    const leaves = databaseExtractionLeaves(src);
    const budgetedPaths = new Set(SERVER_MODULE_SIZE_BUDGETS.map(({ path }) => path));
    expect(leaves.length).toBe(45);
    for (const modulePath of leaves) {
      expect(budgetedPaths.has(modulePath), `${modulePath} must have a size budget`).toBe(true);
      const budget = SERVER_MODULE_SIZE_BUDGETS.find((candidate) => candidate.path === modulePath);
      if (!budget) throw new Error(`${modulePath} budget must exist`);
      expect(moduleLineCount(resolveServerModule(src, modulePath))).toBe(budget.maxLines);
    }
  });

  test('content leaves are budgeted and do not import the api extension facade', () => {
    const src = serverSourceRoot(import.meta.filename);
    const budgetedPaths = new Set(SERVER_MODULE_SIZE_BUDGETS.map(({ path }) => path));
    const apiExtensionImport = /\b(?:from|import)\s*(?:\(\s*)?['"][^'"]*api-extension[^'"]*['"]/;

    for (const modulePath of CONTENT_EXTRACTION_LEAVES) {
      expect(budgetedPaths.has(modulePath), `${modulePath} must have a size budget`).toBe(true);
      const source = readFileSync(resolveServerModule(src, modulePath), 'utf8');
      expect(source, `${modulePath} must not import api-extension.ts`).not.toMatch(
        apiExtensionImport,
      );
    }
  });

  test('database extraction leaves do not import former facades', () => {
    const src = serverSourceRoot(import.meta.filename);
    const actual = databaseExtractionLeaves(src).flatMap((modulePath) =>
      findFormerServerFacadeImports(
        modulePath,
        readFileSync(resolveServerModule(src, modulePath), 'utf8'),
      ),
    );
    expect(actual).toEqual([]);
  });

  test('database facade budgets reject one additional source line', () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'synapsenote-server-boundaries-'));
    const facadeBudgets = SERVER_MODULE_SIZE_BUDGETS.filter(({ path }) =>
      DATABASE_FACADE_PATHS.includes(path as (typeof DATABASE_FACADE_PATHS)[number]),
    );
    expect(facadeBudgets).toHaveLength(DATABASE_FACADE_PATHS.length);
    for (const budget of facadeBudgets) {
      const oversizedSource = `${'line\n'.repeat(budget.maxLines)}extra`;
      writeFileSync(join(fixtureRoot, budget.path), oversizedSource);
    }
    const root = fixtureRoot;
    if (!root) throw new Error('synthetic fixture root must exist');

    for (const budget of facadeBudgets) {
      expect(() => assertModuleSizeBudgets(root, [budget])).toThrow(
        `${budget.path} exceeds ${budget.maxLines} lines`,
      );
    }
  });

  test('reports a synthetic module that exceeds its line budget', () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'synapsenote-server-boundaries-'));
    writeFileSync(join(fixtureRoot, 'oversized.ts'), 'one\ntwo\n');
    const root = fixtureRoot;
    if (!root) throw new Error('synthetic fixture root must exist');

    expect(() =>
      assertModuleSizeBudgets(root, [
        { path: 'oversized.ts', maxLines: 2, owner: 'synthetic fixture' },
      ]),
    ).toThrow('oversized.ts exceeds 2 lines');
  });
});
