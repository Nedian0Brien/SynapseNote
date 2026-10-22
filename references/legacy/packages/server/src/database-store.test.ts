import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  parseDatabaseManifestYaml,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseStore, DatabaseStoreError } from './database-store.ts';

const tempDirs: string[] = [];

function tempProject(): { projectDir: string; contentDir: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-store-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  return { projectDir, contentDir };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function definition(
  key = 'notes',
  id = `db_${key.replaceAll('-', '_')}`,
  folder = 'notes',
): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id,
    key,
    name: key,
    contract: {
      purpose: `Track ${key}`,
      canonicality: 'canonical',
      vocabulary: [key],
      freshness: { expectation: 'manual' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: `ds_${key.replaceAll('-', '_')}`,
        key,
        name: key,
        recordMeaning: 'One note',
        folder,
        properties: [
          {
            id: `prop_${key.replaceAll('-', '_')}_title`,
            key: 'title',
            name: 'Title',
            type: 'title',
          },
        ],
      },
    ],
  });
}

function writeManifest(projectDir: string, file: string, value: DatabaseDefinition | string): void {
  const databaseDir = join(projectDir, '.ok', 'databases');
  mkdirSync(databaseDir, { recursive: true });
  writeFileSync(
    join(databaseDir, file),
    typeof value === 'string' ? value : serializeDatabaseManifestYaml(value),
    'utf-8',
  );
}

describe('DatabaseStore discovery', () => {
  test('loads valid manifests, reports invalid entries, and never exposes absolute paths', async () => {
    const { projectDir, contentDir } = tempProject();
    writeManifest(projectDir, 'good.yml', definition('good', 'db_good', 'good'));
    writeManifest(projectDir, 'broken.yml', 'version: [');
    writeManifest(projectDir, 'wrong-file.yml', definition('different', 'db_different'));
    writeManifest(projectDir, 'duplicate-a.yml', definition('duplicate-a', 'db_duplicate'));
    writeManifest(projectDir, 'duplicate-b.yml', definition('duplicate-b', 'db_duplicate'));
    const symlinkTarget = join(projectDir, 'outside.yml');
    writeFileSync(symlinkTarget, serializeDatabaseManifestYaml(definition('linked')), 'utf-8');
    symlinkSync(symlinkTarget, join(projectDir, '.ok', 'databases', 'linked.yml'));

    const store = createDatabaseStore({ projectDir, contentDir });
    const snapshot = await store.reload();

    expect(snapshot.databases.map((database) => database.id)).toEqual(['db_good']);
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'invalid_manifest',
        'filename_key_mismatch',
        'duplicate_database_id',
        'manifest_symlink',
      ]),
    );
    expect(snapshot.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot)).not.toContain(projectDir);
    expect(snapshot.diagnostics.every((diagnostic) => diagnostic.file.endsWith('.yml'))).toBe(true);
  });

  test('returns an empty snapshot without creating metadata directories', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    const snapshot = await store.reload();

    expect(snapshot).toMatchObject({
      databases: [],
      diagnostics: [],
      revision: 'sha256:empty',
    });
    expect(existsSync(join(projectDir, '.ok', 'databases'))).toBe(false);
  });

  test('removes every ambiguous database when IDs collide across files', async () => {
    const { projectDir, contentDir } = tempProject();
    writeManifest(projectDir, 'alpha.yml', definition('alpha', 'db_shared'));
    writeManifest(projectDir, 'beta.yml', definition('beta', 'db_shared'));

    const snapshot = await createDatabaseStore({ projectDir, contentDir }).reload();
    expect(snapshot.databases).toEqual([]);
    expect(
      snapshot.diagnostics.filter((diagnostic) => diagnostic.code === 'duplicate_database_id'),
    ).toHaveLength(2);
  });
});

