import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from './command.ts';

type TurboTask = {
  cache?: boolean;
  env?: string[];
  inputs?: string[];
};

function readJson(path: string): { tasks: Record<string, TurboTask> } {
  return JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as {
    tasks: Record<string, TurboTask>;
  };
}

describe('Turbo feedback task contract', () => {
  test('declares focused inputs and keeps resource-sensitive tasks uncached', () => {
    const root = readJson('turbo.json');
    for (const task of ['test:unit', 'test:database', 'test:contract']) {
      expect(root.tasks[task]?.inputs?.length, `${task} needs explicit inputs`).toBeGreaterThan(0);
      expect(root.tasks[task]?.cache, `${task} should be cacheable`).toBe(true);
    }
    for (const task of ['test:filesystem', 'test:git', 'test:process']) {
      expect(root.tasks[task]?.cache, `${task} must not be cached`).toBe(false);
    }
    expect(root.tasks['test:unit']?.inputs).toContain('../../scripts/test-feedback/**/*.ts');
    expect(root.tasks['test:unit']?.env).toContain('TEST_FEEDBACK_TIER');
  });

  test('the aggregate server test task cannot hide process-sensitive results in cache', () => {
    const server = readJson('packages/server/turbo.json');
    expect(server.tasks.test.cache).toBe(false);
  });

  test('high-load repository checks use bounded concurrency', () => {
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['check:repository']).not.toContain('--concurrency=100%');
    expect(packageJson.scripts['check:repository']).toContain('--summarize');
    expect(packageJson.scripts['check:full:parallel']).toContain('--concurrency=4');
    expect(readFileSync(join(repositoryRoot, 'scripts/check-package.ts'), 'utf8')).toContain(
      "'--summarize'",
    );
    expect(readFileSync(join(repositoryRoot, 'scripts/check-package.ts'), 'utf8')).toContain(
      "process.env.TEST_FEEDBACK_TIER === 'pr' && packageKey === 'app'",
    );
    expect(readFileSync(join(repositoryRoot, 'scripts/check-package.ts'), 'utf8')).toContain(
      "['test:integration:shard1', 'test:integration:shard2']",
    );
  });
});
