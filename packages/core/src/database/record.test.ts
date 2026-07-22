import { describe, expect, test } from 'bun:test';
import { DOCUMENT_OPEN_BYTE_LIMIT } from '../constants/document-open.ts';
import { materializeDatabaseRecord } from './record.ts';
import { DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT } from './record-identity.ts';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  DatabasePropertySchema,
} from './schema.ts';

function definition(): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_feedback',
    key: 'feedback',
    name: 'Feedback',
    contract: {
      purpose: 'Track feedback',
      canonicality: 'canonical',
      vocabulary: ['feedback'],
      freshness: { expectation: 'daily' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_feedback',
        key: 'feedback',
        name: 'Feedback',
        recordMeaning: 'One customer report',
        folder: 'feedback',
        includeSubfolders: true,
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { id: 'opt_new', key: 'new', name: 'New' },
              { id: 'opt_done', key: 'done', name: 'Done' },
            ],
          },
          {
            id: 'prop_tags',
            key: 'feedback-tags',
            name: 'Tags',
            type: 'multi_select',
            options: [
              { id: 'opt_ux', key: 'ux', name: 'UX' },
              { id: 'opt_auth', key: 'auth', name: 'Authentication' },
            ],
          },
        ],
      },
    ],
  });
}

describe('materializeDatabaseRecord', () => {
  test('refuses oversized pages and frontmatter with migration guidance', () => {
    const identity =
      '_sn:\n  database_id: db_feedback\n  source_id: ds_feedback\n  record_id: rec_limits\ntitle: Limits\n';
    const oversizedFrontmatter = `---\n${identity}large: ${'x'.repeat(
      DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT,
    )}\n---\nBody\n`;
    expect(
      materializeDatabaseRecord({
        definition: definition(),
        sourceId: 'ds_feedback',
        path: 'feedback/frontmatter.md',
        markdown: oversizedFrontmatter,
      }),
    ).toMatchObject({
      ok: false,
      code: 'frontmatter_too_large',
      message: expect.stringMatching(/Markdown body, linked records, or Files/),
    });

    const prefix = `---\n${identity}---\n`;
    const oversizedDocument = `${prefix}${'x'.repeat(DOCUMENT_OPEN_BYTE_LIMIT)}`;
    expect(
      materializeDatabaseRecord({
        definition: definition(),
        sourceId: 'ds_feedback',
        path: 'feedback/document.md',
        markdown: oversizedDocument,
      }),
    ).toMatchObject({
      ok: false,
      code: 'document_too_large',
      message: expect.stringMatching(/linked documents or Files/),
    });
  });

  test('materializes the canonical numeric part of Unique ID and reports missing allocation', () => {
    const unique = definition();
    unique.sources[0]?.properties.push(
      DatabasePropertySchema.parse({
        id: 'prop_ticket',
        key: 'ticket',
        name: 'Ticket',
        type: 'unique_id',
        prefix: 'TASK',
        nextNumber: 8,
      }),
    );
    const valid = materializeDatabaseRecord({
      definition: unique,
      sourceId: 'ds_feedback',
      path: 'feedback/task.md',
      markdown:
        '---\n_sn:\n  database_id: db_feedback\n  source_id: ds_feedback\n  record_id: rec_task\ntitle: Task\nticket: 7\n---\n',
    });
    expect(valid.ok && valid.record.values.prop_ticket).toBe(7);

    const missing = materializeDatabaseRecord({
      definition: unique,
      sourceId: 'ds_feedback',
      path: 'feedback/missing.md',
      preserveInvalidValues: true,
      markdown:
        '---\n_sn:\n  database_id: db_feedback\n  source_id: ds_feedback\n  record_id: rec_missing\ntitle: Missing\n---\n',
    });
    expect(missing.ok && missing.record.issues).toEqual([
      expect.objectContaining({ code: 'missing_unique_id', propertyId: 'prop_ticket' }),
    ]);
  });

  test('maps readable frontmatter keys to stable property and option IDs', () => {
    const result = materializeDatabaseRecord({
      definition: definition(),
      sourceId: 'ds_feedback',
      path: 'feedback/login.md',
      revision: 'sha256:abc',
      markdown: `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_login
title: Login feedback
score: 8
status: new
feedback-tags: [ux, auth]
unrelated: preserved outside the projection
---

Exact customer evidence.
`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({
      id: 'rec_login',
      databaseId: 'db_feedback',
      sourceId: 'ds_feedback',
      path: 'feedback/login.md',
      revision: 'sha256:abc',
      values: {
        prop_title: 'Login feedback',
        prop_score: 8,
        prop_status: 'opt_new',
        prop_tags: ['opt_ux', 'opt_auth'],
      },
    });
    expect(result.record.body).toBe('\nExact customer evidence.\n');
    expect(result.record.values).not.toHaveProperty('unrelated');
  });

  test('materializes canonical archive state from _sn metadata', () => {
    const result = materializeDatabaseRecord({
      definition: definition(),
      sourceId: 'ds_feedback',
      path: 'feedback/archived.md',
      markdown: `---\n_sn:\n  database_id: db_feedback\n  source_id: ds_feedback\n  record_id: rec_archived\n  archived_at: 2026-07-20T01:02:03.000Z\ntitle: Archived\n---\n`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.archivedAt).toBe('2026-07-20T01:02:03.000Z');
  });

  test('derives immutable creation and latest edit times without trusting property keys', () => {
    const temporal = definition();
    temporal.sources[0]?.properties.push(
      DatabasePropertySchema.parse({
        id: 'prop_created',
        key: 'created_time',
        name: 'Created time',
        type: 'created_time',
      }),
      DatabasePropertySchema.parse({
        id: 'prop_edited',
        key: 'last_edited_time',
        name: 'Last edited time',
        type: 'last_edited_time',
      }),
      DatabasePropertySchema.parse({
        id: 'prop_created_by',
        key: 'created_by',
        name: 'Created by',
        type: 'created_by',
      }),
      DatabasePropertySchema.parse({
        id: 'prop_edited_by',
        key: 'last_edited_by',
        name: 'Last edited by',
        type: 'last_edited_by',
      }),
    );
    const result = materializeDatabaseRecord({
      definition: temporal,
      sourceId: 'ds_feedback',
      path: 'feedback/times.md',
      fileCreatedAt: '2026-07-19T08:00:00.000Z',
      fileLastEditedAt: '2026-07-20T09:30:00.000Z',
      fileLastEditedBy: { kind: 'filesystem', principal_id: 'local' },
      preserveInvalidValues: true,
      markdown: `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_times
  created_at: 2026-07-18T01:00:00.000Z
  last_edited_at: 2026-07-19T01:00:00.000Z
  created_by: { kind: agent, principal_id: agent:creator }
  last_edited_by: { kind: sync, principal_id: sync:remote }
title: Times
created_time: forged
created_by: forged
---
`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.values).toMatchObject({
      prop_created: '2026-07-18T01:00:00.000Z',
      prop_edited: '2026-07-20T09:30:00.000Z',
      prop_created_by: 'agent|agent:creator',
      prop_edited_by: 'filesystem|local',
    });
    expect(result.record.invalidValues).toEqual({
      prop_created: 'forged',
      prop_created_by: 'forged',
    });
    expect(result.record.issues).toEqual([
      expect.objectContaining({ propertyId: 'prop_created', code: 'invalid_property_value' }),
      expect.objectContaining({ propertyId: 'prop_created_by', code: 'invalid_property_value' }),
    ]);

    const strict = materializeDatabaseRecord({
      definition: temporal,
      sourceId: 'ds_feedback',
      path: 'feedback/times.md',
      markdown: `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_times
  created_at: 2026-07-18T01:00:00.000Z
  last_edited_at: 2026-07-19T01:00:00.000Z
  created_by: { kind: agent, principal_id: agent:creator }
  last_edited_by: { kind: sync, principal_id: sync:remote }
title: Times
created_time: forged
created_by: forged
---
`,
    });
    expect(strict).toMatchObject({ ok: false, code: 'invalid_record' });
  });

  test('omits derived properties and rejects forged Formula frontmatter values', () => {
    const computed = definition();
    computed.sources[0]?.properties.push(
      DatabasePropertySchema.parse({
        id: 'prop_double_score',
        key: 'double_score',
        name: 'Double score',
        type: 'formula',
        source: 'prop("score") * 2',
        ast: {
          language: 'synapse-formula-1',
          version: 1,
          resultType: 'number',
          expression: {
            type: 'binary',
            operator: 'multiply',
            left: { type: 'property', propertyId: 'prop_score' },
            right: { type: 'literal', valueType: 'number', value: 2 },
          },
        },
      }),
    );
    const markdown = `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_computed
title: Computed
score: 4
---
`;
    const clean = materializeDatabaseRecord({
      definition: computed,
      sourceId: 'ds_feedback',
      path: 'feedback/computed.md',
      markdown,
    });
    expect(clean.ok).toBe(true);
    if (clean.ok) expect(clean.record.values).not.toHaveProperty('prop_double_score');

    const forged = materializeDatabaseRecord({
      definition: computed,
      sourceId: 'ds_feedback',
      path: 'feedback/computed.md',
      markdown: markdown.replace('score: 4', 'score: 4\ndouble_score: 8'),
    });
    expect(forged).toMatchObject({
      ok: false,
      code: 'invalid_record',
      issues: [
        {
          propertyId: 'prop_double_score',
          propertyKey: 'double_score',
          code: 'invalid_property_value',
        },
      ],
    });
  });

  test('keeps Button properties virtual and rejects forged stored Button values', () => {
    const actionable = definition();
    actionable.sources[0]?.properties.push(
      DatabasePropertySchema.parse({
        id: 'prop_finish',
        key: 'finish',
        name: 'Finish',
        type: 'button',
        label: 'Mark done',
        actions: [
          {
            id: 'mark_done',
            kind: 'update_record',
            operations: [{ op: 'set', propertyId: 'prop_status', value: 'opt_done' }],
          },
        ],
      }),
    );
    const markdown = `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_button
title: Actionable
status: new
---
`;
    const clean = materializeDatabaseRecord({
      definition: actionable,
      sourceId: 'ds_feedback',
      path: 'feedback/actionable.md',
      markdown,
    });
    expect(clean.ok).toBe(true);
    if (clean.ok) expect(clean.record.values).not.toHaveProperty('prop_finish');

    const forged = materializeDatabaseRecord({
      definition: actionable,
      sourceId: 'ds_feedback',
      path: 'feedback/actionable.md',
      preserveInvalidValues: true,
      markdown: markdown.replace('status: new', 'status: new\nfinish: clicked'),
    });
    expect(forged).toMatchObject({
      ok: true,
      record: {
        invalidValues: { prop_finish: 'clicked' },
        issues: [
          {
            propertyId: 'prop_finish',
            propertyKey: 'finish',
            code: 'invalid_property_value',
          },
        ],
      },
    });
  });

  test('enforces Relation cardinality, stable IDs, duplicates, and required collections', () => {
    const related = definition();
    related.sources[0]?.properties.push(
      DatabasePropertySchema.parse({
        id: 'prop_related',
        key: 'related',
        name: 'Related',
        type: 'relation',
        targetSourceId: 'ds_feedback',
        cardinality: 'many',
        required: true,
      }),
    );
    const materialize = (value: string) =>
      materializeDatabaseRecord({
        definition: related,
        sourceId: 'ds_feedback',
        path: 'feedback/related.md',
        markdown: `---\n_sn: { database_id: db_feedback, source_id: ds_feedback, record_id: rec_related }\ntitle: Related\nrelated: ${value}\n---\n`,
      });
    const valid = materialize('[rec_first, rec_second]');
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.record.values.prop_related).toEqual(['rec_first', 'rec_second']);
    expect(materialize('[]').ok).toBe(false);
    expect(materialize('[rec_first, rec_first]').ok).toBe(false);
    expect(materialize('[not-a-record]').ok).toBe(false);
  });

  test('materializes structured date ranges without losing timezone or reminder metadata', () => {
    const withDate = definition();
    withDate.sources[0]?.properties.push(
      DatabasePropertySchema.parse({ id: 'prop_due', key: 'due', name: 'Due', type: 'date' }),
    );
    const result = materializeDatabaseRecord({
      definition: withDate,
      sourceId: 'ds_feedback',
      path: 'feedback/conference.md',
      markdown: `---
_sn: { database_id: db_feedback, source_id: ds_feedback, record_id: rec_conference }
title: Conference
due:
  start: 2026-07-20T00:00:00Z
  end: 2026-07-20T01:00:00Z
  timeZone: Asia/Seoul
  reminder: { anchor: start, minutesBefore: 30 }
---
`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.values.prop_due).toEqual({
        start: '2026-07-20T00:00:00Z',
        end: '2026-07-20T01:00:00Z',
        timeZone: 'Asia/Seoul',
        reminder: { anchor: 'start', minutesBefore: 30 },
      });
    }
  });

  test('reports every invalid property without partially materializing a record', () => {
    const result = materializeDatabaseRecord({
      definition: definition(),
      sourceId: 'ds_feedback',
      path: 'feedback/bad.md',
      markdown: `---
_sn: { database_id: db_feedback, source_id: ds_feedback, record_id: rec_bad }
score: high
status: missing
---
`,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid_record');
    expect(result.issues?.map((issue) => issue.code)).toEqual([
      'missing_required_value',
      'invalid_property_value',
      'unknown_select_option',
    ]);
  });

  test('optionally preserves invalid external values beside valid typed projections', () => {
    const result = materializeDatabaseRecord({
      definition: definition(),
      sourceId: 'ds_feedback',
      path: 'feedback/bad.md',
      preserveInvalidValues: true,
      markdown: `---
_sn: { database_id: db_feedback, source_id: ds_feedback, record_id: rec_bad }
title: Preserved
score: high
status: missing
---
Body remains canonical
`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.values).toEqual({ prop_title: 'Preserved' });
    expect(result.record.invalidValues).toEqual({
      prop_score: 'high',
      prop_status: 'missing',
    });
    expect(result.record.issues?.map((issue) => issue.code)).toEqual([
      'invalid_property_value',
      'unknown_select_option',
    ]);
    expect(result.record.body).toBe('Body remains canonical\n');
  });

  test('rejects unsafe URL, malformed email, and non-dialable phone values', () => {
    const withLinks = definition();
    withLinks.sources[0]?.properties.push(
      DatabasePropertySchema.parse({ id: 'prop_url', key: 'url', name: 'URL', type: 'url' }),
      DatabasePropertySchema.parse({
        id: 'prop_email',
        key: 'email',
        name: 'Email',
        type: 'email',
      }),
      DatabasePropertySchema.parse({
        id: 'prop_phone',
        key: 'phone',
        name: 'Phone',
        type: 'phone',
      }),
    );
    const result = materializeDatabaseRecord({
      definition: withLinks,
      sourceId: 'ds_feedback',
      path: 'feedback/unsafe-links.md',
      markdown: `---
_sn: { database_id: db_feedback, source_id: ds_feedback, record_id: rec_unsafe_links }
title: Unsafe links
url: javascript:alert(1)
email: not-an-email
phone: call-me
---
`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({ propertyId: 'prop_url', code: 'invalid_property_value' }),
      expect.objectContaining({ propertyId: 'prop_email', code: 'invalid_property_value' }),
      expect.objectContaining({ propertyId: 'prop_phone', code: 'invalid_property_value' }),
    ]);
  });

  test('rejects values outside declared numeric and text constraints', () => {
    const constrained = definition();
    constrained.sources[0]?.properties.push(
      DatabasePropertySchema.parse({
        id: 'prop_score_constrained',
        key: 'bounded_score',
        name: 'Bounded score',
        type: 'number',
        semantics: {
          constraints: { unique: false, min: 0, max: 10 },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      }),
      DatabasePropertySchema.parse({
        id: 'prop_code',
        key: 'code',
        name: 'Code',
        type: 'text',
        semantics: {
          constraints: { unique: true, maxLength: 4, pattern: '^[A-Z]+$' },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      }),
    );
    const result = materializeDatabaseRecord({
      definition: constrained,
      sourceId: 'ds_feedback',
      path: 'feedback/constrained.md',
      markdown: `---
_sn: { database_id: db_feedback, source_id: ds_feedback, record_id: rec_constrained }
title: Constrained
bounded_score: 11
code: too-long
---
`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({ propertyId: 'prop_score_constrained' }),
      expect.objectContaining({ propertyId: 'prop_code' }),
    ]);
  });

  test('rejects records outside the source and records with mismatched metadata', () => {
    const outside = materializeDatabaseRecord({
      definition: definition(),
      sourceId: 'ds_feedback',
      path: 'notes/login.md',
      markdown: '# No',
    });
    expect(outside).toMatchObject({ ok: false, code: 'outside_source' });

    const mismatch = materializeDatabaseRecord({
      definition: definition(),
      sourceId: 'ds_feedback',
      path: 'feedback/login.md',
      markdown: `---
_sn: { database_id: db_other, source_id: ds_feedback, record_id: rec_login }
title: Login
---
`,
    });
    expect(mismatch).toMatchObject({ ok: false, code: 'database_mismatch' });
  });

  test('materializes valid page layout overrides and rejects stale stable references', () => {
    const laidOut = definition();
    const source = laidOut.sources[0];
    if (!source) throw new Error('expected source');
    source.pageLayout = {
      pinnedPropertyIds: ['prop_status'],
      panelPropertyIds: ['prop_score'],
      hiddenPropertyIds: [],
      sections: [],
      fullWidthContent: false,
    };
    const valid = materializeDatabaseRecord({
      definition: laidOut,
      sourceId: source.id,
      path: 'feedback/layout.md',
      markdown: `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_layout
  page_layout_override:
    pinnedPropertyIds: []
    panelPropertyIds: [prop_status]
    hiddenPropertyIds: []
    groupOverrides: []
    fullWidthContent: true
title: Layout
status: new
---
Body
`,
    });
    expect(valid.ok && valid.record.pageLayoutOverride).toMatchObject({
      panelPropertyIds: ['prop_status'],
      fullWidthContent: true,
    });

    const stale = materializeDatabaseRecord({
      definition: laidOut,
      sourceId: source.id,
      path: 'feedback/stale-layout.md',
      markdown: `---
_sn:
  database_id: db_feedback
  source_id: ds_feedback
  record_id: rec_stale_layout
  page_layout_override:
    pinnedPropertyIds: [prop_missing]
    panelPropertyIds: []
    hiddenPropertyIds: []
    groupOverrides: []
title: Stale layout
---
`,
    });
    expect(stale).toMatchObject({
      ok: false,
      code: 'invalid_record',
      message: expect.stringContaining('prop_missing'),
    });
  });
});