describe('DatabaseStore manifest CRUD', () => {
  test('creates, updates, renames, deletes, and survives a fresh store instance', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });

    const created = await store.create(definition());
    expect(created.id).toBe('db_notes');
    expect(existsSync(join(projectDir, '.ok', 'databases', 'notes.yml'))).toBe(true);

    const updated = await store.update('db_notes', { ...created, name: 'Updated notes' });
    expect(updated.name).toBe('Updated notes');

    const staleTmp = join(projectDir, '.ok', 'databases', 'notes.yml.tmp.crashed-writer');
    writeFileSync(staleTmp, 'stale', 'utf-8');
    const old = new Date(Date.now() - 60_000);
    utimesSync(staleTmp, old, old);
    await store.update('db_notes', { ...updated, description: 'After stale sweep' });
    expect(existsSync(staleTmp)).toBe(false);

    const renamed = await store.renameKey('db_notes', 'knowledge-notes');
    expect(renamed.key).toBe('knowledge-notes');
    expect(existsSync(join(projectDir, '.ok', 'databases', 'notes.yml'))).toBe(false);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'knowledge-notes.yml'))).toBe(true);

    const restarted = createDatabaseStore({ projectDir, contentDir });
    await restarted.reload();
    expect(restarted.getById('db_notes')).toMatchObject({
      key: 'knowledge-notes',
      name: 'Updated notes',
      description: 'After stale sweep',
    });

    const deleted = await restarted.delete('db_notes');
    expect(deleted.id).toBe('db_notes');
    expect(restarted.list()).toEqual([]);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'knowledge-notes.yml'))).toBe(false);
  });

  test('preserves manifest comments and source order across update and key rename', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    const created = await store.create(definition());
    const originalPath = join(projectDir, '.ok', 'databases', 'notes.yml');
    const annotated = readFileSync(originalPath, 'utf-8')
      .replace('version: 1\n', '# maintained by the knowledge team\nversion: 1\n')
      .replace('name: notes\n', 'name: "notes" # human label\n')
      .replace('  - id: ds_notes\n', '  # primary source\n  - id: ds_notes\n');
    writeFileSync(originalPath, annotated, 'utf-8');
    await store.reload();

    await store.update('db_notes', { ...created, name: 'Team notes' });
    await store.renameKey('db_notes', 'team-notes');

    const renamed = readFileSync(join(projectDir, '.ok', 'databases', 'team-notes.yml'), 'utf-8');
    expect(renamed).toStartWith('# maintained by the knowledge team\nversion: 1\n');
    expect(renamed).toContain('name: "Team notes" # human label');
    expect(renamed).toContain('# primary source\n  - id: ds_notes');
    expect(renamed.indexOf('version:')).toBeLessThan(renamed.indexOf('\nid:'));
    expect(renamed.indexOf('\nid:')).toBeLessThan(renamed.indexOf('\nkey:'));
    expect(parseDatabaseManifestYaml(renamed)).toMatchObject({
      ok: true,
      definition: { key: 'team-notes', name: 'Team notes' },
    });
  });

  test('serializes concurrent creators with a cross-process file lock', async () => {
    const { projectDir, contentDir } = tempProject();
    const first = createDatabaseStore({ projectDir, contentDir });
    const second = createDatabaseStore({ projectDir, contentDir });

    const results = await Promise.allSettled([
      first.create(definition()),
      second.create(definition()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(DatabaseStoreError);
      expect((rejected.reason as DatabaseStoreError).code).toBe('conflict');
    }

    const snapshot = await createDatabaseStore({ projectDir, contentDir }).reload();
    expect(snapshot.databases).toHaveLength(1);
    expect(snapshot.diagnostics).toEqual([]);
  });

  test('rolls back manifest content when the rename syscall fails', async () => {
    const { projectDir, contentDir } = tempProject();
    const initial = createDatabaseStore({ projectDir, contentDir });
    await initial.create(definition());

    const failing = createDatabaseStore({
      projectDir,
      contentDir,
      fs: {
        rename: async () => {
          throw Object.assign(new Error('injected rename failure'), { code: 'EIO' });
        },
      },
    });
    await expect(failing.renameKey('db_notes', 'renamed')).rejects.toMatchObject({
      code: 'io_error',
    });

    const original = parseDatabaseManifestYaml(
      readFileSync(join(projectDir, '.ok', 'databases', 'notes.yml'), 'utf-8'),
    );
    expect(original).toMatchObject({ ok: true, definition: { key: 'notes' } });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'renamed.yml'))).toBe(false);
  });

  test('does not damage an existing manifest when an atomic write fails', async () => {
    const { projectDir, contentDir } = tempProject();
    const initial = createDatabaseStore({ projectDir, contentDir });
    const created = await initial.create(definition());
    const manifestPath = join(projectDir, '.ok', 'databases', 'notes.yml');
    const before = readFileSync(manifestPath, 'utf-8');

    const failing = createDatabaseStore({
      projectDir,
      contentDir,
      fs: {
        atomic: {
          writeFile: async () => {
            throw Object.assign(new Error('injected write failure'), { code: 'ENOSPC' });
          },
          rename: async () => {
            throw new Error('rename must not be called');
          },
        },
      },
    });
    await expect(
      failing.update('db_notes', { ...created, name: 'Must not persist' }),
    ).rejects.toMatchObject({ code: 'io_error' });
    expect(readFileSync(manifestPath, 'utf-8')).toBe(before);
  });

  test('recovers after temporary manifest read permission loss', async () => {
    const { projectDir, contentDir } = tempProject();
    await createDatabaseStore({ projectDir, contentDir }).create(definition());
    let denied = true;
    const recovering = createDatabaseStore({
      projectDir,
      contentDir,
      fs: {
        readFile: async (path) => {
          if (denied) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
          return readFileSync(path, 'utf8');
        },
      },
    });

    await expect(recovering.reload()).resolves.toMatchObject({
      databases: [],
      diagnostics: [expect.objectContaining({ code: 'unreadable_manifest', file: 'notes.yml' })],
    });
    denied = false;
    await expect(recovering.reload()).resolves.toMatchObject({
      databases: [expect.objectContaining({ id: 'db_notes' })],
      diagnostics: [],
    });
  });

  test('refuses writes while any manifest diagnostic is unresolved', async () => {
    const { projectDir, contentDir } = tempProject();
    writeManifest(projectDir, 'broken.yml', 'version: [');
    const store = createDatabaseStore({ projectDir, contentDir });

    await expect(store.create(definition())).rejects.toMatchObject({ code: 'store_invalid' });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'notes.yml'))).toBe(false);
  });
});

