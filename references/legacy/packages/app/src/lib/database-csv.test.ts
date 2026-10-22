import { describe, expect, test } from 'bun:test';
import type { DatabaseSource, ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import { databasePersonMentionMarkup } from '@nedian0brien/synapsenote-core';
import {
  databaseCsvRecordIds,
  databaseRecordsToCsv,
  encodeCsv,
  inspectDatabaseImport,
  parseCsv,
  planDatabaseCsvImport,
  planDatabaseDelimitedImport,
} from './database-csv.ts';
import { encodeTsv } from './database-tsv.ts';

const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  includeSubfolders: false,
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    {
      id: 'prop_budget',
      key: 'budget',
      name: 'Budget',
      type: 'number',
      semantics: {
        constraints: { unique: false, min: 0, max: 10_000 },
        format: {
          style: 'currency',
          options: { currency: 'USD', useGrouping: true },
        },
      },
    },
  ],
} as DatabaseSource;

const records: ProjectedDatabaseRecord[] = [
  {
    id: 'rec_first',
    path: 'tasks/first.md',
    revision: `sha256:${'a'.repeat(64)}`,
    values: { prop_title: 'First, "quoted"', prop_budget: 1234.5 },
  },
];

describe('database CSV interchange', () => {
  test('round-trips RFC-style quoted commas, CRLF, quotes, and newlines', () => {
    const rows = [
      ['plain', 'comma,value', 'line one\nline two'],
      ['"quoted"', '', 'tail'],
    ];
    expect(parseCsv(encodeCsv(rows))).toEqual(rows);
    expect(() => parseCsv('a,"unterminated')).toThrow('unterminated');
    expect(() => parseCsv('a,"closed"junk')).toThrow('closing quote');
  });

  test('exports canonical locale-neutral numbers despite display formatting', () => {
    expect(parseCsv(databaseRecordsToCsv({ source, records }))).toEqual([
      ['record_id', 'title', 'budget'],
      ['rec_first', 'First, "quoted"', '1234.5'],
    ]);
  });

  test('round-trips multiline Text markup and stable references without flattening', () => {
    const textSource = {
      ...source,
      properties: [
        source.properties[0],
        { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
      ],
    } as DatabaseSource;
    const markup = `Owner ${databasePersonMentionMarkup('person_alice', 'Alice')}\nNext line`;
    const csv = databaseRecordsToCsv({
      source: textSource,
      records: [{ ...records[0], values: { prop_title: 'First', prop_notes: markup } }],
    });
    expect(parseCsv(csv)).toEqual([
      ['record_id', 'title', 'notes'],
      ['rec_first', 'First', markup],
    ]);
  });

  test('keeps computed errors explicit in CSV exports', () => {
    const record = records[0];
    if (!record) throw new Error('CSV record fixture missing');
    const formula = {
      id: 'prop_formula',
      key: 'formula',
      name: 'Formula',
      type: 'formula' as const,
      source: 'prop("budget") / 0',
      ast: {
        language: 'synapse-formula-1' as const,
        version: 1 as const,
        resultType: 'number' as const,
        expression: {
          type: 'literal' as const,
          valueType: 'number' as const,
          value: 0,
        },
      },
    };
    expect(
      parseCsv(
        databaseRecordsToCsv({
          source: { ...source, properties: [...source.properties, formula] },
          records: [
            {
              ...record,
              computedResults: {
                prop_formula: {
                  kind: 'error',
                  problem: {
                    code: 'divide_by_zero',
                    message: 'Cannot divide by zero',
                  },
                },
              },
            },
          ],
        }),
      ),
    ).toEqual([
      ['record_id', 'title', 'budget', 'formula'],
      ['rec_first', 'First, "quoted"', '1234.5', '#ERROR(divide_by_zero): Cannot divide by zero'],
    ]);
  });

  test('exports stable property keys and canonical typed values in manifest order', () => {
    const typedSource = {
      ...source,
      properties: [
        {
          id: 'prop_title',
          key: 'title',
          name: 'Renamed title',
          type: 'title',
        },
        { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
        { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [{ id: 'opt_open', key: 'open', name: 'In progress' }],
        },
        {
          id: 'prop_tags',
          key: 'tags',
          name: 'Tags',
          type: 'multi_select',
          options: [
            { id: 'opt_red', key: 'red', name: 'Urgent' },
            { id: 'opt_blue', key: 'blue', name: 'Later' },
          ],
        },
        { id: 'prop_url', key: 'url', name: 'URL', type: 'url' },
        {
          id: 'prop_related',
          key: 'related',
          name: 'Related',
          type: 'relation',
          targetSourceId: 'ds_tasks',
          cardinality: 'many',
        },
        { id: 'prop_empty', key: 'empty', name: 'Empty', type: 'text' },
      ],
    } as DatabaseSource;
    const typedRecord = {
      ...records[0],
      values: {
        prop_title: 'First',
        prop_done: true,
        prop_due: '2026-07-20',
        prop_status: 'opt_open',
        prop_tags: ['opt_red', 'opt_blue'],
        prop_url: 'https://example.com/a,b',
        prop_related: ['rec_second', 'rec_third'],
      },
    } as ProjectedDatabaseRecord;

    const csv = databaseRecordsToCsv({
      source: typedSource,
      records: [typedRecord],
    });
    expect(csv.startsWith('\uFEFF')).toBe(false);
    expect(csv).toContain('\r\n');
    expect(parseCsv(csv)).toEqual([
      ['record_id', 'title', 'done', 'due', 'status', 'tags', 'url', 'related', 'empty'],
      [
        'rec_first',
        'First',
        'true',
        '2026-07-20',
        'open',
        '["red","blue"]',
        'https://example.com/a,b',
        '["rec_second","rec_third"]',
        '',
      ],
    ]);
  });

  test('addresses imports by stable record ID and validates every typed value first', () => {
    const csv = 'record_id,title,budget\r\nrec_first,Updated,999.25';
    expect(databaseCsvRecordIds(source, csv)).toEqual(['rec_first']);
    expect(
      planDatabaseCsvImport({ source, csv, records }).map(({ record, property, value }) => [
        record.id,
        property.id,
        value,
      ]),
    ).toEqual([
      ['rec_first', 'prop_title', 'Updated'],
      ['rec_first', 'prop_budget', 999.25],
    ]);
    expect(() =>
      planDatabaseCsvImport({
        source,
        csv: 'record_id,budget\nrec_first,"$1,234.50"',
        records,
      }),
    ).toThrow('finite number');
    expect(() =>
      planDatabaseCsvImport({
        source,
        csv: 'record_id,budget\nrec_missing,1',
        records,
      }),
    ).toThrow('unavailable');
  });

  test('restores the same final typed state across supported CSV and TSV import paths', () => {
    const paritySource = {
      ...source,
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_text', key: 'text', name: 'Text', type: 'text' },
        { id: 'prop_number', key: 'number', name: 'Number', type: 'number' },
        { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
        { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [
            { id: 'opt_open', key: 'open', name: 'Open' },
            { id: 'opt_closed', key: 'closed', name: 'Closed' },
          ],
        },
        {
          id: 'prop_tags',
          key: 'tags',
          name: 'Tags',
          type: 'multi_select',
          options: [
            { id: 'opt_red', key: 'red', name: 'Red' },
            { id: 'opt_blue', key: 'blue', name: 'Blue' },
          ],
        },
        { id: 'prop_url', key: 'url', name: 'URL', type: 'url' },
        { id: 'prop_email', key: 'email', name: 'Email', type: 'email' },
        { id: 'prop_phone', key: 'phone', name: 'Phone', type: 'phone' },
        { id: 'prop_empty', key: 'empty', name: 'Empty', type: 'text' },
      ],
    } as DatabaseSource;
    const canonical = {
      id: 'rec_parity',
      path: 'tasks/parity.md',
      revision: `sha256:${'b'.repeat(64)}`,
      values: {
        prop_title: 'Canonical title',
        prop_text: 'line one\nline two, with comma',
        prop_number: -1234.5,
        prop_done: true,
        prop_due: '2026-07-20T09:30:00+09:00',
        prop_status: 'opt_open',
        prop_tags: ['opt_red', 'opt_blue'],
        prop_url: 'https://example.com/a,b',
        prop_email: 'owner@example.com',
        prop_phone: '+82 (2) 1234-5678',
      },
    } satisfies ProjectedDatabaseRecord;
    const current = {
      ...canonical,
      revision: `sha256:${'c'.repeat(64)}`,
      values: {
        prop_title: 'Old title',
        prop_text: 'Old text',
        prop_number: 0,
        prop_done: false,
        prop_due: '2025-01-01',
        prop_status: 'opt_closed',
        prop_tags: ['opt_blue'],
        prop_url: 'https://old.example.com',
        prop_email: 'old@example.com',
        prop_phone: '+1 555 0100',
        prop_empty: 'remove me',
      },
    } satisfies ProjectedDatabaseRecord;

    const csv = databaseRecordsToCsv({
      source: paritySource,
      records: [canonical],
    });
    const tsv = encodeTsv(parseCsv(csv));
    for (const [contents, delimiter] of [
      [csv, ','],
      [tsv, '\t'],
    ] as const) {
      const changes = planDatabaseDelimitedImport({
        source: paritySource,
        contents,
        delimiter,
        records: [current],
      });
      const restored = structuredClone(current.values);
      for (const change of changes) {
        if (change.value === undefined) delete restored[change.property.id];
        else restored[change.property.id] = change.value;
      }
      expect(restored).toEqual(canonical.values);
      expect(changes.every((change) => change.record.revision === current.revision)).toBe(true);
    }
  });

  test('detects UTF-16 TSV and previews header, type, option, date, and empty mappings', () => {
    const previewSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_due', key: 'due', name: 'Due', type: 'date' as const },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select' as const,
          options: [{ id: 'opt_open', key: 'open', name: 'Open' }],
        },
      ],
    };
    const contents =
      'record_id\tTitle\tBudget\tDue\tStatus\r\nrec_first\tUpdated\t\t2026-07-20\tOpen';
    const utf16 = new Uint8Array(2 + contents.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let index = 0; index < contents.length; index += 1) {
      utf16[2 + index * 2] = contents.charCodeAt(index);
    }
    const inspection = inspectDatabaseImport({
      source: previewSource,
      bytes: utf16,
      filename: 'tasks.tsv',
    });
    expect(inspection).toMatchObject({
      encoding: 'utf-16le',
      delimiterLabel: 'tab',
      rowCount: 1,
      emptyValueCount: 1,
      dateValueCount: 1,
      optionValueCount: 1,
      issues: [],
    });
    expect(inspection.mappings.map(({ header, propertyType }) => [header, propertyType])).toEqual([
      ['Title', 'title'],
      ['Budget', 'number'],
      ['Due', 'date'],
      ['Status', 'select'],
    ]);
    expect(inspection.preview[0]).toMatchObject({
      recordId: 'rec_first',
      values: {
        title: 'Updated',
        budget: '',
        due: '2026-07-20',
        status: 'open',
      },
    });
  });

  test('falls back to Windows-1252 and reports typed preview issues without planning', () => {
    const prefix = new TextEncoder().encode('record_id,title,budget\nrec_first,Dash ');
    const suffix = new TextEncoder().encode(',invalid');
    const bytes = new Uint8Array(prefix.length + 1 + suffix.length);
    bytes.set(prefix);
    bytes[prefix.length] = 0x96;
    bytes.set(suffix, prefix.length + 1);
    const inspection = inspectDatabaseImport({
      source,
      bytes,
      filename: 'tasks.csv',
    });
    expect(inspection.encoding).toBe('windows-1252');
    expect(inspection.preview[0]?.values.title).toBe('Dash –');
    expect(inspection.issues).toEqual([
      expect.objectContaining({
        row: 2,
        header: 'budget',
        message: expect.stringContaining('finite'),
      }),
    ]);
  });
});

