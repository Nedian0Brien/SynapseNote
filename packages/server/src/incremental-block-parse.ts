/**
 * Re-parse only the blocks an edit touched, and reuse the ProseMirror nodes of
 * every other top-level block.
 *
 * Observer B turns `Y.Text('source')` into the fragment by parsing the whole
 * body on every drain — about 1.4 s on a 5,000-line document, which blocks the
 * event loop for every keystroke. Parsing a few blocks costs about 1 ms.
 *
 * The cache holds, for the last parsed body, each top-level block's source
 * range and PM node. After promoters, top-level mdast children and top-level
 * PM nodes correspond 1:1; a document where they do not is never parsed
 * incrementally. For a new body, the changed span is found from the common
 * prefix and suffix, and the blocks it touches are re-parsed together with
 * one unchanged guard block on each side. The result is used only when:
 *
 *  - the re-parsed slice still has one PM node per mdast block, and
 *  - each guard block parses to the same JSON and the same source length as
 *    before — the edit did not reach past it. Block extents are decided
 *    left to right from the text up to and including the following line, so
 *    an unchanged guard means the text outside the slice parses as before.
 *    When a guard changed, the slice widens by one block on that side and
 *    tries again (bounded), and
 *  - no construct with document-wide reach is involved: link reference and
 *    footnote definitions change how `[label]` parses anywhere.
 *
 * MDX component nodes keep document-absolute mdast positions in their attrs,
 * so a full parse gives every component after an edit new offsets and line
 * numbers. The parser does the same: cached blocks after the edit have their
 * positions moved by the edit's length and newline count, and blocks parsed
 * from a slice have slice-relative positions moved to document positions.
 *
 * The one document-level attribute, `sourceDocBoundary` (leading/trailing
 * blank lines and the blank-line count of each wide gap between top-level
 * blocks), is rebuilt from the new block ranges with the same core function
 * the parser uses. Documents that start with a BOM are not parsed
 * incrementally: the parser strips it, so block offsets would be off by one.
 *
 * Anything else returns `null`, and the caller parses the whole body and
 * resets the cache with `parseFull`.
 */
import { computeDocBoundary } from '@nedian0brien/synapsenote-core';
import type { JSONContent } from '@tiptap/core';
import { Fragment, type Node as PmNode, type Schema } from '@tiptap/pm/model';
import type { Root } from 'mdast';

interface CachedBlock {
  /** Source range in the body, from the mdast position (end exclusive). */
  start: number;
  end: number;
  json: JSONContent;
  node: PmNode;
  /** The JSON carries mdast source positions (MDX components keep them in attrs). */
  positioned: boolean;
}

/** Maps a 1-based mdast position point to where it now lies. */
type PointShift = (point: { line: number; column: number; offset: number }) => {
  line: number;
  column: number;
  offset: number;
};

export interface IncrementalBlockParserDeps {
  /** Same parse the full path uses (e.g. `parseWithFallback` with the observer's options). */
  parse: (markdown: string) => JSONContent;
  /** Block positions; may throw on input the full parser only handles by fallback. */
  parseMdast: (markdown: string) => Root;
  schema: Schema;
  /** How many times a slice may widen past a changed guard. */
  maxWidenings?: number;
  /** Told why an update fell back to a full parse (telemetry, tuning). */
  onFallback?: (reason: IncrementalFallbackReason) => void;
}

export type IncrementalFallbackReason =
  | 'no-cache'
  | 'definition'
  | 'bounds'
  | 'doc-attrs'
  | 'parse-error'
  | 'correspondence'
  | 'guard';

export interface IncrementalParseStats {
  incremental: number;
  full: number;
}

// `[label]: …` and `[^label]: …` at the start of a line (up to 3 spaces).
const DEFINITION_LINE = /^ {0,3}\[\^?[^\]\n]+\]:/m;

export class IncrementalBlockParser {
  readonly #deps: Required<IncrementalBlockParserDeps>;
  #body: string | null = null;
  #blocks: CachedBlock[] | null = null;
  #docAttrs: Record<string, unknown> | undefined;
  #hasDefinitions = false;
  readonly stats: IncrementalParseStats = { incremental: 0, full: 0 };

  constructor(deps: IncrementalBlockParserDeps) {
    this.#deps = { maxWidenings: 4, onFallback: () => {}, ...deps };
  }

  /** Forget the cache (e.g. the fragment was rebuilt some other way). */
  reset(): void {
    this.#body = null;
    this.#blocks = null;
  }

