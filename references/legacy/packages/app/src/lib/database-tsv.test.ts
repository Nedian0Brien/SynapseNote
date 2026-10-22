import { describe, expect, test } from 'bun:test';
import type { DatabaseSource, ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import { databaseRecordReferenceMarkup } from '@nedian0brien/synapsenote-core';
import {
  databaseRangeToTsv,
  databaseRecordsToTsv,
  databaseValueFromClipboard,
  databaseValueToClipboard,
  encodeTsv,
  parseTsv,
  planDatabaseTsvPaste,
} from './database-tsv.ts';

const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  includeSubfolders: false,
  properties: [
    {
      id: 'prop_title',
      key: 'title',
      name: 'Title',
      type: 'title',
      required: true,
      semantics: { constraints: { unique: false } },
    },
    {
      id: 'prop_score',
      key: 'score',
      name: 'Score',
      type: 'number',
      semantics: { constraints: { unique: false, min: 0, max: 100 } },
    },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt_todo', key: 'todo', name: 'To do', color: 'gray' }],
      semantics: { constraints: { unique: false } },
    },
  ],
} as DatabaseSource;

const records: ProjectedDatabaseRecord[] = [
  {
    id: 'rec_a',
    path: 'tasks/a.md',
    revision: `sha256:${'a'.repeat(64)}`,
    values: {
      prop_title: 'A\twith tab',
      prop_score: 12.5,
      prop_status: 'opt_todo',
    },
  },
  {
    id: 'rec_b',
    path: 'tasks/b.md',
    revision: `sha256:${'b'.repeat(64)}`,
    values: { prop_title: 'B', prop_score: 20, prop_status: 'opt_todo' },
  },
];

