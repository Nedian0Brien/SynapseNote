/** File-native database Text rich-markup parsing and deterministic projection. */

import { z } from 'zod';

const LINK_PATTERN = /!?\[((?:\\.|[^\]\\\n]){0,500})\]\(([^)\s]{1,2000})(?:\s+"[^"]{0,500}")?\)/g;
const WIKI_PATTERN = /\[\[([^\]|\n]{1,1000})(?:\|([^\]\n]{1,500}))?\]\]/g;

export const DatabaseRichTextReferenceSchema = z
  .object({
    kind: z.enum(['person', 'record', 'document', 'url']),
    target: z.string().min(1).max(2_000),
    label: z.string().max(500),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict();

export type DatabaseRichTextReference = z.infer<typeof DatabaseRichTextReferenceSchema>;

export interface DatabaseRichTextProjection {
  markup: string;
  plainText: string;
  references: readonly DatabaseRichTextReference[];
}

function decodeEntities(value: string): string {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d{1,7});/g, (match, digits: string) => {
      const point = Number(digits);
      return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    });
}

function referenceForLink(
  target: string,
  label: string,
  start: number,
  end: number,
): DatabaseRichTextReference | null {
  try {
    const url = new URL(target);
    if (url.protocol === 'synapsenote:') {
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (url.hostname === 'person' && id.startsWith('person_')) {
        return { kind: 'person', target: id, label, start, end };
      }
      if (url.hostname === 'record' && id.startsWith('rec_')) {
        return { kind: 'record', target: id, label, start, end };
      }
      if (url.hostname === 'document' && id !== '') {
        return { kind: 'document', target: id, label, start, end };
      }
      return null;
    }
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return { kind: 'url', target, label, start, end };
    }
  } catch {
    return null;
  }
  return null;
}

function stripInlineMarkup(value: string): string {
  return decodeEntities(value)
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<!\\)([*_])([^\n]+?)\1/g, '$2')
    .replace(/\\([\\`*_[\]{}()#+.!|>-])/g, '$1');
}

function unescapeLabel(value: string): string {
  return value.replace(/\\([\\`*_[\]{}()#+.!|>-])/g, '$1');
}

/**
 * Projects canonical Markdown-compatible Text markup without resolving labels
 * from mutable workspace state. The same input therefore always yields the
 * same plain text, reference offsets, filter value, and search value.
 */
export function projectDatabaseRichText(input: string): DatabaseRichTextProjection {
  const markup = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const references: DatabaseRichTextReference[] = [];
  for (const match of markup.matchAll(LINK_PATTERN)) {
    const complete = match[0];
    const label = unescapeLabel(match[1] ?? '');
    const target = match[2] ?? '';
    const start = match.index;
    const reference = referenceForLink(target, label, start, start + complete.length);
    if (reference) references.push(DatabaseRichTextReferenceSchema.parse(reference));
  }
  for (const match of markup.matchAll(WIKI_PATTERN)) {
    const target = match[1] ?? '';
    const label = match[2] ?? target;
    const start = match.index;
    references.push(
      DatabaseRichTextReferenceSchema.parse({
        kind: target.startsWith('rec_') ? 'record' : 'document',
        target,
        label,
        start,
        end: start + match[0].length,
      }),
    );
  }
  references.sort((left, right) => left.start - right.start || left.end - right.end);
  const plainText = stripInlineMarkup(
    markup
      .replace(LINK_PATTERN, (_complete, label: string) => unescapeLabel(label))
      .replace(WIKI_PATTERN, (_complete, target: string, label?: string) => label ?? target),
  );
  return { markup, plainText, references };
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(']', '\\]');
}

export function databasePersonMentionMarkup(personId: string, label: string): string {
  if (!personId.startsWith('person_')) throw new Error('Expected a stable database person ID');
  const visible = label.startsWith('@') ? label : `@${label}`;
  return `[${escapeLabel(visible)}](synapsenote://person/${encodeURIComponent(personId)})`;
}

export function databaseRecordReferenceMarkup(recordId: string, label: string): string {
  if (!recordId.startsWith('rec_')) throw new Error('Expected a stable database record ID');
  return `[${escapeLabel(label)}](synapsenote://record/${encodeURIComponent(recordId)})`;
}

export function databaseDocumentReferenceMarkup(path: string, label: string): string {
  if (path === '' || path.includes('\0')) throw new Error('Expected a document path');
  return `[${escapeLabel(label)}](synapsenote://document/${encodeURIComponent(path)})`;
}
