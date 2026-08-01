import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertModuleSizeBudgets,
  moduleLineCount,
  resolveServerModule,
  SERVER_MODULE_SIZE_BUDGETS,
  serverSourceRoot,
} from './module-boundaries.ts';

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
