import { describe, expect, test } from 'bun:test';
import {
  formulaComputedResultToDatabaseValue,
  materializeDatabaseDerivedRecords,
} from './derived-records.ts';
import { formulaErrorResult, formulaValueResult } from './formula-result.ts';
import type { DatabaseRecord } from './record.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

const definition = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_derived',
  key: 'derived',
  name: 'Derived values',
  contract: {
    purpose: 'Verify rebuildable computed projections',
    canonicality: 'canonical',
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' },
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
        { id: 'prop_task_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
        {
          id: 'prop_created_time',
          key: 'created_time',
          name: 'Created time',
          type: 'created_time',
        },
        {
          id: 'prop_created_formula',
          key: 'created_formula',
          name: 'Created formula',
          type: 'formula',
          source: 'prop("created_time")',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'date',
            expression: { type: 'property', propertyId: 'prop_created_time' },
          },
        },
        {
          id: 'prop_created_by',
          key: 'created_by',
          name: 'Created by',
          type: 'created_by',
        },
        {
          id: 'prop_created_by_formula',
          key: 'created_by_formula',
          name: 'Created by formula',
          type: 'formula',
          source: 'prop("created_by")',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'text',
            expression: { type: 'property', propertyId: 'prop_created_by' },
          },
        },
        {
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
        },
        {
          id: 'prop_broken',
          key: 'broken',
          name: 'Broken',
          type: 'formula',
          source: 'prop("score") / 0',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'number',
            expression: {
              type: 'binary',
              operator: 'divide',
              left: { type: 'property', propertyId: 'prop_score' },
              right: { type: 'literal', valueType: 'number', value: 0 },
            },
          },
        },
        {
          id: 'prop_projects',
          key: 'projects',
          name: 'Projects',
          type: 'relation',
          targetSourceId: 'ds_projects',
          cardinality: 'many',
        },
        {
          id: 'prop_visible_budget',
          key: 'visible_budget',
          name: 'Visible budget',
          type: 'rollup',
          relationPropertyId: 'prop_projects',
          targetPropertyId: 'prop_budget',
          function: 'sum',
          targetValueType: 'number',
        },
      ],
    },
    {
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [
        { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' },
      ],
    },
  ],
});

function record(id: string, sourceId: string, values: DatabaseRecord['values']): DatabaseRecord {
  return {
    id,
    databaseId: definition.id,
    sourceId,
    path: `${sourceId}/${id}.md`,
    revision: `sha256:${'a'.repeat(64)}`,
    values,
    body: '',
  };
}

describe('permission-scoped derived record materialization', () => {
  test('keeps canonical values separate while indexing successful Formula and Rollup results', () => {
    const records = [
      record('rec_task', 'ds_tasks', {
        prop_task_title: 'Plan',
        prop_score: 4,
        prop_created_time: '2026-07-18T08:00:00.000Z',
        prop_created_by: 'agent|agent:codex',
        prop_projects: ['rec_visible', 'rec_denied'],
      }),
      record('rec_visible', 'ds_projects', {
        prop_project_title: 'Visible',
        prop_budget: 10,
      }),
      record('rec_denied', 'ds_projects', {
        prop_project_title: 'Denied',
        prop_budget: 1_000_000,
      }),
    ];

    const materialized = materializeDatabaseDerivedRecords({
      definition,
      records,
      context: { now: '2026-07-20T00:00:00.000Z', timeZone: 'UTC', locale: 'en' },
      permissionRevision: `sha256:${'b'.repeat(64)}`,
      canReadRecord: (candidate) => candidate.id !== 'rec_denied',
    });
    const task = materialized.find((candidate) => candidate.id === 'rec_task');
    expect(records[0]?.values).not.toHaveProperty('prop_double_score');
    expect(task?.values).toMatchObject({
      prop_double_score: 8,
    });
    expect(task?.computedResults?.prop_created_formula).toEqual(
      formulaValueResult('date', { kind: 'date', value: '2026-07-18T08:00:00.000Z' }),
    );
    expect(task?.computedResults?.prop_created_by_formula).toEqual(
      formulaValueResult('text', 'agent|agent:codex'),
    );
    expect(task?.values).not.toHaveProperty('prop_broken');
    expect(task?.computedResults?.prop_double_score).toEqual(formulaValueResult('number', 8));
    expect(task?.computedResults?.prop_broken).toMatchObject({
      kind: 'error',
      problem: { code: 'divide_by_zero' },
    });
    expect(task?.computedResults?.prop_visible_budget).toMatchObject({
      kind: 'error',
      problem: { code: 'permission_denied' },
    });
  });

  test('does not fabricate a query value for nulls, errors, nested, or mixed lists', () => {
    expect(formulaComputedResultToDatabaseValue(formulaValueResult('null', null))).toBeUndefined();
    expect(
      formulaComputedResultToDatabaseValue(
        formulaErrorResult({ code: 'domain_error', message: 'not sortable' }),
      ),
    ).toBeUndefined();
    expect(
      formulaComputedResultToDatabaseValue(formulaValueResult('list', ['one', 'two'])),
    ).toEqual(['one', 'two']);
    expect(formulaComputedResultToDatabaseValue(formulaValueResult('list', [1, 2]))).toEqual([
      1, 2,
    ]);
    expect(
      formulaComputedResultToDatabaseValue(formulaValueResult('list', ['one', 2])),
    ).toBeUndefined();
  });

  test('propagates invalid preserved dependencies as typed errors instead of null', () => {
    const task = record('rec_task', 'ds_tasks', {
      prop_task_title: 'Invalid dependency',
      prop_projects: ['rec_project'],
    });
    task.invalidValues = { prop_score: 'high' };
    const project = record('rec_project', 'ds_projects', {
      prop_project_title: 'Invalid budget',
    });
    project.invalidValues = { prop_budget: 'lots' };
    const materialized = materializeDatabaseDerivedRecords({
      definition,
      records: [task, project],
      context: { now: '2026-07-20T00:00:00.000Z', timeZone: 'UTC', locale: 'en' },
      permissionRevision: `sha256:${'c'.repeat(64)}`,
    });
    const computed = materialized.find((candidate) => candidate.id === task.id)?.computedResults;
    expect(computed?.prop_double_score).toMatchObject({
      kind: 'error',
      problem: { code: 'dependency_error', cause: { code: 'result_type_mismatch' } },
    });
    expect(computed?.prop_visible_budget).toMatchObject({
      kind: 'error',
      problem: { code: 'dependency_error', cause: { code: 'result_type_mismatch' } },
    });
  });

  test('keeps broken relation and Rollup targets as explicit derived errors', () => {
    const task = record('rec_task', 'ds_tasks', {
      prop_task_title: 'Broken relation',
      prop_projects: ['rec_missing'],
    });
    const materialized = materializeDatabaseDerivedRecords({
      definition,
      records: [task],
      context: { now: '2026-07-20T00:00:00.000Z', timeZone: 'UTC', locale: 'en' },
      permissionRevision: `sha256:${'c'.repeat(64)}`,
    });
    const projected = materialized[0];
    expect(projected?.computedResults?.prop_visible_budget).toMatchObject({
      kind: 'error',
      problem: { code: 'missing_record' },
    });
  });
});
