/**
 * What the editor hides and what it replaces with widgets (SPEC.md §3).
 *
 * Positions come from the core parser's mdast, so the editor and every other
 * reader of the source agree on how it parses. Frontmatter is split off first
 * (the parser does not see it) and becomes a block widget.
 */
import type { Root as MdastRoot, Nodes, RootContent } from 'mdast';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';

export type Range = readonly [number, number];

export type HiddenKind = 'open' | 'close' | 'prefix' | 'escape' | 'break';

export interface HiddenRange {
  from: number;
  to: number;
  kind: HiddenKind;
}

export type WidgetKind = 'list-marker' | 'entity' | 'inline' | 'block';

export interface WidgetRange {
  from: number;
  to: number;
  kind: WidgetKind;
  /** mdast node type the widget stands for (`table`, `code`, `listItem`, …). */
  node: string;
}

export type MarkType =
  | 'strong'
  | 'emphasis'
  | 'delete'
  | 'mark'
  | 'inlineCode'
  | 'link'
  | 'linkReference'
  | 'wikiLink';

export interface MarkSpan {
  type: MarkType;
  open: Range;
  close: Range;
  /** Typing at the mark's end goes inside it (SPEC.md §4). */
  inclusive: boolean;
}

/** Text drawn with a style and no hidden syntax (tags). */
export interface StyledSpan {
  from: number;
  to: number;
  node: string;
}

export interface Layout {
  hidden: HiddenRange[];
  widgets: WidgetRange[];
  marks: MarkSpan[];
  spans: StyledSpan[];
}

const INCLUSIVE: Record<MarkType, boolean> = {
  strong: true,
  emphasis: true,
  delete: true,
  mark: true,
  inlineCode: true,
  link: false,
  linkReference: false,
  wikiLink: false,
};

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const ENTITY = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

let defaultManager: MarkdownManager | null = null;
function manager(): MarkdownManager {
  defaultManager ??= new MarkdownManager({ extensions: sharedExtensions });
  return defaultManager;
}

type Positioned = { position?: { start: { offset?: number }; end: { offset?: number } } };
const start = (n: Positioned): number | undefined => n.position?.start.offset;
const end = (n: Positioned): number | undefined => n.position?.end.offset;

export function computeLayout(source: string, markdown: MarkdownManager = manager()): Layout {
  const layout: Layout = { hidden: [], widgets: [], marks: [], spans: [] };
  const fm = FRONTMATTER.exec(source);
  const offset = fm ? fm[0].length : 0;
  if (fm) layout.widgets.push({ from: 0, to: fm[0].length, kind: 'block', node: 'yaml' });
  const body = source.slice(offset);
  if (!body.trim()) return layout;
  let tree: MdastRoot;
  try {
    tree = markdown.parseToMdast(body) as MdastRoot;
  } catch {
    // Unparseable (e.g. broken MDX): show it as source rather than guess.
    return layout;
  }
  const walker = new Walker(source, offset, layout);
  for (const child of tree.children) walker.block(child);
  const byFrom = (a: { from: number; to: number }, b: { from: number; to: number }) =>
    a.from - b.from || a.to - b.to;
  layout.hidden.sort(byFrom);
  layout.widgets.sort(byFrom);
  layout.marks.sort((a, b) => a.open[0] - b.open[0]);
  return layout;
}

class Walker {
  constructor(
    private readonly source: string,
    private readonly offset: number,
    private readonly layout: Layout,
  ) {}

  private s(n: Positioned): number | undefined {
    const v = start(n);
    return v === undefined ? undefined : v + this.offset;
  }

  private e(n: Positioned): number | undefined {
    const v = end(n);
    return v === undefined ? undefined : v + this.offset;
  }

  private hide(from: number, to: number, kind: HiddenKind): void {
    if (to > from) this.layout.hidden.push({ from, to, kind });
  }

  private widget(from: number, to: number, kind: WidgetKind, node: string): void {
    if (to > from) this.layout.widgets.push({ from, to, kind, node });
  }

