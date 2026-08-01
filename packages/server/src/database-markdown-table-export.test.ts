import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabaseDataPlane } from './database-data-plane.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Export contract fixture',
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
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
          {
            id: 'prop_double_status_length',
            key: 'double_status_length',
            name: 'Double status length',
            type: 'formula',
            source: 'length(prop("prop_status")) * 2',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'number',
              expression: {
                type: 'binary',
                operator: 'multiply',
                left: {
                  type: 'call',
                  function: 'length',
                  arguments: [{ type: 'property', propertyId: 'prop_status' }],
                },
                right: { type: 'literal', valueType: 'number', value: 2 },
              },
            },
          },
        ],
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'tasks.md', blockId: 'dbb_tasks_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title', 'prop_status'],
        },
      },
    ],
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('server Markdown-table export', () => {
  test('keeps canonical Markdown and computed snapshots disjoint at the data-plane boundary', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-export-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(join(contentDir, 'tasks'), { recursive: true });
    tempDirs.push(projectDir);
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const owner =
      '<!-- synapsenote:database\nversion=2\ndatabase=db_tasks\nsource=ds_tasks\nblock=dbb_tasks_primary\ncolumns=prop_title,prop_status\n-->\n\n| Document | Status |\n| --- | --- |\n| [[tasks/alpha]] | todo |\n';
    const linked = '---\n_sn:\n  document_id: doc_alpha\n---\n# Alpha\nBody\n';
    writeFileSync(join(contentDir, 'tasks.md'), owner);
    writeFileSync(join(contentDir, 'tasks/alpha.md'), linked);
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    const plans = createDatabasePlanEngine({
      databaseStore: store,
      databaseRecordIndex: index,
      projectDir,
      contentDir,
    });
    const commit = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      git: { snapshot: async () => '0'.repeat(40), hashBlob: async () => `sha1:${'a'.repeat(40)}` },
    });
    const dataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      databaseCommitEngine: commit,
    });

    const canonical = dataPlane.exportMarkdownTable({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      mode: 'canonical_markdown',
    });
    expect(canonical.mode).toBe('canonical_markdown');
    expect(canonical.canonical.map((entry) => entry.path)).toEqual(['tasks.md', 'tasks/alpha.md']);
    expect(canonical.canonical[0]?.content).toContain('synapsenote:database');
    expect(canonical.snapshot).toEqual([]);
    expect(canonical.derivedRevision).toBeNull();

    const query = dataPlane.query({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      query: { select: ['prop_double_status_length'] },
    });
    const snapshot = dataPlane.exportMarkdownTable({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      mode: 'computed_snapshot',
      query: { select: ['prop_double_status_length'], page: { limit: 10 } },
    });
    const exportedDerivedRevision = snapshot.derivedRevision;
    expect(snapshot).toMatchObject({
      mode: 'computed_snapshot',
      canonical: [],
      evaluatedAt: expect.any(String),
      derivedRevision: expect.stringMatching(/^sha256:/),
    });
    expect(exportedDerivedRevision).toBe(query.derivedRevision);
    expect(snapshot.snapshot).toEqual([
      expect.objectContaining({ recordId: expect.stringMatching(/^rec_/), path: 'tasks/alpha.md' }),
    ]);
    expect(JSON.stringify(snapshot.snapshot)).not.toContain('synapsenote:database');
  });
});
