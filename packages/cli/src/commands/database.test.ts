import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDatabaseManifestYaml } from '@nedian0brien/synapsenote-core';
import { databaseCommand, installDatabaseGitDrivers, runDatabaseMergeDriver } from './database.ts';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'synapsenote-database-git-'));
  temporaryDirectories.push(directory);
  return directory;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function files(directory: string, base: string, ours: string, theirs: string) {
  const basePath = join(directory, 'base');
  const currentPath = join(directory, 'current');
  const otherPath = join(directory, 'other');
  writeFileSync(basePath, base);
  writeFileSync(currentPath, ours);
  writeFileSync(otherPath, theirs);
  return { basePath, currentPath, otherPath };
}

const manifest = readFileSync(
  fileURLToPath(new URL('../../../core/src/database/fixtures/v1/database.yml', import.meta.url)),
  'utf-8',
);

function stableIds(yaml: string): string[] {
  const parsed = parseDatabaseManifestYaml(yaml);
  if (!parsed.ok) throw new Error(parsed.error);
  const ids: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' && typeof child === 'string') ids.push(child);
      visit(child);
    }
  };
  visit(parsed.definition);
  return ids.sort((left, right) => left.localeCompare(right));
}

function databaseRecord(
  title: string,
  status: string,
  editedAt: string,
  principalId: string,
): string {
  return `---
_sn:
  database_id: db_tasks
  source_id: ds_tasks
  record_id: rec_one
  created_at: 2026-07-20T00:00:00.000Z
  last_edited_at: ${editedAt}
  created_by:
    kind: human
    principal_id: user:creator
  last_edited_by:
    kind: human
    principal_id: ${principalId}
title: ${title}
status: ${status}
---
Body
`;
}

