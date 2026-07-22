import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseTaskStore } from './database-task-store.ts';
import { createConceptEmbedder } from './embeddings/index.ts';
import { createServer } from './server-factory.ts';

const tempDirs: string[] = [];

function fixture(manifest: string): { projectDir: string; contentDir: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-startup-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  writeFileSync(join(projectDir, '.ok', 'databases', 'tasks.yml'), manifest, 'utf-8');
  tempDirs.push(projectDir);
  return { projectDir, contentDir };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function validManifest(): string {
  return serializeDatabaseManifestYaml(
    DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      contract: {
        purpose: 'Track tasks',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'tasks',
          properties: [
            { id: 'prop_tasks_title', key: 'title', name: 'Title', type: 'title' },
            {
              id: 'prop_tasks_status',
              key: 'status',
              name: 'Status',
              type: 'select',
              options: [
                { id: 'opt_todo', key: 'todo', name: 'Todo' },
                { id: 'opt_done', key: 'done', name: 'Done' },
              ],
            },
          ],
        },
      ],
    }),
  );
}

async function eventually(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await Bun.sleep(50);
  }
  throw new Error('Timed out waiting for live database state');
}

function validRecord(title: string, status: 'todo' | 'done'): string {
  return `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_task\ntitle: ${title}\nstatus: ${status}\n---\nBody\n`;
}

describe('createServer database manifest startup discovery', () => {
  test('recovers orphaned running database tasks before ready resolves', async () => {
    const { projectDir, contentDir } = fixture(validManifest());
    const preRestart = createDatabaseTaskStore({ projectDir });
    const queued = await preRestart.create({ operation: 'migration' });
    await preRestart.start(queued.id, queued.revision);

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
      expect(await server.databaseTaskStore.get(queued.id)).toMatchObject({
        state: 'failed',
        cancellable: false,
        problem: { code: 'task_interrupted', retryable: true },
      });
      expect(server.degraded).not.toContain('database-task-store');
    } finally {
      await server.destroy();
    }
  });

  test('loads valid manifests before ready resolves', async () => {
    const { projectDir, contentDir } = fixture(validManifest());
    mkdirSync(join(contentDir, 'tasks'), { recursive: true });
    writeFileSync(join(contentDir, 'tasks', 'task.md'), validRecord('Initial', 'todo'), 'utf-8');
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
      expect(server.databaseStore.list()).toEqual([
        expect.objectContaining({ id: 'db_tasks', key: 'tasks' }),
      ]);
      expect(server.databaseStore.snapshot().diagnostics).toEqual([]);
      expect(server.databaseRecordIndex.getById('rec_task')).toMatchObject({
        path: 'tasks/task.md',
        values: { prop_tasks_title: 'Initial', prop_tasks_status: 'opt_todo' },
      });
      expect(server.databaseDataPlane.catalog('task').candidates).toEqual([
        expect.objectContaining({ id: 'db_tasks', key: 'tasks' }),
      ]);
      expect(server.degraded).not.toContain('database-store');
    } finally {
      await server.destroy();
    }
  });

  test('keeps the server available but marks invalid manifests as degraded', async () => {
    const { projectDir, contentDir } = fixture('version: [');
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
      expect(server.databaseStore.list()).toEqual([]);
      expect(server.databaseStore.snapshot().diagnostics).toEqual([
        expect.objectContaining({
          code: 'invalid_manifest',
          file: 'tasks.yml',
          manifestCode: 'yaml_parse_error',
          line: 1,
        }),
      ]);
      expect(server.degraded).toContain('database-store');
    } finally {
      await server.destroy();
    }
  });

  test('reloads edited and deleted manifests into the live record index', async () => {
    const { projectDir, contentDir } = fixture(validManifest());
    mkdirSync(join(contentDir, 'tasks'), { recursive: true });
    writeFileSync(join(contentDir, 'tasks', 'task.md'), validRecord('Initial', 'todo'), 'utf-8');
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
      const initialRevision = server.databaseStore.snapshot().revision;
      const current = server.databaseStore.getById('db_tasks');
      if (!current) throw new Error('Expected startup database');
      const edited = DatabaseDefinitionSchema.parse({
        ...current,
        name: 'Renamed Tasks',
      });
      const manifestPath = join(projectDir, '.ok', 'databases', 'tasks.yml');
      writeFileSync(manifestPath, serializeDatabaseManifestYaml(edited), 'utf-8');

      await eventually(
        () =>
          server.databaseStore.getById('db_tasks')?.name === 'Renamed Tasks' &&
          server.databaseRecordIndex.snapshot().manifestRevision ===
            server.databaseStore.snapshot().revision,
      );
      expect(server.databaseStore.snapshot().revision).not.toBe(initialRevision);
      expect(server.databaseRecordIndex.getById('rec_task')).not.toBeNull();

      rmSync(manifestPath);
      await eventually(
        () =>
          server.databaseStore.list().length === 0 &&
          server.databaseRecordIndex.list().length === 0,
      );
      expect(server.databaseRecordIndex.snapshot().manifestRevision).toBe(
        server.databaseStore.snapshot().revision,
      );
    } finally {
      await server.destroy();
    }
  }, 20_000);

  test('wires project-local semantic consent into lazy database retrieval', async () => {
    const { projectDir, contentDir } = fixture(validManifest());
    mkdirSync(join(contentDir, 'tasks'), { recursive: true });
    mkdirSync(join(projectDir, '.ok', 'local'), { recursive: true });
    writeFileSync(join(contentDir, 'tasks', 'task.md'), validRecord('Retry login', 'todo'));
    writeFileSync(
      join(projectDir, '.ok', 'local', 'config.yml'),
      'search:\n  semantic:\n    enabled: true\n',
    );
    const server = createServer({
      projectDir,
      contentDir,
      gitEnabled: false,
      quiet: true,
      skipStateManifestCheck: true,
      destroyTimeoutMs: 500,
      configHomedirOverride: projectDir,
      embedderLoader: () =>
        Promise.resolve(
          createConceptEmbedder({
            concepts: [{ id: 'retry', terms: ['retry', 'login', 'task'] }],
          }),
        ),
    });

    try {
      await server.ready;
      expect(
        server.databaseDataPlane.semanticIndexStatus({
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
        }),
      ).toMatchObject({
        state: 'stale',
        privacy: 'remote_allowed',
        propertyIds: ['prop_tasks_title'],
      });
      const result = await server.databaseDataPlane.retrieve({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'retry task',
        mode: 'semantic',
        propertyIds: ['prop_tasks_title'],
      });
      expect(result).toMatchObject({
        requestedMode: 'semantic',
        appliedMode: 'semantic',
        degradedReason: null,
        semanticIndex: {
          state: 'ready',
          privacy: 'remote_allowed',
          indexedRecords: 1,
          propertyIds: ['prop_tasks_title'],
        },
        ranking: { hits: [{ recordId: 'rec_task' }] },
      });
    } finally {
      await server.destroy();
    }
  });
});
