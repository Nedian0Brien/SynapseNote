/** Source ranges used by the live editor's code and table widgets. */
import type { Table } from 'mdast';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import type { Range } from './layout.ts';

export interface CodeWidgetSource {
  body: Range;
  language: Range;
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

export type BlockWidgetEdit =
  | { type: 'code-body'; text: string }
  | { type: 'code-language'; text: string }
  | { type: 'diagram-body'; text: string }
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
  if (!fence) return null; // Indented code is handled in a later P3 slice.
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
