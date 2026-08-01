import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import type { DatabaseMarkdownDocumentLink } from './markdown-table.ts';

export const DATABASE_DOCUMENT_TITLE_MAX_LENGTH = 200 as const;

export type DatabaseDocumentTitleOrigin = 'frontmatter' | 'heading' | 'fallback';

export interface DatabaseDocumentTitle {
  value: string;
  origin: DatabaseDocumentTitleOrigin;
}

export type DatabaseDocumentTitleErrorCode = 'empty' | 'line_break' | 'nul' | 'too_long';

export interface DatabaseDocumentTitleError {
  ok: false;
  code: DatabaseDocumentTitleErrorCode;
  message: string;
}

export type NormalizeDatabaseDocumentTitleResult =
  | { ok: true; value: string }
  | DatabaseDocumentTitleError;

function titleError(
  code: DatabaseDocumentTitleErrorCode,
  message: string,
): DatabaseDocumentTitleError {
  return { ok: false, code, message };
}

/** Validate the one logical title representation shared by table and document surfaces. */
export function normalizeDatabaseDocumentTitle(
  value: string,
): NormalizeDatabaseDocumentTitleResult {
  const normalized = value.trim();
  if (normalized === '') return titleError('empty', 'A document title must not be empty');
  if (normalized.includes('\0'))
    return titleError('nul', 'A document title must not contain a NUL byte');
  if (/\r|\n/u.test(normalized))
    return titleError('line_break', 'A document title must fit on one line');
  if (normalized.length > DATABASE_DOCUMENT_TITLE_MAX_LENGTH) {
    return titleError(
      'too_long',
      `A document title must be at most ${DATABASE_DOCUMENT_TITLE_MAX_LENGTH} characters`,
    );
  }
  return { ok: true, value: normalized };
}

function fallbackTitle(path: string): string {
  return (
    path
      .split('/')
      .at(-1)
      ?.replace(/\.(?:md|mdx)$/iu, '') || path
  );
}

function firstHeading(body: string): string | null {
  let cursor = 0;
  let fence: '`' | '~' | null = null;
  while (cursor < body.length) {
    const newline = body.indexOf('\n', cursor);
    const end = newline < 0 ? body.length : newline + 1;
    const line = body.slice(cursor, end).replace(/\r?\n$/u, '');
    const opening = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence) {
      const fenceChar = fence === '`' ? '`' : '~';
      if (new RegExp(`^\\s{0,3}${fenceChar}{3,}\\s*$`, 'u').test(line)) fence = null;
      cursor = end;
      continue;
    }
    if (opening) {
      const openingFence = opening[1];
      if (!openingFence) throw new Error('Markdown fence capture unexpectedly missing');
      fence = openingFence[0] as '`' | '~';
      cursor = end;
      continue;
    }
    const heading = /^(\s{0,3}#\s+)(.*?)(\s*#?\s*)$/u.exec(line);
    if (heading?.[2]?.trim()) return heading[2].trim();
    cursor = end;
  }
  return null;
}

/** Resolve the logical document title without treating a database alias as storage. */
export function resolveDatabaseDocumentTitle(
  markdown: string,
  path: string,
): DatabaseDocumentTitle {
  const { frontmatter, body } = stripFrontmatter(markdown);
  if (frontmatter !== '') {
    const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
    const title = parsed.map?.title;
    if (typeof title === 'string' && title.trim() !== '') {
      return { value: title.trim(), origin: 'frontmatter' };
    }
  }
  const heading = firstHeading(body);
  if (heading) return { value: heading, origin: 'heading' };
  return { value: fallbackTitle(path), origin: 'fallback' };
}

/**
 * Update the document's canonical title declaration while leaving unrelated body
 * bytes untouched. Existing frontmatter title wins; a frontmatter document with
 * no title receives one, otherwise the first non-fenced H1 is changed; a plain
 * document receives a minimal H1 prefix.
 */
export function replaceDatabaseDocumentTitle(
  markdown: string,
  title: string,
): { ok: true; markdown: string; title: string } | DatabaseDocumentTitleError {
  const normalized = normalizeDatabaseDocumentTitle(title);
  if (!normalized.ok) return normalized;
  const value = normalized.value;
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const { frontmatter, body } = stripFrontmatter(markdown);
  if (frontmatter !== '') {
    const frontmatterBody = unwrapFrontmatterFences(frontmatter);
    const lines = frontmatterBody.split(/\r?\n/);
    const titleIndex = lines.findIndex((line) => /^title\s*:/u.test(line));
    const bodyOffset = frontmatter.indexOf(frontmatterBody);
    if (bodyOffset < 0) return titleError('line_break', 'Unable to locate the frontmatter body');
    const nextBody =
      titleIndex >= 0
        ? lines
            .map((line, index) => (index === titleIndex ? `title: ${JSON.stringify(value)}` : line))
            .join(eol)
        : `${frontmatterBody}${frontmatterBody.endsWith(eol) || frontmatterBody === '' ? '' : eol}title: ${JSON.stringify(value)}`;
    return {
      ok: true,
      title: value,
      markdown:
        frontmatter.slice(0, bodyOffset) +
        nextBody +
        frontmatter.slice(bodyOffset + frontmatterBody.length) +
        body,
    };
  }

  let cursor = 0;
  let fence: '`' | '~' | null = null;
  while (cursor < markdown.length) {
    const newline = markdown.indexOf('\n', cursor);
    const end = newline < 0 ? markdown.length : newline + 1;
    const line = markdown.slice(cursor, end).replace(/\r?\n$/u, '');
    const opening = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence) {
      const fenceChar = fence === '`' ? '`' : '~';
      if (new RegExp(`^\\s{0,3}${fenceChar}{3,}\\s*$`, 'u').test(line)) fence = null;
      cursor = end;
      continue;
    }
    if (opening) {
      const openingFence = opening[1];
      if (!openingFence) throw new Error('Markdown fence capture unexpectedly missing');
      fence = openingFence[0] as '`' | '~';
      cursor = end;
      continue;
    }
    const heading = /^(\s{0,3}#\s+)(.*?)(\s*#?\s*)$/u.exec(line);
    if (heading) {
      const lineEnding = markdown.slice(cursor, end).endsWith('\r\n')
        ? '\r\n'
        : markdown.slice(cursor, end).endsWith('\n')
          ? '\n'
          : '';
      return {
        ok: true,
        title: value,
        markdown:
          markdown.slice(0, cursor) +
          `${heading[1]}${value}${heading[3] ?? ''}${lineEnding}` +
          markdown.slice(end),
      };
    }
    cursor = end;
  }
  return { ok: true, title: value, markdown: `# ${value}${eol}${eol}${markdown}` };
}

/** Return the title link with the logical title as its display alias. */
export function titleLinkWithDocumentTitle(
  link: DatabaseMarkdownDocumentLink,
  title: string,
): { ok: true; link: DatabaseMarkdownDocumentLink } | DatabaseDocumentTitleError {
  const normalized = normalizeDatabaseDocumentTitle(title);
  if (!normalized.ok) return normalized;
  return { ok: true, link: { kind: 'wikilink', target: link.target, alias: normalized.value } };
}
