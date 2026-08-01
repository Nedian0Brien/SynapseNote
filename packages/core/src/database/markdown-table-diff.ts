import {
  type DatabaseMarkdownTableRow,
  deleteDatabaseMarkdownTableRow,
  encodeDatabaseMarkdownCellText,
  insertDatabaseMarkdownTableRow,
  type ParsedDatabaseMarkdownOwner,
  parseDatabaseMarkdownOwner,
  replaceDatabaseMarkdownTableCell,
} from './markdown-table.ts';

export type DatabaseMarkdownSemanticOperationKind =
  | 'header_update'
  | 'cell_update'
  | 'row_insert'
  | 'row_delete'
  | 'row_reorder'
  | 'formatting';

export interface DatabaseMarkdownSemanticOperation {
  kind: DatabaseMarkdownSemanticOperationKind;
  rowKey?: string;
  columnIndex?: number;
  before?: string | null;
  after?: string | null;
}

export interface DatabaseMarkdownSemanticDiff {
  operations: readonly DatabaseMarkdownSemanticOperation[];
  conflicts: readonly string[];
}

export interface DatabaseMarkdownSemanticMergeConflict {
  kind: 'cell' | 'row' | 'header' | 'marker';
  rowKey?: string;
  columnIndex?: number;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  message: string;
}

export interface DatabaseMarkdownSemanticMergeResult {
  merged: string | null;
  conflicts: readonly DatabaseMarkdownSemanticMergeConflict[];
}

export interface DatabaseMarkdownSemanticMergeInput {
  base: string;
  ours: string;
  theirs: string;
  rowKey?: (row: DatabaseMarkdownTableRow, index: number) => string;
}

function defaultRowKey(row: DatabaseMarkdownTableRow, index: number): string {
  return row.cells[0]?.value || `row:${index}`;
}

function rowMap(
  owner: ParsedDatabaseMarkdownOwner,
  keyForRow: (row: DatabaseMarkdownTableRow, index: number) => string,
): Map<string, DatabaseMarkdownTableRow> {
  return new Map(owner.rows.map((row, index) => [keyForRow(row, index), row] as const));
}

function parseOwner(source: string): ParsedDatabaseMarkdownOwner | null {
  const parsed = parseDatabaseMarkdownOwner(source);
  return parsed.ok ? parsed.owner : null;
}

/**
 * Extracts semantic operations without treating unrelated prose or Markdown
 * formatting as a value change. Row keys default to the Title wikilink, which
 * is stable across path aliases when callers provide an identity-aware key.
 */
export function diffDatabaseMarkdownTables(
  base: string,
  next: string,
  keyForRow: (row: DatabaseMarkdownTableRow, index: number) => string = defaultRowKey,
): DatabaseMarkdownSemanticDiff {
  const baseOwner = parseOwner(base);
  const nextOwner = parseOwner(next);
  if (!baseOwner || !nextOwner) {
    return { operations: [], conflicts: ['base_or_next_owner_invalid'] };
  }
  const operations: DatabaseMarkdownSemanticOperation[] = [];
  const conflicts: string[] = [];
  if (
    baseOwner.marker.databaseId !== nextOwner.marker.databaseId ||
    baseOwner.marker.sourceId !== nextOwner.marker.sourceId ||
    baseOwner.marker.blockId !== nextOwner.marker.blockId ||
    baseOwner.marker.columns.join('\0') !== nextOwner.marker.columns.join('\0')
  ) {
    conflicts.push('owner_marker_changed');
  }
  const baseHeader = baseOwner.header.cells.map((cell) => cell.value);
  const nextHeader = nextOwner.header.cells.map((cell) => cell.value);
  if (baseHeader.join('\0') !== nextHeader.join('\0')) {
    operations.push({
      kind: 'header_update',
      before: baseHeader.join('\0'),
      after: nextHeader.join('\0'),
    });
  }
  const baseRows = rowMap(baseOwner, keyForRow);
  const nextRows = rowMap(nextOwner, keyForRow);
  for (const [rowKey, row] of baseRows) {
    if (!nextRows.has(rowKey)) {
      operations.push({
        kind: 'row_delete',
        rowKey,
        before: row.cells.map((cell) => cell.value).join('\0'),
        after: null,
      });
      continue;
    }
    const nextRow = nextRows.get(rowKey)!;
    const columns = Math.min(row.cells.length, nextRow.cells.length);
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const before = row.cells[columnIndex]?.value ?? '';
      const after = nextRow.cells[columnIndex]?.value ?? '';
      if (before !== after) {
        operations.push({ kind: 'cell_update', rowKey, columnIndex, before, after });
      } else if (row.cells[columnIndex]?.raw !== nextRow.cells[columnIndex]?.raw) {
        operations.push({ kind: 'formatting', rowKey, columnIndex, before, after });
      }
    }
  }
  for (const [rowKey, row] of nextRows) {
    if (!baseRows.has(rowKey)) {
      operations.push({
        kind: 'row_insert',
        rowKey,
        before: null,
        after: row.cells.map((cell) => cell.value).join('\0'),
      });
    }
  }
  const baseOrder = [...baseRows.keys()];
  const nextOrder = [...nextRows.keys()];
  if (
    baseOrder.filter((key) => nextRows.has(key)).join('\0') !==
    nextOrder.filter((key) => baseRows.has(key)).join('\0')
  ) {
    operations.push({ kind: 'row_reorder' });
  }
  return { operations, conflicts };
}

