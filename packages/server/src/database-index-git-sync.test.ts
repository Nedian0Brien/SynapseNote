import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createServer } from './server-factory.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(projectDir: string, ...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: projectDir,
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function manifest(scope: 'main' | 'feature'): string {
  return serializeDatabaseManifestYaml(
    DatabaseDefinitionSchema.parse({
      version: 1,
      id: `db_${scope}`,
      key: 'tasks',
      name: `${scope} Tasks`,
      contract: {
        purpose: `Track ${scope} tasks`,
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: `ds_${scope}`,
          key: 'tasks',
          name: `${scope} Tasks`,
          recordMeaning: 'One task',
          folder: 'tasks',
          properties: [{ id: `prop_${scope}_title`, key: 'title', name: 'Title', type: 'title' }],
        },
      ],
    }),
  );
}

function record(scope: 'main' | 'feature'): string {
  return `---\n_sn:\n  database_id: db_${scope}\n  source_id: ds_${scope}\n  record_id: rec_${scope}\ntitle: ${scope} record\n---\nBody\n`;
}

async function eventually(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await Bun.sleep(50);
  }
  throw new Error('Timed out waiting for database branch refresh');
}

describe('database index Git synchronization', () => {
  test('replaces manifests and records atomically after a cross-branch checkout', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-git-sync-'));
    const contentDir = join(projectDir, 'content');
    const manifestPath = join(projectDir, '.ok', 'databases', 'tasks.yml');
    const recordPath = join(contentDir, 'tasks', 'task.md');
    mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
    mkdirSync(join(contentDir, 'tasks'), { recursive: true });
    tempDirs.push(projectDir);

    git(projectDir, 'init', '--initial-branch=main');
    git(projectDir, 'config', 'user.name', 'Database Test');
    git(projectDir, 'config', 'user.email', 'database-test@example.invalid');
    writeFileSync(manifestPath, manifest('main'));
    writeFileSync(recordPath, record('main'));
    git(projectDir, 'add', '.');
    git(projectDir, 'commit', '-m', 'main database');
    git(projectDir, 'checkout', '-b', 'feature');
    writeFileSync(manifestPath, manifest('feature'));
    writeFileSync(recordPath, record('feature'));
    git(projectDir, 'add', '.');
    git(projectDir, 'commit', '-m', 'feature database');
    git(projectDir, 'checkout', 'main');

    const server = createServer({
      projectDir,
      contentDir,
      gitEnabled: false,
      quiet: true,
      skipStateManifestCheck: true,
      destroyTimeoutMs: 500,
      configHomedirOverride: projectDir,
    });

    try {
      await server.ready;
      expect(server.databaseStore.getById('db_main')).not.toBeNull();
      expect(server.databaseRecordIndex.getById('rec_main')).not.toBeNull();

      git(projectDir, 'checkout', 'feature');
      await eventually(
        () =>
          server.databaseStore.getById('db_feature') !== null &&
          server.databaseRecordIndex.getById('rec_feature') !== null &&
          server.databaseRecordIndex.status().state === 'idle',
      );

      expect(server.databaseStore.getById('db_main')).toBeNull();
      expect(server.databaseRecordIndex.getById('rec_main')).toBeNull();
      expect(server.databaseRecordIndex.snapshot().manifestRevision).toBe(
        server.databaseStore.snapshot().revision,
      );

      git(projectDir, 'checkout', 'main');
      await eventually(
        () =>
          server.databaseStore.getById('db_main') !== null &&
          server.databaseRecordIndex.getById('rec_main') !== null &&
          server.databaseRecordIndex.status().state === 'idle',
      );
      expect(server.databaseStore.getById('db_feature')).toBeNull();
      expect(server.databaseRecordIndex.getById('rec_feature')).toBeNull();
      expect(server.databaseStore.getByKey('tasks')).toMatchObject({
        id: 'db_main',
        sources: [{ id: 'ds_main', properties: [{ id: 'prop_main_title' }] }],
      });
    } finally {
      await server.destroy();
    }
  }, 30_000);
});
