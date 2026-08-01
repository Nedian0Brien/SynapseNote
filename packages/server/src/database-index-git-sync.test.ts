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

function v2Manifest(scope: 'main' | 'feature'): string {
  return serializeDatabaseManifestYaml(
    DatabaseDefinitionSchema.parse({
      version: 2,
      id: `db_v2_${scope}`,
      key: 'tasks-v2',
      name: `${scope} v2 Tasks`,
      contract: {
        purpose: `Track ${scope} v2 tasks`,
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: `ds_v2_${scope}`,
          key: 'tasks',
          name: `${scope} v2 Tasks`,
          recordMeaning: 'One task',
          folder: 'tasks',
          storage: {
            kind: 'markdown_table',
            formatVersion: 2,
            owner: { path: 'tasks-v2.md', blockId: `dbb_v2_${scope}` },
            titlePropertyId: 'prop_v2_title',
            storedPropertyIds: ['prop_v2_title'],
          },
          properties: [{ id: 'prop_v2_title', key: 'title', name: 'Title', type: 'title' }],
        },
      ],
    }),
  );
}

function v2Owner(scope: 'main' | 'feature'): string {
  return [
    '<!-- synapsenote:database',
    'version=2',
    `database=db_v2_${scope}`,
    `source=ds_v2_${scope}`,
    `block=dbb_v2_${scope}`,
    'columns=prop_v2_title',
    '-->',
    '',
    '| Title |',
    '| --- |',
    `| [[tasks-v2-${scope}/task\\|${scope} task]] |`,
    '',
  ].join('\n');
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

  test('rebuilds v2 owners and linked documents after a branch checkout without stale cache', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-git-sync-v2-'));
    const contentDir = join(projectDir, 'content');
    const manifestPath = join(projectDir, '.ok', 'databases', 'tasks-v2.yml');
    const ownerPath = join(contentDir, 'tasks-v2.md');
    const mainDocumentDir = join(contentDir, 'tasks-v2-main');
    mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
    mkdirSync(mainDocumentDir, { recursive: true });
    tempDirs.push(projectDir);

    git(projectDir, 'init', '--initial-branch=main');
    git(projectDir, 'config', 'user.name', 'Database Test');
    git(projectDir, 'config', 'user.email', 'database-test@example.invalid');
    writeFileSync(manifestPath, v2Manifest('main'));
    writeFileSync(ownerPath, v2Owner('main'));
    writeFileSync(
      join(mainDocumentDir, 'task.md'),
      '---\n_sn:\n  document_id: doc_v2_main\n---\n# Main task\n',
    );
    git(projectDir, 'add', '.');
    git(projectDir, 'commit', '-m', 'main v2 database');
    git(projectDir, 'checkout', '-b', 'feature');
    writeFileSync(manifestPath, v2Manifest('feature'));
    writeFileSync(ownerPath, v2Owner('feature'));
    mkdirSync(join(contentDir, 'tasks-v2-feature'), { recursive: true });
    writeFileSync(
      join(contentDir, 'tasks-v2-feature', 'task.md'),
      '---\n_sn:\n  document_id: doc_v2_feature\n---\n# Feature task\n',
    );
    rmSync(mainDocumentDir, { recursive: true, force: true });
    git(projectDir, 'add', '.');
    git(projectDir, 'commit', '-m', 'feature v2 database');
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
      expect(server.databaseStore.getById('db_v2_main')).not.toBeNull();
      expect(server.databaseRecordIndex.list('db_v2_main')).toHaveLength(1);
      git(projectDir, 'checkout', 'feature');
      await eventually(
        () =>
          server.databaseStore.getById('db_v2_feature') !== null &&
          server.databaseRecordIndex.list('db_v2_feature').length === 1 &&
          server.databaseRecordIndex.status().state === 'idle',
      );
      expect(server.databaseStore.getById('db_v2_main')).toBeNull();
      expect(server.databaseRecordIndex.list('db_v2_main')).toHaveLength(0);
      expect(server.databaseRecordIndex.list('db_v2_feature')[0]?.path).toBe(
        'tasks-v2-feature/task.md',
      );
    } finally {
      await server.destroy();
    }
  }, 30_000);
});
