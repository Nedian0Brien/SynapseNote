/**
 * Keep a document's layout current by re-parsing only the blocks an edit
 * touched (the editor's 16 ms budget; a full parse of 5,000 lines takes
 * over a second).
 *
 * The cache holds each top-level block's source range and layout. For a new
 * source, the changed span is found from the common prefix and suffix; the
 * blocks it touches are re-parsed together with one unchanged guard block on
 * each side. The result is used only when each guard parses back to the same
 * type, range and layout — the edit did not reach past it — otherwise the
 * slice widens by a block on that side (bounded) and, failing that, the whole
 * body is parsed. Frontmatter changes and link reference / footnote
 * definitions (which change how `[label]` parses anywhere) also parse the
 * whole body.
 */
import type { MarkdownManager } from '../markdown/index.ts';
import {
  type BlockLayout,
  computeBlockLayouts,
  frontmatterLayout,
  frontmatterRange,
  type Layout,
  mergeLayouts,
  type Range,
} from './layout.ts';

const DEFINITION_LINE = /^ {0,3}\[\^?[^\]\n]+\]:/m;
const MAX_WIDENINGS = 4;

export interface IncrementalLayoutStats {
  incremental: number;
  full: number;
}

export class IncrementalLayout {
  #source = '';
  #frontmatter: Range | null = null;
  #blocks: BlockLayout[] = [];
  #merged: Layout | null = null;
  readonly stats: IncrementalLayoutStats = { incremental: 0, full: 0 };

  constructor(
    source: string,
    private readonly markdown?: MarkdownManager,
  ) {
    this.#full(source);
  }

  get source(): string {
    return this.#source;
  }

  /** Top-level blocks after the frontmatter, in document order. */
  get blocks(): readonly BlockLayout[] {
    return this.#blocks;
  }

  get frontmatter(): Range | null {
    return this.#frontmatter;
  }

  /** The whole document's layout (built lazily; prefer `blocks` for ranges). */
  get layout(): Layout {
    this.#merged ??= mergeLayouts([
      ...(this.#frontmatter ? [frontmatterLayout(this.#frontmatter)] : []),
      ...this.#blocks.map((b) => b.layout),
    ]);
    return this.#merged;
  }

  update(next: string): 'unchanged' | 'incremental' | 'full' {
    if (next === this.#source) return 'unchanged';
    const result = this.#incremental(next);
    if (result) {
      this.stats.incremental++;
      return 'incremental';
    }
    this.#full(next);
    return 'full';
  }

  #full(source: string): void {
    this.stats.full++;
    this.#source = source;
    this.#frontmatter = frontmatterRange(source);
    this.#blocks =
      computeBlockLayouts(
        source,
        this.#frontmatter ? this.#frontmatter[1] : 0,
        source.length,
        this.markdown,
      ) ?? [];
    this.#merged = null;
  }

  #incremental(next: string): boolean {
    const old = this.#source;
    const fm = frontmatterRange(next);
    const oldFm = this.#frontmatter;
    if (
      (fm === null) !== (oldFm === null) ||
      (fm && oldFm && next.slice(0, fm[1]) !== old.slice(0, oldFm[1]))
    ) {
      return false;
    }
    const bodyStart = fm ? fm[1] : 0;
    const blocks = this.#blocks;
    if (blocks.length === 0) return false;

    let prefix = 0;
    const max = Math.min(old.length, next.length);
    while (prefix < max && old.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++;
    let suffix = 0;
    while (
      suffix < max - prefix &&
      old.charCodeAt(old.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
    ) {
      suffix++;
    }
    const oldEnd = old.length - suffix;
    const newEnd = next.length - suffix;
    const delta = newEnd - oldEnd;
    if (prefix < bodyStart) return false;
    if (
      DEFINITION_LINE.test(old.slice(lineStart(old, prefix), lineEnd(old, oldEnd))) ||
      DEFINITION_LINE.test(next.slice(lineStart(next, prefix), lineEnd(next, newEnd)))
    ) {
      return false;
    }
    if (
      DEFINITION_LINE.test(old) &&
      (old.slice(prefix, oldEnd) + next.slice(prefix, newEnd)).includes('[')
    ) {
      return false;
    }

    // Blocks the change touches, plus one guard on each side.
    let lo = 0;
    while (lo + 1 < blocks.length && blocks[lo + 1].from <= prefix) lo++;
    let hi = blocks.length - 1;
    while (hi > 0 && blocks[hi - 1].to >= oldEnd) hi--;
    if (hi < lo) hi = lo;
    lo = Math.max(0, lo - 1);
    hi = Math.min(blocks.length - 1, hi + 1);

    for (let attempt = 0; attempt <= MAX_WIDENINGS; attempt++) {
      const sliceStart = lo === 0 ? bodyStart : blocks[lo].from;
      const oldSliceEnd = hi === blocks.length - 1 ? old.length : blocks[hi].to;
      if (sliceStart > prefix || oldSliceEnd < oldEnd) return false;
      const parsed = computeBlockLayouts(next, sliceStart, oldSliceEnd + delta, this.markdown);
      if (parsed === null || parsed.length === 0) return false;
      const leadingOk = lo === 0 || sameBlock(parsed[0], blocks[lo], 0);
      const trailingOk =
        hi === blocks.length - 1 || sameBlock(parsed[parsed.length - 1], blocks[hi], delta);
      if (leadingOk && trailingOk) {
        this.#blocks = [
          ...blocks.slice(0, lo),
          ...parsed,
          ...blocks.slice(hi + 1).map((b) => shiftBlock(b, delta)),
        ];
        this.#source = next;
        this.#frontmatter = fm;
        this.#merged = null;
        return true;
      }
      if (!leadingOk) {
        if (lo === 0) return false;
        lo--;
      }
      if (!trailingOk) {
        if (hi === blocks.length - 1) return false;
        hi++;
      }
    }
    return false;
  }
}