function sameCells(
  left: DatabaseMarkdownTableRow | undefined,
  right: DatabaseMarkdownTableRow | undefined,
): boolean {
  if (!left || !right || left.cells.length !== right.cells.length) return left === right;
  return left.cells.every((cell, index) => cell.value === right.cells[index]?.value);
}

/**
 * Three-way merge for marker-owned tables. Different cells merge without
 * rewriting surrounding prose; divergent edits, delete-vs-edit, and marker
 * changes remain explicit conflicts for the caller.
 */
export function mergeDatabaseMarkdownTables(
  input: DatabaseMarkdownSemanticMergeInput,
): DatabaseMarkdownSemanticMergeResult {
  const baseOwner = parseOwner(input.base);
  const oursOwner = parseOwner(input.ours);
  const theirsOwner = parseOwner(input.theirs);
  if (!baseOwner || !oursOwner || !theirsOwner) {
    return {
      merged: null,
      conflicts: [
        {
          kind: 'marker',
          base: null,
          ours: null,
          theirs: null,
          message: 'One merge side has an invalid owner table',
        },
      ],
    };
  }
  const marker = JSON.stringify(baseOwner.marker);
  const conflicts: DatabaseMarkdownSemanticMergeConflict[] = [];
  const sides: readonly [string, ParsedDatabaseMarkdownOwner][] = [
    ['ours', oursOwner],
    ['theirs', theirsOwner],
  ];
  for (const [name, owner] of sides) {
    if (JSON.stringify(owner.marker) !== marker) {
      conflicts.push({
        kind: 'marker',
        base: marker,
        ours: name === 'ours' ? JSON.stringify(owner.marker) : marker,
        theirs: name === 'theirs' ? JSON.stringify(owner.marker) : marker,
        message: `${name} changed the owner marker`,
      });
    }
  }
  if (
    baseOwner.header.cells.length !== oursOwner.header.cells.length ||
    baseOwner.header.cells.length !== theirsOwner.header.cells.length
  ) {
    conflicts.push({
      kind: 'header',
      base: baseOwner.header.cells.map((cell) => cell.value).join('\0'),
      ours: oursOwner.header.cells.map((cell) => cell.value).join('\0'),
      theirs: theirsOwner.header.cells.map((cell) => cell.value).join('\0'),
      message: 'Owner table column count changed',
    });
  }
  const baseHeader = baseOwner.header.cells.map((cell) => cell.value).join('\0');
  const oursHeader = oursOwner.header.cells.map((cell) => cell.value).join('\0');
  const theirsHeader = theirsOwner.header.cells.map((cell) => cell.value).join('\0');
  if (oursHeader !== baseHeader || theirsHeader !== baseHeader) {
    return {
      merged: null,
      conflicts: [
        {
          kind: 'header',
          base: baseHeader,
          ours: oursHeader,
          theirs: theirsHeader,
          message: 'Owner-table header changes require an explicit reviewed schema plan',
        },
      ],
    };
  }
  if (conflicts.length > 0) return { merged: null, conflicts };
  const defaultBaseRows = rowMap(baseOwner, defaultRowKey);
  const defaultOursRows = rowMap(oursOwner, defaultRowKey);
  const defaultTheirsRows = rowMap(theirsOwner, defaultRowKey);
  const sameRowCount =
    baseOwner.rows.length === oursOwner.rows.length &&
    baseOwner.rows.length === theirsOwner.rows.length;
  const keySetsDiffer =
    [...defaultBaseRows.keys()].sort().join('\0') !==
      [...defaultOursRows.keys()].sort().join('\0') ||
    [...defaultBaseRows.keys()].sort().join('\0') !==
      [...defaultTheirsRows.keys()].sort().join('\0');
  // A path/title rename changes the visible wikilink but not the row identity.
  // When all sides retain the same row cardinality and only the identity key
  // became unavailable, use row position as a conservative local fallback.
  // If the key sets still match, preserve stable-key order so row reorders stay
  // explicit conflicts instead of being mistaken for cell edits.
  const keyForRow =
    input.rowKey ??
    (sameRowCount && keySetsDiffer
      ? (_row: DatabaseMarkdownTableRow, index: number) => `__positional_row_${index}`
      : defaultRowKey);
  const baseRows = rowMap(baseOwner, keyForRow);
  const oursRows = rowMap(oursOwner, keyForRow);
  const theirsRows = rowMap(theirsOwner, keyForRow);
  const baseOrder = [...baseRows.keys()];
  const oursOrder = [...oursRows.keys()];
  const theirsOrder = [...theirsRows.keys()];
  const comparableOrder = (order: readonly string[]) =>
    order.filter((key) => baseRows.has(key)).join('\0');
  if (
    comparableOrder(oursOrder) !== comparableOrder(baseOrder) ||
    comparableOrder(theirsOrder) !== comparableOrder(baseOrder)
  ) {
    return {
      merged: null,
      conflicts: [
        {
          kind: 'row',
          base: baseOrder.join('\0'),
          ours: oursOrder.join('\0'),
          theirs: theirsOrder.join('\0'),
          message: 'Owner-table row reorder requires an explicit reviewed plan',
        },
      ],
    };
  }
  const mergedRows = new Map<string, string[]>();
  const order = [...new Set([...oursRows.keys(), ...theirsRows.keys()])];
  for (const rowKey of order) {
    const base = baseRows.get(rowKey);
    const ours = oursRows.get(rowKey);
    const theirs = theirsRows.get(rowKey);
    if (!base) {
      if (!ours && !theirs) continue;
      if (ours && theirs && !sameCells(ours, theirs)) {
        conflicts.push({
          kind: 'row',
          rowKey,
          base: null,
          ours: ours.cells.map((cell) => cell.value).join('\0'),
          theirs: theirs.cells.map((cell) => cell.value).join('\0'),
          message: 'Both sides inserted the same row key with different values',
        });
        continue;
      }
      const selected = ours ?? theirs;
      if (selected)
        mergedRows.set(
          rowKey,
          selected.cells.map((cell) => cell.value),
        );
      continue;
    }
    if (!ours || !theirs) {
      const surviving = ours ?? theirs;
      if (!surviving || sameCells(surviving, base)) continue;
      conflicts.push({
        kind: 'row',
        rowKey,
        base: base.cells.map((cell) => cell.value).join('\0'),
        ours: ours ? ours.cells.map((cell) => cell.value).join('\0') : null,
        theirs: theirs ? theirs.cells.map((cell) => cell.value).join('\0') : null,
        message: 'One side deleted a row while the other edited it',
      });
      continue;
    }
    const cells: string[] = [];
    for (let columnIndex = 0; columnIndex < base.cells.length; columnIndex += 1) {
      const baseValue = base.cells[columnIndex]?.value ?? '';
      const oursValue = ours.cells[columnIndex]?.value ?? '';
      const theirsValue = theirs.cells[columnIndex]?.value ?? '';
      if (oursValue !== baseValue && theirsValue !== baseValue && oursValue !== theirsValue) {
        conflicts.push({
          kind: 'cell',
          rowKey,
          columnIndex,
          base: baseValue,
          ours: oursValue,
          theirs: theirsValue,
          message: 'Both sides changed the same table cell differently',
        });
        cells.push(baseValue);
      } else {
        cells.push(oursValue !== baseValue ? oursValue : theirsValue);
      }
    }
    mergedRows.set(rowKey, cells);
  }
  if (conflicts.length > 0) return { merged: null, conflicts };
  let merged = input.base;
  let owner = baseOwner;
  // Delete in reverse source order so ranges remain valid, then apply merged
  // rows and insertions. Existing row edits use cell-local splices and keep
  // base prose/alignment/newline bytes untouched.
  const baseEntries = [...baseRows.entries()].reverse();
  for (const [rowKey, row] of baseEntries) {
    if (!mergedRows.has(rowKey)) {
      merged = deleteDatabaseMarkdownTableRow(merged, owner, row.rowIndex);
      owner = parseOwner(merged)!;
    }
  }
  for (const [rowKey, values] of mergedRows) {
    const row = owner.rows.find((candidate, index) => keyForRow(candidate, index) === rowKey);
    if (!row) {
      merged = insertDatabaseMarkdownTableRow(
        merged,
        owner,
        owner.rows.length,
        values.map(encodeDatabaseMarkdownCellText),
      );
      owner = parseOwner(merged)!;
      continue;
    }
    for (let columnIndex = values.length - 1; columnIndex >= 0; columnIndex -= 1) {
      const current = row.cells[columnIndex]?.value ?? '';
      if (current !== values[columnIndex]) {
        merged = replaceDatabaseMarkdownTableCell(
          merged,
          owner,
          row.rowIndex,
          columnIndex,
          encodeDatabaseMarkdownCellText(values[columnIndex] ?? ''),
        );
        owner = parseOwner(merged)!;
      }
    }
  }
  return { merged, conflicts: [] };
}