describe('database Git driver CLI', () => {
  test('exposes inspect and retention cleanup recovery commands', () => {
    const migration = databaseCommand().commands.find((command) => command.name() === 'migration');
    expect(migration?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(['inspect', 'cleanup', 'preview', 'apply', 'status']),
    );
    expect(migration?.commands.find((command) => command.name() === 'inspect')?.description()).toContain(
      'content-free recovery hashes',
    );
  });

  test('semantically merges independent v2 owner-table cells', () => {
    const directory = temporaryDirectory();
    const owner = `<!-- synapsenote:database\nversion=2\ndatabase=db_tasks\nsource=ds_tasks\nblock=dbb_tasks_primary\ncolumns=prop_title,prop_status\n-->\n\n| Title | Status |\n| --- | --- |\n| [[tasks/one]] | todo |\n`;
    const paths = files(
      directory,
      owner,
      owner.replace('| todo |', '| done |'),
      owner.replace('| [[tasks/one]] |', '| [[tasks/renamed]] |'),
    );

    expect(runDatabaseMergeDriver('record', paths.basePath, paths.currentPath, paths.otherPath)).toBe(0);
    const merged = readFileSync(paths.currentPath, 'utf-8');
    expect(merged).toContain('[[tasks/renamed]]');
    expect(merged).toContain('| done |');
    expect(merged).not.toContain('<<<<<<<');
  });

  test('keeps a divergent v2 owner-table cell as an explicit conflict', () => {
    const directory = temporaryDirectory();
    const owner = `<!-- synapsenote:database\nversion=2\ndatabase=db_tasks\nsource=ds_tasks\nblock=dbb_tasks_primary\ncolumns=prop_title,prop_status\n-->\n\n| Title | Status |\n| --- | --- |\n| [[tasks/one]] | todo |\n`;
    const paths = files(
      directory,
      owner,
      owner.replace('| todo |', '| done |'),
      owner.replace('| todo |', '| blocked |'),
    );

    expect(runDatabaseMergeDriver('record', paths.basePath, paths.currentPath, paths.otherPath)).toBe(1);
    expect(readFileSync(paths.currentPath, 'utf-8')).toContain('<<<<<<<');
  });

  test('installs idempotent attributes and trusted repo-local commands', () => {
    const directory = temporaryDirectory();
    git(directory, 'init', '--initial-branch=main');
    writeFileSync(join(directory, '.gitattributes'), '*.png binary\n');

    const first = installDatabaseGitDrivers(directory, "'node' '/trusted/synapsenote.mjs'");
    const second = installDatabaseGitDrivers(directory, "'node' '/trusted/synapsenote.mjs'");

    expect(first.attributes).toBe('updated');
    expect(second.attributes).toBe('unchanged');
    const attributes = readFileSync(join(directory, '.gitattributes'), 'utf-8');
    expect(attributes).toContain('*.png binary');
    expect(attributes.match(/\.ok\/databases\/\*\.yml/g)).toHaveLength(1);
    expect(attributes.match(/\*\.md diff/g)).toHaveLength(1);
    expect(git(directory, 'config', '--local', 'merge.synapsenote-database-manifest.driver')).toBe(
      "'node' '/trusted/synapsenote.mjs' database merge-driver manifest %O %A %B",
    );
    expect(git(directory, 'config', '--local', 'merge.synapsenote-database-record.recursive')).toBe(
      'binary',
    );
  });

  test('refuses a symlinked attributes target', () => {
    const directory = temporaryDirectory();
    git(directory, 'init', '--initial-branch=main');
    const target = join(directory, 'outside');
    writeFileSync(target, 'do not edit\n');
    symlinkSync(target, join(directory, '.gitattributes'));

    expect(() => installDatabaseGitDrivers(directory, 'ok')).toThrow('symlinked .gitattributes');
    expect(readFileSync(target, 'utf-8')).toBe('do not edit\n');
  });

  test('writes a clean semantic manifest merge for independent fields', () => {
    const directory = temporaryDirectory();
    const paths = files(
      directory,
      manifest,
      manifest.replace('name: Database fixture', 'name: Ours database'),
      manifest.replace('name: Feedback', 'name: Customer feedback'),
    );

    expect(
      runDatabaseMergeDriver('manifest', paths.basePath, paths.currentPath, paths.otherPath),
    ).toBe(0);
    const merged = readFileSync(paths.currentPath, 'utf-8');
    expect(merged).toContain('name: Ours database');
    expect(merged).toContain('name: Customer feedback');
    expect(merged).not.toContain('<<<<<<<');
  });

  test('returns Git conflict status and markers for the same manifest field', () => {
    const directory = temporaryDirectory();
    const paths = files(
      directory,
      manifest,
      manifest.replace('name: Database fixture', 'name: Ours'),
      manifest.replace('name: Database fixture', 'name: Theirs'),
    );

    expect(
      runDatabaseMergeDriver('manifest', paths.basePath, paths.currentPath, paths.otherPath),
    ).toBe(1);
    const conflicted = readFileSync(paths.currentPath, 'utf-8');
    expect(conflicted).toContain('<<<<<<<');
    expect(conflicted).toContain('name: Ours');
    expect(conflicted).toContain('name: Theirs');
  });

  test('delegates ordinary Markdown to Git without treating it as a database record', () => {
    const directory = temporaryDirectory();
    const paths = files(directory, 'one\ntwo\nthree\n', 'ONE\ntwo\nthree\n', 'one\ntwo\nTHREE\n');

    expect(
      runDatabaseMergeDriver('record', paths.basePath, paths.currentPath, paths.otherPath),
    ).toBe(0);
    expect(readFileSync(paths.currentPath, 'utf-8')).toBe('ONE\ntwo\nTHREE\n');
  });

  test('completes an end-to-end Git branch merge through the installed driver', () => {
    const directory = temporaryDirectory();
    git(directory, 'init', '--initial-branch=main');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');
    const cliEntry = fileURLToPath(new URL('../cli.ts', import.meta.url));
    installDatabaseGitDrivers(directory, `${quote(process.execPath)} ${quote(cliEntry)}`);
    const manifestDirectory = join(directory, '.ok', 'databases');
    mkdirSync(manifestDirectory, { recursive: true });
    const manifestPath = join(manifestDirectory, 'fixture.yml');
    writeFileSync(manifestPath, manifest);
    git(directory, 'add', '.gitattributes', '.ok/databases/fixture.yml');
    git(directory, 'commit', '-m', 'base');
    git(directory, 'checkout', '-b', 'theirs');
    writeFileSync(manifestPath, manifest.replace('name: Feedback', 'name: Customer feedback'));
    git(directory, 'commit', '-am', 'theirs');
    git(directory, 'checkout', 'main');
    writeFileSync(manifestPath, manifest.replace('name: Database fixture', 'name: Ours database'));
    git(directory, 'commit', '-am', 'ours');

    git(directory, 'merge', '--no-edit', 'theirs');

    const merged = readFileSync(manifestPath, 'utf-8');
    expect(merged).toContain('name: Ours database');
    expect(merged).toContain('name: Customer feedback');
    expect(git(directory, 'status', '--porcelain')).toBe('');
    expect(dirname(manifestPath)).toBe(manifestDirectory);
  });

  test('merges independent record properties end to end despite shared edit metadata', () => {
    const directory = temporaryDirectory();
    git(directory, 'init', '--initial-branch=main');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');
    const cliEntry = fileURLToPath(new URL('../cli.ts', import.meta.url));
    installDatabaseGitDrivers(directory, `${quote(process.execPath)} ${quote(cliEntry)}`);
    const recordDirectory = join(directory, 'tasks');
    mkdirSync(recordDirectory, { recursive: true });
    const recordPath = join(recordDirectory, 'one.md');
    writeFileSync(
      recordPath,
      databaseRecord('Base title', 'todo', '2026-07-20T00:00:00.000Z', 'user:creator'),
    );
    git(directory, 'add', '.gitattributes', 'tasks/one.md');
    git(directory, 'commit', '-m', 'base');
    git(directory, 'checkout', '-b', 'theirs');
    writeFileSync(
      recordPath,
      databaseRecord('Base title', 'done', '2026-07-20T01:00:00.000Z', 'user:theirs'),
    );
    git(directory, 'commit', '-am', 'theirs');
    git(directory, 'checkout', 'main');
    writeFileSync(
      recordPath,
      databaseRecord('Main title', 'todo', '2026-07-20T02:00:00.000Z', 'user:ours'),
    );
    git(directory, 'commit', '-am', 'ours');

    git(directory, 'merge', '--no-edit', 'theirs');

    const merged = readFileSync(recordPath, 'utf-8');
    expect(merged).toContain('title: Main title');
    expect(merged).toContain('status: done');
    expect(merged).toContain('last_edited_at: 2026-07-20T02:00:00.000Z');
    expect(merged).toContain('principal_id: user:ours');
    expect(git(directory, 'status', '--porcelain')).toBe('');
  });

  test('keeps a standalone clone usable when local driver commands are absent', () => {
    const directory = temporaryDirectory();
    git(directory, 'init', '--initial-branch=main');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');
    installDatabaseGitDrivers(directory, 'ok');
    git(directory, 'config', '--remove-section', 'merge.synapsenote-database-manifest');
    git(directory, 'config', '--remove-section', 'merge.synapsenote-database-record');
    const manifestDirectory = join(directory, '.ok', 'databases');
    mkdirSync(manifestDirectory, { recursive: true });
    const manifestPath = join(manifestDirectory, 'fixture.yml');
    writeFileSync(manifestPath, manifest);
    git(directory, 'add', '.gitattributes', '.ok/databases/fixture.yml');
    git(directory, 'commit', '-m', 'base');
    git(directory, 'checkout', '-b', 'theirs');
    writeFileSync(manifestPath, manifest.replace('name: Feedback', 'name: Customer feedback'));
    git(directory, 'commit', '-am', 'theirs');
    git(directory, 'checkout', 'main');
    writeFileSync(manifestPath, manifest.replace('name: Database fixture', 'name: Ours database'));
    git(directory, 'commit', '-am', 'ours');

    git(directory, 'merge', '--no-edit', 'theirs');

    expect(readFileSync(manifestPath, 'utf-8')).toContain('name: Ours database');
    expect(readFileSync(manifestPath, 'utf-8')).toContain('name: Customer feedback');
    expect(git(directory, 'status', '--porcelain')).toBe('');
  });

  test('preserves every stable ID through semantic rebase and hosted remote round-trip', () => {
    const root = temporaryDirectory();
    const directory = join(root, 'work');
    mkdirSync(directory);
    git(directory, 'init', '--initial-branch=main');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');
    const cliEntry = fileURLToPath(new URL('../cli.ts', import.meta.url));
    installDatabaseGitDrivers(directory, `${quote(process.execPath)} ${quote(cliEntry)}`);
    const manifestDirectory = join(directory, '.ok', 'databases');
    mkdirSync(manifestDirectory, { recursive: true });
    const manifestPath = join(manifestDirectory, 'fixture.yml');
    writeFileSync(manifestPath, manifest);
    const expectedIds = stableIds(manifest);
    git(directory, 'add', '.');
    git(directory, 'commit', '-m', 'base');

    git(directory, 'checkout', '-b', 'topic');
    writeFileSync(manifestPath, manifest.replace('name: Feedback', 'name: Customer feedback'));
    git(directory, 'commit', '-am', 'topic field');
    git(directory, 'checkout', 'main');
    writeFileSync(manifestPath, manifest.replace('name: Database fixture', 'name: Main database'));
    git(directory, 'commit', '-am', 'main field');
    git(directory, 'checkout', 'topic');
    git(directory, 'rebase', 'main');
    expect(stableIds(readFileSync(manifestPath, 'utf-8'))).toEqual(expectedIds);

    git(root, 'init', '--bare', 'remote.git');
    git(directory, 'remote', 'add', 'origin', join(root, 'remote.git'));
    git(directory, 'push', '-u', 'origin', 'topic');
    git(root, 'clone', '--branch', 'topic', join(root, 'remote.git'), 'clone');
    const clone = join(root, 'clone');
    const cloneManifest = join(clone, '.ok', 'databases', 'fixture.yml');
    expect(stableIds(readFileSync(cloneManifest, 'utf-8'))).toEqual(expectedIds);
    git(clone, 'config', 'user.email', 'remote@example.com');
    git(clone, 'config', 'user.name', 'Remote');
    writeFileSync(
      cloneManifest,
      readFileSync(cloneManifest, 'utf-8').replace('name: Main database', 'name: Synced database'),
    );
    git(clone, 'commit', '-am', 'remote update');
    git(clone, 'push');
    git(directory, 'pull', '--ff-only');
    expect(stableIds(readFileSync(manifestPath, 'utf-8'))).toEqual(expectedIds);
    expect(readFileSync(manifestPath, 'utf-8')).toContain('name: Synced database');
  });
});
