/** Source ranges used by the live editor's code and table widgets. */
import type { Table } from 'mdast';
import { IMAGE_EXTENSIONS } from '../constants/upload.ts';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import { sourceChanges } from './changes.ts';
import type { Range } from './layout.ts';
import { type MdxWidgetEdit, updateMdxWidget } from './mdx-widget.ts';

export interface CodeWidgetSource {
  body: Range;
  language: Range;
}

export interface IndentedCodeWidgetSource {
  text: string;
  indent: string;
}

export interface TableCellSource {
  from: number;
  to: number;
  text: string;
}

export interface TableWidgetSource {
  rows: TableCellSource[][];
  align: Table['align'];
}

export interface DiagramWidgetSource {
  kind: 'math' | 'mermaid';
  body: Range;
  /** Formula or chart text as interpreted by the shared parser. */
  preview: string;
}

export interface ContainerWidgetSource {
  kind: 'callout' | 'accordion';
  syntax: 'gfm' | 'mdx';
  title: string;
  calloutType?: string;
  props: Readonly<Record<string, string | boolean>>;
  body: string;
  /** Raw source range containing the body, without opening and closing syntax. */
  bodyRange: Range;
  /** One source offset for each UTF-16 boundary in the displayed body. */
  bodyBoundaries: number[];
  titleRange: Range | null;
  typeRange: Range | null;
  /** Position for inserting a missing MDX attribute or GFM title. */
  attributeInsert: number;
}

export interface MediaWidgetSource {
  kind: 'image' | 'file' | 'embed';
  syntax: 'markdown' | 'wiki' | 'mdx';
  nodeName: string;
  src: string;
  label: string;
  props: Readonly<Record<string, string | boolean>>;
  srcRange: Range | null;
  labelRange: Range | null;
  attributeInsert: number;
}

export type BlockWidgetEdit =
  | { type: 'code-body'; text: string }
  | { type: 'code-language'; text: string }
  | { type: 'diagram-body'; text: string }
  | { type: 'container-body'; text: string }
  | { type: 'container-title'; text: string }
  | { type: 'container-type'; text: string }
  | { type: 'media-src'; text: string }
  | { type: 'media-label'; text: string }
  | MdxWidgetEdit
  | { type: 'table-cell'; row: number; column: number; text: string };

let parser: MarkdownManager | undefined;
function md(): MarkdownManager {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  return parser;
}

/** A fenced code block's editable body and language, excluding its fences and metadata. */
export function codeWidgetSource(
  source: string,
  from: number,
  to: number,
): CodeWidgetSource | null {
  const raw = source.slice(from, to);
  const firstNewline = raw.indexOf('\n');
  if (firstNewline < 0) return null;
  const opening = raw.slice(0, firstNewline).replace(/\r$/, '');
  const fence = /^ {0,3}(`{3,}|~{3,})([^\s`~]*)/.exec(opening);
  if (!fence) return null;
  const languageFrom = from + fence[0].length - fence[2].length;
  let bodyEnd = to;
  const lastNewline = raw.lastIndexOf('\n');
  if (lastNewline > firstNewline) {
    const closing = raw.slice(lastNewline + 1).replace(/\r$/, '');
    const closeFence = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
    if (closeFence.test(closing)) bodyEnd = from + lastNewline;
  }
  return {
    language: [languageFrom, languageFrom + fence[2].length],
    body: [from + firstNewline + 1, bodyEnd],
  };
}

/** Code indentation belongs to Markdown syntax, not the editable body. */
export function indentedCodeWidgetSource(
  source: string,
  from: number,
  to: number,
): IndentedCodeWidgetSource | null {
  const raw = source.slice(from, to);
  const indent = raw.startsWith('\t') ? '\t' : raw.startsWith('    ') ? '    ' : null;
  if (!indent) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'code' || node.lang) return null;
  const text = raw
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
  return { text, indent };
}

