import {
  parseDatabaseMarkdownOwner,
  type ParsedDatabaseMarkdownOwner,
} from './markdown-table.ts';

export interface DatabaseMarkdownLinkRewrite {
  rowIndex: number;
  columnIndex: number;
  before: string;
  after: string;
  range: { start: number; end: number };
}

export interface DatabaseMarkdownLinkRewriteResult {
  changed: boolean;
  markdown: string;
  rewrites: readonly DatabaseMarkdownLinkRewrite[];
  owner: ParsedDatabaseMarkdownOwner;
}

function pathTarget(path: string): string {
  return path.replaceAll('\\', '/').replace(/\.(?:md|mdx)$/iu, '');
}

/**
 * Rewrite exact document wikilinks inside a marker-owned table.
 *
 * The operation is deliberately range-local: prose, headings, fenced code,
 * and unrelated table formatting are never touched. Relative/alias links are
 * left alone unless their target is the exact moved path; callers can build a
 * broader resolver-backed plan when a relative link needs disambiguation.
 */
export function rewriteDatabaseMarkdownDocumentLinks(input: {
  markdown: string;
  oldPath: string;
  newPath: string;
}): DatabaseMarkdownLinkRewriteResult {
  const parsed = parseDatabaseMarkdownOwner(input.markdown);
  if (!parsed.ok) throw new Error(`Cannot rewrite links in invalid owner: ${parsed.message}`);
  const oldTarget = pathTarget(input.oldPath);
  const newTarget = pathTarget(input.newPath);
  if (!oldTarget || !newTarget || oldTarget === newTarget) {
    return { changed: false, markdown: input.markdown, rewrites: [], owner: parsed.owner };
  }
  const rewrites: DatabaseMarkdownLinkRewrite[] = [];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const row of parsed.owner.rows) {
    for (const cell of row.cells) {
      const source = input.markdown.slice(cell.valueRange.start, cell.valueRange.end);
      const next = source.replace(/\[\[([^\]|#^]+)(?:\|([^\]]*))?\]\]/gu, (whole, target: string, alias?: string) => {
        const escapedSeparator = target.endsWith('\\');
        const cleanTarget = escapedSeparator ? target.slice(0, -1) : target;
        if (pathTarget(cleanTarget.trim()) !== oldTarget) return whole;
        return `[[${newTarget}${alias === undefined ? '' : `${escapedSeparator ? '\\|' : '|'}${alias}`}]]`;
      });
      if (next === source) continue;
      replacements.push({ start: cell.valueRange.start, end: cell.valueRange.end, value: next });
      rewrites.push({
        rowIndex: row.rowIndex,
        columnIndex: cell.columnIndex,
        before: source,
        after: next,
        range: cell.valueRange,
      });
    }
  }
  let markdown = input.markdown;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    markdown = markdown.slice(0, replacement.start) + replacement.value + markdown.slice(replacement.end);
  }
  const reparsed = parseDatabaseMarkdownOwner(markdown);
  if (!reparsed.ok) throw new Error(`Rewritten owner failed verification: ${reparsed.message}`);
  return { changed: rewrites.length > 0, markdown, rewrites, owner: reparsed.owner };
}
