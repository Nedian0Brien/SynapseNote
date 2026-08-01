import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertModuleSizeBudgets,
  moduleLineCount,
  resolveServerModule,
  SERVER_MODULE_SIZE_BUDGETS,
  serverSourceRoot,
} from './module-boundaries.ts';

const SERVER_EXTRACTION_LEAVES = [
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

  test('new server leaves are budgeted and do not import the api extension facade', () => {
    const src = serverSourceRoot(import.meta.filename);
    const budgetedPaths = new Set(SERVER_MODULE_SIZE_BUDGETS.map(({ path }) => path));
    const apiExtensionImport = /\b(?:from|import)\s*(?:\(\s*)?['"][^'"]*api-extension[^'"]*['"]/;

    for (const modulePath of SERVER_EXTRACTION_LEAVES) {
      expect(budgetedPaths.has(modulePath), `${modulePath} must have a size budget`).toBe(true);
      const source = readFileSync(resolveServerModule(src, modulePath), 'utf8');
      expect(source, `${modulePath} must not import api-extension.ts`).not.toMatch(
        apiExtensionImport,
      );
    }
  });

  test('api extension budget rejects one additional source line', () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'synapsenote-server-boundaries-'));
    const apiBudget = SERVER_MODULE_SIZE_BUDGETS.find(
      (candidate) => candidate.path === 'api-extension.ts',
    );
    if (!apiBudget) throw new Error('api-extension.ts budget must exist');

    const oversizedSource = `${'line\n'.repeat(apiBudget.maxLines)}extra`;
    writeFileSync(join(fixtureRoot, apiBudget.path), oversizedSource);
    const root = fixtureRoot;
    if (!root) throw new Error('synthetic fixture root must exist');

    expect(() => assertModuleSizeBudgets(root, [apiBudget])).toThrow(
      `api-extension.ts exceeds ${apiBudget.maxLines} lines`,
    );
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
