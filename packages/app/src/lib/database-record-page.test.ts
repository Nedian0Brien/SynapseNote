import { describe, expect, test } from 'bun:test';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { databaseRecordMetadata, databaseValueFromFrontmatter } from './database-record-page.ts';

const property = (input: Partial<DatabaseProperty> & Pick<DatabaseProperty, 'type'>) =>
  ({
    id: `prop_${input.type}`,
    key: input.type,
    name: input.type,
    description: '',
    required: false,
    options: [],
    semantics: {
      constraints: { unique: false },
      inference: { mode: 'explicit_only', allowAgentSuggestions: false },
      sensitivity: 'inherit',
    },
    ...input,
  }) as DatabaseProperty;

describe('database record page bridge', () => {
  test('recognizes only complete stable record metadata', () => {
    expect(
      databaseRecordMetadata({
        _sn: { database_id: 'db_tasks', source_id: 'ds_tasks', record_id: 'rec_first' },
      }),
    ).toMatchObject({ database_id: 'db_tasks', source_id: 'ds_tasks', record_id: 'rec_first' });
    expect(databaseRecordMetadata({ _sn: { database_id: 'db_tasks' } })).toBeNull();
    expect(databaseRecordMetadata({ title: 'ordinary note' })).toBeNull();
  });

  test('maps readable option keys to stable IDs and preserves scalar types', () => {
    const select = property({
      type: 'select',
      options: [{ id: 'opt_todo', key: 'todo', name: 'To do', color: 'gray' }],
    });
    const multi = property({
      type: 'multi_select',
      options: [
        { id: 'opt_a', key: 'a', name: 'A', color: 'blue' },
        { id: 'opt_b', key: 'b', name: 'B', color: 'green' },
      ],
    });
    const status = property({
      type: 'status',
      groups: [
        { id: 'stg_todo', key: 'todo', name: 'To-do', category: 'todo' },
        {
          id: 'stg_doing',
          key: 'in_progress',
          name: 'In progress',
          category: 'in_progress',
        },
        { id: 'stg_complete', key: 'complete', name: 'Complete', category: 'complete' },
      ],
      options: [
        { id: 'opt_not_started', key: 'not_started', name: 'Not started', groupId: 'stg_todo' },
        { id: 'opt_doing', key: 'doing', name: 'Doing', groupId: 'stg_doing' },
        { id: 'opt_done', key: 'done', name: 'Done', groupId: 'stg_complete' },
      ],
    });
    expect(databaseValueFromFrontmatter(select, 'todo')).toBe('opt_todo');
    expect(databaseValueFromFrontmatter(multi, ['b', 'a'])).toEqual(['opt_b', 'opt_a']);
    expect(databaseValueFromFrontmatter(status, 'doing')).toBe('opt_doing');
    expect(
      databaseValueFromFrontmatter(
        property({ type: 'person', multiple: true }),
        ['owner', 'codex'],
        [
          {
            id: 'person_owner',
            key: 'owner',
            name: 'Owner',
            kind: 'collaborator',
            active: true,
          },
          {
            id: 'person_codex',
            key: 'codex',
            name: 'Codex',
            kind: 'agent',
            subjectId: 'agent:codex',
            active: true,
          },
        ],
      ),
    ).toEqual(['person_owner', 'person_codex']);
    expect(
      databaseValueFromFrontmatter(property({ type: 'files' }), [
        { kind: 'local', path: 'assets/brief.pdf', caption: 'Approved' },
        { kind: 'external', url: 'https://cdn.example.com/demo.mp4', name: 'Demo' },
      ]),
    ).toEqual([
      { kind: 'local', path: 'assets/brief.pdf', caption: 'Approved' },
      { kind: 'external', url: 'https://cdn.example.com/demo.mp4', name: 'Demo' },
    ]);
    expect(databaseValueFromFrontmatter(property({ type: 'number' }), 12.5)).toBe(12.5);
    expect(databaseValueFromFrontmatter(property({ type: 'checkbox' }), true)).toBe(true);
    expect(
      databaseValueFromFrontmatter(property({ type: 'date' }), {
        start: '2026-07-20',
        end: '2026-07-22',
        timeZone: 'Asia/Seoul',
      }),
    ).toEqual({ start: '2026-07-20', end: '2026-07-22', timeZone: 'Asia/Seoul' });
    expect(
      databaseValueFromFrontmatter(
        property({ type: 'relation', targetSourceId: 'ds_other', cardinality: 'many' }),
        ['rec_a', 'rec_b'],
      ),
    ).toEqual(['rec_a', 'rec_b']);
  });

  test('refuses invalid Relation, option, and Files values', () => {
    expect(() =>
      databaseValueFromFrontmatter(
        property({ type: 'relation', targetSourceId: 'ds_other', cardinality: 'many' }),
        ['rec_a', 'rec_a'],
      ),
    ).toThrow('unique');
    expect(() =>
      databaseValueFromFrontmatter(
        property({
          type: 'select',
          options: [{ id: 'opt_a', key: 'a', name: 'A', color: 'blue' }],
        }),
        'missing',
      ),
    ).toThrow('valid option');
    expect(() =>
      databaseValueFromFrontmatter(property({ type: 'files' }), [
        { kind: 'local', path: '../escape.pdf' },
      ]),
    ).toThrow('unique safe local assets');
  });
});