describe('database TSV clipboard contract', () => {
  test('round-trips tabs, quotes, CRLF, and multiline cells', () => {
    const rows = [
      ['plain', 'tab\tvalue', 'line one\nline two'],
      ['"quoted"', '', 'tail'],
    ];
    expect(parseTsv(encodeTsv(rows))).toEqual(rows);
    expect(parseTsv('a\tb\r\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(() => parseTsv('a\tb\nc')).toThrow('same number of columns');
  });

  test('preserves canonical Text reference markup through clipboard encoding', () => {
    const property = {
      id: 'prop_notes',
      key: 'notes',
      name: 'Notes',
      type: 'text',
    } as const;
    const markup = `See ${databaseRecordReferenceMarkup('rec_target', 'Target')}\nDetails`;
    const serialized = databaseValueToClipboard(property as never, markup);
    expect(databaseValueFromClipboard(property as never, serialized)).toBe(markup);
    expect(parseTsv(encodeTsv([[serialized]]))).toEqual([[markup]]);
  });

  test('exports locale-neutral numbers and stable option keys', () => {
    const tsv = databaseRecordsToTsv({ source, records });
    expect(parseTsv(tsv)).toEqual([
      ['Title', 'Score', 'Status'],
      ['A\twith tab', '12.5', 'todo'],
      ['B', '20', 'todo'],
    ]);
  });

  test('exports Unique IDs with their current prefix and rejects pasted allocation values', () => {
    const uniqueId = {
      id: 'prop_ticket',
      key: 'ticket',
      name: 'Ticket',
      type: 'unique_id',
      prefix: 'TASK',
      nextNumber: 43,
      required: false,
      aliases: [],
      semantics: {
        constraints: { unique: false },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
      },
    } as const;
    expect(databaseValueToClipboard(uniqueId, 42)).toBe('TASK-42');
    expect(() => databaseValueFromClipboard(uniqueId, 'TASK-43')).toThrow('cannot be pasted');
  });

  test('round-trips Place values as canonical privacy-preserving JSON', () => {
    const place = {
      id: 'prop_place',
      key: 'place',
      name: 'Place',
      type: 'place',
      externalSearch: 'disabled',
      externalMap: 'disabled',
      required: false,
      aliases: [],
      semantics: {
        constraints: { unique: false },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
      },
    } as const;
    const value = {
      label: 'City Hall',
      address: 'Seoul',
      lat: 37.57,
      lon: 126.98,
      precision: 'approximate' as const,
      source: 'manual' as const,
    };
    const serialized = databaseValueToClipboard(place, value);
    expect(serialized).toBe(
      '{"label":"City Hall","address":"Seoul","lat":37.57,"lon":126.98,"precision":"approximate","source":"manual"}',
    );
    expect(databaseValueFromClipboard(place, serialized)).toEqual(value);
  });

  test('exports read-only metadata times as canonical ISO timestamps', () => {
    const temporalSource = {
      ...source,
      properties: [
        source.properties[0],
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
        {
          id: 'prop_last_edited_by',
          key: 'last_edited_by',
          name: 'Last edited by',
          type: 'last_edited_by',
          required: false,
          aliases: [],
          semantics: {
            constraints: { unique: false },
            inferencePolicy: 'explicit_only',
            sensitivity: 'inherit',
          },
        },
      ],
    } as DatabaseSource;
    const temporalRecord: ProjectedDatabaseRecord = {
      id: 'rec_temporal',
      path: 'tasks/temporal.md',
      revision: null,
      values: {
        prop_title: 'Temporal',
        prop_created_time: '2026-07-18T08:00:00.000Z',
        prop_last_edited_time: '2026-07-20T09:30:00.000Z',
        prop_created_by: 'agent|agent:codex',
        prop_last_edited_by: 'filesystem|local',
      },
    };
    expect(
      parseTsv(
        databaseRecordsToTsv({
          source: temporalSource,
          records: [temporalRecord],
        }),
      ),
    ).toEqual([
      ['Title', 'Created time', 'Last edited time', 'Created by', 'Last edited by'],
      [
        'Temporal',
        '2026-07-18T08:00:00.000Z',
        '2026-07-20T09:30:00.000Z',
        'agent|agent:codex',
        'filesystem|local',
      ],
    ]);
  });

  test('exports Verification as canonical JSON and refuses clipboard attribution writes', () => {
    const property = {
      id: 'prop_verification',
      key: 'verification',
      name: 'Verification',
      type: 'verification',
    } as const;
    const value = {
      state: 'verified' as const,
      verifiedAt: '2026-07-20T00:00:00.000Z',
      verifiedBy: { kind: 'agent' as const, principal_id: 'agent:reviewer' },
      evidenceRevision: `sha256:${'a'.repeat(64)}`,
    };
    expect(databaseValueToClipboard(property as never, value)).toBe(JSON.stringify(value));
    expect(() => databaseValueFromClipboard(property as never, JSON.stringify(value))).toThrow(
      'cannot be pasted',
    );
  });

  test('exports computed nulls and typed errors explicitly instead of empty cells', () => {
    const computedSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_formula',
          key: 'formula',
          name: 'Formula',
          type: 'formula',
          source: 'prop("score") / 0',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'number',
            expression: { type: 'literal', valueType: 'number', value: 0 },
          },
        },
        {
          id: 'prop_rollup',
          key: 'rollup',
          name: 'Rollup',
          type: 'rollup',
          relationPropertyId: 'prop_relation',
          targetPropertyId: 'prop_budget',
          function: 'average',
          targetValueType: 'number',
        },
      ],
    } as DatabaseSource;
    const computedRecord: ProjectedDatabaseRecord = {
      id: 'rec_computed',
      path: 'tasks/computed.md',
      revision: null,
      values: { prop_title: 'Computed' },
      computedResults: {
        prop_formula: {
          kind: 'error',
          problem: { code: 'divide_by_zero', message: 'Cannot divide by zero' },
        },
        prop_rollup: { kind: 'value', valueType: 'null', value: null },
      },
    };

    expect(
      parseTsv(
        databaseRecordsToTsv({
          source: computedSource,
          records: [computedRecord],
        }),
      ),
    ).toEqual([
      ['Title', 'Formula', 'Rollup'],
      ['Computed', '#ERROR(divide_by_zero): Cannot divide by zero', 'null'],
    ]);
  });

  test('exports invalid preserved values explicitly without treating them as empty', () => {
    const invalid: ProjectedDatabaseRecord = {
      id: 'rec_invalid',
      path: 'tasks/invalid.md',
      revision: null,
      values: { prop_title: 'Invalid' },
      invalidValues: { prop_score: 'high' },
      issues: [
        {
          code: 'invalid_property_value',
          propertyId: 'prop_score',
          propertyKey: 'score',
          message: 'Score must be a finite number',
        },
      ],
    };
    expect(parseTsv(databaseRecordsToTsv({ source, records: [invalid] }))[1]).toEqual([
      'Invalid',
      '#INVALID(invalid_property_value): high',
      '',
    ]);
  });

  test('exports a normalized rectangular range without headers', () => {
    expect(
      parseTsv(
        databaseRangeToTsv({
          records,
          properties: source.properties,
          rowStart: 1,
          rowEnd: 0,
          columnStart: 2,
          columnEnd: 1,
        }),
      ),
    ).toEqual([
      ['12.5', 'todo'],
      ['20', 'todo'],
    ]);
    expect(() =>
      databaseRangeToTsv({
        records,
        properties: source.properties,
        rowStart: 0,
        rowEnd: 2,
        columnStart: 0,
        columnEnd: 0,
      }),
    ).toThrow('outside the loaded table');
  });

  test('parses typed values and validates the complete rectangular paste before mutation', () => {
    const score = source.properties.at(1);
    const status = source.properties.at(2);
    if (!score || !status) throw new Error('Expected clipboard fixture properties');
    expect(databaseValueFromClipboard(score, '99.5')).toBe(99.5);
    expect(databaseValueFromClipboard(status, 'To do')).toBe('opt_todo');
    expect(() => databaseValueFromClipboard(score, '1,000')).toThrow('finite number');
    const changes = planDatabaseTsvPaste({
      source,
      records,
      anchorRecordId: 'rec_a',
      anchorPropertyId: 'prop_score',
      tsv: '15\ttodo\n25\tTo do',
    });
    expect(changes.map(({ record, property, value }) => [record.id, property.id, value])).toEqual([
      ['rec_a', 'prop_score', 15],
      ['rec_a', 'prop_status', 'opt_todo'],
      ['rec_b', 'prop_score', 25],
      ['rec_b', 'prop_status', 'opt_todo'],
    ]);
    expect(() =>
      planDatabaseTsvPaste({
        source,
        records,
        anchorRecordId: 'rec_b',
        anchorPropertyId: 'prop_score',
        tsv: '1\ttodo\n2\ttodo',
      }),
    ).toThrow('loaded record range');
  });

  test('round-trips multi-select as a deduplicated set of stable option keys', () => {
    const property = {
      id: 'prop_tags',
      key: 'tags',
      name: 'Tags',
      type: 'multi_select' as const,
      options: [
        { id: 'opt_red', key: 'red', name: 'Red' },
        { id: 'opt_blue', key: 'blue', name: 'Blue' },
      ],
    };
    expect(databaseValueToClipboard(property, ['opt_red', 'opt_blue'])).toBe('["red","blue"]');
    expect(databaseValueFromClipboard(property, '["Red","red","blue"]')).toEqual([
      'opt_red',
      'opt_blue',
    ]);
    expect(() => databaseValueFromClipboard(property, '["missing"]')).toThrow('no option');
  });

  test('round-trips one/many Relation values as stable record IDs', () => {
    const one = {
      id: 'prop_project',
      key: 'project',
      name: 'Project',
      type: 'relation' as const,
      targetSourceId: 'ds_projects',
      cardinality: 'one' as const,
    };
    const many = {
      ...one,
      id: 'prop_dependencies',
      key: 'dependencies',
      name: 'Dependencies',
      cardinality: 'many' as const,
    };
    expect(databaseValueToClipboard(one, 'rec_project')).toBe('rec_project');
    expect(databaseValueFromClipboard(one, 'rec_project')).toBe('rec_project');
    expect(databaseValueToClipboard(many, ['rec_a', 'rec_b'])).toBe('["rec_a","rec_b"]');
    expect(databaseValueFromClipboard(many, '["rec_a","rec_b"]')).toEqual(['rec_a', 'rec_b']);
    expect(() => databaseValueFromClipboard(many, '["rec_a","rec_a"]')).toThrow('unique');
  });

  test('round-trips Person values as stable keys and refuses inactive new assignments', () => {
    const property = {
      id: 'prop_owners',
      key: 'owners',
      name: 'Owners',
      type: 'person' as const,
      multiple: true,
    };
    const people = [
      {
        id: 'person_owner',
        key: 'owner',
        name: 'Owner',
        kind: 'collaborator' as const,
        active: true,
      },
      {
        id: 'person_former',
        key: 'former',
        name: 'Former',
        kind: 'guest' as const,
        active: false,
      },
    ];
    expect(databaseValueToClipboard(property, ['person_owner'], people)).toBe('["owner"]');
    expect(databaseValueFromClipboard(property, '["Owner"]', people)).toEqual(['person_owner']);
    expect(() => databaseValueFromClipboard(property, '["former"]', people)).toThrow('inactive');
  });

  test('round-trips ordered Files objects as stable JSON and rejects unsafe imports', () => {
    const property = {
      id: 'prop_assets',
      key: 'assets',
      name: 'Assets',
      type: 'files' as const,
    };
    const value = [
      { kind: 'local' as const, path: 'assets/brief.pdf', caption: 'Approved' },
      {
        kind: 'external' as const,
        url: 'https://cdn.example.com/demo.mp4',
        name: 'Demo',
      },
    ];
    const exported = databaseValueToClipboard(property, value);
    expect(databaseValueFromClipboard(property, exported)).toEqual(value);
    expect(() =>
      databaseValueFromClipboard(property, '[{"kind":"local","path":"../escape.pdf"}]'),
    ).toThrow(/unique safe local assets/);
  });

  test('refuses archived Select options as new clipboard assignments', () => {
    const archived = {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select' as const,
      options: [{ id: 'opt_old', key: 'old', name: 'Old', archived: true }],
    };
    expect(() => databaseValueFromClipboard(archived, 'old')).toThrow('archived');
  });

  test('round-trips Status through stable option keys and rejects archived states', () => {
    const status = {
      id: 'prop_workflow',
      key: 'workflow',
      name: 'Workflow',
      type: 'status' as const,
      groups: [
        {
          id: 'stg_todo',
          key: 'todo',
          name: 'To-do',
          category: 'todo' as const,
        },
        {
          id: 'stg_doing',
          key: 'in_progress',
          name: 'In progress',
          category: 'in_progress' as const,
        },
        {
          id: 'stg_complete',
          key: 'complete',
          name: 'Complete',
          category: 'complete' as const,
        },
      ],
      options: [
        {
          id: 'opt_not_started',
          key: 'not_started',
          name: 'Not started',
          groupId: 'stg_todo',
        },
        { id: 'opt_doing', key: 'doing', name: 'Doing', groupId: 'stg_doing' },
        { id: 'opt_done', key: 'done', name: 'Done', groupId: 'stg_complete' },
        {
          id: 'opt_cancelled',
          key: 'cancelled',
          name: 'Cancelled',
          groupId: 'stg_complete',
          archived: true,
        },
      ],
    };
    expect(databaseValueToClipboard(status, 'opt_doing')).toBe('doing');
    expect(databaseValueFromClipboard(status, 'Doing')).toBe('opt_doing');
    expect(() => databaseValueFromClipboard(status, 'cancelled')).toThrow('archived');
  });

  test('round-trips structured Date values as stable locale-independent JSON', () => {
    const due = {
      id: 'prop_due',
      key: 'due',
      name: 'Due',
      type: 'date' as const,
    };
    const value = {
      start: '2026-07-20T00:00:00Z',
      end: '2026-07-20T01:00:00Z',
      timeZone: 'Asia/Seoul',
      reminder: { anchor: 'start' as const, minutesBefore: 30 },
    };
    const encoded = databaseValueToClipboard(due, value);
    expect(encoded).toBe(
      '{"start":"2026-07-20T00:00:00Z","end":"2026-07-20T01:00:00Z","timeZone":"Asia/Seoul","reminder":{"anchor":"start","minutesBefore":30}}',
    );
    expect(databaseValueFromClipboard(due, encoded)).toEqual(value);
    expect(() => databaseValueFromClipboard(due, '07/20/2026')).toThrow();
  });
});

