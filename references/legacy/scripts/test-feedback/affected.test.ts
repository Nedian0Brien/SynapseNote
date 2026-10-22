import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeAffectedPlan, domainsForFiles, readChangedFiles } from './affected.ts';

describe('affected feedback plan', () => {
  test('keeps an app-only editor change at the app package and editor domain', () => {
    const plan = computeAffectedPlan(['packages/app/src/editor/TiptapEditor.tsx']);

    expect(plan.repository).toBe(false);
    expect(plan.packages).toContain('app');
    expect(plan.domains).toContain('editor');
    expect(plan.packages).not.toContain('server');
  });

  test('promotes root configuration changes to the repository gate', () => {
    const plan = computeAffectedPlan(['turbo.json']);

    expect(plan.repository).toBe(true);
    expect(plan.packages).toEqual([]);
    expect(plan.domains).toEqual([]);
  });

  test('promotes unsupported workspace packages instead of silently skipping them', () => {
    const plan = computeAffectedPlan(['packages/native-config/src/lib.rs']);

    expect(plan.repository).toBe(true);
    expect(plan.reasons.some((reason) => reason.includes('native-config'))).toBe(true);
  });

  test('limits documentation-only changes to the documentation tier', () => {
    const plan = computeAffectedPlan(['docs/content/guide.mdx', 'README.md']);

    expect(plan.repository).toBe(false);
    expect(plan.docsOnly).toBe(true);
    expect(plan.packages).toEqual([]);
  });

  test('does not narrow unknown paths', () => {
    const plan = computeAffectedPlan(['random-generated-output.txt']);

    expect(plan.repository).toBe(true);
    expect(plan.reasons.some((reason) => reason.includes('outside a known'))).toBe(true);
  });

  test('maps contract and startup paths to their domain gates', () => {
    expect(
      domainsForFiles([
        'packages/core/src/schemas/api.type-tests.ts',
        'packages/server/src/server-factory.ts',
      ]),
    ).toEqual(['contract', 'server-startup']);
  });

  test('promotes a core schema change to every direct consumer in the workspace graph', () => {
    const plan = computeAffectedPlan(['packages/core/src/schemas/api.type-tests.ts']);

    expect(plan.repository).toBe(false);
    expect(plan.domains).toContain('contract');
    expect(plan.packages).toEqual(['app', 'cli', 'core', 'desktop', 'server']);
  });

  test('reads a real Git diff fixture instead of treating a zero-test selection as success', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'synapsenote-affected-fixture-'));
    mkdirSync(join(fixture, 'packages/app/src/editor'), { recursive: true });
    mkdirSync(join(fixture, 'packages/core'), { recursive: true });
    mkdirSync(join(fixture, 'packages/server'), { recursive: true });
    mkdirSync(join(fixture, 'packages/cli'), { recursive: true });
    mkdirSync(join(fixture, 'packages/desktop'), { recursive: true });
    mkdirSync(join(fixture, 'docs'), { recursive: true });
    writeFileSync(
      join(fixture, 'packages/app/package.json'),
      JSON.stringify({ name: '@fixture/app', scripts: {} }),
    );
    for (const key of ['core', 'server', 'cli', 'desktop']) {
      writeFileSync(
        join(fixture, `packages/${key}/package.json`),
        JSON.stringify({ name: `@fixture/${key}` }),
      );
    }
    writeFileSync(join(fixture, 'docs/package.json'), JSON.stringify({ name: '@fixture/docs' }));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: fixture });
    execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: fixture });
    writeFileSync(
      join(fixture, 'packages/app/src/editor/fixture.ts'),
      'export const fixture = true;\n',
    );
    execFileSync('git', ['add', '.'], { cwd: fixture });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: fixture });
    writeFileSync(
      join(fixture, 'packages/app/src/editor/changed.ts'),
      'export const changed = true;\n',
    );

    expect(readChangedFiles({ pr: false }, fixture)).toEqual([
      'packages/app/src/editor/changed.ts',
    ]);
    expect(computeAffectedPlan(['packages/app/src/editor/changed.ts'], fixture).packages).toEqual([
      'app',
    ]);
  });
});