  /** Parse the whole body and cache its blocks. */
  parseFull(body: string): PmNode {
    this.stats.full++;
    const json = this.#deps.parse(body);
    const doc = this.#deps.schema.nodeFromJSON(json);
    this.#body = body;
    this.#docAttrs = json.attrs;
    this.#blocks = body.charCodeAt(0) === 0xfeff ? null : this.#blocksFor(body, json, doc, 0);
    this.#hasDefinitions = DEFINITION_LINE.test(body);
    return doc;
  }

  /**
   * Parse `body` by re-using unchanged blocks from the previous parse.
   * Returns `null` when that is not provably equivalent to a full parse.
   */
  update(body: string): PmNode | null {
    const result = this.#update(body);
    if (typeof result === 'string') {
      this.#deps.onFallback(result);
      return null;
    }
    return result;
  }

  #update(body: string): PmNode | IncrementalFallbackReason {
    const old = this.#body;
    const blocks = this.#blocks;
    if (old === null || blocks === null || blocks.length === 0) return 'no-cache';
    if (old === body) return this.#assemble(blocks);

    let prefix = 0;
    const minLength = Math.min(old.length, body.length);
    while (prefix < minLength && old.charCodeAt(prefix) === body.charCodeAt(prefix)) prefix++;
    let suffix = 0;
    while (
      suffix < minLength - prefix &&
      old.charCodeAt(old.length - 1 - suffix) === body.charCodeAt(body.length - 1 - suffix)
    ) {
      suffix++;
    }
    const oldEnd = old.length - suffix;
    const newEnd = body.length - suffix;
    const delta = body.length - old.length;
    const lineDelta = countNewlines(body, prefix, newEnd) - countNewlines(old, prefix, oldEnd);
    const shiftAfterEdit: PointShift = (p) => ({
      line: p.line + lineDelta,
      column: p.column,
      offset: p.offset + delta,
    });
    const moved = (b: CachedBlock): CachedBlock => {
      const start = b.start + delta;
      const end = b.end + delta;
      if (!b.positioned) return { ...b, start, end };
      const json = shiftPositions(b.json, shiftAfterEdit) as JSONContent;
      return { start, end, json, node: this.#deps.schema.nodeFromJSON(json), positioned: true };
    };

    // Whole lines around the change, before and after.
    const lineStart = old.lastIndexOf('\n', prefix - 1) + 1;
    const oldLines = old.slice(lineStart, lineEndAt(old, oldEnd));
    const newLines = body.slice(lineStart, lineEndAt(body, newEnd));
    if (DEFINITION_LINE.test(oldLines) || DEFINITION_LINE.test(newLines)) return 'definition';
    if (this.#hasDefinitions && (oldLines.includes('[') || newLines.includes('[')))
      return 'definition';

    const n = blocks.length;
    let first = blocks.findIndex((b) => b.end >= prefix);
    if (first < 0) first = n - 1;
    let last = -1;
    for (let k = n - 1; k >= 0; k--) {
      if (blocks[k].start <= oldEnd) {
        last = k;
        break;
      }
    }
    if (last < 0) last = 0;
    let lo = Math.max(0, Math.min(first, last) - 1);
    let hi = Math.min(n - 1, Math.max(first, last) + 1);

    for (let attempt = 0; attempt <= this.#deps.maxWidenings; attempt++) {
      const sliceStart = lo === 0 ? 0 : blocks[lo].start;
      const oldSliceEnd = hi === n - 1 ? old.length : blocks[hi + 1].start;
      if (oldSliceEnd < oldEnd || sliceStart > prefix) return 'bounds';
      const newSliceEnd = oldSliceEnd + delta;
      const slice = body.slice(sliceStart, newSliceEnd);

      // Slice-relative mdast positions → document positions.
      const linesBefore = countNewlines(body, 0, sliceStart);
      const startColumn = sliceStart - (body.lastIndexOf('\n', sliceStart - 1) + 1);
      const toDocument: PointShift = (p) => ({
        line: p.line + linesBefore,
        column: p.line === 1 ? p.column + startColumn : p.column,
        offset: p.offset + sliceStart,
      });

      let json: JSONContent;
      let parsed: CachedBlock[] | null;
      try {
        json = this.#deps.parse(slice);
        if (!sameAttrs(withoutBoundary(json.attrs), withoutBoundary(this.#docAttrs)))
          return 'doc-attrs';
        parsed = this.#blocksFor(
          slice,
          json,
          this.#deps.schema.nodeFromJSON(json),
          sliceStart,
          toDocument,
        );
      } catch {
        return 'parse-error';
      }
      if (parsed === null || parsed.length === 0) return 'correspondence';

      const leadingOk = lo === 0 || sameBlock(parsed[0], blocks[lo]);
      const trailingOk = hi === n - 1 || sameBlock(parsed[parsed.length - 1], moved(blocks[hi]));
      if (leadingOk && trailingOk) {
        const next = [...blocks.slice(0, lo), ...parsed, ...blocks.slice(hi + 1).map(moved)];
        this.#body = body;
        this.#blocks = next;
        this.#docAttrs = {
          ...this.#docAttrs,
          sourceDocBoundary: computeDocBoundary(next, body, false) ?? null,
        };
        this.stats.incremental++;
        return this.#assemble(next);
      }
      if (!leadingOk) {
        if (lo === 0) return 'guard';
        lo--;
      }
      if (!trailingOk) {
        if (hi === n - 1) return 'guard';
        hi++;
      }
    }
    return 'guard';
  }

  #assemble(blocks: CachedBlock[]): PmNode {
    return this.#deps.schema.topNodeType.create(
      this.#docAttrs ?? null,
      Fragment.fromArray(blocks.map((b) => b.node)),
    );
  }

