import { describe, expect, test } from 'bun:test';
import {
  cloneDatabaseMarkdownOwnerIdentity,
  DATABASE_MARKDOWN_LIMITS,
  decodeDatabaseMarkdownCell,
  deleteDatabaseMarkdownTableRow,
  encodeDatabaseMarkdownCell,
  encodeDatabaseMarkdownCellText,
  insertDatabaseMarkdownTableRow,
  parseDatabaseMarkdownOwner,
  replaceDatabaseMarkdownTableCell,
  replaceDatabaseMarkdownTableRow,
  reshapeDatabaseMarkdownOwnerColumns,
  serializeDatabaseMarkdownOwnerMarker,
} from './markdown-table.ts';
import { diffDatabaseMarkdownTables, mergeDatabaseMarkdownTables } from './markdown-table-diff.ts';
import { rewriteDatabaseMarkdownDocumentLinks } from './markdown-table-link-rewrite.ts';

const marker = {
  version: 2 as const,
  databaseId: 'db_orders',
  sourceId: 'ds_orders',
  blockId: 'dbb_orders_primary',
  columns: ['prop_document', 'prop_name', 'prop_quantity'],
};

function sourceWithTable(): string {
  return [
    '# Orders',
    '',
    serializeDatabaseMarkdownOwnerMarker(marker),
    '',
    '| 문서 | 이름 | 수량 |',
    '| --- | --- | ---: |',
    '| [[orders/one\\|One]] | A \\| B | 2 |',
    '| [[orders/two]] | C | 3 |',
    '',
    'Unrelated prose stays here.',
    '',
  ].join('\n');
}

