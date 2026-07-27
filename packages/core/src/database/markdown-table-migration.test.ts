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

  test('binds migration provenance and aliases to the v2 manifest when committedAt is supplied', () => {
    const result = planDatabaseMarkdownV2Migration({
      definition: definition(),
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      migrationCommittedAt: '2026-07-27T00:00:00.000Z',
      records: [
        {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          path: 'tasks/alpha.md',
          markdown:
            '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\ntitle: Alpha\nnotes: Keep this\nstatus: todo\n---\n',
        },
      ],
    });

    expect(result.definition.migration).toMatchObject({
      fromVersion: 1,
      committedAt: '2026-07-27T00:00:00.000Z',
      sourceFolders: { ds_tasks: 'tasks' },
    });
    expect(result.definition.migration?.legacyRecordIds.rec_alpha?.canonicalRecordId).toMatch(/^rec_/);
  });

  test('carries v1 lifecycle metadata in the bounded alias map instead of linked-document frontmatter', () => {
    const temporal = definition();
    temporal.sources[0]?.properties.push(
      {
        id: 'prop_created_time',
        key: 'created_time',
        name: 'Created time',
        type: 'created_time',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
      {
        id: 'prop_last_edited_time',
        key: 'last_edited_time',
        name: 'Last edited time',
        type: 'last_edited_time',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
      {
        id: 'prop_created_by',
        key: 'created_by',
        name: 'Created by',
        type: 'created_by',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
    );
    const result = planDatabaseMarkdownV2Migration({
      definition: temporal,
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      migrationCommittedAt: '2026-07-27T00:00:00.000Z',
      records: [
        {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          path: 'tasks/alpha.md',
          markdown:
            '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\n  archived_at: 2026-07-26T12:00:00.000Z\n  created_at: 2026-07-20T12:00:00.000Z\n  last_edited_at: 2026-07-26T12:00:00.000Z\n  created_by: { kind: agent, principal_id: agent:migration }\ntitle: Alpha\nnotes: Keep this\nstatus: todo\n---\n',
        },
      ],
    });

    expect(result.status).toBe('ready');
    expect(result.definition?.migration?.legacyRecordIds.rec_alpha).toMatchObject({
      archivedAt: '2026-07-26T12:00:00.000Z',
      createdAt: '2026-07-20T12:00:00.000Z',
      lastEditedAt: '2026-07-26T12:00:00.000Z',
      createdBy: { kind: 'agent', principal_id: 'agent:migration' },
    });
    expect(result.linkedDocuments['tasks/alpha.md']).not.toContain('archived_at:');
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

  test('applies an explicit title choice to both the document title and first wikilink alias', () => {
    const conflictDefinition = definition();
    const conflictSource = conflictDefinition.sources[0]!;
    const conflictTitle = conflictSource.properties[0]!;
    conflictSource.properties[0] = { ...conflictTitle, key: 'record_title' } as typeof conflictTitle;
    const input = {
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
    } as const;

    const keepDocument = planDatabaseMarkdownV2Migration({
      ...input,
      titleChoices: { rec_alpha: { kind: 'keep_document_title' } },
    });
    expect(keepDocument.status).toBe('ready');
    expect(keepDocument.ownerDocuments['tasks.md']).toContain('| [[tasks/alpha\\|Document title]] |');
    expect(keepDocument.linkedDocuments['tasks/alpha.md']).toContain('# Document title');

    const useRecord = planDatabaseMarkdownV2Migration({
      ...input,
      titleChoices: { rec_alpha: { kind: 'use_record_title' } },
    });
    expect(useRecord.status).toBe('ready');
    expect(useRecord.ownerDocuments['tasks.md']).toContain('| [[tasks/alpha\\|Record title]] |');
    expect(useRecord.linkedDocuments['tasks/alpha.md']).toContain('title: "Record title"');

    const custom = planDatabaseMarkdownV2Migration({
      ...input,
      titleChoices: { rec_alpha: { kind: 'custom_title', title: 'Custom title' } },
    });
    expect(custom.status).toBe('ready');
    expect(custom.ownerDocuments['tasks.md']).toContain('| [[tasks/alpha\\|Custom title]] |');
    expect(custom.linkedDocuments['tasks/alpha.md']).toContain('title: "Custom title"');
  });

  test('blocks an invalid custom title choice before generating any files', () => {
    const conflictDefinition = definition();
    const conflictSource = conflictDefinition.sources[0]!;
    const conflictTitle = conflictSource.properties[0]!;
    conflictSource.properties[0] = { ...conflictTitle, key: 'record_title' } as typeof conflictTitle;
    const result = planDatabaseMarkdownV2Migration({
      definition: conflictDefinition,
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      titleChoices: { rec_alpha: { kind: 'custom_title', title: 'bad\ntitle' } },
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
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: 'title_choice_invalid' }));
    expect(result.ownerDocuments).toEqual({});
  });
});