describe('DatabaseStore source onboarding preview', () => {
  test('classifies existing files deterministically without changing any bytes', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const notesDir = join(contentDir, 'notes');
    mkdirSync(join(notesDir, 'sub'), { recursive: true });

    const fixtures: Record<string, string> = {
      'asset.png': 'not really a png',
      'invalid.md': '---\ntitle: 42\n---\nBody\n',
      'malformed.md': '---\ntitle: [\n---\nBody\n',
      'missing-title.md': 'Body without frontmatter\n',
      'new.md': '---\ntitle: New\n---\nBody\n',
      'ready.md':
        '---\ntitle: Ready\n_sn:\n  database_id: db_notes\n  source_id: ds_notes\n  record_id: rec_ready\n---\nBody\n',
      'sub/nested.mdx': '---\ntitle: Nested\n---\n# Nested\n',
    };
    for (const [path, contents] of Object.entries(fixtures)) {
      writeFileSync(join(notesDir, path), contents, 'utf-8');
    }
    const outside = join(projectDir, 'outside.md');
    writeFileSync(outside, '# outside\n', 'utf-8');
    symlinkSync(outside, join(notesDir, 'linked.md'));

    const preview = await store.previewSourceOnboarding({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
    });

    expect(preview.complete).toBe(true);
    expect(preview.summary).toEqual({ include: 1, exclude: 1, modify: 3, reject: 3 });
    expect(Object.fromEntries(preview.items.map((item) => [item.path, item.action]))).toEqual({
      'notes/asset.png': 'exclude',
      'notes/invalid.md': 'reject',
      'notes/linked.md': 'reject',
      'notes/malformed.md': 'reject',
      'notes/missing-title.md': 'modify',
      'notes/new.md': 'modify',
      'notes/ready.md': 'include',
      'notes/sub/nested.mdx': 'modify',
    });
    expect(preview.items.find((item) => item.path === 'notes/missing-title.md')).toMatchObject({
      plannedChanges: [
        { type: 'assign_record_id' },
        {
          type: 'provide_required_property',
          propertyId: 'prop_notes_title',
          propertyKey: 'title',
        },
      ],
    });
    expect(JSON.stringify(preview)).not.toContain(projectDir);
    for (const [path, contents] of Object.entries(fixtures)) {
      expect(readFileSync(join(notesDir, path), 'utf-8')).toBe(contents);
    }
  });

  test('shows excluded nested records and reports an explicit entry limit', async () => {
    const { projectDir, contentDir } = tempProject();
    const noSubfolders = DatabaseDefinitionSchema.parse({
      ...definition(),
      sources: [{ ...definition().sources[0], includeSubfolders: false }],
    });
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(noSubfolders);
    mkdirSync(join(contentDir, 'notes', 'sub'), { recursive: true });
    writeFileSync(join(contentDir, 'notes', 'alpha.md'), '---\ntitle: Alpha\n---\n', 'utf-8');
    writeFileSync(join(contentDir, 'notes', 'beta.md'), '---\ntitle: Beta\n---\n', 'utf-8');
    writeFileSync(
      join(contentDir, 'notes', 'sub', 'nested.md'),
      '---\ntitle: Nested\n---\n',
      'utf-8',
    );

    const full = await store.previewSourceOnboarding({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
    });
    expect(full.items.find((item) => item.path === 'notes/sub/nested.md')).toMatchObject({
      action: 'exclude',
      reasons: [{ code: 'subfolder_excluded' }],
    });

    const limited = await store.previewSourceOnboarding({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      maxEntries: 2,
    });
    expect(limited.complete).toBe(false);
    expect(limited.entryLimit).toBe(2);
    expect(limited.items.map((item) => item.path)).toEqual(['notes/alpha.md', 'notes/beta.md']);
  });

  test('refuses a source root symlink before scanning outside content', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const outside = join(projectDir, 'outside-folder');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.md'), 'secret\n', 'utf-8');
    symlinkSync(outside, join(contentDir, 'notes'));

    await expect(
      store.previewSourceOnboarding({ databaseId: 'db_notes', sourceId: 'ds_notes' }),
    ).rejects.toMatchObject({ code: 'record_symlink', details: { sourceFolder: 'notes' } });
  });
});