/** Parse table cell ranges with the same mdast parser used by the editing model. */
export function tableWidgetSource(
  source: string,
  from: number,
  to: number,
): TableWidgetSource | null {
  const raw = source.slice(from, to);
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'table') return null;
  const table = node as Table;
  const rows = table.children.map((row) =>
    row.children.map((cell) => {
      const start = cell.position?.start.offset;
      const end = cell.position?.end.offset;
      if (start === undefined || end === undefined) return null;
      const segment = raw.slice(start, end);
      const padding = cell.data?.sourcePadding as { left?: number; right?: number } | undefined;
      const cellFrom = from + start + (segment.startsWith('|') ? 1 : 0) + (padding?.left ?? 0);
      let escapes = 0;
      if (segment.endsWith('|')) {
        for (let i = segment.length - 2; i >= 0 && segment[i] === '\\'; i--) escapes++;
      }
      const boundaryPipe = segment.endsWith('|') && escapes % 2 === 0;
      const cellTo = from + end - (boundaryPipe ? 1 : 0) - (padding?.right ?? 0);
      if (cellFrom > cellTo) return null;
      return { from: cellFrom, to: cellTo, text: source.slice(cellFrom, cellTo) };
    }),
  );
  if (rows.some((row) => row.some((cell) => cell === null))) return null;
  return { rows: rows as TableCellSource[][], align: table.align };
}

