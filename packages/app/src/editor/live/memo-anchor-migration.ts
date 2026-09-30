import {
  codeWidgetSource,
  frontmatterRange,
  MarkdownManager,
  sharedExtensions,
} from '@nedian0brien/synapsenote-core';
import type {
  DocumentMemoAnchor,
  DocumentMemoQuote,
  DocumentMemoState,
} from '@/lib/document-memo-store';
import { legacyMemoQuoteText } from '../extensions/memo-quote-text';

interface AstNode {
  type: string;
  value?: string;
  children?: AstNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
export interface MemoTextProjection {
  text: string;
  from: number[];
  to: number[];
}
let parser: MarkdownManager | undefined;
/** The old renderer flattened textblocks with a single newline between them. */
export function memoTextProjection(source: string): MemoTextProjection {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  const offset = frontmatterRange(source)?.[1] ?? 0;
  const root = parser.parseToMdast(source.slice(offset)) as unknown as AstNode;
  const chunks: MemoTextProjection[] = [];
  const start = (node: AstNode) =>
    node.position?.start.offset === undefined ? -1 : offset + node.position.start.offset;
  const end = (node: AstNode) =>
    node.position?.end.offset === undefined ? -1 : offset + node.position.end.offset;
  const appendValue = (
    value: string,
    from: number,
    to: number,
    chunk: MemoTextProjection,
    quote: boolean,
    indent = '',
  ) => {
    const raw = source.slice(from, to);
    let at = 0;
    const local: MemoTextProjection = { text: '', from: [], to: [] };
    for (let i = 0; i < value.length; i++) {
      if ((i === 0 || value[i - 1] === '\n') && indent && raw.startsWith(indent, at))
        at += indent.length;
      if (i > 0 && value[i - 1] === '\n' && quote)
        at += /^ {0,3}(?:>[ \t]?)+/.exec(raw.slice(at))?.[0].length ?? 0;
      let glyphFrom = -1;
      let glyphTo = -1;
      while (at < raw.length) {
        if (raw[at] === '\\' && raw[at + 1] === value[i]) {
          glyphFrom = from + at;
          at += 2;
          glyphTo = from + at;
          break;
        }
        if (raw[at] === value[i]) {
          glyphFrom = from + at;
          at++;
          glyphTo = from + at;
          break;
        }
        at++;
      }
      if (glyphFrom < 0) return false;
      local.text += value[i];
      local.from.push(glyphFrom);
      local.to.push(glyphTo);
    }
    chunk.text += local.text;
    for (let i = 0; i < local.from.length; i++) {
      chunk.from.push(local.from[i]);
      chunk.to.push(local.to[i]);
    }
    return true;
  };
  const inline = (node: AstNode, chunk: MemoTextProjection, quote: boolean): boolean => {
    const from = start(node);
    const to = end(node);
    if (from < 0 || to < from || to > source.length) return false;
    if (node.type === 'text' || node.type === 'inlineCode')
      return appendValue(node.value ?? '', from, to, chunk, quote);
    if (
      node.children &&
      ['strong', 'emphasis', 'delete', 'mark', 'link', 'linkReference'].includes(node.type)
    )
      return node.children.every((child) => inline(child, chunk, quote));
    // Existing renderer leaf atoms contribute an object replacement character.
    chunk.text += '\uFFFC';
    chunk.from.push(from);
    chunk.to.push(to);
    return true;
  };
  const walk = (node: AstNode, quote = false) => {
    if (['paragraph', 'heading', 'tableCell'].includes(node.type)) {
      const chunk: MemoTextProjection = { text: '', from: [], to: [] };
      if (node.children?.every((child) => inline(child, chunk, quote))) chunks.push(chunk);
      return;
    }
    if (node.type === 'code') {
      const from = start(node);
      const to = end(node);
      if (from < 0 || to < from) return;
      const code = codeWidgetSource(source, from, to);
      const chunk: MemoTextProjection = { text: '', from: [], to: [] };
      const indent = source[from] === '\t' ? '\t' : source.startsWith('    ', from) ? '    ' : '';
      if (
        appendValue(
          node.value ?? '',
          code?.body[0] ?? from,
          code?.body[1] ?? to,
          chunk,
          quote,
          indent,
        )
      )
        chunks.push(chunk);
      return;
    }
    for (const child of node.children ?? []) walk(child, quote || node.type === 'blockquote');
  };
  walk(root);
  const result: MemoTextProjection = { text: '', from: [], to: [] };
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) {
      result.text += '\n';
      result.from.push(result.to.at(-1) ?? 0);
      result.to.push(chunk.from[0] ?? result.to.at(-1) ?? 0);
    }
    result.text += chunk.text;
    for (let i = 0; i < chunk.from.length; i++) {
      result.from.push(chunk.from[i]);
      result.to.push(chunk.to[i]);
    }
  }
  return result;
}

