import { describe, expect, test } from 'bun:test';
import {
  DATABASE_QUERY_OPERATOR_MATRIX,
  DATABASE_QUERY_OPERATORS,
  DATABASE_QUERY_SORT_SEMANTICS,
  DatabaseQueryError,
  DatabaseQueryResultSchema,
  databaseQueryOperatorsForProperty,
  evaluateDatabaseFilter,
  queryDatabaseRecords,
} from './query.ts';
import type { DatabaseRecord } from './record.ts';
import {
  DATABASE_PROPERTY_TYPES,
  type DatabaseProperty,
  type DatabaseQueryOperator,
  type DatabaseSource,
  DatabaseSourceSchema,
} from './schema.ts';

function source(): DatabaseSource {
  return DatabaseSourceSchema.parse({
    id: 'ds_tasks',
    key: 'tasks',
    name: 'Tasks',
    recordMeaning: 'One actionable task',
    folder: 'tasks',
    properties: [
      { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
      { id: 'prop_priority', key: 'priority', name: 'Priority', type: 'number' },
      { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
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
      {
        id: 'prop_tags',
        key: 'tags',
        name: 'Tags',
        type: 'multi_select',
        options: [
          { id: 'opt_auth', key: 'auth', name: 'Auth' },
          { id: 'opt_ui', key: 'ui', name: 'UI' },
        ],
      },
    ],
  });
}

function record(id: string, values: DatabaseRecord['values']): DatabaseRecord {
  return {
    id,
    databaseId: 'db_tasks',
    sourceId: 'ds_tasks',
    path: `tasks/${id}.md`,
    revision: `rev:${id}`,
    values,
    body: '',
  };
}

const records = [
  record('rec_a', {
    prop_title: 'Fix authentication',
    prop_priority: 3,
    prop_due: '2026-07-22',
    prop_status: 'opt_todo',
    prop_tags: ['opt_auth'],
  }),
  record('rec_b', {
    prop_title: 'Polish settings UI',
    prop_priority: 1,
    prop_due: '2026-07-24',
    prop_status: 'opt_todo',
    prop_tags: ['opt_ui'],
  }),
  record('rec_c', {
    prop_title: 'Close auth incident',
    prop_priority: 5,
    prop_due: '2026-07-20',
    prop_status: 'opt_done',
    prop_tags: ['opt_auth'],
  }),
];

function allTypeSource(): DatabaseSource {
  return DatabaseSourceSchema.parse({
    id: 'ds_all_types',
    key: 'all-types',
    name: 'All types',
    recordMeaning: 'One operator fixture',
    folder: 'all-types',
    properties: [
      { id: 'prop_all_title', key: 'title', name: 'Title', type: 'title' },
      { id: 'prop_all_text', key: 'text', name: 'Text', type: 'text' },
      { id: 'prop_all_number', key: 'number', name: 'Number', type: 'number' },
      { id: 'prop_all_checkbox', key: 'checkbox', name: 'Checkbox', type: 'checkbox' },
      { id: 'prop_all_date', key: 'date', name: 'Date', type: 'date' },
      {
        id: 'prop_all_select',
        key: 'select',
        name: 'Select',
        type: 'select',
        options: [{ id: 'opt_all_alpha', key: 'alpha', name: 'Alpha' }],
      },
      {
        id: 'prop_all_status',
        key: 'status',
        name: 'Status',
        type: 'status',
        groups: [
          { id: 'stg_all_todo', key: 'todo', name: 'To-do', category: 'todo' },
          {
            id: 'stg_all_doing',
            key: 'in_progress',
            name: 'In progress',
            category: 'in_progress',
          },
          {
            id: 'stg_all_complete',
            key: 'complete',
            name: 'Complete',
            category: 'complete',
          },
        ],
        options: [
          {
            id: 'opt_all_not_started',
            key: 'not_started',
            name: 'Not started',
            groupId: 'stg_all_todo',
          },
          {
            id: 'opt_all_doing',
            key: 'doing',
            name: 'Doing',
            groupId: 'stg_all_doing',
          },
          {
            id: 'opt_all_done',
            key: 'done',
            name: 'Done',
            groupId: 'stg_all_complete',
          },
        ],
      },
      {
        id: 'prop_all_multi',
        key: 'multi',
        name: 'Multi',
        type: 'multi_select',
        options: [
          { id: 'opt_all_tag', key: 'tag', name: 'Tag' },
          { id: 'opt_all_other', key: 'other', name: 'Other' },
        ],
      },
      { id: 'prop_all_url', key: 'url', name: 'URL', type: 'url' },
      { id: 'prop_all_email', key: 'email', name: 'Email', type: 'email' },
      { id: 'prop_all_phone', key: 'phone', name: 'Phone', type: 'phone' },
      {
        id: 'prop_all_created',
        key: 'created_time',
        name: 'Created time',
        type: 'created_time',
      },
      {
        id: 'prop_all_edited',
        key: 'last_edited_time',
        name: 'Last edited time',
        type: 'last_edited_time',
      },
      {
        id: 'prop_all_created_by',
        key: 'created_by',
        name: 'Created by',
        type: 'created_by',
      },
      {
        id: 'prop_all_edited_by',
        key: 'last_edited_by',
        name: 'Last edited by',
        type: 'last_edited_by',
      },
      {
        id: 'prop_all_unique_id',
        key: 'unique_id',
        name: 'Unique ID',
        type: 'unique_id',
        prefix: 'ROW',
        nextNumber: 2,
      },
      {
        id: 'prop_all_place',
        key: 'place',
        name: 'Place',
        type: 'place',
      },
      {
        id: 'prop_all_person',
        key: 'person',
        name: 'Person',
        type: 'person',
        multiple: true,
      },
      { id: 'prop_all_files', key: 'files', name: 'Files', type: 'files' },
      {
        id: 'prop_all_relation',
        key: 'relation',
        name: 'Relation',
        type: 'relation',
        targetSourceId: 'ds_all_types',
        cardinality: 'many',
      },
    ],
  });
}

function canonicalFilterValue(property: DatabaseProperty, operator: DatabaseQueryOperator) {
  const scalar = (() => {
    switch (property.type) {
      case 'number':
      case 'unique_id':
        return 10;
      case 'checkbox':
        return true;
      case 'date':
      case 'created_time':
      case 'last_edited_time':
        return '2026-07-19';
      case 'select':
        return 'opt_all_alpha';
      case 'status':
        return 'opt_all_not_started';
      case 'multi_select':
        return 'opt_all_tag';
      case 'person':
        return 'person_all_owner';
      case 'files':
        return 'assets/all.pdf';
      case 'relation':
        return 'rec_all_related';
      default:
        return 'Alpha';
    }
  })();
  if (operator === 'in') return [scalar];
  if (
    (operator === 'eq' || operator === 'neq') &&
    (property.type === 'multi_select' ||
      property.type === 'person' ||
      property.type === 'files' ||
      (property.type === 'relation' && property.cardinality === 'many'))
  ) {
    return [scalar];
  }
  return scalar;
}

describe('queryDatabaseRecords', () => {
  test('returns a tri-state filter result so invalid values never trigger display rules', () => {
    const querySource = source();
    const filter = { propertyId: 'prop_priority', operator: 'gte' as const, value: 5 };
    const valid = records[0];
    if (!valid) throw new Error('missing query fixture');
    const matching = { ...valid, values: { ...valid.values, prop_priority: 10 } };
    expect(evaluateDatabaseFilter(matching, querySource, filter)).toBe('match');
    expect(
      evaluateDatabaseFilter(
        { ...matching, invalidValues: { prop_priority: 'not-a-number' } },
        querySource,
        filter,
      ),
    ).toBe('invalid');
  });
  test('filters, sorts, and calculates derived metadata times with date semantics', () => {
    const temporal = DatabaseSourceSchema.parse({
      ...source(),
      properties: [
        ...source().properties,
        {
          id: 'prop_created_time',
          key: 'created_time',
          name: 'Created time',
          type: 'created_time',
        },
        {
          id: 'prop_last_edited_time',
          key: 'last_edited_time',
          name: 'Last edited time',
          type: 'last_edited_time',
        },
        {
          id: 'prop_created_by',
          key: 'created_by',
          name: 'Created by',
          type: 'created_by',
        },
        {
          id: 'prop_last_edited_by',
          key: 'last_edited_by',
          name: 'Last edited by',
          type: 'last_edited_by',
        },
      ],
    });
    const result = queryDatabaseRecords({
      source: temporal,
      records: [
        record('rec_old', {
          prop_title: 'Old',
          prop_created_time: '2026-07-18T08:00:00.000Z',
          prop_last_edited_time: '2026-07-20T08:00:00.000Z',
          prop_created_by: 'human|user:local',
          prop_last_edited_by: 'sync|sync:remote',
        }),
        record('rec_new', {
          prop_title: 'New',
          prop_created_time: '2026-07-19T08:00:00.000Z',
          prop_last_edited_time: '2026-07-21T08:00:00.000Z',
          prop_created_by: 'agent|agent:codex',
          prop_last_edited_by: 'filesystem|local',
        }),
      ],
      snapshotRevision: 'snapshot-metadata-times',
      query: {
        where: {
          propertyId: 'prop_created_time',
          operator: 'gte',
          value: '2026-07-18T00:00:00.000Z',
        },
        sort: [{ propertyId: 'prop_last_edited_time', direction: 'desc' }],
        aggregate: {
          calculations: [
            { id: 'earliest_created', propertyId: 'prop_created_time', function: 'earliest' },
          ],
        },
      },
    });
    expect(result.records.map((candidate) => candidate.id)).toEqual(['rec_new', 'rec_old']);
    expect(result.aggregation?.calculations).toEqual([
      expect.objectContaining({ id: 'earliest_created', value: '2026-07-18T08:00:00.000Z' }),
    ]);
    const actors = queryDatabaseRecords({
      source: temporal,
      records: [
        record('rec_human', {
          prop_title: 'Human',
          prop_created_by: 'human|user:local',
          prop_last_edited_by: 'sync|sync:remote',
        }),
        record('rec_agent', {
          prop_title: 'Agent',
          prop_created_by: 'agent|agent:codex',
          prop_last_edited_by: 'filesystem|local',
        }),
      ],
      snapshotRevision: 'snapshot-metadata-actors',
      query: {
        where: {
          propertyId: 'prop_created_by',
          operator: 'eq',
          value: 'agent|agent:codex',
        },
      },
    });
    expect(actors.records.map((candidate) => candidate.id)).toEqual(['rec_agent']);
  });

  test('projects invalid preserved values but excludes them from typed filter and aggregate semantics', () => {
    const invalid: DatabaseRecord = {
      ...record('rec_invalid', { prop_title: 'Externally edited' }),
      invalidValues: { prop_priority: 'high' },
      issues: [
        {
          code: 'invalid_property_value',
          propertyId: 'prop_priority',
          propertyKey: 'priority',
          message: 'Property "priority" must be a finite number',
        },
      ],
    };
    const all = queryDatabaseRecords({
      source: source(),
      records: [...records, invalid],
      snapshotRevision: 'snapshot-invalid',
      query: {
        select: ['prop_title', 'prop_priority'],
        aggregate: {
          calculations: [{ id: 'empty', function: 'percent_empty', propertyId: 'prop_priority' }],
        },
      },
    });
    expect(all.records.find((candidate) => candidate.id === invalid.id)).toMatchObject({
      invalidValues: { prop_priority: 'high' },
      issues: [{ propertyId: 'prop_priority', code: 'invalid_property_value' }],
    });
    expect(all.aggregation?.calculations[0]?.value).toBe(0);

    for (const where of [
      { propertyId: 'prop_priority', operator: 'is_empty' as const },
      {
        not: { propertyId: 'prop_priority', operator: 'gt' as const, value: 0 },
      },
    ]) {
      const filtered = queryDatabaseRecords({
        source: source(),
        records: [invalid],
        snapshotRevision: 'snapshot-invalid',
        query: { where },
      });
      expect(filtered.records).toEqual([]);
    }
  });

  test('projects only referenced readable relation cards from the selected page', () => {
    const source = allTypeSource();
    const relationRecords = [
      record('rec_first', {
        prop_all_title: 'First',
        prop_all_relation: ['rec_target_visible', 'rec_target_denied'],
      }),
      record('rec_second', {
        prop_all_title: 'Second',
        prop_all_relation: ['rec_target_next_page'],
      }),
    ].map((entry) => ({ ...entry, sourceId: source.id }));
    const resolved: string[] = [];
    const result = queryDatabaseRecords({
      source,
      records: relationRecords,
      snapshotRevision: 'snapshot:relation-cards',
      query: { select: ['prop_all_title', 'prop_all_relation'], page: { limit: 1 } },
      resolveRelationRecord: (recordId, sourceId) => {
        resolved.push(recordId);
        return recordId === 'rec_target_visible'
          ? { id: recordId, sourceId, title: 'Visible target' }
          : null;
      },
    });
    expect(resolved).toEqual(['rec_target_denied', 'rec_target_visible']);
    expect(result.relationRecords).toEqual([
      { id: 'rec_target_visible', sourceId: source.id, title: 'Visible target' },
    ]);
    expect(DatabaseQueryResultSchema.safeParse(result).success).toBe(true);
  });

  test('excludes archived records by default and returns them only when explicitly requested', () => {
    const first = records[0];
    const second = records[1];
    const third = records[2];
    if (!first || !second || !third) throw new Error('invalid archive query fixture');
    const archived = {
      ...second,
      archivedAt: '2026-07-20T01:02:03.000Z',
    } as DatabaseRecord;
    const activeOnly = queryDatabaseRecords({
      source: source(),
      records: [first, archived, third],
      snapshotRevision: 'snapshot:archive-default',
    });
    expect(activeOnly.records.map((entry) => entry.id)).toEqual(['rec_a', 'rec_c']);
    const withArchived = queryDatabaseRecords({
      source: source(),
      records: [first, archived, third],
      snapshotRevision: 'snapshot:archive-explicit',
      query: { includeArchived: true },
    });
    expect(withArchived.records.map((entry) => entry.id)).toEqual(['rec_a', 'rec_b', 'rec_c']);
    expect(withArchived.records[1]?.archivedAt).toBe('2026-07-20T01:02:03.000Z');
  });
  test('defines and enforces the complete operator matrix for every property type', () => {
    const matrixSource = allTypeSource();
    expect(Object.keys(DATABASE_QUERY_OPERATOR_MATRIX).sort()).toEqual(
      [...DATABASE_PROPERTY_TYPES].sort(),
    );

    for (const property of matrixSource.properties) {
      const allowed = databaseQueryOperatorsForProperty(property);
      expect(allowed).toEqual(DATABASE_QUERY_OPERATOR_MATRIX[property.type]);
      for (const operator of DATABASE_QUERY_OPERATORS) {
        const where =
          operator === 'is_empty' || operator === 'is_not_empty'
            ? { propertyId: property.id, operator }
            : {
                propertyId: property.id,
                operator,
                value: canonicalFilterValue(property, operator),
              };
        const execute = () =>
          queryDatabaseRecords({
            source: matrixSource,
            records: [],
            snapshotRevision: 'snapshot:operator-matrix',
            query: { where },
          });
        if (allowed.includes(operator)) expect(execute).not.toThrow();
        else expect(execute).toThrow(DatabaseQueryError);
      }
    }
  });

  test('filters, sorts, and projects Formula/Rollup index values while preserving typed errors', () => {
    const computedSource = DatabaseSourceSchema.parse({
      id: 'ds_computed',
      key: 'computed',
      name: 'Computed',
      recordMeaning: 'One computed query fixture',
      folder: 'computed',
      properties: [
        { id: 'prop_computed_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_formula_score',
          key: 'formula_score',
          name: 'Formula score',
          type: 'formula',
          source: '1',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'number',
            expression: { type: 'literal', valueType: 'number', value: 1 },
          },
        },
        {
          id: 'prop_computed_relation',
          key: 'relation',
          name: 'Relation',
          type: 'relation',
          targetSourceId: 'ds_computed',
          cardinality: 'many',
        },
        {
          id: 'prop_rollup_count',
          key: 'rollup_count',
          name: 'Rollup count',
          type: 'rollup',
          relationPropertyId: 'prop_computed_relation',
          targetPropertyId: 'prop_computed_title',
          function: 'count_all',
          targetValueType: 'text',
        },
      ],
    });
    const computedRecords: DatabaseRecord[] = [
      {
        ...record('rec_low', {
          prop_computed_title: 'Low',
          prop_formula_score: 2,
          prop_rollup_count: 1,
        }),
        sourceId: computedSource.id,
        computedResults: {
          prop_formula_score: { kind: 'value', valueType: 'number', value: 2 },
          prop_rollup_count: { kind: 'value', valueType: 'number', value: 1 },
        },
      },
      {
        ...record('rec_high', {
          prop_computed_title: 'High',
          prop_formula_score: 8,
          prop_rollup_count: 3,
        }),
        sourceId: computedSource.id,
        computedResults: {
          prop_formula_score: { kind: 'value', valueType: 'number', value: 8 },
          prop_rollup_count: { kind: 'value', valueType: 'number', value: 3 },
        },
      },
      {
        ...record('rec_error', { prop_computed_title: 'Error' }),
        sourceId: computedSource.id,
        computedResults: {
          prop_formula_score: {
            kind: 'error',
            problem: { code: 'divide_by_zero', message: 'Cannot divide by zero' },
          },
        },
      },
    ];
    expect(
      databaseQueryOperatorsForProperty(computedSource.properties[1] as DatabaseProperty),
    ).toContain('gt');
    expect(
      databaseQueryOperatorsForProperty(computedSource.properties[3] as DatabaseProperty),
    ).toContain('gte');
    const result = queryDatabaseRecords({
      source: computedSource,
      records: computedRecords,
      snapshotRevision: 'snapshot:computed-index',
      query: {
        where: { propertyId: 'prop_formula_score', operator: 'gt', value: 1 },
        sort: [{ propertyId: 'prop_rollup_count', direction: 'desc' }],
        select: ['prop_computed_title', 'prop_formula_score', 'prop_rollup_count'],
      },
    });
    expect(result.records.map((entry) => entry.id)).toEqual(['rec_high', 'rec_low']);
    expect(result.records[0]?.computedResults).toMatchObject({
      prop_formula_score: { kind: 'value', value: 8 },
      prop_rollup_count: { kind: 'value', value: 3 },
    });
    expect(DatabaseQueryResultSchema.safeParse(result).success).toBe(true);
  });

  test('executes prefix, suffix, and negative containment without type coercion', () => {
    const matrixSource = allTypeSource();
    const matrixRecords = [
      record('rec_all', {
        prop_all_title: 'Alpha launch',
        prop_all_text: 'Release Candidate',
        prop_all_number: 10,
        prop_all_checkbox: true,
        prop_all_date: '2026-07-19',
        prop_all_select: 'opt_all_alpha',
        prop_all_multi: ['opt_all_tag'],
        prop_all_url: 'https://example.com/Launch',
        prop_all_email: 'Agent@Example.com',
        prop_all_phone: '+82-10-1234-5678',
        prop_all_relation: ['rec_all_related'],
      }),
    ].map((entry) => ({ ...entry, sourceId: matrixSource.id }));
    const matchedIds = (propertyId: string, operator: DatabaseQueryOperator, value: string) =>
      queryDatabaseRecords({
        source: matrixSource,
        records: matrixRecords,
        snapshotRevision: 'snapshot:text-operators',
        query: { where: { propertyId, operator, value } },
      }).records.map((entry) => entry.id);

    expect(matchedIds('prop_all_text', 'starts_with', 'release')).toEqual(['rec_all']);
    expect(matchedIds('prop_all_text', 'ends_with', 'CANDIDATE')).toEqual(['rec_all']);
    expect(matchedIds('prop_all_title', 'does_not_contain', 'private')).toEqual(['rec_all']);
    expect(matchedIds('prop_all_multi', 'does_not_contain', 'opt_all_other')).toEqual(['rec_all']);
    expect(matchedIds('prop_all_relation', 'does_not_contain', 'rec_other')).toEqual(['rec_all']);
    expect(() => matchedIds('prop_all_multi', 'starts_with', 'opt')).toThrow(DatabaseQueryError);
  });

  test('filters, sorts, and projects Text by deterministic plain text while preserving markup', () => {
    const matrixSource = allTypeSource();
    const rich =
      'Line one\nOwner: [@Alice](synapsenote://person/person_alice) · [Task](synapsenote://record/rec_task)';
    const matrixRecords = [
      record('rec_rich', { prop_all_title: 'Rich', prop_all_text: rich }),
      record('rec_plain', { prop_all_title: 'Plain', prop_all_text: 'Zulu' }),
    ].map((entry) => ({ ...entry, sourceId: matrixSource.id }));
    const result = queryDatabaseRecords({
      source: matrixSource,
      records: matrixRecords,
      snapshotRevision: 'snapshot:rich-text',
      people: [
        {
          id: 'person_alice',
          key: 'alice',
          name: 'Alice',
          kind: 'local',
          subjectId: 'principal:alice',
          active: true,
        },
      ],
      query: {
        where: { propertyId: 'prop_all_text', operator: 'contains', value: 'owner: @alice' },
        sort: [{ propertyId: 'prop_all_text', direction: 'asc' }],
        select: ['prop_all_text'],
      },
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.values.prop_all_text).toBe(rich);
    expect(result.records[0]?.textProjections).toMatchObject({
      prop_all_text: {
        plainText: 'Line one\nOwner: @Alice · Task',
        references: [
          { kind: 'person', target: 'person_alice' },
          { kind: 'record', target: 'rec_task' },
        ],
      },
    });
    expect(result.people).toMatchObject([{ id: 'person_alice', key: 'alice', name: 'Alice' }]);
    expect(DatabaseQueryResultSchema.safeParse(result).success).toBe(true);
  });

  test('uses deterministic natural Unicode collation and keeps empty values last', () => {
    const matrixSource = allTypeSource();
    expect(DATABASE_QUERY_SORT_SEMANTICS).toEqual({
      version: 1,
      locale: 'und',
      normalization: 'NFKD',
      collation: 'unicode_code_point',
      case: 'insensitive_primary_uppercase_first_tertiary',
      diacritic: 'insensitive_primary_sensitive_secondary',
      naturalNumbers: 'ascii_decimal_runs',
      emptyValues: 'last_regardless_of_direction',
      arrays: 'sorted_elements_then_lexicographic',
      tieBreaker: 'record_id',
    });
    const sortable = [
      ['rec_upper', 'Item 2'],
      ['rec_lower', 'item 2'],
      ['rec_zero', 'item 02'],
      ['rec_accent', 'Ítem 2'],
      ['rec_ten', 'item 10'],
      ['rec_empty', ''],
      ['rec_missing', undefined],
    ].map(([id, text]) => ({
      ...record(String(id), {
        prop_all_title: String(id),
        ...(text === undefined ? {} : { prop_all_text: text }),
      }),
      sourceId: matrixSource.id,
    }));
    const sortedIds = (direction: 'asc' | 'desc') =>
      queryDatabaseRecords({
        source: matrixSource,
        records: sortable,
        snapshotRevision: 'snapshot:collation',
        query: { sort: [{ propertyId: 'prop_all_text', direction }] },
      }).records.map((entry) => entry.id);

    expect(sortedIds('asc')).toEqual([
      'rec_upper',
      'rec_lower',
      'rec_accent',
      'rec_zero',
      'rec_ten',
      'rec_empty',
      'rec_missing',
    ]);
    expect(sortedIds('desc')).toEqual([
      'rec_ten',
      'rec_zero',
      'rec_accent',
      'rec_lower',
      'rec_upper',
      'rec_empty',
      'rec_missing',
    ]);
  });

  test('sorts collection values elementwise and rejects pre-collation cursors', () => {
    const matrixSource = allTypeSource();
    const sortable = [
      ['rec_many', ['rec_2', 'rec_10']],
      ['rec_few', ['rec_2', 'rec_3']],
      ['rec_empty_array', []],
    ].map(([id, relation]) => ({
      ...record(String(id), {
        prop_all_title: String(id),
        prop_all_relation: relation as string[],
      }),
      sourceId: matrixSource.id,
    }));
    const result = queryDatabaseRecords({
      source: matrixSource,
      records: sortable,
      snapshotRevision: 'snapshot:array-collation',
      query: { sort: [{ propertyId: 'prop_all_relation', direction: 'asc' }] },
    });
    expect(result.records.map((entry) => entry.id)).toEqual([
      'rec_few',
      'rec_many',
      'rec_empty_array',
    ]);
    expect(() =>
      queryDatabaseRecords({
        source: matrixSource,
        records: sortable,
        snapshotRevision: 'snapshot:array-collation',
        query: { page: { limit: 1, cursor: 'v1:00000000:1' } },
      }),
    ).toThrow(DatabaseQueryError);
  });

  test('filters, sorts, projects, paginates, and reports truncation explicitly', () => {
    const first = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:1',
      query: {
        where: {
          and: [
            { propertyId: 'prop_status', operator: 'eq', value: 'opt_todo' },
            { propertyId: 'prop_tags', operator: 'contains', value: 'opt_auth' },
          ],
        },
        sort: [{ propertyId: 'prop_priority', direction: 'desc' }],
        select: ['prop_title', 'prop_priority'],
        page: { limit: 1 },
      },
    });

    expect(first).toMatchObject({
      sourceId: 'ds_tasks',
      snapshotRevision: 'snapshot:1',
      matched: 1,
      returned: 1,
      isComplete: true,
      nextCursor: null,
      truncatedBy: null,
      indexFreshness: 'snapshot',
    });
    expect(first.records).toEqual([
      {
        id: 'rec_a',
        path: 'tasks/rec_a.md',
        revision: 'rev:rec_a',
        values: { prop_title: 'Fix authentication', prop_priority: 3 },
      },
    ]);

    const paged = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:1',
      query: {
        sort: [{ propertyId: 'prop_priority', direction: 'desc' }],
        page: { limit: 2 },
      },
    });
    expect(paged).toMatchObject({
      matched: 3,
      returned: 2,
      isComplete: false,
      truncatedBy: 'page_limit',
    });
    expect(paged.nextCursor).toMatch(/^v2:[0-9a-f]{8}:2$/);

    const finalPage = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:1',
      query: {
        sort: [{ propertyId: 'prop_priority', direction: 'desc' }],
        page: { limit: 2, cursor: paged.nextCursor },
      },
    });
    expect(finalPage).toMatchObject({ returned: 1, isComplete: true, nextCursor: null });
  });

  test('calculates totals, groups, and subgroups over the full filtered snapshot before record paging', () => {
    const result = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:aggregation',
      query: {
        page: { limit: 1 },
        aggregate: {
          groupBy: [
            { propertyId: 'prop_status', direction: 'asc' },
            { propertyId: 'prop_tags', direction: 'asc', arrayMode: 'each' },
          ],
          calculations: [
            { id: 'records', function: 'count_all' },
            { id: 'priority_sum', function: 'sum', propertyId: 'prop_priority' },
            { id: 'priority_average', function: 'average', propertyId: 'prop_priority' },
            { id: 'priority_median', function: 'median', propertyId: 'prop_priority' },
            { id: 'earliest_due', function: 'earliest', propertyId: 'prop_due' },
          ],
          groupLimit: 20,
        },
      },
    });

    expect(result.returned).toBe(1);
    expect(result.aggregation).toMatchObject({
      matched: 3,
      totalGroups: 5,
      returnedGroups: 5,
      groupsComplete: true,
      truncatedBy: null,
      calculations: [
        { id: 'records', value: 3, unit: 'count' },
        { id: 'priority_sum', value: 9, unit: 'number' },
        { id: 'priority_average', value: 3, unit: 'number' },
        { id: 'priority_median', value: 3, unit: 'number' },
        { id: 'earliest_due', value: '2026-07-20', unit: 'date' },
      ],
    });
    expect(
      result.aggregation?.groups.map((group) => ({
        level: group.level,
        values: group.key.map((item) => item.value),
        matched: group.matched,
      })),
    ).toEqual([
      { level: 1, values: ['opt_done'], matched: 1 },
      { level: 1, values: ['opt_todo'], matched: 2 },
      { level: 2, values: ['opt_done', 'opt_auth'], matched: 1 },
      { level: 2, values: ['opt_todo', 'opt_auth'], matched: 1 },
      { level: 2, values: ['opt_todo', 'opt_ui'], matched: 1 },
    ]);
    expect(result.groupMemberships).toEqual({
      rec_a: [
        [
          { propertyId: 'prop_status', value: 'opt_todo' },
          { propertyId: 'prop_tags', value: 'opt_auth' },
        ],
      ],
    });
    expect(DatabaseQueryResultSchema.safeParse(result).success).toBe(true);
  });

  test('queries date ranges by start while calculations cover their complete span', () => {
    const dateRecords = [
      record('rec_range', {
        prop_title: 'Conference',
        prop_due: {
          start: '2026-07-20',
          end: '2026-07-25',
          timeZone: 'Asia/Seoul',
        },
      }),
      record('rec_point', { prop_title: 'Follow-up', prop_due: '2026-07-22' }),
    ];
    const result = queryDatabaseRecords({
      source: source(),
      records: dateRecords,
      snapshotRevision: 'snapshot:date-ranges',
      query: {
        where: { propertyId: 'prop_due', operator: 'gte', value: '2026-07-21' },
        sort: [{ propertyId: 'prop_due', direction: 'asc' }],
      },
    });
    expect(result.records.map((item) => item.id)).toEqual(['rec_point']);
    expect(
      queryDatabaseRecords({
        source: source(),
        records: [
          record('rec_instant', {
            prop_title: 'Same instant',
            prop_due: {
              start: '2026-07-20T09:00:00+09:00',
              timeZone: 'Asia/Seoul',
            },
          }),
        ],
        snapshotRevision: 'snapshot:date-instant-equality',
        query: {
          where: { propertyId: 'prop_due', operator: 'eq', value: '2026-07-20T00:00:00Z' },
        },
      }).records.map((item) => item.id),
    ).toEqual(['rec_instant']);

    const aggregate = queryDatabaseRecords({
      source: source(),
      records: dateRecords,
      snapshotRevision: 'snapshot:date-range-calculations',
      query: {
        aggregate: {
          calculations: [
            { id: 'earliest', function: 'earliest', propertyId: 'prop_due' },
            { id: 'latest', function: 'latest', propertyId: 'prop_due' },
            { id: 'span', function: 'date_range', propertyId: 'prop_due' },
          ],
        },
      },
    });
    expect(aggregate.aggregation?.calculations).toEqual([
      expect.objectContaining({ id: 'earliest', value: '2026-07-20' }),
      expect.objectContaining({ id: 'latest', value: '2026-07-25' }),
      expect.objectContaining({ id: 'span', value: 432_000_000 }),
    ]);
  });

  test('implements the complete per-column calculation matrix with explicit units', () => {
    const matrixSource = allTypeSource();
    const matrixRecords = [
      {
        ...record('rec_calc_a', {
          prop_all_title: 'Alpha',
          prop_all_text: 'same',
          prop_all_number: 1,
          prop_all_checkbox: true,
          prop_all_date: '2026-07-19',
        }),
        sourceId: matrixSource.id,
      },
      {
        ...record('rec_calc_b', {
          prop_all_title: 'Beta',
          prop_all_text: 'same',
          prop_all_number: 3,
          prop_all_checkbox: false,
          prop_all_date: '2026-07-21',
        }),
        sourceId: matrixSource.id,
      },
      {
        ...record('rec_calc_c', { prop_all_title: 'Gamma' }),
        sourceId: matrixSource.id,
      },
    ];
    const calculations = [
      { id: 'all', function: 'count_all' },
      { id: 'values', function: 'count_values', propertyId: 'prop_all_text' },
      { id: 'unique', function: 'count_unique', propertyId: 'prop_all_text' },
      { id: 'empty', function: 'percent_empty', propertyId: 'prop_all_number' },
      { id: 'not_empty', function: 'percent_not_empty', propertyId: 'prop_all_number' },
      { id: 'sum', function: 'sum', propertyId: 'prop_all_number' },
      { id: 'average', function: 'average', propertyId: 'prop_all_number' },
      { id: 'median', function: 'median', propertyId: 'prop_all_number' },
      { id: 'min', function: 'min', propertyId: 'prop_all_number' },
      { id: 'max', function: 'max', propertyId: 'prop_all_number' },
      { id: 'range', function: 'range', propertyId: 'prop_all_number' },
      { id: 'earliest', function: 'earliest', propertyId: 'prop_all_date' },
      { id: 'latest', function: 'latest', propertyId: 'prop_all_date' },
      { id: 'date_range', function: 'date_range', propertyId: 'prop_all_date' },
      { id: 'checked', function: 'checked', propertyId: 'prop_all_checkbox' },
      { id: 'unchecked', function: 'unchecked', propertyId: 'prop_all_checkbox' },
      {
        id: 'percent_checked',
        function: 'percent_checked',
        propertyId: 'prop_all_checkbox',
      },
      {
        id: 'percent_unchecked',
        function: 'percent_unchecked',
        propertyId: 'prop_all_checkbox',
      },
    ];
    const result = queryDatabaseRecords({
      source: matrixSource,
      records: matrixRecords,
      snapshotRevision: 'snapshot:calculation-matrix',
      query: { aggregate: { calculations } },
    });
    const byId = new Map(result.aggregation?.calculations.map((item) => [item.id, item]));
    expect(byId.get('all')).toMatchObject({ value: 3, unit: 'count' });
    expect(byId.get('values')).toMatchObject({ value: 2, unit: 'count' });
    expect(byId.get('unique')).toMatchObject({ value: 1, unit: 'count' });
    expect(byId.get('empty')?.value).toBeCloseTo(100 / 3);
    expect(byId.get('not_empty')?.value).toBeCloseTo(200 / 3);
    for (const [id, value] of [
      ['sum', 4],
      ['average', 2],
      ['median', 2],
      ['min', 1],
      ['max', 3],
      ['range', 2],
    ] as const) {
      expect(byId.get(id)).toMatchObject({ value, unit: 'number' });
    }
    expect(byId.get('earliest')).toMatchObject({ value: '2026-07-19', unit: 'date' });
    expect(byId.get('latest')).toMatchObject({ value: '2026-07-21', unit: 'date' });
    expect(byId.get('date_range')).toMatchObject({ value: 172_800_000, unit: 'milliseconds' });
    expect(byId.get('checked')).toMatchObject({ value: 1, unit: 'count' });
    expect(byId.get('unchecked')).toMatchObject({ value: 1, unit: 'count' });
    expect(byId.get('percent_checked')?.value).toBeCloseTo(100 / 3);
    expect(byId.get('percent_unchecked')?.value).toBeCloseTo(100 / 3);
  });

  test('reports deterministic empty groups, calculation nulls, and explicit group truncation', () => {
    const sparse = [
      ...records,
      record('rec_d', { prop_title: 'Unscheduled', prop_status: 'opt_todo', prop_tags: [] }),
    ];
    const result = queryDatabaseRecords({
      source: source(),
      records: sparse,
      snapshotRevision: 'snapshot:sparse-aggregation',
      query: {
        aggregate: {
          groupBy: [
            {
              propertyId: 'prop_tags',
              direction: 'desc',
              arrayMode: 'each',
              includeEmpty: true,
            },
          ],
          calculations: [
            { id: 'average', function: 'average', propertyId: 'prop_priority' },
            { id: 'empty', function: 'percent_empty', propertyId: 'prop_priority' },
          ],
          groupLimit: 2,
        },
      },
    });
    expect(result.aggregation).toMatchObject({
      totalGroups: 3,
      returnedGroups: 2,
      groupsComplete: false,
      truncatedBy: 'group_limit',
      calculations: [
        { id: 'average', value: 3 },
        { id: 'empty', value: 25, unit: 'percentage' },
      ],
    });
    expect(result.aggregation?.groups.map((group) => group.key[0]?.value)).toEqual([
      'opt_ui',
      'opt_auth',
    ]);
  });

  test('binds record cursors to the exact aggregation contract', () => {
    const first = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:aggregate-cursor',
      query: {
        page: { limit: 1 },
        aggregate: { calculations: [{ id: 'records', function: 'count_all' }] },
      },
    });
    expect(first.nextCursor).not.toBeNull();
    expect(() =>
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:aggregate-cursor',
        query: {
          page: { limit: 1, cursor: first.nextCursor ?? undefined },
          aggregate: {
            calculations: [{ id: 'priority_sum', function: 'sum', propertyId: 'prop_priority' }],
          },
        },
      }),
    ).toThrow(DatabaseQueryError);
  });

  test('bounds array group fan-out before a record can create combinatorial memberships', () => {
    const matrixSource = allTypeSource();
    const wide = {
      ...record('rec_wide', {
        prop_all_title: 'Wide relation',
        prop_all_relation: Array.from({ length: 11 }, (_, index) => `rec_related_${index}`),
      }),
      sourceId: matrixSource.id,
    };
    expect(() =>
      queryDatabaseRecords({
        source: matrixSource,
        records: [wide],
        snapshotRevision: 'snapshot:group-fanout',
        query: {
          aggregate: {
            groupBy: [{ propertyId: 'prop_all_relation', arrayMode: 'each' }],
            membershipLimit: 10,
          },
        },
      }),
    ).toThrow(DatabaseQueryError);
  });

  test('rejects duplicate, missing-property, and type-incompatible calculations', () => {
    for (const aggregate of [
      {
        calculations: [
          { id: 'count', function: 'count_all' },
          { id: 'count', function: 'count_all' },
        ],
      },
      { calculations: [{ id: 'sum', function: 'sum', propertyId: 'prop_title' }] },
      { calculations: [{ id: 'average', function: 'average' }] },
      { calculations: [{ id: 'count', function: 'count_all', propertyId: 'prop_title' }] },
    ]) {
      expect(() =>
        queryDatabaseRecords({
          source: source(),
          records,
          snapshotRevision: 'snapshot:invalid-aggregation',
          query: { aggregate },
        }),
      ).toThrow(DatabaseQueryError);
    }
  });

  test('returns candidate properties instead of guessing an unknown ID', () => {
    try {
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:1',
        query: { select: ['prop_missing'] },
      });
      throw new Error('expected query to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseQueryError);
      const queryError = error as DatabaseQueryError;
      expect(queryError.code).toBe('unknown_property');
      expect(queryError.details.candidates).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'prop_title', key: 'title' })]),
      );
    }
  });

  test('rejects incompatible operators and unknown canonical options', () => {
    expect(() =>
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:1',
        query: {
          where: { propertyId: 'prop_status', operator: 'gt', value: 'opt_todo' },
        },
      }),
    ).toThrow(DatabaseQueryError);

    try {
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:1',
        query: {
          where: { propertyId: 'prop_status', operator: 'eq', value: 'todo' },
        },
      });
      throw new Error('expected query to fail');
    } catch (error) {
      expect((error as DatabaseQueryError).code).toBe('invalid_value');
    }
  });

  test('rejects duplicate record IDs and invalid cursors', () => {
    const duplicateRecord = records[0];
    if (!duplicateRecord) throw new Error('fixture record is missing');
    expect(() =>
      queryDatabaseRecords({
        source: source(),
        records: [duplicateRecord, duplicateRecord],
        snapshotRevision: 'snapshot:1',
      }),
    ).toThrow('appears more than once');

    expect(() =>
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:1',
        query: { page: { limit: 2, cursor: 'v2:99' } },
      }),
    ).toThrow('invalid');

    const firstPage = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:1',
      query: { page: { limit: 1 } },
    });
    expect(() =>
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:2',
        query: { page: { limit: 1, cursor: firstPage.nextCursor ?? undefined } },
      }),
    ).toThrow('invalid');
  });

  test('durably paginates a large snapshot without overlap or server-side cursor state', () => {
    const largeSource = source();
    const largeRecords = Array.from({ length: 10_005 }, (_, index) =>
      record(`rec_large_${String(index).padStart(5, '0')}`, {
        prop_title: `Task ${index}`,
        prop_priority: index,
      }),
    ).reverse();
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = queryDatabaseRecords({
        source: largeSource,
        records: largeRecords,
        snapshotRevision: 'snapshot:large-durable',
        query: { page: { limit: 500, ...(cursor ? { cursor } : {}) } },
      });
      ids.push(...result.records.map((entry) => entry.id));
      cursor = result.nextCursor ?? undefined;
      pages += 1;
      if (pages > 100) throw new Error('pagination failed to converge');
    } while (cursor);

    expect(pages).toBe(21);
    expect(ids).toHaveLength(10_005);
    expect(new Set(ids).size).toBe(10_005);
    expect(ids[0]).toBe('rec_large_00000');
    expect(ids.at(-1)).toBe('rec_large_10004');
  });

  test('searches the complete source snapshot before applying pagination', () => {
    const firstPage = queryDatabaseRecords({
      source: source(),
      records,
      snapshotRevision: 'snapshot:search',
      query: { search: 'incident', page: { limit: 1 } },
    });
    expect(firstPage.matched).toBe(1);
    expect(firstPage.records.map((entry) => entry.id)).toEqual(['rec_c']);
    expect(firstPage.isComplete).toBe(true);
    expect(
      queryDatabaseRecords({
        source: source(),
        records,
        snapshotRevision: 'snapshot:search',
        query: { search: 'does-not-exist', page: { limit: 1 } },
      }).records,
    ).toEqual([]);
  });

  test('cooperatively cancels bounded query stages before producing a partial result', () => {
    const largeRecords = Array.from({ length: 2_000 }, (_, index) =>
      record(`rec_cancel_${String(index).padStart(4, '0')}`, {
        prop_title: `Task ${index}`,
        prop_priority: 2_000 - index,
      }),
    );
    let checkpoints = 0;
    expect(() =>
      queryDatabaseRecords({
        source: source(),
        records: largeRecords,
        snapshotRevision: 'snapshot:cancel',
        query: {
          sort: [{ propertyId: 'prop_priority', direction: 'asc' }],
          page: { limit: 500 },
        },
        throwIfCancelled: () => {
          checkpoints += 1;
          if (checkpoints === 4) throw new DOMException('cancelled', 'AbortError');
        },
      }),
    ).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(checkpoints).toBe(4);
  });
});