function lineStart(text: string, at: number): number {
  return text.lastIndexOf('\n', at - 1) + 1;
}

function lineEnd(text: string, at: number): number {
  const end = text.indexOf('\n', at);
  return end < 0 ? text.length : end;
}

function sameBlock(parsed: BlockLayout, cached: BlockLayout, delta: number): boolean {
  if (
    parsed.type !== cached.type ||
    parsed.from !== cached.from + delta ||
    parsed.to !== cached.to + delta
  ) {
    return false;
  }
  return layoutKey(parsed.layout) === layoutKey(shiftLayout(cached.layout, delta));
}

/** Order-independent of object keys: compares values only. */
function layoutKey(layout: Layout): string {
  return JSON.stringify([
    layout.hidden.map((h) => [h.from, h.to, h.kind]),
    layout.widgets.map((w) => [w.from, w.to, w.kind, w.node, w.label ?? null]),
    layout.marks.map((m) => [m.type, m.open, m.close, m.inclusive]),
    layout.spans.map((s) => [s.from, s.to, s.node]),
  ]);
}

function shiftBlock(block: BlockLayout, delta: number): BlockLayout {
  if (delta === 0) return block;
  return {
    ...block,
    from: block.from + delta,
    to: block.to + delta,
    layout: shiftLayout(block.layout, delta),
  };
}

function shiftLayout(layout: Layout, delta: number): Layout {
  if (delta === 0) return layout;
  const r = <T extends { from: number; to: number }>(x: T): T => ({
    ...x,
    from: x.from + delta,
    to: x.to + delta,
  });
  const pair = (x: Range): Range => [x[0] + delta, x[1] + delta];
  return {
    hidden: layout.hidden.map(r),
    widgets: layout.widgets.map(r),
    spans: layout.spans.map(r),
    marks: layout.marks.map((m) => ({ ...m, open: pair(m.open), close: pair(m.close) })),
  };
}