  /**
   * Pair mdast block positions with PM nodes, or `null` when they do not
   * correspond 1:1. With `shift`, positions inside the JSON are moved from
   * slice-relative to document-relative and those blocks get fresh nodes.
   */
  #blocksFor(
    markdown: string,
    json: JSONContent,
    doc: PmNode,
    offset: number,
    shift?: PointShift,
  ): CachedBlock[] | null {
    let mdast: Root;
    try {
      mdast = this.#deps.parseMdast(markdown);
    } catch {
      return null;
    }
    const content = json.content ?? [];
    if (mdast.children.length !== content.length || doc.childCount !== content.length) return null;
    const blocks: CachedBlock[] = [];
    for (let i = 0; i < content.length; i++) {
      const position = mdast.children[i].position;
      const start = position?.start.offset;
      const end = position?.end.offset;
      if (start === undefined || end === undefined) return null;
      const positioned = JSON.stringify(content[i]).includes('"position":');
      if (shift && positioned) {
        const moved = shiftPositions(content[i], shift) as JSONContent;
        blocks.push({
          start: start + offset,
          end: end + offset,
          json: moved,
          node: this.#deps.schema.nodeFromJSON(moved),
          positioned,
        });
      } else {
        blocks.push({
          start: start + offset,
          end: end + offset,
          json: content[i],
          node: doc.child(i),
          positioned,
        });
      }
    }
    return blocks;
  }
}

function countNewlines(text: string, from: number, to: number): number {
  let count = 0;
  for (let i = text.indexOf('\n', from); i >= 0 && i < to; i = text.indexOf('\n', i + 1)) count++;
  return count;
}

function isPoint(value: unknown): value is { line: number; column: number; offset: number } {
  const p = value as { line?: unknown; column?: unknown; offset?: unknown } | null;
  return (
    !!p &&
    typeof p.line === 'number' &&
    typeof p.column === 'number' &&
    typeof p.offset === 'number'
  );
}

/** Copy `value`, rewriting every mdast `position` ({start, end} points) with `shift`. */
function shiftPositions(value: unknown, shift: PointShift): unknown {
  if (Array.isArray(value)) return value.map((item) => shiftPositions(item, shift));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const pos = item as { start?: unknown; end?: unknown } | null;
    if (key === 'position' && pos && isPoint(pos.start) && isPoint(pos.end)) {
      out[key] = { ...pos, start: shift(pos.start), end: shift(pos.end) };
    } else {
      out[key] = shiftPositions(item, shift);
    }
  }
  return out;
}

function lineEndAt(text: string, index: number): number {
  const end = text.indexOf('\n', index);
  return end < 0 ? text.length : end;
}

function sameBlock(a: CachedBlock, b: CachedBlock): boolean {
  return a.end - a.start === b.end - b.start && deepEqual(a.json, b.json);
}

/** Doc attrs other than the whitespace record, which is rebuilt, not compared. */
function withoutBoundary(attrs: Record<string, unknown> | undefined): Record<string, unknown> {
  const { sourceDocBoundary: _boundary, ...rest } = attrs ?? {};
  return rest;
}

function sameAttrs(a: unknown, b: unknown): boolean {
  return deepEqual(a ?? null, b ?? null);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a as object).filter(
    (k) => (a as Record<string, unknown>)[k] !== undefined,
  );
  const bk = Object.keys(b as object).filter(
    (k) => (b as Record<string, unknown>)[k] !== undefined,
  );
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false;
  }
  return true;
}
