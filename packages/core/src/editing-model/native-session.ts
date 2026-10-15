/**
 * The editing model for a native editor (macOS/iOS TextKit 2) that runs this
 * code in JavaScriptCore.
 *
 * The session keeps the source, the cursor state and the block layout on the
 * JS side, so a keystroke crosses the bridge as a few actions in and a few
 * source changes out instead of the whole document. Every method takes and
 * returns JSON strings (UTF-16 offsets, the same units as `NSString`).
 */
import { type SourceChange, sourceChanges } from './changes.ts';
import { type EditResult, type EditState, initialState } from './edit.ts';
import type { EditAction } from './fixtures.ts';
import { IncrementalLayout } from './incremental-layout.ts';
import { frontmatterLayout, type Layout } from './layout.ts';
import { applyActionsInWindow } from './window.ts';

export interface NativeRange {
  from: number;
  to: number;
}

/** A top-level block: its source range and mdast type (`heading`, `code`, `list`, …). */
export interface NativeBlock {
  from: number;
  to: number;
  type: string;
}

export interface NativeSnapshot {
  layout: Layout;
  blocks: NativeBlock[];
}

export interface NativeLayoutUpdate {
  /** The source range whose layout must be redrawn, in the new source. */
  dirty: NativeRange;
  /** Layout entries that intersect `dirty`. */
  layout: Layout;
  /** Blocks that intersect `dirty`. */
  blocks: NativeBlock[];
}

export interface NativeEditResult extends NativeLayoutUpdate {
  /**
   * Changes in the offsets of the source before the edit, ascending and
   * non-overlapping (`sourceChanges`). Apply them from last to first.
   */
  changes: SourceChange[];
  anchor: number;
  head: number;
  clipboard?: { markdown: string };
  ui?: string;
}

export interface NativeRemoteResult extends NativeLayoutUpdate {
  anchor: number;
  head: number;
}

export class NativeEditorSession {
  #layout: IncrementalLayout;
  #state: EditState;

  constructor(source: string) {
    this.#layout = new IncrementalLayout(source);
    this.#state = initialState(source, 0);
  }

  get source(): string {
    return this.#layout.source;
  }

  /** The whole document's layout and blocks, for the first paint. */
  snapshot(): string {
    const out: NativeSnapshot = {
      layout: this.#layout.layout,
      blocks: this.#layout.blocks.map(({ from, to, type }) => ({ from, to, type })),
    };
    return JSON.stringify(out);
  }

