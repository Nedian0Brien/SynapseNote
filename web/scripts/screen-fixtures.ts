// writes the values the swift ports of 11d-1 are checked against: what morrow's database, formula, diff, site,
// portability and importer code make of the same inputs. run: npm run screen-fixtures, which writes
// ../App/Tests/Fixtures/core/expected/*.json. the clock and ids are fixed and the time zone is UTC (npm script).

const FIXED_NOW = Date.UTC(2026, 9, 19, 9, 30, 0);
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(FIXED_NOW);
    else super(...(args as [string | number]));
  }
  static override now(): number {
    return FIXED_NOW;
  }
}
globalThis.Date = FixedDate as DateConstructor;

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  convertValue,
  databaseFromTable,
  defaultDatabase,
  formatValue,
  formulaResult,
  groupRows,
  inferType,
  matchesFilter,
  newView,
  optionsFromValues,
  parseCellValue,
  sortRows,
  valueOf,
  visibleRows,
} from '../vendor/morrow/src/core/database';
import { computeFormula } from '../vendor/morrow/src/core/formula';
import type { FormulaValue } from '../vendor/morrow/src/core/formula';
import { newPageMeta } from '../vendor/morrow/src/core/model';
import type { DatabaseDef, FilterOp, PageMeta, PropDef, PropValue, WorkspaceState } from '../vendor/morrow/src/core/model';
import { diffCases, importerCases, portabilityCases, richState, siteCases } from './screen-fixtures-export';

const fixtures = process.argv[2] ?? '';
if (!fixtures) throw new Error('Give the fixtures folder.');
const out = path.join(fixtures, 'expected');

function write(name: string, value: unknown, indent = 0): void {
  writeFileSync(path.join(out, name), `${JSON.stringify(value, null, indent)}\n`);
}

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

// ---- formulas

function formulaCases(): unknown {
  const props: Record<string, FormulaValue> = {
    Price: 12.5,
    Count: 3,
    Name: 'Tea',
    Done: true,
    Empty: null,
    Due: '2026-11-02',
    Started: '2026-01-31',
    Words: 'alpha, beta',
    Zero: 0,
    Text: '  42 ',
    Leap: '2024-02-29',
    Old: '0050-06-15',
    Stamp: Date.UTC(2026, 0, 1, 12),
  };
  const sources = [
    '',
    '   ',
    '1 + 2 * 3',
    '(1 + 2) * 3',
    '2 ^ 3 ^ 2',
    '-2 ^ 2',
    '10 / 4',
    '10 / 0',
    '10 % 3',
    '-7 % 3',
    '7 % 0',
    '0.1 + 0.2',
    '1e3 + .5',
    '1 / 3',
    'prop("Price") * prop("Count")',
    'prop("price")',
    'prop("Missing")',
    'prop()',
    'prop("Name") + " for " + prop("Count")',
    'prop("Count") + prop("Done")',
    'prop("Text") * 2',
    'prop("Words") + 1',
    'if(prop("Done"), "✅", "⏳")',
    'if(prop("Zero"), "yes", "no")',
    'if(prop("Empty"), 1)',
    'if(false, 1/0)',
    'empty(prop("Empty"))',
    'empty(prop("Name"))',
    'not prop("Done")',
    '!prop("Done") or prop("Count") > 2 and true',
    'prop("Count") == "3"',
    'prop("Name") != "tea"',
    '"apple" < "Banana"',
    '"a" <= "a"',
    'prop("Count") >= 3',
    'round(prop("Price") / 7, 2)',
    'round(2.5)',
    'round(-2.5)',
    'round(1.005, 2)',
    'round(3.14159, 20)',
    'round(1, "x")',
    'floor(-1.5) + ceil(1.2) + abs(-3) + sqrt(16)',
    'sqrt(-1)',
    'min(3, 1, 2) + max(3, 1, 2)',
    'min()',
    'min(1, "x")',
    'sum(1, "2", "x", true, null)',
    'length(prop("Name")) + length("😀")',
    'concat("a", 1, true, null)',
    'join(", ", "a", "", "b", 3)',
    'join()',
    'upper("straße") + lower("ÀB")',
    'contains("Morrow notes", "NOTES")',
    'replace("a-b-c", "-", "+")',
    'replace("abc", "", ".")',
    'slice("abcdef", 2)',
    'slice("abcdef", -2)',
    'slice("abcdef", 1, -1)',
    'slice("abcdef", "x", 2)',
    'number("12") + number("x")',
    'text(1/3) + format(true)',
    'now()',
    'today()',
    'dateAdd(prop("Due"), 3, "days")',
    'dateAdd(prop("Started"), 1, "months")',
    'dateAdd(prop("Leap"), 1, "years")',
    'dateAdd(prop("Due"), -2, "weeks")',
    'dateAdd(prop("Due"), 5, "hours")',
    'dateAdd(prop("Due"), 1.5, "months")',
    'dateAdd(prop("Due"), "x", "months")',
    'dateAdd(prop("Old"), 1, "days")',
    'dateAdd(prop("Stamp"), 1, "days")',
    'dateAdd("nonsense", 1)',
    'dateBetween(prop("Due"), today(), "days")',
    'dateBetween(today(), prop("Due"), "weeks")',
    'dateBetween(prop("Due"), prop("Started"))',
    'dateBetween("x", today())',
    'year(prop("Due")) + month(prop("Due")) + day(prop("Due"))',
    'year(prop("Old"))',
    'year("x")',
    'unknown(1)',
    'prop',
    '1 +',
    '(1 + 2',
    '1 2',
    '"open',
    "'single' + 'quotes'",
    '"esc\\"aped"',
    '3 # 4',
    '.',
    '1.',
    'true + true',
    'x'.repeat(2001),
    '('.repeat(70) + '1' + ')'.repeat(70),
  ];
  const now = new Date(FIXED_NOW);
  return {
    props,
    now: FIXED_NOW,
    cases: sources.map((source) => ({ source, result: computeFormula(source, (name) => props[name] ?? null, now) })),
  };
}