describe('DatabaseStore record identity assignment', () => {
  test('assigns once, preserves bytes and file mode, and is idempotent', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({
      projectDir,
      contentDir,
      generateUuid: () => '018f7f3d-90ab-7ccd-8123-456789abcdef',
    });
    await store.create(definition());
    const notesDir = join(contentDir, 'notes');
    mkdirSync(notesDir, { recursive: true });
    const recordPath = join(notesDir, 'entry.md');
    const original = '---\r\n# comment\r\ntitle: "Quoted"\r\n---\r\nBody  \r\n';
    writeFileSync(recordPath, original, 'utf-8');
    chmodSync(recordPath, 0o600);

    const assigned = await store.assignRecordId({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordPath: 'notes/entry.md',
    });
    expect(assigned).toEqual({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordPath: 'notes/entry.md',
      recordId: 'rec_018f7f3d90ab7ccd8123456789abcdef',
      changed: true,
    });
    const written = readFileSync(recordPath, 'utf-8');
    expect(written).toContain('# comment\r\ntitle: "Quoted"\r\n_sn:\r\n');
    expect(written.endsWith('---\r\nBody  \r\n')).toBe(true);
    expect(statSync(recordPath).mode & 0o777).toBe(0o600);

    const repeated = await store.assignRecordId({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordPath: 'notes/entry.md',
    });
    expect(repeated).toMatchObject({ changed: false, recordId: assigned.recordId });
    expect(readFileSync(recordPath, 'utf-8')).toBe(written);
  });

  test('serializes concurrent assignment and returns the same identity', async () => {
    const { projectDir, contentDir } = tempProject();
    const setup = createDatabaseStore({ projectDir, contentDir });
    await setup.create(definition());
    mkdirSync(join(contentDir, 'notes'), { recursive: true });
    writeFileSync(join(contentDir, 'notes', 'same.md'), 'title body\n', 'utf-8');

    const first = createDatabaseStore({
      projectDir,
      contentDir,
      generateUuid: () => '018f7f3d-90ab-7ccd-8123-456789abcdef',
    });
    const second = createDatabaseStore({
      projectDir,
      contentDir,
      generateUuid: () => '128f7f3d-90ab-7ccd-8123-456789abcdef',
    });
    const results = await Promise.all([
      first.assignRecordId({
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordPath: 'notes/same.md',
      }),
      second.assignRecordId({
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordPath: 'notes/same.md',
      }),
    ]);

    expect(new Set(results.map((result) => result.recordId))).toHaveLength(1);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
  });

  test('keeps record identity through file, title, and source-folder moves', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({
      projectDir,
      contentDir,
      generateUuid: () => '018f7f3d-90ab-7ccd-8123-456789abcdef',
    });
    const created = await store.create(definition());
    mkdirSync(join(contentDir, 'notes'), { recursive: true });
    const originalPath = join(contentDir, 'notes', 'original.md');
    writeFileSync(originalPath, '---\ntitle: Original title\n---\nBody\n', 'utf-8');

    const initial = await store.assignRecordId({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordPath: 'notes/original.md',
    });
    const movedPath = join(contentDir, 'notes', 'renamed.md');
    renameSync(originalPath, movedPath);
    writeFileSync(
      movedPath,
      readFileSync(movedPath, 'utf-8').replace('Original title', 'Changed title'),
      'utf-8',
    );

    const afterFileAndTitleMove = await store.assignRecordId({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordPath: 'notes/renamed.md',
    });
    expect(afterFileAndTitleMove).toMatchObject({
      recordId: initial.recordId,
      changed: false,
    });

    renameSync(join(contentDir, 'notes'), join(contentDir, 'archive'));
    await store.update('db_notes', {
      ...created,
      sources: [{ ...created.sources[0], folder: 'archive' }],
    });
    const afterSourceFolderMove = await store.assignRecordId({
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordPath: 'archive/renamed.md',
    });
    expect(afterSourceFolderMove).toMatchObject({
      recordId: initial.recordId,
      changed: false,
    });
    expect(readFileSync(join(contentDir, 'archive', 'renamed.md'), 'utf-8')).toContain(
      `record_id: ${initial.recordId}`,
    );
  });

  test('refuses traversal, symlinks, malformed metadata, and missing files', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    mkdirSync(join(contentDir, 'notes'), { recursive: true });

    await expect(
      store.assignRecordId({
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordPath: '../escape.md',
      }),
    ).rejects.toMatchObject({ code: 'invalid_record_path' });

    const outside = join(projectDir, 'outside.md');
    writeFileSync(outside, '# outside\n', 'utf-8');
    symlinkSync(outside, join(contentDir, 'notes', 'linked.md'));
    await expect(
      store.assignRecordId({
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordPath: 'notes/linked.md',
      }),
    ).rejects.toMatchObject({ code: 'record_symlink' });

    const malformedPath = join(contentDir, 'notes', 'malformed.md');
    const malformed = '---\ntitle: [\n---\nBody\n';
    writeFileSync(malformedPath, malformed, 'utf-8');
    await expect(
      store.assignRecordId({
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordPath: 'notes/malformed.md',
      }),
    ).rejects.toMatchObject({
      code: 'record_identity_error',
      details: { identityError: 'malformed_frontmatter' },
    });
    expect(readFileSync(malformedPath, 'utf-8')).toBe(malformed);

    await expect(
      store.assignRecordId({
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordPath: 'notes/missing.md',
      }),
    ).rejects.toMatchObject({ code: 'record_not_found' });
  });
});
