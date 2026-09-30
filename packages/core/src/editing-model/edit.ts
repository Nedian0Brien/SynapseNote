/**
 * Turn editor actions into source edits (SPEC.md §4–§8).
 *
 * Everything works on the source string. The screen is the source minus
 * hidden ranges, with each widget as one unit; a cursor sits between two
 * units, and when hidden syntax lies between them the rules in §4 decide
 * which source offset an edit lands on.
 */
import { htmlToMdast, mdastToMarkdown } from '../markdown/html-to-mdast.ts';
import type { BlockKind, EditAction } from './fixtures.ts';
import {
  computeBlockLayouts,
  computeLayout,
  frontmatterRange,
  type HiddenRange,
  type Layout,
  type MarkSpan,
  type MarkType,
  type WidgetRange,
} from './layout.ts';
import { updateSourceLink } from './link.ts';

export type ToggleMark = 'bold' | 'italic' | 'code' | 'strike' | 'highlight';

export interface EditState {
  source: string;
  anchor: number;
  head: number;
  /** `outside`: at a mark boundary, the next input goes outside every mark ending here. */
  side: 'default' | 'outside';
  /** Marks toggled on with an empty selection; the next typed text gets them. */
  pending: ToggleMark[];
  /**
   * Set right after an input rule: Backspace next puts back what was typed,
   * as written (§6). Any other action clears it.
   */
  undo?: SourceUndo;
}

