/**
 * Run editing actions on the few blocks around the cursor instead of the whole
 * document: every action parses its input, and a 5,000-line document takes
 * over a second to parse.
 *
 * The window is the blocks the selection touches plus one block on each side,
 * so joining with the previous block and Enter at a block's end stay inside
 * it. Block-level parsing is local except for link reference and footnote
 * definitions, which change how `[label]` parses anywhere; a document with
 * any definition is edited whole.
 */
import { applyActions, type EditResult, type EditState } from './edit.ts';
import type { EditAction } from './fixtures.ts';
import type { IncrementalLayout } from './incremental-layout.ts';

const DEFINITION_LINE = /^ {0,3}\[\^?[^\]\n]+\]:/m;

export interface WindowRange {
  from: number;
  to: number;
}

/** The source range the window editing `state` works on. */
export function editWindow(layout: IncrementalLayout, state: EditState): WindowRange {
  const source = layout.source;
  const blocks = layout.blocks;
  const bodyStart = layout.frontmatter ? layout.frontmatter[1] : 0;
  if (blocks.length === 0 || DEFINITION_LINE.test(source)) return { from: 0, to: source.length };
  const from = Math.min(state.anchor, state.head);
  const to = Math.max(state.anchor, state.head);
  let lo = 0;
  while (lo + 1 < blocks.length && blocks[lo + 1].from <= from) lo++;
  let hi = blocks.length - 1;
  while (hi > 0 && blocks[hi - 1].to >= to) hi--;
  if (hi < lo) hi = lo;
  lo = Math.max(0, lo - 1);
  hi = Math.min(blocks.length - 1, hi + 1);
  return {
    from: lo === 0 ? bodyStart : blocks[lo].from,
    to: hi === blocks.length - 1 ? source.length : blocks[hi].to,
  };
}

export function applyActionsInWindow(
  layout: IncrementalLayout,
  state: EditState,
  actions: readonly EditAction[],
): EditResult {
  const source = layout.source;
  const window = editWindow(layout, state);
  if (state.anchor < window.from || state.head < window.from) {
    return applyActions(state, actions);
  }
  const inner = applyActions(
    {
      ...state,
      source: source.slice(window.from, window.to),
      anchor: state.anchor - window.from,
      head: state.head - window.from,
    },
    actions,
  );
  return {
    ...inner,
    source: source.slice(0, window.from) + inner.source + source.slice(window.to),
    anchor: inner.anchor + window.from,
    head: inner.head + window.from,
  };
}