  block(node: RootContent): void {
    const from = this.s(node);
    const to = this.e(node);
    if (from === undefined || to === undefined) return;
    switch (node.type) {
      case 'paragraph':
        this.inlines(node.children);
        return;
      case 'heading': {
        const line = this.source.slice(from, to);
        const prefix = /^ {0,3}#{1,6}(?:[ \t]+|$)/.exec(line);
        if (prefix) {
          this.hide(from, from + prefix[0].length, 'prefix');
          const closing = /[ \t]+#+[ \t]*$/.exec(line);
          if (closing && closing.index >= prefix[0].length) {
            this.hide(from + closing.index, to, 'close');
          }
        }
        this.inlines(node.children);
        return;
      }
      case 'blockquote': {
        // A `>` marker opens every line of the quote (lazy lines may omit it).
        for (let at = from; at < to; ) {
          const lineEnd = this.source.indexOf('\n', at);
          const stop = lineEnd < 0 || lineEnd > to ? to : lineEnd;
          const marker = /^ {0,3}> ?/.exec(this.source.slice(at, stop));
          if (marker) this.hide(at, at + marker[0].length, 'prefix');
          at = stop + 1;
        }
        for (const child of node.children) this.block(child);
        return;
      }
      case 'list':
        for (const item of node.children) {
          const itemFrom = this.s(item);
          const itemTo = this.e(item);
          if (itemFrom === undefined || itemTo === undefined) continue;
          const first = item.children[0];
          const contentFrom = (first && this.s(first)) ?? itemTo;
          this.widget(itemFrom, contentFrom, 'list-marker', 'listItem');
          for (const child of item.children) this.block(child);
        }
        return;
      default:
        this.widget(from, to, 'block', node.type);
    }
  }

  private inlines(nodes: readonly Nodes[]): void {
    for (const node of nodes) this.inline(node);
  }

  private mark(type: MarkType, open: Range, close: Range): void {
    this.hide(open[0], open[1], 'open');
    this.hide(close[0], close[1], 'close');
    this.layout.marks.push({ type, open, close, inclusive: INCLUSIVE[type] });
  }

  private inline(node: Nodes): void {
    const from = this.s(node);
    const to = this.e(node);
    if (from === undefined || to === undefined) return;
    switch (node.type) {
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'mark' as Nodes['type']:
      case 'link':
      case 'linkReference': {
        const children = (node as { children: Nodes[] }).children;
        if (node.type === 'link' && this.source[from] === '<') {
          this.mark('link', [from, from + 1], [to - 1, to]);
          this.inlines(children);
          return;
        }
        const firstFrom = children[0] && this.s(children[0]);
        const lastTo = children.length ? this.e(children[children.length - 1]) : undefined;
        if (firstFrom === undefined || lastTo === undefined) {
          this.widget(from, to, 'inline', node.type);
          return;
        }
        this.mark(node.type as MarkType, [from, firstFrom], [lastTo, to]);
        this.inlines(children);
        return;
      }
      case 'inlineCode': {
        let ticks = 0;
        while (this.source[from + ticks] === '`') ticks++;
        let open = from + ticks;
        let close = to - ticks;
        // One padding space on each side is not part of the code (CommonMark §6.1).
        if (close - open - node.value.length === 2 && this.source[open] === ' ') {
          open++;
          close--;
        }
        this.mark('inlineCode', [from, open], [close, to]);
        return;
      }
      case 'break':
        if (this.source[from] === '\\') this.hide(from, from + 1, 'break');
        else this.hide(from, to - 1, 'break');
        return;
      case 'text':
        this.text(from, to, node.value);
        return;
      default: {
        if (node.type === ('wikiLink' as Nodes['type'])) {
          const raw = this.source.slice(from, to);
          const pipe = raw.indexOf('|');
          this.mark('wikiLink', [from, pipe > 0 ? from + pipe + 1 : from + 2], [to - 2, to]);
          return;
        }
        if (node.type === ('tag' as Nodes['type'])) {
          this.layout.spans.push({ from, to, node: 'tag' });
          return;
        }
        const children = (node as { children?: Nodes[] }).children;
        if (children?.length && children.every((c) => start(c) !== undefined)) {
          this.inlines(children);
          return;
        }
        this.widget(from, to, 'inline', node.type);
      }
    }
  }

  /** Find backslash escapes and character references by aligning the source with the parsed value. */
  private text(from: number, to: number, value: string): void {
    const raw = this.source.slice(from, to);
    let i = 0;
    let j = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (
        ch === '\\' &&
        i + 1 < raw.length &&
        ASCII_PUNCT.test(raw[i + 1]) &&
        value[j] === raw[i + 1]
      ) {
        this.hide(from + i, from + i + 1, 'escape');
        i += 2;
        j += 1;
        continue;
      }
      if (ch === '&') {
        // The parser keeps references literal in the mdast value (it protects
        // them for byte-faithful serialization) or decodes them; both show one
        // character on screen.
        const entity = ENTITY.exec(raw.slice(i));
        if (entity) {
          this.widget(from + i, from + i + entity[0].length, 'entity', 'characterReference');
          i += entity[0].length;
          j += value.startsWith(entity[0], j) ? entity[0].length : decodedLength(entity[1]);
          continue;
        }
      }
      if (ch === value[j]) j++;
      i++;
    }
  }
}

function decodedLength(reference: string): number {
  if (reference.startsWith('#')) {
    const code =
      reference[1] === 'x' || reference[1] === 'X'
        ? Number.parseInt(reference.slice(2), 16)
        : Number.parseInt(reference.slice(1), 10);
    return code > 0xffff ? 2 : 1;
  }
  return 1;
}