/** Replace `[from, to)` of the current source with `insert` and put the cursor at `cursor`. */
export interface SourceUndo {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

export interface EditResult extends EditState {
  clipboard?: { markdown: string };
  ui?: string;
}

const DELIMITER: Record<ToggleMark, string> = {
  bold: '**',
  italic: '*',
  code: '`',
  strike: '~~',
  highlight: '==',
};
const MARK_TYPE: Record<ToggleMark, MarkType> = {
  bold: 'strong',
  italic: 'emphasis',
  code: 'inlineCode',
  strike: 'delete',
  highlight: 'mark',
};

const ESCAPABLE = /[!-/:-@[-`{-~]/;
/** Characters escaped when pasted as plain text anywhere on a line (SPEC.md §8). */
const PASTE_INLINE = /[\\*_`[\]<>~=|]/g;
/**
 * A line holding only a block marker still being typed. Markdown already reads
 * most of these as a block (`-` is an empty list item, `#` an empty heading),
 * so the editor keeps the typed marker escaped until its trigger (§5).
 */
const PARTIAL_BLOCK_MARKER =
  /^\s*(?:#{1,6}|[-*+]|\d+[.)]?|>|[-*+] \[[ xX]?\]?|-{2,}|\*{2,}|_{2,}|`+|~{2,}|\${1,2})$/;
/** A block marker completed by a space (§5 trigger). */
const BLOCK_MARKER = /^\s*(?:#{1,6}|[-*+]|\d+[.)]|>|[-*+] \[[ xX]\])$/;
const FENCE_LINE = /^\s*(`{3,}|~{3,}|\$\$)[\w-]*\s*$/;
/** A list item line: indent, marker, optional task box, content start. */
const ITEM_LINE = /^( *)(?:([-*+])|(\d{1,9})([.)]))(?:( \[[ xX]\])(?= |$))?( |$)/;
/** Quote markers at a line start (`>`, `> >`). */
const QUOTE_PREFIX = /^(?: {0,3}> ?)+/;
const HEADING_PREFIX = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;

export function initialState(source: string, anchor: number, head = anchor): EditState {
  return { source, anchor, head, side: 'default', pending: [] };
}

export function applyActions(state: EditState, actions: readonly EditAction[]): EditResult {
  let result: EditResult = { ...state };
  for (const action of actions) {
    const { clipboard, ui, ...next } = result;
    result = applyAction(next, action);
    if (!result.ui && ui && action.type === 'text') result.ui = ui;
  }
  return result;
}

export function applyAction(state: EditState, action: EditAction): EditResult {
  const { undo, ...base } = state;
  if (undo && action.type === 'key' && action.key === 'Backspace' && base.anchor === base.head) {
    const source = base.source.slice(0, undo.from) + undo.insert + base.source.slice(undo.to);
    return collapsed(source, undo.cursor);
  }
  const block = blockSourceAt(base);
  const raw = block ? editBlockSource(base, block, action) : null;
  if (raw) return raw;
  switch (action.type) {
    case 'link': {
      const result = updateSourceLink(
        base.source,
        base.anchor,
        base.head,
        action.href,
        action.label,
      );
      return { ...collapsed(result.source, result.head), anchor: result.anchor };
    }
    case 'text':
      return typeText(base, action.text);
    case 'key':
      return pressKey(base, action.key);
    case 'toggle':
      return toggleMark(base, action.mark);
    case 'block':
      return setBlock(base, action.block);
    case 'move':
      return moveBlock(base, action.direction);
    case 'paste':
      if (action.html !== undefined) {
        const markdown = mdastToMarkdown(htmlToMdast(action.html)).replace(/\n+$/, '');
        return insertLiteral(base, markdown);
      }
      if (action.as === 'markdown') return insertLiteral(base, action.text ?? '');
      return insertLiteral(base, escapePlainText(action.text ?? ''));
    case 'copy': {
      const [from, to] = ordered(base);
      return { ...base, clipboard: { markdown: base.source.slice(from, to) } };
    }
  }
}

// ── block source ────────────────────────────────────────────────────────────

/**
 * The block widget (code, math, table, …) the selection lies strictly inside.
 * Until block widgets are drawn (P3) their source shows, and inside it the
 * editor edits text as written (§3).
 */
function blockSourceAt(state: EditState): WidgetRange | null {
  const [from, to] = ordered(state);
  return (
    layoutOf(state.source).widgets.find((w) => w.kind === 'block' && w.from < from && to < w.to) ??
    null
  );
}

/** Edit inside a block's source: text goes in as typed; Enter is a newline (§7). */
function editBlockSource(
  state: EditState,
  block: WidgetRange,
  action: EditAction,
): EditResult | null {
  const [from, to] = ordered(state);
  const { source } = state;
  const replace = (a: number, b: number, text: string, cursor = a + text.length) =>
    collapsed(source.slice(0, a) + text + source.slice(b), cursor);
  switch (action.type) {
    case 'text':
      return replace(from, to, action.text);
    case 'paste':
      return replace(from, to, action.text ?? '');
    case 'key':
      switch (action.key) {
        case 'Enter':
          return replace(from, to, '\n');
        case 'Shift-Enter': {
          // Leave the block: a new paragraph after it.
          const after = source.slice(block.to);
          return collapsed(`${source.slice(0, block.to)}\n\n${after}`, block.to + 2);
        }
        case 'Backspace':
          if (from !== to) return replace(from, to, '');
          return replace(from - codePointBefore(source, from), from, '');
        case 'Delete':
          if (from !== to) return replace(from, to, '');
          return replace(to, to + codePointAfter(source, to), '');
        case 'Tab':
          return replace(from, to, '  ');
        case 'Shift-Tab': {
          const line = lineAround(source, state.head);
          const remove = Math.min(
            2,
            /^ */.exec(source.slice(line.start, line.end))?.[0].length ?? 0,
          );
          return collapsed(
            source.slice(0, line.start) + source.slice(line.start + remove),
            Math.max(line.start, state.head - remove),
          );
        }
        case 'ArrowLeft':
          return collapsed(source, from === to ? from - codePointBefore(source, from) : from);
        case 'ArrowRight':
          return collapsed(source, from === to ? to + codePointAfter(source, to) : to);
      }
      return null;
    default:
      return null;
  }
}

function codePointBefore(source: string, at: number): number {
  if (at === 0) return 0;
  const code = source.charCodeAt(at - 1);
  return code >= 0xdc00 && code <= 0xdfff && at >= 2 ? 2 : 1;
}

function codePointAfter(source: string, at: number): number {
  if (at >= source.length) return 0;
  const code = source.charCodeAt(at);
  return code >= 0xd800 && code <= 0xdbff && at + 1 < source.length ? 2 : 1;
}

/** Record how to put back `literal` (the typed text as written) from `next`. */
function withUndo(next: EditState, literal: EditState): EditState {
  const a = next.source;
  const b = literal.source;
  let prefix = 0;
  const max = Math.min(a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return {
    ...next,
    undo: {
      from: prefix,
      to: a.length - suffix,
      insert: b.slice(prefix, b.length - suffix),
      cursor: literal.head,
    },
  };
}

// ── screen model ────────────────────────────────────────────────────────────

interface Unit {
  from: number;
  to: number;
  /** A widget (one unit whatever its length). */
  widget?: 'list-marker' | 'entity' | 'inline' | 'block';
}

interface Screen {
  layout: Layout;
  units: Unit[];
}

/** The last source's layout: one action asks for the same source's layout more than once. */
let lastLayout: { source: string; layout: Layout } | null = null;
function layoutOf(source: string): Layout {
  if (lastLayout?.source !== source) lastLayout = { source, layout: computeLayout(source) };
  return lastLayout.layout;
}

function screen(source: string, layout = layoutOf(source)): Screen {
  const hidden = new Uint8Array(source.length);
  for (const h of layout.hidden) hidden.fill(1, h.from, h.to);
  const widgetAt = new Map(layout.widgets.map((w) => [w.from, w]));
  const units: Unit[] = [];
  for (let i = 0; i < source.length; ) {
    const widget = widgetAt.get(i);
    if (widget) {
      units.push({ from: widget.from, to: widget.to, widget: widget.kind });
      i = widget.to;
      continue;
    }
    if (hidden[i]) {
      i++;
      continue;
    }
    const code = source.charCodeAt(i);
    const width = code >= 0xd800 && code <= 0xdbff && i + 1 < source.length ? 2 : 1;
    units.push({ from: i, to: i + width });
    i += width;
  }
  return { layout, units };
}

/** The screen position (gap before unit k) a source offset falls in. */
function positionOf(s: Screen, offset: number): number {
  let k = 0;
  while (k < s.units.length && s.units[k].to <= offset) k++;
  // Inside a unit (only possible for widgets): the gap before it.
  return k;
}

/** Source range `[a, b]` of the gap before unit k: everything hidden between two units. */
function gapOf(s: Screen, k: number, length: number): [number, number] {
  const a = k === 0 ? 0 : s.units[k - 1].to;
  const b = k === s.units.length ? length : s.units[k].from;
  return [a, b];
}

/** Where input lands for screen position k (SPEC.md §4). */
function insertionOffset(s: Screen, k: number, length: number, side: EditState['side']): number {
  const [a, b] = gapOf(s, k, length);
  let at = a;
  // Closing delimiters in the gap, innermost first: pass the outermost mark that
  // does not take input at its end (links, or every mark when `outside`).
  for (const mark of s.layout.marks) {
    if (mark.close[0] >= a && mark.close[1] <= b && (!mark.inclusive || side === 'outside')) {
      at = Math.max(at, mark.close[1]);
    }
  }
  // Line prefixes (heading `#`, quote `>`) belong before the line's text.
  for (const h of s.layout.hidden) {
    if (h.kind === 'prefix' && h.from >= at && h.to <= b) at = h.to;
  }
  return at;
}

function canonical(state: EditState, s: Screen): number {
  return insertionOffset(s, positionOf(s, state.head), state.source.length, state.side);
}

function ordered(state: EditState): [number, number] {
  return state.anchor <= state.head ? [state.anchor, state.head] : [state.head, state.anchor];
}

function collapsed(source: string, at: number, side: EditState['side'] = 'default'): EditState {
  return { source, anchor: at, head: at, side, pending: [] };
}

// ── typing ──────────────────────────────────────────────────────────────────

function typeText(state: EditState, text: string): EditResult {
  let current: EditResult = state;
  let typed = '';
  for (const ch of text) {
    current = typeChar(current, ch);
    typed += ch;
  }
  const ui = uiFor(current.source, current.head, typed);
  return ui ? { ...current, ui } : current;
}

function uiFor(source: string, at: number, typed: string): string | undefined {
  if (source.slice(0, at).endsWith('[[')) return 'wiki-link-suggest';
  if (typed.endsWith('/')) {
    const before = source[at - 2];
    if (at - 1 === 0 || before === undefined || /\s/.test(before)) return 'slash-menu';
  }
  return undefined;
}

function typeChar(state: EditState, ch: string): EditState {
  return tidyCharacterReference(typeCharAt(state, ch));
}

/**
 * A whitespace character reference the editor wrote because a bare space
 * could not close a mark (`**bold&#x20;**`) is no longer needed once more
 * text follows it (`**bold X**`): turn it back into the character when the
 * screen stays the same.
 */
function tidyCharacterReference(state: EditState): EditState {
  const window = state.source.slice(Math.max(0, state.head - 16), state.head);
  const found = /&#x(9|A|20);(?=[^;]*$)/i.exec(window);
  if (!found) return state;
  const from = state.head - window.length + found.index;
  const to = from + found[0].length;
  if (to >= state.head) return state;
  const plain = String.fromCodePoint(Number.parseInt(found[1], 16));
  const source = state.source.slice(0, from) + plain + state.source.slice(to);
  if (screenSignature(source) !== screenSignature(state.source)) return state;
  const shift = found[0].length - plain.length;
  const { undo, ...rest } = state;
  return { ...rest, source, anchor: state.anchor - shift, head: state.head - shift };
}

/** What the screen shows: each unit's text (character references decoded) and the marks over it. */
function screenSignature(source: string): string {
  const s = screen(source);
  return JSON.stringify(
    s.units.map((u) => {
      const raw = source.slice(u.from, u.to);
      const ref = u.widget === 'entity' ? /^&#x([0-9a-f]+);$/i.exec(raw) : null;
      const text = ref ? String.fromCodePoint(Number.parseInt(ref[1], 16)) : raw;
      const marks = s.layout.marks
        .filter((m) => m.open[1] <= u.from && u.to <= m.close[0])
        .map((m) => m.type)
        .sort()
        .join(',');
      return `${text}|${marks}`;
    }),
  );
}

function typeCharAt(state: EditState, ch: string): EditState {
  let base = state;
  if (base.anchor !== base.head) base = deleteSelection(base);
  const s = screen(base.source);
  const at = canonical(base, s);

  if (base.pending.length) {
    const open = base.pending.map((m) => DELIMITER[m]).join('');
    const close = [...base.pending]
      .reverse()
      .map((m) => DELIMITER[m])
      .join('');
    const source = base.source.slice(0, at) + open + ch + close + base.source.slice(at);
    return collapsed(source, at + open.length + ch.length);
  }

  const marker = blockMarkerInput(base, s, at, ch);
  if (marker) return marker;

  const source = base.source.slice(0, at) + ch + base.source.slice(at);
  const after = layoutOf(source);
  if (keepsLayout(s.layout, after, at, 0)) return collapsed(source, at + ch.length);
  // The interpretation changed beyond the typed character.
  const closed = closesMarkAt(after, s.layout, at, at + ch.length);
  if (closed) {
    return withUndo(
      collapsed(source, at + ch.length, 'outside'),
      escapedDelimiters(source, closed, at + ch.length),
    );
  }
  return literalChar(base, s, at, ch, true);
}

/**
 * Put `ch` in so that it shows as itself and nothing else changes (§5): try
 * spellings and, failing those, the other side of the syntax at the same
 * screen position. Code spans and wiki link targets decode neither escapes
 * nor character references.
 */
function literalChar(
  base: EditState,
  s: Screen,
  at: number,
  ch: string,
  rawChecked = false,
): EditState {
  const source = base.source.slice(0, at) + ch + base.source.slice(at);
  if (!rawChecked && keepsLayout(s.layout, layoutOf(source), at, 0)) {
    return collapsed(source, at + ch.length);
  }
  const container = s.layout.marks.find(
    (m) =>
      (m.type === 'inlineCode' || m.type === 'wikiLink') && m.open[1] <= at && at <= m.close[0],
  );
  if (container?.type === 'inlineCode' && ch === '`')
    return widenCodeFence(base.source, container, at);
  const spellings = container
    ? []
    : [ESCAPABLE.test(ch) ? `\\${ch}` : null, characterReference(ch)].filter(
        (x): x is string => x !== null,
      );
  const [a, b] = gapOf(s, positionOf(s, base.head), base.source.length);
  const offsets = [at, ...boundaryOffsets(s.layout, a, b).filter((o) => o !== at)];
  const candidates: [number, string][] = [
    ...spellings.map((spelling): [number, string] => [at, spelling]),
    ...offsets.slice(1).flatMap((o) => [ch, ...spellings].map((t): [number, string] => [o, t])),
  ];
  for (const [offset, text] of candidates) {
    const tried = base.source.slice(0, offset) + text + base.source.slice(offset);
    if (keepsLayout(s.layout, layoutOf(tried), offset, text.length - ch.length, text.length)) {
      return collapsed(tried, offset + text.length);
    }
  }
  return collapsed(source, at + ch.length);
}

/**
 * Block markers at a line start (§5). A marker becomes a block only at its
 * trigger: the space after it turns the escaped marker the editor kept
 * (`\-`, `1\.`) into the block (`- `, `1. `). Any other character after a
 * marker that was kept escaped releases the escape when the line then forms
 * no block (`-5`, a `#tag`, `**bold`), so the escape lasts only while the
 * marker alone would read as a block. A marker typed at the start of a list
 * item's text changes the item's list type (`1. ` in a bullet item). Returns
 * null when none of these applies.
 */
function blockMarkerInput(base: EditState, s: Screen, at: number, ch: string): EditState | null {
  const { source } = base;
  const { layout } = s;
  const line = lineAround(source, at);
  const prefix = source.slice(line.start, at);
  const plain = unescapeMarker(prefix);
  const rest = source.slice(at);
  const restOfLine = source.slice(at, line.end);
  const literal = () => literalChar(base, s, at, ch);

  // Thematic break: the third `-`, or `***` / `___` and a space.
  const thematic =
    ch === '-' && /^ {0,3}--$/.test(plain)
      ? `${plain.trim()}-`
      : ch === ' ' && /^ {0,3}(?:\*\*\*|___)$/.test(plain)
        ? plain.trim()
        : null;
  if (thematic && !restOfLine.trim()) {
    const gap = blankBefore(source, line.start) ? '' : '\n';
    const head = `${source.slice(0, line.start)}${gap}${thematic}\n\n`;
    return withUndo(collapsed(head + source.slice(line.end), head.length), literal());
  }

  // `~~~lang` and a space: a code block.
  if (ch === ' ' && !restOfLine.trim() && /^ {0,3}~~~[\w-]*$/.test(plain)) {
    const fence = plain.trim();
    const head = `${source.slice(0, line.start)}${fence}\n`;
    return withUndo(collapsed(`${head}\n~~~${source.slice(line.end)}`, head.length), literal());
  }

  const item = parseItem(source.slice(line.start, line.end));
  if (ch === ' ' && item && at >= line.start + item.content) {
    const typed = unescapeMarker(source.slice(line.start + item.content, at));
    const m = /^(?:([-*+])|(\d{1,9})([.)])|\[([ xX])\])$/.exec(typed);
    if (m) {
      const marker =
        m[4] !== undefined ? `${itemMarker(item)} [${m[4]}]` : (m[1] ?? `${m[2]}${m[3]}`);
      const head = `${source.slice(0, line.start)}${' '.repeat(item.indent)}${marker} `;
      const written = `${source.slice(0, line.start + item.content)}${escapeMarker(typed)} `;
      return withUndo(
        collapsed(head + rest, head.length),
        collapsed(written + rest, written.length),
      );
    }
  }

  if (ch === ' ' && BLOCK_MARKER.test(plain)) {
    const next = `${source.slice(0, line.start)}${plain} ${rest}`;
    const end = line.start + plain.length + 1;
    const after = layoutOf(next);
    if (blockStartsIn(after, line.start, end) && sameBefore(layout, after, line.start)) {
      const written = `${source.slice(0, line.start)}${escapeMarker(plain)} `;
      return withUndo(collapsed(next, end), collapsed(written + rest, written.length));
    }
    return null;
  }
  if (ch === ' ' || plain === prefix || !PARTIAL_BLOCK_MARKER.test(plain)) return null;
  const next = `${source.slice(0, line.start)}${plain}${ch}${rest}`;
  const end = line.start + plain.length + ch.length;
  const after = layoutOf(next);
  const lineEnd = lineAround(next, end).end;
  if (blockStartsIn(after, line.start, lineEnd) || !sameBefore(layout, after, line.start)) {
    return null;
  }
  return collapsed(next, end);
}

/** A block marker written so it reads as text: its first punctuation escaped (`\\-`, `1\\.`). */
function escapeMarker(marker: string): string {
  const i = marker.search(/[!-/:-@[-`{-~]/);
  return i < 0 ? marker : `${marker.slice(0, i)}\\${marker.slice(i)}`;
}

/** The marker text with its backslash escapes and character references spelled out. */
function unescapeMarker(text: string): string {
  return text
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    );
}

/** A list marker, block widget or line prefix (heading, quote) starting in `[from, to)`. */
function blockStartsIn(layout: Layout, from: number, to: number): boolean {
  return (
    layout.widgets.some(
      (w) => (w.kind === 'list-marker' || w.kind === 'block') && w.from >= from && w.from < to,
    ) || layout.hidden.some((h) => h.kind === 'prefix' && h.from >= from && h.from < to)
  );
}

/** The layout before `at` is the same in both. */
function sameBefore(a: Layout, b: Layout, at: number): boolean {
  const cut = (l: Layout): Layout => ({
    ...l,
    hidden: l.hidden.filter((h) => h.to <= at),
    widgets: l.widgets.filter((w) => w.to <= at),
  });
  return sameLayout(cut(a), cut(b));
}

/** Put a backtick inside a code span by rewriting its fences one backtick longer than any run inside. */
function widenCodeFence(source: string, code: MarkSpan, at: number): EditState {
  const content = `${source.slice(code.open[1], at)}\`${source.slice(at, code.close[0])}`;
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
  const span = `${fence}${pad}${content}${pad}${fence}`;
  const cursor = code.open[0] + fence.length + pad.length + (at - code.open[1]) + 1;
  return collapsed(source.slice(0, code.open[0]) + span + source.slice(code.close[1]), cursor);
}

/** `&#x…;` for characters with no backslash escape (whitespace), else null. */
function characterReference(ch: string): string | null {
  if (!/\s/.test(ch) && ESCAPABLE.test(ch))
    return `&#x${ch.codePointAt(0)?.toString(16).toUpperCase()};`;
  if (/\s/.test(ch)) return `&#x${ch.codePointAt(0)?.toString(16).toUpperCase()};`;
  return null;
}

/** Source offsets inside gap `[a, b]` at hidden-range edges: same screen position, different syntax side. */
function boundaryOffsets(layout: Layout, a: number, b: number): number[] {
  const offsets = new Set<number>([a, b]);
  for (const h of layout.hidden) {
    if (h.from >= a && h.to <= b) {
      offsets.add(h.from);
      offsets.add(h.to);
    }
  }
  return [...offsets].sort((x, y) => x - y);
}

/**
 * Inserting text at `at` left every hidden range and widget where it was. The
 * escape (`\\`) or character reference that spells the typed character is its
 * own syntax and is not compared; anything else the insertion creates is.
 */
function keepsLayout(
  before: Layout,
  after: Layout,
  at: number,
  spellingSyntax: number,
  length = spellingSyntax + 1,
): boolean {
  const spelling = (r: { from: number; to: number }) =>
    spellingSyntax > 0 && r.from >= at && r.to <= at + length;
  return sameLayout(shiftLayout(before, at, length), {
    ...after,
    hidden: after.hidden.filter((h) => !(h.kind === 'escape' && spelling(h))),
    widgets: after.widgets.filter((w) => !(w.kind === 'entity' && spelling(w))),
  });
}

/**
 * A mark in `after` whose closing delimiter ends at `end`, which `before` did
 * not have. Typing a mark's own delimiter inside that mark is not a new
 * construct (it would split the mark), so it does not count.
 */
function closesMarkAt(
  after: Layout,
  before: Layout,
  at: number,
  end: number,
): MarkSpan | undefined {
  const inside = new Set(
    before.marks.filter((m) => m.open[1] <= at && at <= m.close[0]).map((m) => m.type),
  );
  return after.marks.find(
    (m) =>
      m.close[1] === end &&
      !inside.has(m.type) &&
      !before.marks.some(
        (b) =>
          b.type === m.type && b.open[0] === m.open[0] && b.close[0] === m.close[0] - (end - at),
      ),
  );
}

/** `source` with the mark's delimiters escaped: the typed text as written, cursor at `end`. */
function escapedDelimiters(source: string, mark: MarkSpan, end: number): EditState {
  let out = '';
  let cursor = end;
  for (let i = 0; i < source.length; i++) {
    const delimiter =
      (i >= mark.open[0] && i < mark.open[1]) || (i >= mark.close[0] && i < mark.close[1]);
    if (delimiter && ESCAPABLE.test(source[i])) {
      out += '\\';
      if (i < end) cursor++;
    }
    out += source[i];
  }
  return collapsed(out, cursor);
}

function shiftLayout(layout: Layout, at: number, by: number): Layout {
  const shift = (x: number) => (x >= at ? x + by : x);
  return {
    hidden: layout.hidden.map((h) => ({
      ...h,
      from: shift(h.from),
      to: h.to > at ? h.to + by : h.to,
    })),
    widgets: layout.widgets.map((w) => ({
      ...w,
      from: shift(w.from),
      to: w.to > at ? w.to + by : w.to,
    })),
    marks: layout.marks,
    spans: layout.spans,
  };
}

function sameLayout(a: Layout, b: Layout): boolean {
  const key = (l: Layout) =>
    JSON.stringify([
      l.hidden.map((h) => [h.from, h.to, h.kind]),
      l.widgets.map((w) => [w.from, w.to, w.kind]),
    ]);
  return key(a) === key(b);
}

function lineAround(source: string, at: number): { start: number; end: number } {
  const start = source.lastIndexOf('\n', at - 1) + 1;
  const newline = source.indexOf('\n', at);
  return { start, end: newline < 0 ? source.length : newline };
}

interface Line {
  start: number;
  end: number;
  text: string;
}

/** The lines above the line starting at `lineStart`, nearest first. */
function* linesAbove(source: string, lineStart: number): Generator<Line> {
  let end = lineStart - 1;
  while (end >= 0) {
    const start = source.lastIndexOf('\n', end - 1) + 1;
    yield { start, end, text: source.slice(start, end) };
    end = start - 1;
  }
}

/** The lines below the line ending at `lineEnd`, nearest first. */
function* linesBelow(source: string, lineEnd: number): Generator<Line> {
  let start = lineEnd + 1;
  while (start <= source.length && lineEnd < source.length) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline;
    yield { start, end, text: source.slice(start, end) };
    if (newline < 0) return;
    start = end + 1;
  }
}

function leadingSpaces(text: string): number {
  return /^ */.exec(text)?.[0].length ?? 0;
}

/** The line before `lineStart` is blank, or there is none. */
function blankBefore(source: string, lineStart: number): boolean {
  const above = linesAbove(source, lineStart).next();
  return above.done === true || !above.value.text.trim();
}

interface ItemLine {
  indent: number;
  bullet?: string;
  number?: number;
  delimiter?: string;
  /** ` [ ]` or ` [x]` after the marker. */
  task?: string;
  /** Offset of the item's text in the line. */
  content: number;
}

function parseItem(text: string): ItemLine | null {
  const m = ITEM_LINE.exec(text);
  if (!m) return null;
  return {
    indent: m[1].length,
    bullet: m[2],
    number: m[3] === undefined ? undefined : Number(m[3]),
    delimiter: m[4],
    task: m[5],
    content: m[0].length,
  };
}

function itemMarker(item: ItemLine): string {
  return item.bullet ?? `${item.number}${item.delimiter}`;
}

/** Column where the item's children start (indent plus marker and its space). */
function childIndent(item: ItemLine): number {
  return item.indent + itemMarker(item).length + 1;
}

/** The item before this one in the same list, or null for the first item. */
function previousSibling(source: string, lineStart: number, indent: number): ItemLine | null {
  for (const line of linesAbove(source, lineStart)) {
    if (!line.text.trim()) continue;
    const item = parseItem(line.text);
    if (item && item.indent === indent) return item;
    if (leadingSpaces(line.text) <= indent) return null;
  }
  return null;
}

/** The item this one is nested in, or null at the top level. */
function parentItem(source: string, lineStart: number, indent: number): ItemLine | null {
  for (const line of linesAbove(source, lineStart)) {
    if (!line.text.trim()) continue;
    const item = parseItem(line.text);
    if (item && item.indent < indent) return item;
    if (!item && leadingSpaces(line.text) < indent) return null;
  }
  return null;
}

/** The nearest item above at `indent` inside the previous sibling (the list this item joins). */
function itemAbove(
  source: string,
  lineStart: number,
  indent: number,
  stop: number,
): ItemLine | null {
  for (const line of linesAbove(source, lineStart)) {
    if (!line.text.trim()) continue;
    const item = parseItem(line.text);
    if (item && item.indent === indent) return item;
    if (leadingSpaces(line.text) <= stop) return null;
  }
  return null;
}

/** End of the item's own lines: its children and continuation lines below it. */
function itemEnd(source: string, line: Line, indent: number): number {
  let end = line.end;
  for (const below of linesBelow(source, line.end)) {
    if (!below.text.trim()) continue;
    if (leadingSpaces(below.text) <= indent) break;
    end = below.end;
  }
  return end;
}

function insertLiteral(state: EditState, text: string): EditResult {
  let base = state;
  if (base.anchor !== base.head) base = deleteSelection(base);
  const at = canonical(base, screen(base.source));
  return collapsed(base.source.slice(0, at) + text + base.source.slice(at), at + text.length);
}

function escapePlainText(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let out = line.replace(PASTE_INLINE, (c) => `\\${c}`);
      out = out.replace(/^(\s*)([#>+-])/, '$1\\$2');
      out = out.replace(/^(\s*\d+)([.)])/, '$1\\$2');
      return out;
    })
    .join('\n');
}

// ── keys ────────────────────────────────────────────────────────────────────

type Key = Extract<EditAction, { type: 'key' }>['key'];

function pressKey(state: EditState, key: Key): EditResult {
  switch (key) {
    case 'ArrowRight':
      return arrow(state, 1);
    case 'ArrowLeft':
      return arrow(state, -1);
    case 'Backspace':
      return state.anchor !== state.head ? deleteSelection(state) : backspace(state);
    case 'Delete':
      return state.anchor !== state.head ? deleteSelection(state) : deleteForward(state);
    case 'Enter':
      return enter(state);
    case 'Shift-Enter':
      return insertLiteral(state, '\\\n');
    case 'Tab':
      return indentItem(state, 1);
    case 'Shift-Tab':
      return indentItem(state, -1);
  }
}

function arrow(state: EditState, direction: 1 | -1): EditResult {
  const s = screen(state.source);
  if (state.anchor !== state.head) {
    const [from, to] = ordered(state);
    return collapsed(state.source, direction > 0 ? to : from);
  }
  const k = positionOf(s, state.head);
  if (direction > 0 && state.side === 'default') {
    // Leaving inline code: the first ArrowRight at its end only switches sides (§4).
    const [a, b] = gapOf(s, k, state.source.length);
    const exitsCode = s.layout.marks.some(
      (m) => m.type === 'inlineCode' && m.close[0] >= a && m.close[1] <= b,
    );
    if (exitsCode) return { ...state, side: 'outside' };
  }
  const next = Math.max(0, Math.min(s.units.length, k + direction));
  return collapsed(state.source, insertionOffset(s, next, state.source.length, 'default'));
}

function backspace(state: EditState): EditResult {
  const s = screen(state.source);
  const k = positionOf(s, state.head);
  const [a, b] = gapOf(s, k, state.source.length);
  const prefix = s.layout.hidden.find((h) => h.kind === 'prefix' && h.from >= a && h.to <= b);
  if (prefix) {
    const joined = joinQuoteLine(state.source, prefix);
    return joined ?? removeRange(state.source, prefix.from, prefix.to);
  }
  if (k === 0) return { ...state };
  const previous = s.units[k - 1];
  if (previous.widget === 'list-marker') {
    const line = lineAround(state.source, previous.from);
    const text = state.source.slice(line.start, line.end);
    const item = parseItem(text);
    if (item && line.start + item.content === previous.to) {
      return liftItem(state.source, { ...line, text }, item);
    }
    return removeRange(state.source, previous.from, previous.to);
  }

  if (isNewline(state.source, previous)) {
    // Join with the block above: drop the newlines between them, or select a block widget.
    let j = k - 1;
    while (j >= 0 && isNewline(state.source, s.units[j])) j--;
    if (j >= 0 && s.units[j].widget === 'block') {
      return {
        ...state,
        anchor: s.units[j].from,
        head: s.units[j].to,
        side: 'default',
        pending: [],
      };
    }
    const from = j >= 0 ? s.units[j].to : 0;
    return removeRange(state.source, from, a);
  }
  return deleteUnit(state.source, s, previous);
}

function deleteForward(state: EditState): EditResult {
  const s = screen(state.source);
  const k = positionOf(s, state.head);
  if (k >= s.units.length) return { ...state };
  if (isNewline(state.source, s.units[k])) {
    // Join the next block onto this one (§6), or select a block widget.
    let j = k;
    while (j < s.units.length && isNewline(state.source, s.units[j])) j++;
    if (j === s.units.length) return { ...state };
    const next = s.units[j];
    if (next.widget === 'block') {
      return { ...state, anchor: next.from, head: next.to, side: 'default', pending: [] };
    }
    const at = canonical(state, s);
    return removeRange(state.source, at, next.widget === 'list-marker' ? next.to : next.from);
  }
  return deleteUnit(state.source, s, s.units[k]);
}

/**
 * Backspace at a quote line's start: a line continuing the quote's paragraph
 * (or the paragraph after a bare `>` line) joins the text above; the quote's
 * first line leaves the quote.
 */
function joinQuoteLine(source: string, prefix: HiddenRange): EditResult | null {
  if (!/^ {0,3}>/.test(source.slice(prefix.from, prefix.to))) return null;
  const line = lineAround(source, prefix.from);
  const above = [...linesAbove(source, line.start)].slice(0, 2);
  const isQuote = (l: Line | undefined) => l !== undefined && QUOTE_PREFIX.test(l.text);
  const hasText = (l: Line) =>
    l.text.slice(QUOTE_PREFIX.exec(l.text)?.[0].length ?? 0).trim() !== '';
  let target: Line | undefined;
  if (isQuote(above[0]) && hasText(above[0])) target = above[0];
  else if (isQuote(above[0]) && isQuote(above[1]) && hasText(above[1] as Line)) target = above[1];
  if (!target) return null;
  return removeRange(source, target.end, prefix.to);
}

/** Turn a list item into a paragraph outside the list (§6). */
function liftItem(source: string, line: Line, item: ItemLine, cursorInText = 0): EditResult {
  const text = line.text.slice(item.content);
  const below = linesBelow(source, line.end).next();
  const gapBefore = blankBefore(source, line.start) ? '' : '\n';
  const gapAfter = below.done || !below.value.text.trim() ? '' : '\n';
  const head = `${source.slice(0, line.start)}${gapBefore}`;
  return collapsed(
    `${head}${text}${gapAfter}${source.slice(line.end)}`,
    head.length + Math.min(cursorInText, text.length),
  );
}

/** Delete one screen unit; a mark left empty loses its delimiters too (§6). */
function deleteUnit(source: string, s: Screen, unit: Unit): EditResult {
  const ranges: [number, number][] = [[unit.from, unit.to]];
  for (const mark of s.layout.marks) {
    if (mark.open[1] === unit.from && mark.close[0] === unit.to) {
      ranges.push([mark.open[0], mark.open[1]], [mark.close[0], mark.close[1]]);
    }
  }
  return removeRanges(source, ranges, unit.from);
}

function deleteSelection(state: EditState): EditState {
  const [from, to] = ordered(state);
  const s = screen(state.source);
  // A whole block widget goes with the blank lines after it.
  const block = s.units.find((u) => u.widget === 'block' && u.from === from && u.to === to);
  if (block) {
    let end = to;
    while (state.source[end] === '\n') end++;
    return removeRange(state.source, from, end);
  }
  // Marks cut by the selection keep the delimiter that fell inside it (§6).
  let reopen = '';
  let reclose = '';
  for (const mark of s.layout.marks) {
    const openInside = mark.open[0] >= from && mark.open[1] <= to;
    const closeInside = mark.close[0] >= from && mark.close[1] <= to;
    if (openInside && !closeInside) reopen += state.source.slice(mark.open[0], mark.open[1]);
    if (closeInside && !openInside)
      reclose = state.source.slice(mark.close[0], mark.close[1]) + reclose;
  }
  const source = state.source.slice(0, from) + reclose + reopen + state.source.slice(to);
  const at = from + reclose.length;
  return normalized(collapsed(source, at));
}

function normalized(state: EditState): EditState {
  const s = screen(state.source);
  return { ...state, anchor: canonical(state, s), head: canonical(state, s) };
}

function removeRange(source: string, from: number, to: number): EditResult {
  return normalized(collapsed(source.slice(0, from) + source.slice(to), from));
}

function removeRanges(source: string, ranges: [number, number][], cursor: number): EditResult {
  const sorted = [...ranges].sort((x, y) => y[0] - x[0]);
  let out = source;
  let at = cursor;
  for (const [from, to] of sorted) {
    out = out.slice(0, from) + out.slice(to);
    if (from < at) at -= Math.min(to, at) - from;
  }
  return normalized(collapsed(out, at));
}

function isNewline(source: string, unit: Unit): boolean {
  return !unit.widget && source[unit.from] === '\n';
}

function enter(state: EditState): EditResult {
  let base: EditState = state;
  if (base.anchor !== base.head) base = deleteSelection(base);
  const at = canonical(base, screen(base.source));
  const source = base.source;
  const line = lineAround(source, at);
  const text = source.slice(line.start, line.end);
  const split = () => collapsed(`${source.slice(0, at)}\n\n${source.slice(at)}`, at + 2);

  // A fence typed at a line start was kept escaped (§5); Enter is its trigger.
  const plain = at === line.end ? unescapeMarker(text) : text;
  if (at === line.end && FENCE_LINE.test(plain)) {
    const fence = /(`{3,}|~{3,}|\$\$)/.exec(plain)?.[1] ?? '```';
    const end = line.start + plain.length;
    const next = collapsed(
      `${source.slice(0, line.start)}${plain}\n\n${fence}${source.slice(at)}`,
      end + 1,
    );
    return plain === text ? next : withUndo(next, split());
  }

  const quote = QUOTE_PREFIX.exec(text);
  if (quote) {
    const depth = (quote[0].match(/>/g) ?? []).length;
    const marker = '> '.repeat(depth);
    if (!text.slice(quote[0].length).trim()) {
      // An empty quoted line leaves one level of the quote (and drops a bare `>` above it).
      const above = linesAbove(source, line.start).next();
      const start =
        !above.done && /^(?: {0,3}>)+ *$/.test(above.value.text) ? above.value.start : line.start;
      const outer = '> '.repeat(depth - 1);
      const insert = depth > 1 ? `${outer.trimEnd()}\n${outer}` : '\n';
      return collapsed(
        source.slice(0, start) + insert + source.slice(line.end),
        start + insert.length,
      );
    }
    const insert = `\n${marker.trimEnd()}\n${marker}`;
    return collapsed(source.slice(0, at) + insert + source.slice(at), at + insert.length);
  }

  const item = parseItem(text);
  if (item) {
    if (!text.slice(item.content).trim()) {
      // Enter on an empty item: a nested item moves out one level; a top-level one ends the list.
      if (parentItem(source, line.start, item.indent)) return indentItem(base, -1);
      return collapsed(`${source.slice(0, line.start)}\n${source.slice(line.end)}`, line.start + 1);
    }
    const number = item.number === undefined ? undefined : item.number + 1;
    const marker = number === undefined ? item.bullet : `${number}${item.delimiter}`;
    const insert = `\n${' '.repeat(item.indent)}${marker}${item.task ? ' [ ]' : ''} `;
    return collapsed(source.slice(0, at) + insert + source.slice(at), at + insert.length);
  }

  const heading = HEADING_PREFIX.exec(text);
  if (heading && at < line.end) {
    const content = line.start + heading[0].length;
    if (at <= content) {
      // At the heading's start: a new block above it.
      return collapsed(`${source.slice(0, line.start)}\n\n${source.slice(line.start)}`, at + 2);
    }
    // Inside the heading: two headings of the same level.
    const insert = `\n\n${heading[1]} `;
    return collapsed(source.slice(0, at) + insert + source.slice(at), at + insert.length);
  }
  return split();
}

/**
 * Tab nests a list item under the item above it, at that item's text column;
 * Shift-Tab moves it out to its parent's level, and a top-level item becomes
 * a paragraph (§7). The item's children move with it.
 */
function indentItem(state: EditState, direction: 1 | -1): EditResult {
  const { source } = state;
  const at = state.head;
  const range = lineAround(source, at);
  const line = { ...range, text: source.slice(range.start, range.end) };
  const item = parseItem(line.text);
  if (!item) return { ...state };
  if (direction > 0) {
    const sibling = previousSibling(source, line.start, item.indent);
    if (!sibling) return { ...state };
    const indent = childIndent(sibling);
    const joined = itemAbove(source, line.start, indent, item.indent);
    const marker = joined
      ? joined.number === undefined
        ? itemMarker(joined)
        : `${joined.number + 1}${joined.delimiter}`
      : sibling.number === undefined
        ? itemMarker(sibling)
        : `1${sibling.delimiter}`;
    return reindentItem(state, line, item, indent, marker);
  }
  const parent = parentItem(source, line.start, item.indent);
  if (!parent) return liftItem(source, line, item, at - line.start - item.content);
  const marker =
    parent.number === undefined ? itemMarker(parent) : `${parent.number + 1}${parent.delimiter}`;
  return reindentItem(state, line, item, parent.indent, marker);
}

function reindentItem(
  state: EditState,
  line: Line,
  item: ItemLine,
  indent: number,
  marker: string,
): EditResult {
  const { source } = state;
  const prefix = `${' '.repeat(indent)}${marker}${item.task ?? ''} `;
  const delta = indent - item.indent;
  const end = itemEnd(source, line, item.indent);
  const children = source
    .slice(line.end, end)
    .split('\n')
    .map((l, i) => {
      if (i === 0 || !l.trim()) return l;
      return delta > 0 ? ' '.repeat(delta) + l : l.slice(Math.min(-delta, leadingSpaces(l)));
    })
    .join('\n');
  const next = `${source.slice(0, line.start)}${prefix}${line.text.slice(item.content)}${children}${source.slice(end)}`;
  const inText = Math.max(0, state.head - line.start - item.content);
  return collapsed(next, line.start + prefix.length + inText);
}

// ── formatting ──────────────────────────────────────────────────────────────

function toggleMark(state: EditState, mark: ToggleMark): EditResult {
  if (state.anchor === state.head) {
    const pending = state.pending.includes(mark)
      ? state.pending.filter((m) => m !== mark)
      : [...state.pending, mark];
    return { ...state, pending };
  }
  const [from, to] = ordered(state);
  const s = screen(state.source);
  const existing = s.layout.marks.find(
    (m: MarkSpan) => m.type === MARK_TYPE[mark] && m.open[1] === from && m.close[0] === to,
  );
  if (existing) {
    const source =
      state.source.slice(0, existing.open[0]) +
      state.source.slice(existing.open[1], existing.close[0]) +
      state.source.slice(existing.close[1]);
    const shift = existing.open[1] - existing.open[0];
    return { ...state, source, anchor: from - shift, head: to - shift, pending: [] };
  }
  const delimiter = DELIMITER[mark];
  const source =
    state.source.slice(0, from) +
    delimiter +
    state.source.slice(from, to) +
    delimiter +
    state.source.slice(to);
  return {
    ...state,
    source,
    anchor: from + delimiter.length,
    head: to + delimiter.length,
    pending: [],
  };
}

// ── block shortcuts ─────────────────────────────────────────────────────────

/**
 * Rewrite the lines `[first, last]` one by one. Each line changes only at its
 * start, so a selection end keeps its place in the text after the change.
 */
function editLines(
  state: EditState,
  first: number,
  last: number,
  rewrite: (text: string, index: number) => string,
): EditResult {
  const { source } = state;
  const lines = source.slice(first, last).split('\n');
  const out: string[] = [];
  const map: {
    from: number;
    oldLength: number;
    newFrom: number;
    newLength: number;
    keep: number;
  }[] = [];
  let from = first;
  let newFrom = first;
  lines.forEach((text, i) => {
    const next = rewrite(text, i);
    let keep = 0;
    while (
      keep < Math.min(text.length, next.length) &&
      text[text.length - 1 - keep] === next[next.length - 1 - keep]
    )
      keep++;
    map.push({ from, oldLength: text.length, newFrom, newLength: next.length, keep });
    out.push(next);
    from += text.length + 1;
    newFrom += next.length + 1;
  });
  const shift = (offset: number): number => {
    if (offset < first) return offset;
    for (const m of map) {
      if (offset <= m.from + m.oldLength) {
        const fromEnd = m.from + m.oldLength - offset;
        return fromEnd <= m.keep
          ? m.newFrom + m.newLength - fromEnd
          : m.newFrom + m.newLength - m.keep;
      }
    }
    return offset + (newFrom - from);
  };
  const next = source.slice(0, first) + out.join('\n') + source.slice(last);
  return { ...collapsed(next, shift(state.head)), anchor: shift(state.anchor) };
}

/** Lines of the paragraph (run of non-blank lines) around the selection. */
function blockLines(state: EditState): { first: number; last: number } {
  const { source } = state;
  const [from, to] = ordered(state);
  let first = lineAround(source, from).start;
  let last = lineAround(source, to).end;
  if (from === to) {
    for (const line of linesAbove(source, first)) {
      if (!line.text.trim()) break;
      first = line.start;
    }
    for (const line of linesBelow(source, last)) {
      if (!line.text.trim()) break;
      last = line.end;
    }
  }
  return { first, last };
}

/** The block shortcuts (§7): headings, paragraph, lists, quote, code block. */
function setBlock(state: EditState, kind: BlockKind): EditResult {
  switch (kind) {
    case 'code':
      return toggleCodeBlock(state);
    case 'quote':
      return toggleQuote(state);
    case 'bullet':
    case 'ordered':
    case 'task':
      return toggleList(state, kind);
    default: {
      const level = kind === 'paragraph' ? 0 : Number(kind.slice(1));
      const [from, to] = ordered(state);
      const first = lineAround(state.source, from).start;
      const last = lineAround(state.source, to).end;
      return editLines(state, first, last, (text) => {
        if (!text.trim()) {
          return first === last && state.anchor === state.head && level > 0
            ? `${'#'.repeat(level)} `
            : text;
        }
        const quote = QUOTE_PREFIX.exec(text)?.[0] ?? '';
        const rest = text.slice(quote.length);
        if (parseItem(rest)) return text;
        const heading = HEADING_PREFIX.exec(rest);
        const body = heading ? rest.slice(heading[0].length) : rest;
        if (level === 0 || heading?.[1].length === level) return quote + body;
        return `${quote}${'#'.repeat(level)} ${body}`;
      });
    }
  }
}

function toggleList(state: EditState, kind: 'bullet' | 'ordered' | 'task'): EditResult {
  const { source } = state;
  const range = lineAround(source, state.head);
  const line = { ...range, text: source.slice(range.start, range.end) };
  const item = parseItem(line.text);
  if (item) {
    const current = item.task ? 'task' : item.number !== undefined ? 'ordered' : 'bullet';
    if (current === kind)
      return liftItem(source, line, item, state.head - line.start - item.content);
    // Another kind: rewrite the markers of the whole list at this level.
    let first = line.start;
    for (const above of linesAbove(source, line.start)) {
      if (!above.text.trim()) continue;
      const lead = leadingSpaces(above.text);
      if (lead < item.indent || (lead === item.indent && !parseItem(above.text))) break;
      first = above.start;
    }
    let last = line.end;
    for (const below of linesBelow(source, line.end)) {
      if (!below.text.trim()) continue;
      const lead = leadingSpaces(below.text);
      if (lead < item.indent || (lead === item.indent && !parseItem(below.text))) break;
      last = below.end;
    }
    let ordinal = 0;
    let shift = 0;
    return editLines(state, first, last, (text) => {
      const it = parseItem(text);
      if (it && it.indent === item.indent) {
        ordinal++;
        const marker = kind === 'ordered' ? `${ordinal}.` : kind === 'task' ? '- [ ]' : '-';
        const prefix = `${' '.repeat(it.indent)}${marker} `;
        // Children follow the item's text column when the marker width changes.
        shift = (kind === 'ordered' ? marker.length + 1 : 2) - (itemMarker(it).length + 1);
        return prefix + text.slice(it.content);
      }
      if (!text.trim() || leadingSpaces(text) <= item.indent) return text;
      return shift >= 0
        ? ' '.repeat(shift) + text
        : text.slice(Math.min(-shift, leadingSpaces(text)));
    });
  }
  const { first, last } = blockLines(state);
  let ordinal = 0;
  let inParagraph = false;
  return editLines(state, first, last, (text) => {
    if (!text.trim()) {
      inParagraph = false;
      return text;
    }
    const marker = kind === 'ordered' ? `${++ordinal}.` : kind === 'task' ? '- [ ]' : '-';
    const width = kind === 'ordered' ? marker.length + 1 : 2;
    const out = inParagraph ? ' '.repeat(width) + text : `${marker} ${text}`;
    inParagraph = true;
    return out;
  });
}

function toggleQuote(state: EditState): EditResult {
  const { source } = state;
  const range = lineAround(source, state.head);
  if (QUOTE_PREFIX.test(source.slice(range.start, range.end))) {
    let first = range.start;
    for (const above of linesAbove(source, range.start)) {
      if (!QUOTE_PREFIX.test(above.text)) break;
      first = above.start;
    }
    let last = range.end;
    for (const below of linesBelow(source, range.end)) {
      if (!QUOTE_PREFIX.test(below.text)) break;
      last = below.end;
    }
    return editLines(state, first, last, (text) => text.replace(/^ {0,3}> ?/, ''));
  }
  const { first, last } = blockLines(state);
  return editLines(state, first, last, (text) => (text.trim() ? `> ${text}` : '>'));
}

function toggleCodeBlock(state: EditState): EditResult {
  const { source } = state;
  const code = layoutOf(source).widgets.find(
    (w) => w.kind === 'block' && w.node === 'code' && w.from <= state.head && state.head <= w.to,
  );
  if (code) {
    const block = source.slice(code.from, code.to);
    const open = block.indexOf('\n');
    if (open < 0) return { ...state };
    const close = block.lastIndexOf('\n');
    const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.test(block.slice(close + 1));
    const body = block.slice(open + 1, closing && close > open ? close : block.length);
    const at = Math.min(Math.max(state.head - code.from - open - 1, 0), body.length);
    return collapsed(source.slice(0, code.from) + body + source.slice(code.to), code.from + at);
  }
  const { first, last } = blockLines(state);
  const next = `${source.slice(0, first)}\`\`\`\n${source.slice(first, last)}\n\`\`\`${source.slice(last)}`;
  return { ...collapsed(next, state.head + 4), anchor: state.anchor + 4 };
}

/** Move the top-level block at the cursor above or below its neighbour (Cmd-Shift-↑/↓). */
function moveBlock(state: EditState, direction: 'up' | 'down'): EditResult {
  const { source } = state;
  const fm = frontmatterRange(source);
  const blocks = computeBlockLayouts(source, fm ? fm[1] : 0, source.length) ?? [];
  const i = blocks.findIndex((b) => b.from <= state.head && state.head <= b.to);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= blocks.length) return { ...state };
  const [a, b] = i < j ? [blocks[i], blocks[j]] : [blocks[j], blocks[i]];
  const next =
    source.slice(0, a.from) +
    source.slice(b.from, b.to) +
    source.slice(a.to, b.from) +
    source.slice(a.from, a.to) +
    source.slice(b.to);
  const moved = blocks[i];
  const start = direction === 'up' ? a.from : a.from + (b.to - b.from) + (b.from - a.to);
  const shift = start - moved.from;
  return { ...collapsed(next, state.head + shift), anchor: state.anchor + shift };
}

export type { HiddenRange };
