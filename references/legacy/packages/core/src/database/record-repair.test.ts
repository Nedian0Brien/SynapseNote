import { describe, expect, test } from 'bun:test';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import { materializeDatabaseRecord } from './record.ts';
import { repairDatabaseRecord } from './record-repair.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

const definition = DatabaseDefinitionSchema.parse({
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
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [
            { id: 'opt_todo', key: 'todo', name: 'Todo' },
            { id: 'opt_done', key: 'done', name: 'Done' },
          ],
          semantics: {
            constraints: { unique: false },
            inferencePolicy: 'explicit_only',
            sensitivity: 'inherit',
            defaultValue: 'todo',
          },
        },
        {
          id: 'prop_tags',
          key: 'tags',
          name: 'Tags',
          type: 'multi_select',
          options: [{ id: 'opt_agent', key: 'agent', name: 'Agent' }],
        },
        { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
      ],
    },
  ],
});

describe('repairDatabaseRecord', () => {
  test('applies only trusted Unique ID allocations and makes the record materializable', () => {
    const withUniqueId = DatabaseDefinitionSchema.parse({
      ...definition,
      sources: definition.sources.map((source) => ({
        ...source,
        properties: [
          ...source.properties,
          {
            id: 'prop_ticket',
            key: 'ticket',
            name: 'Ticket',
            type: 'unique_id',
            prefix: 'TASK',
            nextNumber: 8,
          },
        ],
      })),
    });
    const repaired = repairDatabaseRecord({
      definition: withUniqueId,
      sourceId: 'ds_tasks',
      path: 'tasks/missing-ticket.md',
      markdown:
        '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_ticket\ntitle: Ticket\n---\n',
      uniqueIdValues: { prop_ticket: 7 },
    });
    expect(repaired).toMatchObject({
      ok: true,
      changes: [
        expect.objectContaining({
          kind: 'allocate_unique_id',
          propertyId: 'prop_ticket',
          after: 7,
        }),
      ],
    });
    if (repaired.ok) expect(repaired.markdown).toContain('ticket: 7');
  });

  test('repairs stale identity and invalid optional values with an exact loss preview', () => {
    const markdown = `---\n# keep this comment\ncustom: untouched\n_sn:\n  database_id: db_old\n  source_id: ds_old\n  record_id: rec_keep\n  created_at: 2026-07-18T08:00:00.000Z\n  last_edited_at: 2026-07-19T08:00:00.000Z\n  created_by: { kind: agent, principal_id: agent:creator }\n  last_edited_by: { kind: sync, principal_id: sync:remote }\ntitle: Repair me\nstatus: removed-option\ntags: [agent, agent]\ndue: someday\n---\nBody bytes stay here.\n`;
    const repaired = repairDatabaseRecord({
      definition,
      sourceId: 'ds_tasks',
      path: 'tasks/repair.md',
      markdown,
    });
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;

    expect(repaired.recordId).toBe('rec_keep');
    expect(repaired.changes.map((change) => change.kind)).toEqual([
      'set_identity',
      'set_default',
      'deduplicate',
      'unset_invalid_optional',
    ]);
    expect(repaired.markdown).toContain('# keep this comment');
    expect(repaired.markdown).toContain('custom: untouched');
    expect(repaired.markdown).toContain('created_at: 2026-07-18T08:00:00.000Z');
    expect(repaired.markdown).toContain('principal_id: agent:creator');
    expect(repaired.markdown).toContain('principal_id: sync:remote');
    expect(repaired.markdown.endsWith('Body bytes stay here.\n')).toBe(true);
    const materialized = materializeDatabaseRecord({
      definition,
      sourceId: 'ds_tasks',
      path: 'tasks/repair.md',
      markdown: repaired.markdown,
    });
    expect(materialized).toMatchObject({
      ok: true,
      record: {
        id: 'rec_keep',
        values: {
          prop_title: 'Repair me',
          prop_status: 'opt_todo',
          prop_tags: ['opt_agent'],
        },
      },
    });
    const yaml = repaired.markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    expect(parseFrontmatterYaml(yaml).map).not.toHaveProperty('due');
  });

  test('uses an exact replacement identity for a duplicate record', () => {
    const repaired = repairDatabaseRecord({
      definition,
      sourceId: 'ds_tasks',
      path: 'tasks/duplicate.md',
      markdown: `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_duplicate\ntitle: Duplicate\n---\n`,
      recordId: 'rec_replacement',
    });
    expect(repaired).toMatchObject({
      ok: true,
      recordId: 'rec_replacement',
      changes: [{ kind: 'set_identity' }],
    });
  });

  test('blocks a required value that has no safe default', () => {
    const repaired = repairDatabaseRecord({
      definition,
      sourceId: 'ds_tasks',
      path: 'tasks/blocked.md',
      markdown: `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_blocked\ntitle: 123\n---\n`,
    });
    expect(repaired).toMatchObject({
      ok: false,
      code: 'required_value_needs_input',
      propertyId: 'prop_title',
      propertyKey: 'title',
    });
  });

  test('refuses malformed frontmatter without inventing replacement data', () => {
    expect(
      repairDatabaseRecord({
        definition,
        sourceId: 'ds_tasks',
        path: 'tasks/malformed.md',
        markdown: '---\ntitle: [\n---\nBody\n',
      }),
    ).toMatchObject({ ok: false, code: 'malformed_frontmatter' });
  });
});