describe('parseDatabaseMarkdownOwner', () => {
  test('enforces shared byte, row, and JSON resource limits', () => {
    const oversized = `${sourceWithTable()}${'x'.repeat(DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes)}`;
    expect(parseDatabaseMarkdownOwner(oversized)).toMatchObject({
      ok: false,
      code: 'resource_limit',
    });
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < DATABASE_MARKDOWN_LIMITS.jsonDepth + 1; index += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    expect(encodeDatabaseMarkdownCell('files', deep)).toMatchObject({
      ok: false,
      code: 'invalid_value',
    });
  });
  test('binds a versioned marker to the immediate GFM table and preserves ranges', () => {
    const source = sourceWithTable();
    const result = parseDatabaseMarkdownOwner(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.owner.marker).toEqual(marker);
    expect(result.owner.header.cells.map((cell) => cell.value)).toEqual(['문서', '이름', '수량']);
    expect(result.owner.rows).toHaveLength(2);
    expect(result.owner.rows[0]?.cells.map((cell) => cell.value)).toEqual([
      '[[orders/one|One]]',
      'A | B',
      '2',
    ]);
    expect(source.slice(result.owner.tableRange.start, result.owner.tableRange.end)).toContain(
      '| [[orders/one\\|One]] | A \\| B | 2 |',
    );
  });

  test('accepts a UTF-8 BOM before the owner marker', () => {
    const result = parseDatabaseMarkdownOwner(
      `\uFEFF${serializeDatabaseMarkdownOwnerMarker(marker)}\n\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |`,
    );
    expect(result.ok).toBe(true);
  });

  test('replaces only the selected cell value range', () => {
    const source = sourceWithTable();
    const parsed = parseDatabaseMarkdownOwner(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const next = replaceDatabaseMarkdownTableCell(
      source,
      parsed.owner,
      0,
      1,
      encodeDatabaseMarkdownCellText('Updated | value'),
    );
    expect(next).toContain('| [[orders/one\\|One]] | Updated \\| value | 2 |');
    expect(next).toContain('Unrelated prose stays here.');
    const reparsed = parseDatabaseMarkdownOwner(next);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.owner.rows[0]?.cells[1]?.value).toBe('Updated | value');
  });

  test('inserts, replaces, and deletes rows without rewriting surrounding prose', () => {
    const source = sourceWithTable();
    const parsed = parseDatabaseMarkdownOwner(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const inserted = insertDatabaseMarkdownTableRow(source, parsed.owner, 1, [
      '[[orders/new]]',
      'Inserted',
      '4',
    ]);
    expect(inserted).toContain('| [[orders/new]] | Inserted | 4 |\n| [[orders/two]] | C | 3 |');
    expect(inserted).toContain('Unrelated prose stays here.');

    const insertedOwner = parseDatabaseMarkdownOwner(inserted);
    expect(insertedOwner.ok).toBe(true);
    if (!insertedOwner.ok) return;
    const replaced = replaceDatabaseMarkdownTableRow(inserted, insertedOwner.owner, 1, [
      '[[orders/new]]',
      'Replaced',
      '5',
    ]);
    expect(replaced).toContain('| [[orders/new]] | Replaced | 5 |');

    const replacedOwner = parseDatabaseMarkdownOwner(replaced);
    expect(replacedOwner.ok).toBe(true);
    if (!replacedOwner.ok) return;
    const deleted = deleteDatabaseMarkdownTableRow(replaced, replacedOwner.owner, 1);
    expect(deleted).not.toContain('Replaced');
    expect(deleted).toContain('| [[orders/two]] | C | 3 |');
    expect(deleted).toContain('Unrelated prose stays here.');
  });

  test('rejects an unmarked generic table and malformed owner structures', () => {
    expect(parseDatabaseMarkdownOwner('| A |\n| --- |\n| B |')).toMatchObject({
      ok: false,
      code: 'marker_missing',
    });
    expect(
      parseDatabaseMarkdownOwner(
        `${serializeDatabaseMarkdownOwnerMarker(marker)}\n\n| A | B |\n| --- | --- |\n| 1 |`,
      ),
    ).toMatchObject({ ok: false, code: 'table_invalid_header' });
    expect(
      parseDatabaseMarkdownOwner(
        '<!-- synapsenote:database\nversion=2\ndatabase=db_orders\nsource=ds_orders\nblock=dbb_orders_primary\ncolumns=prop_document,prop_document\n-->\n\n| A | B |\n| --- | --- |',
      ),
    ).toMatchObject({ ok: false, code: 'marker_invalid_field' });
  });

  test('does not treat fenced code, quotes, or nested list HTML as an owner marker', () => {
    const fenced = [
      '```markdown',
      serializeDatabaseMarkdownOwnerMarker(marker),
      '',
      '| A | B | C |',
      '| --- | --- | --- |',
      '| fake | fake | fake |',
      '```',
      '',
      `> ${serializeDatabaseMarkdownOwnerMarker(marker).replaceAll('\n', '\n> ')}`,
      '',
      `- ${serializeDatabaseMarkdownOwnerMarker(marker).replaceAll('\n', '\n  ')}`,
    ].join('\n');
    expect(parseDatabaseMarkdownOwner(fenced)).toMatchObject({ ok: false, code: 'marker_missing' });
  });

  test('requires an explicit new owner identity for copy/paste and preserves table bytes', () => {
    const source = sourceWithTable();
    const result = cloneDatabaseMarkdownOwnerIdentity({
      source,
      databaseId: 'db_copy',
      sourceId: 'ds_copy',
      blockId: 'dbb_copy_primary',
    });
    expect(result.owner.marker).toEqual({
      ...marker,
      databaseId: 'db_copy',
      sourceId: 'ds_copy',
      blockId: 'dbb_copy_primary',
    });
    expect(result.markdown).toContain('| [[orders/one\\|One]] | A \\| B | 2 |');
    expect(result.markdown).toContain('Unrelated prose stays here.');
    expect(() =>
      cloneDatabaseMarkdownOwnerIdentity({
        source,
        databaseId: marker.databaseId,
        sourceId: marker.sourceId,
        blockId: marker.blockId,
      }),
    ).toThrow('must differ');
    const duplicate = `${source}\n${serializeDatabaseMarkdownOwnerMarker(marker)}\n\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |`;
    expect(() =>
      cloneDatabaseMarkdownOwnerIdentity({
        source: duplicate,
        databaseId: 'db_copy',
        sourceId: 'ds_copy',
        blockId: 'dbb_copy_primary',
      }),
    ).toThrow('duplicate');
  });

  test('rewrites moved document links only inside owner-table cells', () => {
    const source = [
      '```markdown',
      '[[tasks/old]]',
      '```',
      '',
      sourceWithTable().replace('[[orders/one\\|One]]', '[[tasks/old\\|Old]]'),
    ].join('\n');
    const result = rewriteDatabaseMarkdownDocumentLinks({
      markdown: source,
      oldPath: 'tasks/old.md',
      newPath: 'tasks/new.md',
    });
    expect(result.changed).toBe(true);
    expect(result.rewrites).toHaveLength(1);
    expect(result.markdown).toContain('| [[tasks/new\\|Old]] |');
    expect(result.markdown).toContain('```markdown\n[[tasks/old]]\n```');
    expect(result.markdown).toContain('Unrelated prose stays here.');
  });
});

describe('semantic Markdown table diff and merge', () => {
  test('classifies independent cell changes without reporting prose formatting', () => {
    const base = sourceWithTable();
    const parsed = parseDatabaseMarkdownOwner(base);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ours = replaceDatabaseMarkdownTableCell(base, parsed.owner, 0, 2, '5');
    const diff = diffDatabaseMarkdownTables(base, ours);
    expect(diff.operations).toEqual([
      expect.objectContaining({
        kind: 'cell_update',
        rowKey: '[[orders/one|One]]',
        columnIndex: 2,
        before: '2',
        after: '5',
      }),
    ]);
  });

  test('merges different cells and refuses a same-cell divergent edit', () => {
    const base = sourceWithTable();
    const parsed = parseDatabaseMarkdownOwner(base);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ours = replaceDatabaseMarkdownTableCell(base, parsed.owner, 0, 1, 'ours');
    const theirs = replaceDatabaseMarkdownTableCell(base, parsed.owner, 0, 2, '9');
    const merged = mergeDatabaseMarkdownTables({ base, ours, theirs });
    expect(merged.conflicts).toEqual([]);
    expect(merged.merged).toContain('| [[orders/one\\|One]] | ours | 9 |');

    const divergent = mergeDatabaseMarkdownTables({
      base,
      ours,
      theirs: replaceDatabaseMarkdownTableCell(base, parsed.owner, 0, 1, 'theirs'),
    });
    expect(divergent.merged).toBeNull();
    expect(divergent.conflicts).toEqual([
      expect.objectContaining({ kind: 'cell', rowKey: '[[orders/one|One]]', columnIndex: 1 }),
    ]);
  });
});

describe('database Markdown cell codecs', () => {
  test.each([
    ['text', 'hello | world'],
    ['url', 'https://example.com/a?x=1'],
    ['email', 'person@example.com'],
    ['phone', '+82 10-1234-5678'],
    ['select', 'in_progress'],
    ['status', 'done'],
  ] as const)('round-trips %s scalar values', (type, value) => {
    const encoded = encodeDatabaseMarkdownCell(type, value);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeDatabaseMarkdownCell(type, encoded.text);
    expect(decoded).toEqual({ ok: true, value });
  });

  test('round-trips numbers, checkboxes, dates, and multi-select JSON', () => {
    for (const [type, value] of [
      ['number', 12.5],
      ['unique_id', 42],
      ['checkbox', true],
      ['date', '2026-07-27'],
      ['multi_select', ['ux', 'mobile']],
    ] as const) {
      const encoded = encodeDatabaseMarkdownCell(type, value);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) continue;
      const decoded = decodeDatabaseMarkdownCell(type, encoded.text);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      expect(decoded.value).toEqual(value);
    }
  });

  test('uses escaped wikilinks for title and relation cells', () => {
    const document = { kind: 'wikilink' as const, target: 'orders/one', alias: 'Order | One' };
    const encodedTitle = encodeDatabaseMarkdownCell('title', document);
    expect(encodedTitle).toEqual({ ok: true, text: '[[orders/one\\|Order \\| One]]' });
    if (!encodedTitle.ok) return;
    expect(decodeDatabaseMarkdownCell('title', encodedTitle.text)).toEqual({
      ok: true,
      value: document,
    });

    const relation = encodeDatabaseMarkdownCell('relation', [document]);
    expect(relation).toEqual({ ok: true, text: '[[orders/one\\|Order \\| One]]' });
  });

  test('preserves structured JSON and reports invalid values explicitly', () => {
    const place = { label: 'Seoul', lat: 37.5, lon: 127 };
    const encoded = encodeDatabaseMarkdownCell('place', place);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(decodeDatabaseMarkdownCell('place', encoded.text)).toEqual({ ok: true, value: place });
    expect(decodeDatabaseMarkdownCell('number', '1,000')).toMatchObject({
      ok: false,
      code: 'invalid_value',
    });
    expect(decodeDatabaseMarkdownCell('checkbox', 'true')).toMatchObject({
      ok: false,
      code: 'invalid_value',
    });
    expect(decodeDatabaseMarkdownCell('title', 'Order 1')).toMatchObject({
      ok: false,
      code: 'invalid_wikilink',
    });
  });
});

