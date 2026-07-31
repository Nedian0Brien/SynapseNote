import { describe, expect, test } from 'bun:test';
import { parseDatabaseMarkdownOwner } from './markdown-table.ts';
import {
  createDatabaseMarkdownOwnerScopedRevisions,
  createDatabaseMarkdownRecordRevisionSet,
  createDatabaseMarkdownRevisionSet,
  databaseMarkdownTableCellRevision,
  databaseMarkdownTableRowRevision,
} from './markdown-table-revision.ts';

const source = `<!-- synapsenote:database\nversion=2\ndatabase=db_demo\nsource=ds_demo\nblock=dbb_owner\ncolumns=prop_title,prop_value\n-->\n\n| Title | Value |\n| --- | --- |\n| [[alpha]] | 1 |\n`;

describe('database Markdown semantic revisions', () => {
  test('separates owner bytes from table/row/cell semantics', () => {
    const parsed = parseDatabaseMarkdownOwner(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const revisions = createDatabaseMarkdownRevisionSet({
      manifestRevision: 'sha256:manifest',
      ownerMarkdown: source,
      owner: parsed.owner,
      rowKeys: ['rec_alpha'],
      documentRevisions: { doc_alpha: 'sha256:doc' },
      derivedRevision: 'sha256:derived',
    });
    expect(revisions.owner).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(revisions.table).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(revisions.rows.rec_alpha).toBe(databaseMarkdownTableRowRevision(parsed.owner.rows[0]!));
    expect(revisions.cells['rec_alpha:0']).toBe(
      databaseMarkdownTableCellRevision(parsed.owner.rows[0]!.cells[0]!),
    );
    expect(revisions.derived).toBe('sha256:derived');
  });

  test('semantic row revision ignores source padding but cell revision retains invalid raw', () => {
    const parsedA = parseDatabaseMarkdownOwner(source);
    const padded = source.replace('| [[alpha]] | 1 |', '|  [[alpha]]  |  1  |');
    const parsedB = parseDatabaseMarkdownOwner(padded);
    expect(parsedA.ok && parsedB.ok).toBe(true);
    if (!parsedA.ok || !parsedB.ok) return;
    expect(databaseMarkdownTableRowRevision(parsedA.owner.rows[0]!)).toBe(
      databaseMarkdownTableRowRevision(parsedB.owner.rows[0]!),
    );
    expect(databaseMarkdownTableCellRevision(parsedA.owner.rows[0]!.cells[1]!)).toBe(
      databaseMarkdownTableCellRevision(parsedB.owner.rows[0]!.cells[1]!),
    );
  });

  test('builds one portable record revision set for table, row, cells, and document', () => {
    const parsed = parseDatabaseMarkdownOwner(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const revisions = createDatabaseMarkdownRecordRevisionSet({
      ownerMarkdown: source,
      owner: parsed.owner,
      rowIndex: 0,
      documentMarkdown: '---\n_sn:\n  document_id: doc_alpha\n---\nAlpha\n',
    });
    expect(revisions.owner).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(revisions.table).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(revisions.row).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.keys(revisions.cells)).toEqual(['prop_title', 'prop_value']);
    expect(revisions.document).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('keeps semantic scopes independent when prose or another row changes', () => {
    const parsed = parseDatabaseMarkdownOwner(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prose = `${source}\nUnrelated prose.\n`;
    const row = source.replace('| [[alpha]] | 1 |', '| [[alpha]] | 2 |');
    const proseParsed = parseDatabaseMarkdownOwner(prose);
    const rowParsed = parseDatabaseMarkdownOwner(row);
    expect(proseParsed.ok && rowParsed.ok).toBe(true);
    if (!proseParsed.ok || !rowParsed.ok) return;
    expect(databaseMarkdownTableRowRevision(parsed.owner.rows[0]!)).toBe(
      databaseMarkdownTableRowRevision(proseParsed.owner.rows[0]!),
    );
    expect(databaseMarkdownTableCellRevision(parsed.owner.rows[0]!.cells[1]!)).toBe(
      databaseMarkdownTableCellRevision(proseParsed.owner.rows[0]!.cells[1]!),
    );
    expect(databaseMarkdownTableCellRevision(parsed.owner.rows[0]!.cells[1]!)).not.toBe(
      databaseMarkdownTableCellRevision(rowParsed.owner.rows[0]!.cells[1]!),
    );
  });
});

/**
 * `owner` and `table` describe the whole table, not the row, so they are
 * identical for every row of one projection — each a hash over the entire
 * owner markdown. Projecting a 318-row source recomputed them per row and
 * hashed ~6MB to produce two constants, which was most of the cost of
 * applying a single-row write. Callers may now hand them in.
 *
 * The only thing that makes that safe is that the hoisted path returns
 * byte-identical output, so that is what this asserts — for a multi-row table,
 * at every row.
 */
describe('owner-scoped revisions', () => {
  const multiRow = `<!-- synapsenote:database\nversion=2\ndatabase=db_demo\nsource=ds_demo\nblock=dbb_owner\ncolumns=prop_title,prop_value\n-->\n\n| Title | Value |\n| --- | --- |\n| [[alpha]] | 1 |\n| [[beta]] | 2 |\n| [[gamma]] | 3 |\n`;

  test('passing them in changes nothing about the result', () => {
    const parsed = parseDatabaseMarkdownOwner(multiRow);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ownerScoped = createDatabaseMarkdownOwnerScopedRevisions(multiRow, parsed.owner);
    for (const rowIndex of parsed.owner.rows.map((row) => row.rowIndex)) {
      const derived = createDatabaseMarkdownRecordRevisionSet({
        ownerMarkdown: multiRow,
        owner: parsed.owner,
        rowIndex,
        documentMarkdown: `# Row ${rowIndex}\n`,
      });
      const hoisted = createDatabaseMarkdownRecordRevisionSet({
        ownerMarkdown: multiRow,
        owner: parsed.owner,
        rowIndex,
        documentMarkdown: `# Row ${rowIndex}\n`,
        ownerScoped,
      });
      expect(hoisted).toEqual(derived);
    }
  });

  test('the owner-scoped pair really is constant across rows', () => {
    const parsed = parseDatabaseMarkdownOwner(multiRow);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sets = parsed.owner.rows.map((row) =>
      createDatabaseMarkdownRecordRevisionSet({
        ownerMarkdown: multiRow,
        owner: parsed.owner,
        rowIndex: row.rowIndex,
        documentMarkdown: `# Row ${row.rowIndex}\n`,
      }),
    );
    expect(new Set(sets.map((set) => set.owner)).size).toBe(1);
    expect(new Set(sets.map((set) => set.table)).size).toBe(1);
    // The row-scoped halves must still differ, or the hoist would be hiding a
    // collapse of everything into one value.
    expect(new Set(sets.map((set) => set.row)).size).toBe(sets.length);
  });
});