/** Locate the editable source inside a promoted math or Mermaid block. */
export function diagramWidgetSource(
  source: string,
  from: number,
  to: number,
): DiagramWidgetSource | null {
  const raw = source.slice(from, to);
  if (!/^(?:\$\$|\\\[|\[| {0,3}(?:`{3,}|~{3,}))/.test(raw)) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'mdxJsxFlowElement') return null;
  const kind =
    node.name === 'MermaidFence'
      ? 'mermaid'
      : node.name === 'DollarMath' || node.name === 'MathFence'
        ? 'math'
        : null;
  if (!kind) return null;
  const attribute = node.attributes.find(
    (item) =>
      item.type === 'mdxJsxAttribute' && item.name === (kind === 'math' ? 'formula' : 'chart'),
  );
  const preview =
    attribute?.type === 'mdxJsxAttribute' && typeof attribute.value === 'string'
      ? attribute.value
      : '';
  const fenced = codeWidgetSource(source, from, to);
  if (fenced) return { kind, body: fenced.body, preview };
  if (node.name !== 'DollarMath') return null;
  const firstNewline = raw.indexOf('\n');
  const lastNewline = raw.lastIndexOf('\n');
  if (firstNewline < 0 || lastNewline <= firstNewline) return null;
  const opening = raw.slice(0, firstNewline).trim();
  const closing = raw.slice(lastNewline + 1).trim();
  if (
    !(
      (opening === '$$' && closing === '$$') ||
      (opening === '\\[' && closing === '\\]') ||
      (opening === '[' && closing === ']')
    )
  )
    return null;
  return { kind, body: [from + firstNewline + 1, from + lastNewline], preview };
}

/** Source-positioned Callout and Accordion body/attribute model. */
export function containerWidgetSource(
  source: string,
  from: number,
  to: number,
): ContainerWidgetSource | null {
  const raw = source.slice(from, to);
  if (!/^(?: {0,3}>|<Callout\b|<Accordion\b)/.test(raw)) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'mdxJsxFlowElement') return null;
  const kind =
    node.name === 'GFMCallout' || node.name === 'Callout'
      ? 'callout'
      : node.name === 'Accordion'
        ? 'accordion'
        : null;
  if (!kind) return null;
  if (node.name === 'GFMCallout') {
    const headerEnd = raw.indexOf('\n');
    const header = raw.slice(0, headerEnd < 0 ? raw.length : headerEnd);
    const marker = /\[!([A-Za-z]+)\]/.exec(header);
    if (!marker) return null;
    const titleStart = marker.index + marker[0].length;
    const titleMatch = /\s+(.*)$/.exec(header.slice(titleStart));
    const title = titleMatch?.[1] ?? '';
    const titleOffset = titleMatch
      ? titleStart + titleMatch.index + titleMatch[0].length - title.length
      : header.length;
    const bodyStart = from + (headerEnd < 0 ? raw.length : headerEnd + 1);
    const { body, boundaries } = quotedBody(source, bodyStart, to);
    return {
      kind,
      syntax: 'gfm',
      title,
      calloutType: marker[1].toLowerCase(),
      props: { type: marker[1].toLowerCase(), title },
      body,
      bodyRange: [bodyStart, to],
      bodyBoundaries: boundaries,
      titleRange: title ? [from + titleOffset, from + header.length] : null,
      typeRange: [from + marker.index + 2, from + marker.index + 2 + marker[1].length],
      attributeInsert: from + header.length,
    };
  }

  const name = node.name;
  if (!name) return null;
  const openerEnd = mdxOpenerEnd(raw);
  if (openerEnd < 0) return null;
  const closeAt = raw.lastIndexOf(`</${name}>`);
  if (closeAt < openerEnd) return null;
  const bodyStart = from + openerEnd + 1 + (raw[openerEnd + 1] === '\n' ? 1 : 0);
  const bodyEnd = from + closeAt - (closeAt > openerEnd + 2 && raw[closeAt - 1] === '\n' ? 1 : 0);
  if (bodyStart > bodyEnd) return null;
  const attribute = (key: string) => {
    const attr = node.attributes.find(
      (item) => item.type === 'mdxJsxAttribute' && item.name === key,
    );
    if (attr?.type !== 'mdxJsxAttribute' || typeof attr.value !== 'string') return null;
    const a = attr.position?.start.offset;
    const b = attr.position?.end.offset;
    if (a === undefined || b === undefined) return null;
    const spelling = raw.slice(a, b);
    const quote = /=[ \t]*(["'])/.exec(spelling);
    if (!quote) return null;
    const valueStart = a + quote.index + quote[0].length;
    const valueEnd = b - 1;
    return { value: attr.value, range: [from + valueStart, from + valueEnd] as Range };
  };
  const title = attribute('title');
  const type = attribute('type');
  const props: Record<string, string | boolean> = {};
  for (const item of node.attributes) {
    if (item.type !== 'mdxJsxAttribute') continue;
    if (typeof item.value === 'string') props[item.name] = item.value;
    else if (item.value === null) props[item.name] = true;
    else if (item.value && (item.value.value === 'true' || item.value.value === 'false')) {
      props[item.name] = item.value.value === 'true';
    }
  }
  const body = source.slice(bodyStart, bodyEnd);
  return {
    kind,
    syntax: 'mdx',
    title: title?.value ?? '',
    calloutType: kind === 'callout' ? (type?.value ?? 'note') : undefined,
    props,
    body,
    bodyRange: [bodyStart, bodyEnd],
    bodyBoundaries: Array.from({ length: body.length + 1 }, (_, i) => bodyStart + i),
    titleRange: title?.range ?? null,
    typeRange: type?.range ?? null,
    attributeInsert: from + openerEnd,
  };
}

function mdxOpenerEnd(raw: string): number {
  let quote: '"' | "'" | null = null;
  let braces = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote && raw[i - 1] !== '\\') quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') braces++;
    else if (ch === '}') braces = Math.max(0, braces - 1);
    else if (ch === '>' && braces === 0) return i;
  }
  return -1;
}

function quotedBody(
  source: string,
  from: number,
  to: number,
): { body: string; boundaries: number[] } {
  if (from >= to) return { body: '', boundaries: [to] };
  let body = '';
  const boundaries: number[] = [];
  let at = from;
  while (at < to) {
    const end = source.indexOf('\n', at);
    const stop = end < 0 || end > to ? to : end;
    const prefix = /^ {0,3}> ?/.exec(source.slice(at, stop))?.[0].length ?? 0;
    const contentFrom = at + prefix;
    if (boundaries.length === 0) boundaries.push(contentFrom);
    for (let i = contentFrom; i < stop; i++) {
      body += source[i];
      boundaries.push(i + 1);
    }
    if (stop >= to) break;
    body += '\n';
    const nextAt = stop + 1;
    const nextStop = source.indexOf('\n', nextAt);
    const nextLine = source.slice(nextAt, nextStop < 0 || nextStop > to ? to : nextStop);
    const nextPrefix = /^ {0,3}> ?/.exec(nextLine)?.[0].length ?? 0;
    boundaries.push(nextAt + nextPrefix);
    at = nextAt;
  }
  return { body, boundaries };
}

/** Locate the editable source fields of a Markdown, wiki, or MDX media node. */
export function mediaWidgetSource(
  source: string,
  from: number,
  to: number,
): MediaWidgetSource | null {
  const raw = source.slice(from, to);
  if (!raw.startsWith('![') && !/^<(?:img|File|Embed)\b/.test(raw)) return null;
  if (raw.startsWith('![[') && raw.endsWith(']]')) {
    const pipe = raw.indexOf('|', 3);
    const targetEnd = pipe < 0 ? raw.length - 2 : pipe;
    const target = raw.slice(3, targetEnd);
    const extension = target.split(/[?#]/, 1)[0]?.split('.').at(-1)?.toLowerCase() ?? '';
    const image = IMAGE_EXTENSIONS.has(extension);
    return {
      kind: image ? 'image' : 'file',
      syntax: 'wiki',
      nodeName: 'wikiLinkEmbed',
      src: target,
      label: pipe < 0 ? target : raw.slice(pipe + 1, -2),
      props: {},
      srcRange: [from + 3, from + targetEnd],
      labelRange: pipe < 0 ? null : [from + pipe + 1, to - 2],
      attributeInsert: to - 2,
    };
  }
  if (raw.startsWith('![')) {
    const node = md().parseToMdast(raw).children[0];
    const image =
      node?.type === 'mdxJsxFlowElement' && node.name === 'CommonMarkImage'
        ? node
        : node?.type === 'paragraph' &&
            node.children.length === 1 &&
            node.children[0]?.type === 'image'
          ? node.children[0]
          : null;
    if (!image) return null;
    let depth = 1;
    let bracket = -1;
    for (let i = 2; i < raw.length; i++) {
      if (raw[i] === '\\') {
        i++;
        continue;
      }
      if (raw[i] === '[') depth++;
      if (raw[i] === ']' && --depth === 0) {
        bracket = i;
        break;
      }
    }
    if (bracket < 0 || raw[bracket + 1] !== '(') return null;
    let start = bracket + 2;
    while (raw[start] === ' ') start++;
    const angle = raw[start] === '<';
    if (angle) start++;
    let end = start;
    let parens = 0;
    for (; end < raw.length; end++) {
      const ch = raw[end];
      if (ch === '\\') {
        end++;
        continue;
      }
      if (angle && ch === '>') break;
      if (!angle && ch === '(') parens++;
      else if (!angle && ch === ')') {
        if (parens === 0) break;
        parens--;
      } else if (!angle && /\s/.test(ch) && parens === 0) break;
    }
    const alt = raw.slice(2, bracket);
    const url = raw.slice(start, end);
    return {
      kind: 'image',
      syntax: 'markdown',
      nodeName: 'image',
      src: url,
      label: alt,
      props: {
        title:
          image.type === 'mdxJsxFlowElement'
            ? String(
                image.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'title')
                  ?.value ?? '',
              )
            : (image.title ?? ''),
      },
      srcRange: [from + start, from + end],
      labelRange: [from + 2, from + bracket],
      attributeInsert: from + bracket,
    };
  }
  if (!raw.startsWith('<')) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'mdxJsxFlowElement') return null;
  const name = node.name;
  if (!name) return null;
  const kind =
    name === 'img' ? 'image' : name === 'File' ? 'file' : name === 'Embed' ? 'embed' : null;
  if (!kind) return null;
  const props: Record<string, string | boolean> = {};
  const range = (key: string): Range | null => {
    const attr = node.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === key);
    if (attr?.type !== 'mdxJsxAttribute' || typeof attr.value !== 'string') return null;
    const a = attr.position?.start.offset;
    const b = attr.position?.end.offset;
    if (a === undefined || b === undefined) return null;
    const spelling = raw.slice(a, b);
    const quote = /=[ \t]*(["'])/.exec(spelling);
    if (!quote) return null;
    return [from + a + quote.index + quote[0].length, from + b - 1];
  };
  for (const attr of node.attributes) {
    if (attr.type !== 'mdxJsxAttribute') continue;
    if (typeof attr.value === 'string') props[attr.name] = attr.value;
    else if (attr.value === null) props[attr.name] = true;
  }
  const openerEnd = mdxOpenerEnd(raw);
  if (openerEnd < 0) return null;
  const labelKey = kind === 'image' ? 'alt' : kind === 'file' ? 'name' : 'title';
  const insertAt = from + openerEnd - (raw[openerEnd - 1] === '/' ? 1 : 0);
  return {
    kind,
    syntax: 'mdx',
    nodeName: name,
    src: typeof props.src === 'string' ? props.src : '',
    label: typeof props[labelKey] === 'string' ? props[labelKey] : '',
    props,
    srcRange: range('src'),
    labelRange: range(labelKey),
    attributeInsert: insertAt,
  };
}

/** Replace only the source range owned by an editable widget part. */
export function updateBlockWidget(
  source: string,
  from: number,
  to: number,
  edit: BlockWidgetEdit,
): string | null {
  const replace = (range: Range, text: string) =>
    source.slice(0, range[0]) + text + source.slice(range[1]);
  if (edit.type === 'table-cell') {
    const cell = tableWidgetSource(source, from, to)?.rows[edit.row]?.[edit.column];
    if (!cell) return null;
    // Literal pipes would split the cell. Keep an existing escaped pipe as is.
    const text = edit.text
      .replace(/\r?\n/g, ' ')
      .replace(/(\\*)\|/g, (_, slashes: string) =>
        slashes.length % 2 ? `${slashes}|` : `${slashes}\\|`,
      );
    return replace([cell.from, cell.to], text);
  }
  if (edit.type === 'diagram-body') {
    const diagram = diagramWidgetSource(source, from, to);
    if (!diagram) return null;
    if (codeWidgetSource(source, from, to)) {
      return updateBlockWidget(source, from, to, { type: 'code-body', text: edit.text });
    }
    return replace(diagram.body, edit.text);
  }
  if (edit.type.startsWith('container-')) {
    const container = containerWidgetSource(source, from, to);
    if (!container) return null;
    if (edit.type === 'container-body') {
      if (container.syntax === 'mdx') {
        if (container.bodyRange[0] === container.bodyRange[1] && edit.text) {
          const at = container.bodyRange[0];
          const before = source[at - 1] === '\n' ? '' : '\n';
          return replace(container.bodyRange, `${before}${edit.text}\n`);
        }
        return replace(container.bodyRange, edit.text);
      }
      if (container.bodyRange[0] === container.bodyRange[1] && edit.text) {
        const before = source[container.bodyRange[0] - 1] === '\n' ? '' : '\n';
        return replace(container.bodyRange, `${before}> ${edit.text.replace(/\n/g, '\n> ')}`);
      }
      const changes = sourceChanges(container.body, edit.text);
      let next = source;
      for (const change of changes.reverse()) {
        const rawFrom = container.bodyBoundaries[change.from];
        const rawTo = container.bodyBoundaries[change.to];
        if (rawFrom === undefined || rawTo === undefined) return null;
        const insert = change.insert.replace(/\n/g, '\n> ');
        next = next.slice(0, rawFrom) + insert + next.slice(rawTo);
      }
      return next;
    }
    const text = edit.text.replace(/[\r\n]/g, ' ');
    const range = edit.type === 'container-title' ? container.titleRange : container.typeRange;
    if (range) {
      if (container.syntax === 'gfm')
        return replace(range, edit.type === 'container-type' ? text.toUpperCase() : text);
      const quote = source[range[0] - 1];
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&#39;' : '&quot;');
      return replace(range, escaped);
    }
    if (!text) return source;
    const label = edit.type === 'container-title' ? 'title' : 'type';
    const insertion =
      container.syntax === 'gfm'
        ? ` ${text}`
        : ` ${label}="${text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    return replace([container.attributeInsert, container.attributeInsert], insertion);
  }
  if (edit.type === 'media-src' || edit.type === 'media-label') {
    const media = mediaWidgetSource(source, from, to);
    if (!media) return null;
    const range = edit.type === 'media-src' ? media.srcRange : media.labelRange;
    const labelKey = media.kind === 'image' ? 'alt' : media.kind === 'file' ? 'name' : 'title';
    const text = edit.text.replace(/[\r\n]/g, ' ');
    if (range) {
      if (media.syntax === 'mdx') {
        const quote = source[range[0] - 1];
        const escaped = text
          .replace(/&/g, '&amp;')
          .replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&#39;' : '&quot;');
        return replace(range, escaped);
      }
      if (media.syntax === 'markdown') {
        const escaped =
          edit.type === 'media-label'
            ? text.replace(/([\\[\]])/g, '\\$1')
            : text.replace(/ /g, '%20').replace(/\)/g, '\\)');
        return replace(range, escaped);
      }
      return replace(range, text.replace(/\]/g, '\\]'));
    }
    if (!text) return source;
    if (media.syntax === 'wiki') {
      return replace(
        [media.attributeInsert, media.attributeInsert],
        `|${text.replace(/\]/g, '\\]')}`,
      );
    }
    if (media.syntax === 'mdx') {
      const key = edit.type === 'media-src' ? 'src' : labelKey;
      const escaped = text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const before = /\s/.test(source[media.attributeInsert - 1] ?? '') ? '' : ' ';
      const after = source[media.attributeInsert] === '/' ? ' ' : '';
      return replace(
        [media.attributeInsert, media.attributeInsert],
        `${before}${key}="${escaped}"${after}`,
      );
    }
    return null;
  }
  if (edit.type === 'mdx-prop' || edit.type === 'mdx-body') {
    return updateMdxWidget(source, from, to, edit);
  }
  if (edit.type === 'code-body') {
    const indented = indentedCodeWidgetSource(source, from, to);
    if (indented) {
      const body = edit.text
        .split('\n')
        .map((line) => (line ? indented.indent + line : ''))
        .join('\n');
      return replace([from, to], body);
    }
  }
  const code = codeWidgetSource(source, from, to);
  if (!code) return null;
  if (edit.type === 'code-language') {
    return replace(code.language, edit.text.replace(/[\s`~]/g, ''));
  }
  const opening = source.slice(from, code.language[0]);
  const fence = /^ {0,3}(`{3,}|~{3,})/.exec(opening)?.[1];
  if (!fence) return null;
  // A line in the body that looks like a closing fence requires a longer
  // delimiter. Widen both fences while leaving the user's body untouched.
  const unsafe = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`, 'm');
  if (!unsafe.test(edit.text)) return replace(code.body, edit.text);
  const runs = [...edit.text.matchAll(new RegExp(`^ {0,3}(${fence[0]}+)[ \\t]*$`, 'gm'))];
  const length = Math.max(fence.length, ...runs.map((match) => match[1].length)) + 1;
  const longer = fence[0].repeat(length);
  const close = source.slice(code.body[1], to);
  const updatedClose = close.replace(
    new RegExp(`^( {0,3})${fence[0]}{${fence.length},}`, 'm'),
    `$1${longer}`,
  );
  return (
    source.slice(0, from) +
    source.slice(from, code.language[0]).replace(fence, longer) +
    source.slice(code.language[0], code.body[0]) +
    edit.text +
    updatedClose +
    source.slice(to)
  );
}