describe('reshapeDatabaseMarkdownOwnerColumns', () => {
  function reshape(columns: readonly { propertyId: string; header: string }[]): string {
    const source = sourceWithTable();
    const parsed = parseDatabaseMarkdownOwner(source);
    if (!parsed.ok) throw new Error('fixture owner did not parse');
    return reshapeDatabaseMarkdownOwnerColumns(source, parsed.owner, columns);
  }

  test('adds a column with empty cells and keeps every other byte', () => {
    const next = reshape([
      { propertyId: 'prop_document', header: '문서' },
      { propertyId: 'prop_name', header: '이름' },
      { propertyId: 'prop_quantity', header: '수량' },
      { propertyId: 'prop_notes', header: 'Notes' },
    ]);
    expect(next).toContain('columns=prop_document,prop_name,prop_quantity,prop_notes');
    expect(next).toContain('| 문서 | 이름 | 수량 | Notes |');
    // A surviving cell keeps its exact encoded bytes, escapes included.
    expect(next).toContain('| [[orders/one\\|One]] | A \\| B | 2 |  |');
    expect(next).toContain('| [[orders/two]] | C | 3 |  |');
    expect(next).toContain('# Orders');
    expect(next).toContain('Unrelated prose stays here.');
  });

  test('carries values with their property when columns are reordered', () => {
    const next = reshape([
      { propertyId: 'prop_quantity', header: '수량' },
      { propertyId: 'prop_document', header: '문서' },
      { propertyId: 'prop_name', header: '이름' },
    ]);
    expect(next).toContain('columns=prop_quantity,prop_document,prop_name');
    expect(next).toContain('| 2 | [[orders/one\\|One]] | A \\| B |');
    // Alignment travels with its column too.
    expect(next).toContain('| ---: | --- | --- |');
  });

  test('drops a removed column and leaves the survivors intact', () => {
    const next = reshape([
      { propertyId: 'prop_document', header: '문서' },
      { propertyId: 'prop_quantity', header: '수량' },
    ]);
    expect(next).toContain('columns=prop_document,prop_quantity');
    expect(next).toContain('| [[orders/one\\|One]] | 2 |');
    expect(next).not.toContain('A \\| B');
  });

  test('refuses a duplicated or empty column set', () => {
    expect(() =>
      reshape([
        { propertyId: 'prop_document', header: '문서' },
        { propertyId: 'prop_document', header: 'Again' },
      ]),
    ).toThrow(/duplicated/);
    expect(() => reshape([])).toThrow(/at least one column/);
  });

  test('round-trips through the parser with the new column count', () => {
    const next = reshape([
      { propertyId: 'prop_document', header: '문서' },
      { propertyId: 'prop_notes', header: 'Notes' },
    ]);
    const reparsed = parseDatabaseMarkdownOwner(next);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.owner.marker.columns).toEqual(['prop_document', 'prop_notes']);
    expect(reparsed.owner.rows).toHaveLength(2);
    expect(reparsed.owner.rows[0]?.cells).toHaveLength(2);
  });
});
