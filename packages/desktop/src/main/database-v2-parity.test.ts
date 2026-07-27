import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseRecordIndex, createDatabaseStore } from '@nedian0brien/synapsenote-server';
import { type BranchInfoProxyDeps, proxyRunCheckout } from './branch-info-proxy.ts';
import { handleRevealExternal } from './reveal-external.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function manifest() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Desktop v2 parity fixture',
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
        folder: '.',
        includeSubfolders: true,
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'tasks.md', blockId: 'dbb_tasks_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title'],
        },
        properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
      },
    ],
  });
}

function owner(title: string): string {
  return [
    '<!-- synapsenote:database',
    'version=2',
    'database=db_tasks',
    'source=ds_tasks',
    'block=dbb_tasks_primary',
    'columns=prop_title',
    '-->',
    '',
    '| Title |',
    '| --- |',
    `| [[${title}\\|${title.replaceAll('-', ' ')}]] |`,
    '',
  ].join('\n');
}

function linkedDocument(documentId: string, title: string): string {
  return `---\n_sn:\n  document_id: ${documentId}\n---\n# ${title}\n\nCanonical desktop document.\n`;
}

function proxyDeps(fetch: typeof globalThis.fetch): BranchInfoProxyDeps {
  return {
    readServerLock: () => ({ pid: 42, port: 7777 }),
    isProcessAlive: () => true,
    fetch,
    pollIntervalMs: 1,
    pollTimeoutMs: 10,
    requestTimeoutMs: 100,
  };
}

describe('desktop v2 database parity', () => {
  test('reloads the canonical owner/document result and opens the linked Markdown path', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-desktop-v2-parity-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
    mkdirSync(contentDir, { recursive: true });
    tempDirs.push(projectDir);
    writeFileSync(
      join(projectDir, '.ok', 'databases', 'tasks.yml'),
      serializeDatabaseManifestYaml(manifest()),
    );
    writeFileSync(join(contentDir, 'tasks.md'), owner('Alpha'));
    writeFileSync(join(contentDir, 'Alpha.md'), linkedDocument('doc_alpha', 'Alpha'));

    const store = createDatabaseStore({ projectDir, contentDir });
    await store.reload();
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    const initial = index.list('db_tasks', 'ds_tasks');
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ path: 'Alpha.md', values: { prop_title: 'Alpha' } });
    expect(initial[0]?.path).not.toMatch(/(?:^|\/)rec_[^/]+\.md$/u);

    // This is the same cold/incremental rebuild boundary used by the desktop's
    // shared server watcher after an external Markdown edit.
    writeFileSync(join(contentDir, 'tasks.md'), owner('Beta-task'));
    writeFileSync(join(contentDir, 'Beta-task.md'), linkedDocument('doc_beta', 'Beta task'));
    rmSync(join(contentDir, 'Alpha.md'));
    await index.rebuild();
    expect(index.list('db_tasks', 'ds_tasks')).toMatchObject([
      { path: 'Beta-task.md', values: { prop_title: 'Beta task' } },
    ]);

    const shown: string[] = [];
    const reveal = await handleRevealExternal(resolve(contentDir, 'Beta-task.md'), {
      probe: () => 'exists',
      confirmReveal: async () => true,
      showItemInFolder: (path) => shown.push(path),
    });
    expect(reveal).toEqual({ ok: true, outcome: 'revealed' });
    expect(shown).toEqual([resolve(contentDir, 'Beta-task.md')]);
    expect(readFileSync(join(contentDir, 'Beta-task.md'), 'utf8')).toContain(
      'document_id: doc_beta',
    );
  });

  test('uses the desktop Git proxy for the same v2 project server route', async () => {
    let seenUrl = '';
    let seenBody = '';
    const fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenBody = String(init?.body ?? '');
      return Response.json({ ok: true });
    }) as unknown as typeof globalThis.fetch;
    const result = await proxyRunCheckout(
      { projectPath: '/tmp/v2-project', branch: 'feature/v2' },
      proxyDeps(fetch),
    );
    expect(result).toEqual({ ok: true });
    expect(seenUrl).toBe('http://localhost:7777/api/git/checkout');
    expect(JSON.parse(seenBody)).toEqual({ branch: 'feature/v2' });
  });
});
