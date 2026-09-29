/** Source ranges for an MDX block rendered by the live editor. */
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import type { Range } from './layout.ts';

export interface MdxWidgetAttribute {
  name: string;
  value: unknown;
  sourceRange: Range;
  valueRange: Range | null;
  expressionRange: Range | null;
  quote: '"' | "'" | null;
}

export interface MdxWidgetSource {
  name: string;
  props: Readonly<Record<string, unknown>>;
  attributes: readonly MdxWidgetAttribute[];
  body: string;
  bodyRange: Range | null;
  attributeInsert: number;
}

export type MdxWidgetEdit =
  | { type: 'mdx-prop'; key: string; text: string }
  | { type: 'mdx-prop-literal'; key: string; value: unknown }
  | { type: 'mdx-body'; text: string };

let parser: MarkdownManager | undefined;
function md(): MarkdownManager {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  return parser;
}

function openerEnd(raw: string): number {
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

/** Parse literal attributes and a paired body's exact byte range. */
export function mdxWidgetSource(source: string, from: number, to: number): MdxWidgetSource | null {
  const raw = source.slice(from, to);
  if (!raw.startsWith('<')) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'mdxJsxFlowElement' || !node.name) return null;
  const end = openerEnd(raw);
  if (end < 0) return null;
  const props: Record<string, unknown> = {};
  const attributes: MdxWidgetAttribute[] = [];
  for (const item of node.attributes) {
    if (item.type !== 'mdxJsxAttribute') continue;
    const a = item.position?.start.offset;
    const b = item.position?.end.offset;
    if (a === undefined || b === undefined) continue;
    const spelling = raw.slice(a, b);
    const match = /=[ \t]*(["'])/.exec(spelling);
    const quote = (match?.[1] as '"' | "'" | undefined) ?? null;
    const valueRange: Range | null = match
      ? [from + a + match.index + match[0].length, from + b - 1]
      : null;
    const expression = /=[ \t]*\{/.exec(spelling);
    const expressionRange: Range | null =
      !match && expression
        ? [from + a + expression.index + expression[0].length, from + b - 1]
        : null;
    let value: unknown;
    if (typeof item.value === 'string') value = item.value;
    else if (item.value === null) value = true;
    else if (item.value) {
      try {
        value = JSON.parse(item.value.value);
      } catch {
        // Arbitrary MDX expressions are retained in source and are not run.
        value = undefined;
      }
    }
    if (value !== undefined) props[item.name] = value;
    attributes.push({
      name: item.name,
      value,
      sourceRange: [from + a, from + b],
      valueRange,
      expressionRange,
      quote,
    });
  }
  const selfClosing = /\/\s*>$/.test(raw.slice(0, end + 1));
  let bodyRange: Range | null = null;
  let body = '';
  if (!selfClosing) {
    const close = raw.lastIndexOf(`</${node.name}>`);
    if (close < end) return null;
    const bodyStart = from + end + 1 + (raw[end + 1] === '\n' ? 1 : 0);
    const bodyEnd = from + close - (close > end + 2 && raw[close - 1] === '\n' ? 1 : 0);
    if (bodyStart > bodyEnd) return null;
    bodyRange = [bodyStart, bodyEnd];
    body = source.slice(bodyStart, bodyEnd);
  }
  return {
    name: node.name,
    props,
    attributes,
    body,
    bodyRange,
    attributeInsert: from + end - (raw[end - 1] === '/' ? 1 : 0),
  };
}

export function updateMdxWidget(
  source: string,
  from: number,
  to: number,
  edit: MdxWidgetEdit,
): string | null {
  const model = mdxWidgetSource(source, from, to);
  if (!model) return null;
  const replace = (range: Range, text: string) =>
    source.slice(0, range[0]) + text + source.slice(range[1]);
  if (edit.type === 'mdx-body') {
    if (model.bodyRange) {
      if (model.bodyRange[0] === model.bodyRange[1] && edit.text) {
        const at = model.bodyRange[0];
        return replace(model.bodyRange, `${source[at - 1] === '\n' ? '' : '\n'}${edit.text}\n`);
      }
      return replace(model.bodyRange, edit.text);
    }
    if (!edit.text) return source;
    const raw = source.slice(from, to);
    const slash = raw.lastIndexOf('/>');
    if (slash < 0) return null;
    return `${source.slice(0, from + slash)}>\n${edit.text}\n</${model.name}>${source.slice(to)}`;
  }
  const key = edit.key.trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) return null;
  if (edit.type === 'mdx-prop-literal') {
    const encoded = JSON.stringify(edit.value);
    if (encoded === undefined) return null;
    const attr = model.attributes.find((item) => item.name === key);
    if (attr?.expressionRange) return replace(attr.expressionRange, encoded);
    if (attr) return replace(attr.sourceRange, `${key}={${encoded}}`);
    const before = /\s/.test(source[model.attributeInsert - 1] ?? '') ? '' : ' ';
    const after = source[model.attributeInsert] === '/' ? ' ' : '';
    return replace(
      [model.attributeInsert, model.attributeInsert],
      `${before}${key}={${encoded}}${after}`,
    );
  }
  const value = edit.text.replace(/[\r\n]/g, ' ');
  const attr = model.attributes.find((item) => item.name === key);
  if (attr?.valueRange && attr.quote) {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(attr.quote === "'" ? /'/g : /"/g, attr.quote === "'" ? '&#39;' : '&quot;');
    return replace(attr.valueRange, escaped);
  }
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  if (attr) return replace(attr.sourceRange, `${key}="${escaped}"`);
  const before = /\s/.test(source[model.attributeInsert - 1] ?? '') ? '' : ' ';
  const after = source[model.attributeInsert] === '/' ? ' ' : '';
  return replace(
    [model.attributeInsert, model.attributeInsert],
    `${before}${key}="${escaped}"${after}`,
  );
}
