/**
 * Turn editor actions into source edits (SPEC.md §4–§8).
 *
 * Everything works on the source string. The screen is the source minus
 * hidden ranges, with each widget as one unit; a cursor sits between two
 * units, and when hidden syntax lies between them the rules in §4 decide
 * which source offset an edit lands on.
 */
import { htmlToMdast, mdastToMarkdown } from '../markdown/html-to-mdast.ts';
import type { EditAction } from './fixtures.ts';
import {
  computeLayout,
  type HiddenRange,
  type Layout,
  type MarkSpan,
  type MarkType,
} from './layout.ts';

export type ToggleMark = 'bold' | 'italic' | 'code' | 'strike' | 'highlight';

export interface EditState {
  source: string;
  anchor: number;
  head: number;
  /** `outside`: at a mark boundary, the next input goes outside every mark ending here. */
  side: 'default' | 'outside';
  /** Marks toggled on with an empty selection; the next typed text gets them. */
  pending: ToggleMark[];
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
/** A line holding only a block marker being typed (§5: not judged for escaping yet). */
const PARTIAL_BLOCK_MARKER =
  /^\s*(?:#{1,6}|[-*+]|\d+[.)]?|>|[-*+] \[[ xX]?\]?|-{2,}|\*{2,}|_{2,}|`+|~{2,}|\${1,2})$/;
/** A block marker completed by a space (§5 trigger). */
const BLOCK_MARKER = /^\s*(?:#{1,6}|[-*+]|\d+[.)]|>|[-*+] \[[ xX]\])$/;
const LIST_ITEM = /^(\s*)([-*+]|(\d+)([.)]))( \[[ xX]\])? /;
const FENCE_LINE = /^\s*(`{3,}|~{3,}|\$\$)[\w-]*\s*$/;

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
  switch (action.type) {
    case 'text':
      return typeText(state, action.text);
    case 'key':
      return pressKey(state, action.key);
    case 'toggle':
      return toggleMark(state, action.mark);
    case 'paste':
      if (action.html !== undefined) {
        const markdown = mdastToMarkdown(htmlToMdast(action.html)).replace(/\n+$/, '');
        return insertLiteral(state, markdown);
      }
      if (action.as === 'markdown') return insertLiteral(state, action.text ?? '');
      return insertLiteral(state, escapePlainText(action.text ?? ''));
    case 'copy': {
      const [from, to] = ordered(state);
      return { ...state, clipboard: { markdown: state.source.slice(from, to) } };
    }
  }
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

function screen(source: string, layout = computeLayout(source)): Screen {
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
  return { ...state, source, anchor: state.anchor - shift, head: state.head - shift };
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

  const source = base.source.slice(0, at) + ch + base.source.slice(at);
  const after = computeLayout(source);
  if (keepsLayout(s.layout, after, at, 0)) return collapsed(source, at + ch.length);
  // The interpretation changed beyond the typed character.
  if (closesMarkAt(after, s.layout, at, at + ch.length)) {
    return collapsed(source, at + ch.length, 'outside');
  }
  const line = lineAround(source, at);
  const lineBefore = source.slice(line.start, at + ch.length);
  const lineAfter = source.slice(at + ch.length, line.end);
  if (ch === ' ' && BLOCK_MARKER.test(source.slice(line.start, at))) {
    return collapsed(source, at + ch.length);
  }
  if (!lineAfter.trim() && PARTIAL_BLOCK_MARKER.test(lineBefore)) {
    return collapsed(source, at + ch.length);
  }
  // Keep the character literal (§5): try spellings and, failing those, the
  // other side of the syntax at the same screen position. Code spans and wiki
  // link targets decode neither escapes nor character references.
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
    if (keepsLayout(s.layout, computeLayout(tried), offset, text.length - ch.length, text.length)) {
      return collapsed(tried, offset + text.length);
    }
  }
  return collapsed(source, at + ch.length);
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
function closesMarkAt(after: Layout, before: Layout, at: number, end: number): boolean {
  const inside = new Set(
    before.marks.filter((m) => m.open[1] <= at && at <= m.close[0]).map((m) => m.type),
  );
  return after.marks.some(
    (m) =>
      m.close[1] === end &&
      !inside.has(m.type) &&
      !before.marks.some(
        (b) =>
          b.type === m.type && b.open[0] === m.open[0] && b.close[0] === m.close[0] - (end - at),
      ),
  );
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
      return indentListItem(state, 1);
    case 'Shift-Tab':
      return indentListItem(state, -1);
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
  if (prefix) return removeRange(state.source, prefix.from, prefix.to);
  if (k === 0) return { ...state };
  const previous = s.units[k - 1];
  if (previous.widget === 'list-marker') {
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
  return deleteUnit(state.source, s, s.units[k]);
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

  if (at === line.end && FENCE_LINE.test(text)) {
    const fence = /(`{3,}|~{3,}|\$\$)/.exec(text)?.[1] ?? '```';
    return collapsed(`${source.slice(0, at)}\n\n${fence}${source.slice(at)}`, at + 1);
  }
  const item = LIST_ITEM.exec(text);
  if (item) {
    const content = text.slice(item[0].length);
    if (!content.trim()) {
      // Enter on an empty item ends the list.
      return collapsed(`${source.slice(0, line.start)}\n${source.slice(line.end)}`, line.start + 1);
    }
    const [, indent, bullet, number, delimiter, task] = item;
    const marker = number ? `${Number(number) + 1}${delimiter}` : bullet;
    const insert = `\n${indent}${marker}${task ? ' [ ]' : ''} `;
    return collapsed(source.slice(0, at) + insert + source.slice(at), at + insert.length);
  }
  return collapsed(`${source.slice(0, at)}\n\n${source.slice(at)}`, at + 2);
}

function indentListItem(state: EditState, direction: 1 | -1): EditResult {
  const at = state.head;
  const line = lineAround(state.source, at);
  const text = state.source.slice(line.start, line.end);
  if (!LIST_ITEM.test(text)) return { ...state };
  if (direction > 0) {
    const source = `${state.source.slice(0, line.start)}  ${state.source.slice(line.start)}`;
    return collapsed(source, at + 2);
  }
  const remove = Math.min(2, /^ */.exec(text)?.[0].length ?? 0);
  if (!remove) return { ...state };
  const source = state.source.slice(0, line.start) + state.source.slice(line.start + remove);
  return collapsed(source, at - remove);
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

export type { HiddenRange };