  /** A caret move or selection the editor made itself (click, arrow keys, drag). */
  select(anchor: number, head: number): void {
    const length = this.source.length;
    const a = clamp(anchor, length);
    const h = clamp(head, length);
    if (a === this.#state.anchor && h === this.#state.head) return;
    this.#state = { ...initialState(this.source, a, h) };
  }

  /** Run editing actions (`EditAction[]` as JSON) at the current selection. */
  edit(actionsJson: string): string {
    const actions = JSON.parse(actionsJson) as EditAction[];
    const before = this.source;
    const result: EditResult = applyActionsInWindow(this.#layout, this.#state, actions);
    const changes = sourceChanges(before, result.source);
    const { clipboard, ui, ...state } = result;
    this.#state = state;
    const update = this.#relayout(spanOfChanges(changes), result.source);
    const out: NativeEditResult = {
      ...update,
      changes,
      anchor: state.anchor,
      head: state.head,
      ...(clipboard ? { clipboard } : {}),
      ...(ui ? { ui } : {}),
    };
    return JSON.stringify(out);
  }

  /**
   * Apply changes made elsewhere (another device, an agent), mapping the
   * selection. Each change is in the offsets the previous one left, the order
   * a Y.Text delta arrives in.
   */
  applyRemote(changesJson: string): string {
    const changes = JSON.parse(changesJson) as SourceChange[];
    let source = this.source;
    let { anchor, head } = this.#state;
    for (const change of changes) {
      source = source.slice(0, change.from) + change.insert + source.slice(change.to);
      anchor = mapPosition(anchor, change);
      head = mapPosition(head, change);
    }
    this.#state = { ...this.#state, source, anchor, head, undo: undefined };
    const update = this.#relayout(spanOfSequence(changes), source);
    const out: NativeRemoteResult = { ...update, anchor, head };
    return JSON.stringify(out);
  }

  #relayout(span: NativeRange | null, next: string): NativeLayoutUpdate {
    if (span === null) {
      return {
        dirty: { from: 0, to: 0 },
        layout: { hidden: [], widgets: [], marks: [], spans: [] },
        blocks: [],
      };
    }
    const mode = this.#layout.update(next);
    this.#state = { ...this.#state, source: next };
    if (mode === 'full') {
      const dirty = { from: 0, to: next.length };
      return { dirty, layout: this.#layout.layout, blocks: blocksIn(this.#layout.blocks, dirty) };
    }
    const dirty = this.#blockSpan(span.from, span.to);
    const layout = layoutIn(this.#layout.blocks, dirty);
    const fm = this.#layout.frontmatter;
    if (fm && dirty.from < fm[1]) prependLayout(layout, frontmatterLayout(fm));
    return { dirty, layout, blocks: blocksIn(this.#layout.blocks, dirty) };
  }

  /** Grow `[from, to)` to whole top-level blocks plus one block on each side. */
  #blockSpan(from: number, to: number): NativeRange {
    const blocks = this.#layout.blocks;
    const length = this.source.length;
    if (blocks.length === 0) return { from: 0, to: length };
    let lo = 0;
    while (lo + 1 < blocks.length && blocks[lo + 1].from <= from) lo++;
    let hi = lo;
    while (hi + 1 < blocks.length && blocks[hi + 1].from < to) hi++;
    lo = Math.max(0, lo - 1);
    hi = Math.min(blocks.length - 1, hi + 1);
    return {
      from: lo === 0 ? 0 : blocks[lo].from,
      to: hi === blocks.length - 1 ? length : blocks[hi].to,
    };
  }
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(value)));
}

function mapPosition(position: number, change: SourceChange): number {
  if (position <= change.from) return position;
  if (position >= change.to) return position + change.insert.length - (change.to - change.from);
  return change.from + change.insert.length;
}

/** The range ascending changes in original offsets touched, in the source after them. */
function spanOfChanges(changes: readonly SourceChange[]): NativeRange | null {
  if (changes.length === 0) return null;
  let shift = 0;
  for (let i = 0; i < changes.length - 1; i++) {
    shift += changes[i].insert.length - (changes[i].to - changes[i].from);
  }
  const last = changes[changes.length - 1];
  return { from: changes[0].from, to: last.from + shift + last.insert.length };
}

/** The range sequential changes touched, in the source after all of them. */
function spanOfSequence(changes: readonly SourceChange[]): NativeRange | null {
  let span: NativeRange | null = null;
  for (const change of changes) {
    const end = change.from + change.insert.length;
    if (span) {
      span = { from: mapPosition(span.from, change), to: mapPosition(span.to, change) };
      span = { from: Math.min(span.from, change.from), to: Math.max(span.to, end) };
    } else {
      span = { from: change.from, to: end };
    }
  }
  return span;
}

function layoutIn(
  blocks: readonly { from: number; to: number; layout: Layout }[],
  range: NativeRange,
): Layout {
  const out: Layout = { hidden: [], widgets: [], marks: [], spans: [] };
  for (const block of blocks) {
    if (block.to < range.from || block.from > range.to) continue;
    out.hidden.push(...block.layout.hidden);
    out.widgets.push(...block.layout.widgets);
    out.marks.push(...block.layout.marks);
    out.spans.push(...block.layout.spans);
  }
  return out;
}

function blocksIn(
  blocks: readonly { from: number; to: number; type: string }[],
  range: NativeRange,
): NativeBlock[] {
  return blocks
    .filter((b) => b.to >= range.from && b.from <= range.to)
    .map(({ from, to, type }) => ({ from, to, type }));
}

function prependLayout(target: Layout, first: Layout): void {
  target.hidden.unshift(...first.hidden);
  target.widgets.unshift(...first.widgets);
  target.marks.unshift(...first.marks);
  target.spans.unshift(...first.spans);
}
