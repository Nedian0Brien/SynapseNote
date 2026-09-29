import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import { sourceChanges } from './changes.ts';
import type { Range } from './layout.ts';

export interface FootnoteWidgetSource {
  identifier: string;
  body: string;
  bodyRange: Range;
  bodyBoundaries: readonly number[];
}

export interface CommentWidgetSource {
  form: 'percent' | 'html';
  body: string;
  bodyRange: Range;
}

let parser: MarkdownManager | undefined;
function md(): MarkdownManager {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  return parser;
}

/** Remove only the definition marker and continuation indentation. */
export function footnoteWidgetSource(
  source: string,
  from: number,
  to: number,
): FootnoteWidgetSource | null {
  const raw = source.slice(from, to);
  const opener = /^ {0,3}\[\^[^\]\n]+\]:[ \t]?/.exec(raw);
  if (!opener) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'footnoteDefinition') return null;
  let body = '';
  const boundaries: number[] = [];
  let at = from;
  let first = true;
  while (at < to) {
    const next = source.indexOf('\n', at);
    const stop = next < 0 || next > to ? to : next;
    const line = source.slice(at, stop);
    const prefix = first ? opener[0].length : (/^(?: {4}|\t)/.exec(line)?.[0].length ?? 0);
    const contentFrom = Math.min(at + prefix, stop);
    if (!boundaries.length) boundaries.push(contentFrom);
    for (let i = contentFrom; i < stop; i++) {
      body += source[i];
      boundaries.push(i + 1);
    }
    if (stop >= to) break;
    body += '\n';
    const nextAt = stop + 1;
    const nextStop = source.indexOf('\n', nextAt);
    const nextLine = source.slice(nextAt, nextStop < 0 || nextStop > to ? to : nextStop);
    const nextPrefix = /^(?: {4}|\t)/.exec(nextLine)?.[0].length ?? 0;
    boundaries.push(nextAt + nextPrefix);
    at = nextAt;
    first = false;
  }
  return {
    identifier: node.identifier,
    body,
    bodyRange: [from + opener[0].length, to],
    bodyBoundaries: boundaries,
  };
}

export function updateFootnoteWidget(
  source: string,
  from: number,
  to: number,
  text: string,
): string | null {
  const model = footnoteWidgetSource(source, from, to);
  if (!model) return null;
  const changes = sourceChanges(model.body, text);
  let next = source;
  for (const change of changes.reverse()) {
    const rawFrom = model.bodyBoundaries[change.from];
    const rawTo = model.bodyBoundaries[change.to];
    if (rawFrom === undefined || rawTo === undefined) return null;
    const insert = change.insert.replace(/\n/g, '\n    ');
    next = next.slice(0, rawFrom) + insert + next.slice(rawTo);
  }
  return next;
}

/** The visible body excludes its original delimiters and outer line breaks. */
export function commentWidgetSource(
  source: string,
  from: number,
  to: number,
): CommentWidgetSource | null {
  const raw = source.slice(from, to);
  const form =
    raw.startsWith('<!--') && raw.endsWith('-->')
      ? 'html'
      : raw.startsWith('%%') && raw.endsWith('%%')
        ? 'percent'
        : null;
  if (!form) return null;
  const open = form === 'html' ? 4 : 2;
  const close = form === 'html' ? 3 : 2;
  const start = from + open + (raw[open] === '\n' ? 1 : 0);
  const end = to - close - (raw[raw.length - close - 1] === '\n' ? 1 : 0);
  if (start > end) return null;
  return { form, body: source.slice(start, end), bodyRange: [start, end] };
}

export function updateCommentWidget(
  source: string,
  from: number,
  to: number,
  text: string,
): string | null {
  const model = commentWidgetSource(source, from, to);
  if (!model) return null;
  if (text.includes(model.form === 'html' ? '-->' : '%%')) return null;
  return source.slice(0, model.bodyRange[0]) + text + source.slice(model.bodyRange[1]);
}
