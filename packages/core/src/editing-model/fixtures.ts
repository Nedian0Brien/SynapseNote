/**
 * Conformance fixtures for the editing model (see SPEC.md §10).
 *
 * Both the web editor (CodeMirror) and the native editor run these cases.
 * `hide.json` pins what the screen shows for a source; `edit.json` pins the
 * source a user action produces.
 */
import editCases from './fixtures/edit.json';
import hideCases from './fixtures/hide.json';

export interface HideFixture {
  id: string;
  group: string;
  rule: string;
  /** Source with hidden ranges as `⟨…⟩` and widget ranges as `⦃…⦄`. */
  marked: string;
}

/** Block types the block shortcuts set or toggle (SPEC.md §7). */
export type BlockKind =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'code';

export type EditAction =
  | { type: 'text'; text: string }
  | {
      type: 'key';
      key:
        | 'Backspace'
        | 'Delete'
        | 'Enter'
        | 'Shift-Enter'
        | 'Tab'
        | 'Shift-Tab'
        | 'ArrowRight'
        | 'ArrowLeft';
    }
  | { type: 'toggle'; mark: 'bold' | 'italic' | 'code' | 'strike' | 'highlight' }
  | { type: 'block'; block: BlockKind }
  | { type: 'move'; direction: 'up' | 'down' }
  | { type: 'paste'; text?: string; html?: string; as?: 'markdown' }
  | { type: 'copy' };

export interface EditFixture {
  id: string;
  group: string;
  rule: string;
  /** Source with the cursor as `│` or a selection as `⟪…⟫`. */
  before: string;
  actions: EditAction[];
  after?: string;
  clipboard?: { markdown: string };
  ui?: string;
}

export const hideFixtures = hideCases as HideFixture[];
export const editFixtures = editCases as EditFixture[];

export interface MarkedSource {
  source: string;
  /** Hidden source ranges `[from, to)`. */
  hidden: [number, number][];
  /** Widget source ranges `[from, to)`. */
  widgets: [number, number][];
  /** What the screen shows: hidden ranges removed, each widget as `￼`. */
  visible: string;
}

/** Split a `hide.json` `marked` string into source, ranges and visible text. */
export function parseMarked(marked: string): MarkedSource {
  let source = '';
  let visible = '';
  const hidden: [number, number][] = [];
  const widgets: [number, number][] = [];
  let open: { kind: 'hidden' | 'widget'; from: number } | null = null;
  for (const ch of marked) {
    if (ch === '⟨' || ch === '⦃') {
      if (open) throw new Error(`nested range marker in ${JSON.stringify(marked)}`);
      open = { kind: ch === '⟨' ? 'hidden' : 'widget', from: source.length };
      if (ch === '⦃') visible += '￼';
    } else if (ch === '⟩' || ch === '⦄') {
      const kind = ch === '⟩' ? 'hidden' : 'widget';
      if (!open || open.kind !== kind)
        throw new Error(`unbalanced range marker in ${JSON.stringify(marked)}`);
      (kind === 'hidden' ? hidden : widgets).push([open.from, source.length]);
      open = null;
    } else {
      source += ch;
      if (!open) visible += ch;
    }
  }
  if (open) throw new Error(`unclosed range marker in ${JSON.stringify(marked)}`);
  return { source, hidden, widgets, visible };
}

export interface CursorSource {
  source: string;
  /** Selection anchor and head as source offsets (equal for a cursor). */
  anchor: number;
  head: number;
}

/** Split an `edit.json` `before`/`after` string into source and selection. */
export function parseCursor(text: string): CursorSource {
  const cursors = [...text].filter((c) => c === '│').length;
  const opens = [...text].filter((c) => c === '⟪').length;
  const closes = [...text].filter((c) => c === '⟫').length;
  if (cursors + opens !== 1 || opens !== closes) {
    throw new Error(`expected one │ or one ⟪…⟫ in ${JSON.stringify(text)}`);
  }
  if (cursors === 1) {
    const at = text.indexOf('│');
    return { source: text.slice(0, at) + text.slice(at + 1), anchor: at, head: at };
  }
  const from = text.indexOf('⟪');
  const to = text.indexOf('⟫') - 1;
  if (to < from) throw new Error(`⟫ before ⟪ in ${JSON.stringify(text)}`);
  return { source: text.replace('⟪', '').replace('⟫', ''), anchor: from, head: to };
}
