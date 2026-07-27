import { describe, expect, test } from 'bun:test';
import { parseDatabaseMarkdownOwner } from './markdown-table.ts';
import {
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
    expect(revisions.cells['rec_alpha:0']).toBe(databaseMarkdownTableCellRevision(parsed.owner.rows[0]!.cells[0]!));
    expect(revisions.derived).toBe('sha256:derived');
  });

  test('semantic row revision ignores source padding but cell revision retains invalid raw', () => {
    const parsedA = parseDatabaseMarkdownOwner(source);
    const padded = source.replace('| [[alpha]] | 1 |', '|  [[alpha]]  |  1  |');
    const parsedB = parseDatabaseMarkdownOwner(padded);
    expect(parsedA.ok && parsedB.ok).toBe(true);
    if (!parsedA.ok || !parsedB.ok) return;
    expect(databaseMarkdownTableRowRevision(parsedA.owner.rows[0]!)).toBe(databaseMarkdownTableRowRevision(parsedB.owner.rows[0]!));
    expect(databaseMarkdownTableCellRevision(parsedA.owner.rows[0]!.cells[1]!)).toBe(databaseMarkdownTableCellRevision(parsedB.owner.rows[0]!.cells[1]!));
  });
});
