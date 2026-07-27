import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from './schema.ts';
import { planDatabaseMarkdownV2Migration } from './markdown-table-migration.ts';

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track tasks',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'manual' },
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
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
          {
            id: 'prop_status',
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
  });
}

describe('planDatabaseMarkdownV2Migration', () => {
  test('creates owner table, generic document identities, and legacy aliases without writing', () => {
    const result = planDatabaseMarkdownV2Migration({
      definition: definition(),
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      records: [
        {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          path: 'tasks/alpha.md',
          markdown:
            '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\ntitle: Alpha\nnotes: Keep this\nstatus: todo\n---\nBody\n',
        },
      ],
    });

    expect(result.status).toBe('ready');
    expect(result.blockers).toEqual([]);
    expect(result.definition).toMatchObject({
      version: 2,
      sources: [
        {
          storage: {
            kind: 'markdown_table',
            owner: { path: 'tasks.md', blockId: 'dbb_tasks_primary' },
            storedPropertyIds: ['prop_title', 'prop_notes', 'prop_status'],
          },
        },
      ],
    });
    expect(result.ownerDocuments['tasks.md']).toContain('| [[tasks/alpha\\|Alpha]] | Keep this | todo |');
    expect(result.linkedDocuments['tasks/alpha.md']).toContain('document_id: doc_alpha');
    expect(result.linkedDocuments['tasks/alpha.md']).not.toContain('database_id:');
    expect(result.linkedDocuments['tasks/alpha.md']).not.toContain('record_id:');
    expect(result.aliases[0]).toMatchObject({
      legacyRecordId: 'rec_alpha',
      documentId: 'doc_alpha',
    });
  });

  test('blocks invalid owner paths and unresolved typed values before any write', () => {
    const result = planDatabaseMarkdownV2Migration({
      definition: definition(),
      owners: [{ sourceId: 'ds_tasks', path: '../tasks.md', blockId: 'dbb_tasks_primary' }],
      records: [
        {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          path: 'tasks/alpha.md',
          markdown:
            '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\ntitle: Alpha\nstatus: unknown\n---\n',
        },
      ],
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(['unsafe_owner_path', 'unsupported_property_value']),
    );
    expect(result.ownerDocuments).toEqual({});
  });

  test('blocks a v1 Title/document-title conflict instead of choosing a destructive default', () => {
    const conflictDefinition = definition();
    const conflictSource = conflictDefinition.sources[0]!;
    const conflictTitle = conflictSource.properties[0]!;
    conflictSource.properties[0] = { ...conflictTitle, key: 'record_title' } as typeof conflictTitle;
    const result = planDatabaseMarkdownV2Migration({
      definition: conflictDefinition,
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      records: [
        {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          path: 'tasks/alpha.md',
          markdown:
            '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\nrecord_title: Record title\ntitle: Document title\nstatus: todo\n---\n# Document title\n',
        },
      ],
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'title_conflict', path: 'tasks/alpha.md' }),
    );
    expect(result.ownerDocuments).toEqual({});
  });
});