function locate(projection: MemoTextProjection, anchor: DocumentMemoAnchor): number {
  let at = projection.text.indexOf(anchor.exact);
  let best = -1;
  let score = -1;
  while (at >= 0 && anchor.exact) {
    const prefix = projection.text.slice(Math.max(0, at - anchor.prefix.length), at);
    const suffix = projection.text.slice(
      at + anchor.exact.length,
      at + anchor.exact.length + anchor.suffix.length,
    );
    let current = 0;
    for (let n = 1; n <= anchor.prefix.length; n++)
      if (prefix.endsWith(anchor.prefix.slice(-n))) current = n;
    for (let n = 1; n <= anchor.suffix.length; n++)
      if (suffix.startsWith(anchor.suffix.slice(0, n))) current += n;
    const distance = Math.abs((projection.from[at] ?? 0) - anchor.from);
    const previousDistance = Math.abs((projection.from[best] ?? 0) - anchor.from);
    if (current > score || (current === score && distance < previousDistance)) {
      best = at;
      score = current;
    }
    at = projection.text.indexOf(anchor.exact, at + 1);
  }
  return best;
}
export function migrateMemoAnchors(
  source: string,
  state: DocumentMemoState,
): { state: DocumentMemoState; changed: boolean; unmatched: string[] } {
  let projection: MemoTextProjection | undefined;
  let changed = false;
  const unmatched: string[] = [];
  const convert = (quote: DocumentMemoQuote | null, id: string): DocumentMemoQuote | null => {
    if (
      !quote ||
      quote.anchor?.surface === 'source' ||
      (!quote.anchor && quote.sourceLineStart !== undefined)
    )
      return quote;
    const original = quote.anchor ?? {
      surface: 'wysiwyg' as const,
      exact: legacyMemoQuoteText(quote.markdown),
      prefix: '',
      suffix: '',
      from: -1,
      to: -1,
    };
    projection ??= memoTextProjection(source);
    const at = locate(projection, original);
    const from = projection.from[at];
    const to = projection.to[at + original.exact.length - 1];
    if (at < 0 || from === undefined || to === undefined || from >= to) {
      unmatched.push(id);
      return quote;
    }
    changed = true;
    return {
      ...quote,
      legacyAnchor: quote.legacyAnchor ?? original,
      sourceLineStart: source.slice(0, from).split('\n').length,
      sourceLineEnd: source.slice(0, to).split('\n').length,
      anchor: {
        surface: 'source',
        exact: source.slice(from, to),
        prefix: source.slice(Math.max(0, from - 48), from),
        suffix: source.slice(to, to + 48),
        from,
        to,
      },
    };
  };
  const draftQuote = convert(state.draftQuote, 'draft');
  const items = state.items.map((item) => {
    const quote = convert(item.quote, item.id);
    return quote === item.quote ? item : { ...item, quote };
  });
  return { state: changed ? { ...state, draftQuote, items } : state, changed, unmatched };
}
