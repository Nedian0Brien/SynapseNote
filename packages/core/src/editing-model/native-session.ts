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

export interface NativeLayoutUpdate {
  /** The source range whose layout must be redrawn, in the new source. */
  dirty: NativeRange;
  /** Layout entries that intersect `dirty`. */
  layout: Layout;
}

export interface NativeEditResult extends NativeLayoutUpdate {
  /** Changes to apply in order, each in the offsets left by the previous one. */
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

  /** The whole document's layout, for the first paint. */
  snapshot(): string {
    return JSON.stringify(this.#layout.layout);
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
    const update = this.#relayout(changes, result.source);
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

  /** Apply changes made elsewhere (another device, an agent), mapping the selection. */
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
    const update = this.#relayout(changes, source);
    const out: NativeRemoteResult = { ...update, anchor, head };
    return JSON.stringify(out);
  }

  #relayout(changes: readonly SourceChange[], next: string): NativeLayoutUpdate {
    if (changes.length === 0) {
      return { dirty: { from: 0, to: 0 }, layout: { hidden: [], widgets: [], marks: [], spans: [] } };
    }
    const mode = this.#layout.update(next);
    this.#state = { ...this.#state, source: next };
    if (mode === 'full') {
      return { dirty: { from: 0, to: next.length }, layout: this.#layout.layout };
    }
    const span = changedSpan(changes);
    const dirty = this.#blockSpan(span.from, span.to);
    const layout = layoutIn(this.#layout.blocks, dirty);
    const fm = this.#layout.frontmatter;
    if (fm && dirty.from < fm[1]) prependLayout(layout, frontmatterLayout(fm));
    return { dirty, layout };
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

/** The range the changes touched, in the source after all of them. */
function changedSpan(changes: readonly SourceChange[]): NativeRange {
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
  return span ?? { from: 0, to: 0 };
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

function prependLayout(target: Layout, first: Layout): void {
  target.hidden.unshift(...first.hidden);
  target.widgets.unshift(...first.widgets);
  target.marks.unshift(...first.marks);
  target.spans.unshift(...first.spans);
}