describe('TSV round-trip invariants', () => {
  const ITERATIONS = 128;
  const FRAGMENTS = [
    'plain',
    '\t',
    '"',
    '""',
    '\r\n',
    '\n',
    '',
    'a\t"b"\r\nc',
    '행 😀 مرحبا',
    '  spaced  ',
  ];

  function unit(seed: number, salt: number): number {
    let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
    return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
  }

  function integer(seed: number, salt: number, maximum: number): number {
    return Math.floor(unit(seed, salt) * maximum);
  }

  function generatedRows(seed: number): string[][] {
    const columnCount = 1 + integer(seed, 1, 4);
    const rowCount = 1 + integer(seed, 2, 5);
    return Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) => {
        const salt = 10 + row * 7 + column;
        const fragment = FRAGMENTS[integer(seed, salt, FRAGMENTS.length)];
        return `${fragment}${integer(seed, salt + 3, 1_000)}`;
      }),
    );
  }

  test('round-trips generated rows containing tabs, quotes, CRLF, and Unicode', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rows = generatedRows(seed);
      expect(parseTsv(encodeTsv(rows)), `seed ${seed}`).toEqual(rows);
    }
  });

  test('round-trips generated typed clipboard values for number, checkbox, and select', () => {
    const number = { id: 'prop_number', key: 'number', name: 'Number', type: 'number' as const };
    const checkbox = {
      id: 'prop_done',
      key: 'done',
      name: 'Done',
      type: 'checkbox' as const,
    };
    const status = {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select' as const,
      options: [
        { id: 'opt_open', key: 'open', name: 'Open' },
        { id: 'opt_closed', key: 'closed', name: 'Closed' },
      ],
    };
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const numberValue = integer(seed, 30, 100_000) - 50_000;
      expect(
        databaseValueFromClipboard(number, databaseValueToClipboard(number, numberValue)),
        `number seed ${seed}`,
      ).toBe(numberValue);

      const checkboxValue = unit(seed, 31) >= 0.5;
      expect(
        databaseValueFromClipboard(checkbox, databaseValueToClipboard(checkbox, checkboxValue)),
        `checkbox seed ${seed}`,
      ).toBe(checkboxValue);

      const statusValue = unit(seed, 32) >= 0.5 ? 'opt_open' : 'opt_closed';
      expect(
        databaseValueFromClipboard(status, databaseValueToClipboard(status, statusValue)),
        `status seed ${seed}`,
      ).toBe(statusValue);
    }
  });
});