describe('CSV round-trip invariants', () => {
  const ITERATIONS = 128;
  const FRAGMENTS = [
    'plain',
    ',',
    '"',
    '""',
    '\r\n',
    '\n',
    '',
    'a,"b"\r\nc',
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

  test('round-trips generated rows containing commas, quotes, CRLF, and Unicode', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rows = generatedRows(seed);
      expect(parseCsv(encodeCsv(rows)), `seed ${seed}`).toEqual(rows);
    }
  });

  test('round-trips generated typed record values through export and delimited import', () => {
    const typedSource = {
      ...source,
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_number', key: 'number', name: 'Number', type: 'number' },
        { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [
            { id: 'opt_open', key: 'open', name: 'Open' },
            { id: 'opt_closed', key: 'closed', name: 'Closed' },
          ],
        },
      ],
    } as DatabaseSource;
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const canonical = {
        id: 'rec_generated',
        path: 'tasks/generated.md',
        revision: `sha256:${(seed % 10).toString().repeat(64)}`,
        values: {
          prop_title: `행 ${seed} 👩🏽‍💻, "quoted"\nline two`,
          prop_number: integer(seed, 20, 100_000) - 50_000,
          prop_done: unit(seed, 21) >= 0.5,
          prop_status: unit(seed, 22) >= 0.5 ? 'opt_open' : 'opt_closed',
        },
      } as ProjectedDatabaseRecord;
      const current = { ...canonical, values: {} } as ProjectedDatabaseRecord;

      const csv = databaseRecordsToCsv({ source: typedSource, records: [canonical] });
      const changes = planDatabaseCsvImport({ source: typedSource, csv, records: [current] });
      const restored: Record<string, unknown> = {};
      for (const change of changes) {
        if (change.value !== undefined) restored[change.property.id] = change.value;
      }
      expect(restored, `seed ${seed}`).toEqual(canonical.values);
    }
  });
});