// ---- databases

function databaseCases(): unknown {
  const newId = counter('d');
  const status: PropDef = {
    id: 'p-status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'o-todo', name: 'To do', color: 'gray' },
      { id: 'o-doing', name: 'Doing', color: 'blue' },
      { id: 'o-done', name: 'Done', color: 'green' },
    ],
  };
  const tags: PropDef = {
    id: 'p-tags',
    name: 'Tags',
    type: 'multiSelect',
    options: [
      { id: 'o-red', name: 'Red', color: 'red' },
      { id: 'o-blue', name: 'Blue', color: 'blue' },
    ],
  };
  const properties: PropDef[] = [
    status,
    tags,
    { id: 'p-pages', name: 'Pages', type: 'number', options: [] },
    { id: 'p-due', name: 'Due', type: 'date', options: [] },
    { id: 'p-done', name: 'Done', type: 'checkbox', options: [] },
    { id: 'p-notes', name: 'Notes', type: 'text', options: [] },
    { id: 'p-link', name: 'Link', type: 'url', options: [] },
    { id: 'p-rel', name: 'Related', type: 'relation', options: [] },
    { id: 'p-score', name: 'Score', type: 'formula', options: [], formula: 'prop("Pages") * 2 + if(prop("Done"), 100, 0)' },
    { id: 'p-label', name: 'Label', type: 'formula', options: [], formula: 'prop("Status") + " · " + prop("Score")' },
    { id: 'p-loop', name: 'Loop', type: 'formula', options: [], formula: 'prop("Loop") + 1' },
    { id: 'p-bad', name: 'Bad', type: 'formula', options: [], formula: 'prop("Pages" +' },
    { id: 'p-days', name: 'Days', type: 'formula', options: [], formula: 'dateBetween(prop("Due"), today())' },
  ];
  const database: DatabaseDef = { properties, views: [] };
  const values: Array<Record<string, PropValue>> = [
    { 'p-status': 'o-doing', 'p-tags': ['o-red'], 'p-pages': 320, 'p-due': '2026-11-01', 'p-done': false, 'p-notes': 'Long, slow', 'p-link': 'https://example.org', 'p-rel': ['Book 2', 'Book 3'] },
    { 'p-status': 'o-done', 'p-tags': ['o-red', 'o-blue'], 'p-pages': 120, 'p-due': '2026-10-01', 'p-done': true, 'p-notes': 'item 10' },
    { 'p-status': 'o-todo', 'p-pages': 12.5, 'p-notes': 'item 9', 'p-rel': 'Single' },
    { 'p-tags': [], 'p-notes': '' },
    { 'p-status': 'o-gone', 'p-tags': ['o-gone'], 'p-pages': 0, 'p-done': true, 'p-due': '2027-01-15', 'p-notes': 'Ångström' },
  ];
  const rows: PageMeta[] = values.map((properties, index) => ({
    ...newPageMeta({ id: `r${index + 1}`, parentId: 'db', title: ['Middlemarch', 'piranesi', 'Book 10', '', 'Book 9'][index]!, createdAt: 1000 * (5 - index) }),
    updatedAt: 2000 + index,
    order: [3, 1, 2, 5, 4][index]!,
    properties,
  }));
  const propIds = ['title', 'created', 'updated', ...properties.map((prop) => prop.id)];
  const ops: FilterOp[] = ['contains', 'notContains', 'is', 'isNot', 'empty', 'notEmpty', 'gt', 'lt', 'checked', 'unchecked'];
  const wanted: PropValue[] = [null, '', 'o-doing', 'book', '120', 100, '2026-10-15', 'red', 'o-red', true, 'middlemarch'];
  const filters = propIds.flatMap((prop) =>
    ops.flatMap((op) => wanted.map((value, index) => ({ id: `f${index}`, prop, op, value }))),
  );
  const sorts = [
    [{ prop: 'title', dir: 'asc' as const }],
    [{ prop: 'title', dir: 'desc' as const }],
    [{ prop: 'p-pages', dir: 'desc' as const }],
    [{ prop: 'p-status', dir: 'asc' as const }],
    [{ prop: 'p-done', dir: 'asc' as const }, { prop: 'title', dir: 'asc' as const }],
    [{ prop: 'p-due', dir: 'asc' as const }],
    [{ prop: 'p-tags', dir: 'asc' as const }],
    [{ prop: 'p-score', dir: 'desc' as const }],
    [{ prop: 'p-notes', dir: 'asc' as const }],
    [{ prop: 'created', dir: 'asc' as const }],
    [{ prop: 'missing', dir: 'asc' as const }],
  ];
  const view = { ...newView('table', database, newId), filters: [{ id: 'f', prop: 'p-done', op: 'unchecked' as FilterOp, value: null }], sorts: [{ prop: 'p-pages', dir: 'desc' as const }] };
  const cells = ['', '  ', '1,234.5', 'x', 'yes', 'TRUE', 'no', '2026-10-19', 'October 19, 2026', '19 Oct 2026', '10/19/2026', '2026/2/31', 'Sept 5, 2026', 'Monday', 'doing', 'Red, blue', 'red,gone'];
  const columns: string[][] = [
    ['yes', 'No', 'true', ''],
    ['1', '2.5', '-3', '1,000'],
    ['2026-10-19', 'October 19, 2026', '19 Oct 2026'],
    ['https://a.org', 'http://b.org/x'],
    ['red, blue', 'blue', 'green, red'],
    ['To do', 'Done', 'To do', 'Doing'],
    ['a long sentence with many words', 'another one'],
    ['', ''],
    ['10/19/2026', 'Monday'],
  ];
  return {
    database,
    rows,
    values: rows.map((row) => propIds.map((prop) => valueOf(row, prop, database))),
    formulas: rows.map((row) => properties.filter((prop) => prop.type === 'formula').map((prop) => formulaResult(row, prop, database))),
    formatted: rows.map((row) => properties.map((prop) => formatValue(prop, row.properties[prop.id] ?? null))),
    formatWithout: [null, 'x', 3, true, ['a', 'b'], [1, null]].map((value) => formatValue(undefined, value as PropValue)),
    filters: filters.map((rule) => ({ rule, rows: rows.filter((row) => matchesFilter(row, rule, database)).map((row) => row.id) })),
    sorts: sorts.map((rules) => ({ rules, rows: sortRows(rows, rules, database).map((row) => row.id) })),
    view: { view, rows: visibleRows(rows, view, database).map((row) => row.id) },
    groups: [null, 'p-status', 'p-tags', 'p-done', 'p-notes'].map((propId) => ({
      propId,
      groups: groupRows(rows, propId, database).map((group) => ({ ...group, rows: group.rows.map((row) => row.id) })),
    })),
    conversions: properties.flatMap((from) =>
      properties.map((to) => ({ from: from.id, to: to.id, values: rows.map((row) => convertValue(from, to, row.properties[from.id] ?? null)) })),
    ),
    options: properties.map((from) => optionsFromValues(from, rows.map((row) => row.properties[from.id] ?? null), counter('opt'))),
    cells: properties.map((prop) => ({ prop: prop.id, values: cells.map((cell) => parseCellValue(prop, cell)) })),
    types: columns.map((column) => ({ column, type: inferType(column) })),
    table: databaseFromTable(
      ['Name', 'Done', 'Pages', 'When', 'Site', 'Tags', 'Status', '', 'tags', 'Notes', 'notes'],
      [
        ['A', 'yes', '1', '2026-10-19', 'https://a.org', 'red, blue', 'To do', '', 'x', 'free text', 'n'],
        ['B', 'no', '2', '2026-10-20', 'https://b.org', 'blue', 'Done', '', 'y', 'more', 'm'],
        ['C', '', '3,000', 'Oct 21, 2026', 'http://c.org', 'red', 'To do', '', 'z', 'and more words here', 'o'],
      ],
      counter('t'),
    ),
    defaultDatabase: defaultDatabase(counter('n')),
  };
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  write('formula.json', formulaCases(), 1);
  write('database.json', databaseCases());
  write('diff.json', diffCases(), 1);
  const state = richState(FIXED_NOW);
  const saved = (value: WorkspaceState) => ({ pages: Object.values(value.pages), docs: value.docs });
  write('site.json', { state: saved(state), ...(siteCases(state) as object) });
  write('portability.json', { state: saved(state), ...(portabilityCases(state, FIXED_NOW) as object) });
  write('importer.json', { state: saved(state), ...(importerCases(state, FIXED_NOW) as object) });
  console.log(`wrote the 11d-1 fixtures to ${path.relative(process.cwd(), out)}`);
}

await main();
