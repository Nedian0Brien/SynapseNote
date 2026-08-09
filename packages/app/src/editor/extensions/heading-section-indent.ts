/**
 * HeadingSectionIndent — Tab / Shift-Tab indents a heading together with the
 * section it owns.
 *
 * `ParagraphIndentShortcuts` handles body prose by writing a literal tab into
 * the paragraph text. A heading cannot use that carrier: the `#` marker comes
 * first, and CommonMark strips the whitespace run between the marker and the
 * content, so `## \tTitle` re-parses as `## Title` and the indent is gone. A
 * tab BEFORE the marker is worse — four columns of leading whitespace turns
 * the whole line into an indented code block.
 *
 * Storage
 * -------
 * The one form that survives the round-trip is the ATX leading indent that
 * `heading-fidelity.ts` already models: 1-3 spaces before the `#` run
 * (CommonMark §4.2), captured on parse as `sourceLeadingIndent` and re-emitted
 * verbatim. So Tab moves that attribute 0 → 1 → 2 → 3 and Shift-Tab walks it
 * back. Three levels is the ceiling the file format allows — a 4th space would
 * re-parse as a code block, and the serializer drops the attr rather than emit
 * it. Deeper nesting is still reachable through sub-headings, which stack
 * their own indent on top of the inherited one.
 *
 * Propagation to the section
 * --------------------------
 * Indenting a heading moves everything under it — the blocks up to the next
 * heading of the same or higher rank. Those children do NOT each store an
 * indent: paragraphs could (a leading tab), but lists, tables, blockquotes and
 * thematic breaks have no round-trip carrier at all — a list's leading spaces
 * are canonicalized away by the serializer (`list-indent-canonical` in
 * `bridge/normalize.ts`). Writing per-child indents would therefore look right
 * until the next reload and then silently collapse for half the block types.
 *
 * Instead the heading's attribute is the single stored value and every block
 * in its section INHERITS it for rendering, via the node decoration below.
 * Re-parsing the file recomputes the same layout from the same one attribute,
 * so nothing can drift, and block types with no carrier of their own move with
 * the section like everything else. A paragraph's own Tab indent composes on
 * top of the section indent rather than replacing it.
 *
 * Priority 10 matches `ParagraphIndentShortcuts` — below every context-aware
 * Tab handler (`ListItem` 100, `Table` / `CodeBlockFidelity` 60, the
 * suggestion plugins) and above `TabFocusTrap` (1), which still consumes the
 * keystroke for the positions both prose handlers decline.
 */

import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** Matches the `--ok-indent-step` fallback and the prose transition timing. */
const INDENT_ANIMATION_MS = 180;
const INDENT_ANIMATION_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)';
const INDENT_STEP_FALLBACK_PX = 24;

/** CommonMark §4.2 allows at most 3 spaces before the `#` run. */
export const HEADING_INDENT_MAX = 3;

/** Class consumed by `.ProseMirror .ok-section-indent` in `prose-base.css`. */
export const OK_SECTION_INDENT_CLASS = 'ok-section-indent';

export const headingSectionIndentKey = new PluginKey('headingSectionIndent');

/** A heading's own stored indent, clamped to what the file format can hold. */
function ownIndent(node: PmNode): number {
  const raw = node.attrs.sourceLeadingIndent;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.trunc(raw), 0), HEADING_INDENT_MAX);
}

/**
 * Effective indent level of every top-level block, in document order.
 *
 * A heading's level is its own stored indent plus the indent it inherits from
 * the nearest enclosing (lower-rank) heading; every non-heading block carries
 * the level of the heading whose section it sits in. Blocks before the first
 * heading are at zero.
 */
export function sectionIndentLevels(doc: PmNode): number[] {
  const levels: number[] = [];
  // Enclosing headings, outermost first — each entry is its rank plus the
  // effective indent its section imposes.
  const enclosing: Array<{ rank: number; indent: number }> = [];
  let sectionIndent = 0;

  doc.forEach((node) => {
    if (node.type.name !== 'heading') {
      levels.push(sectionIndent);
      return;
    }
    const rank = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
    while (enclosing.length > 0 && (enclosing.at(-1)?.rank ?? 0) >= rank) enclosing.pop();
    const inherited = enclosing.at(-1)?.indent ?? 0;
    sectionIndent = inherited + ownIndent(node);
    enclosing.push({ rank, indent: sectionIndent });
    levels.push(sectionIndent);
  });

  return levels;
}

/**
 * Paint the inherited indent. Rebuilt per state transition like
 * `chunkWrapperDecorationPlugin` — the walk is over top-level children only,
 * and PM merges these attrs with any other node decoration on the same block.
 */
export function headingSectionIndentPlugin(): Plugin {
  return new Plugin({
    key: headingSectionIndentKey,
    props: {
      decorations(state) {
        const levels = sectionIndentLevels(state.doc);
        const decos: Decoration[] = [];
        let index = 0;
        state.doc.forEach((node, pos) => {
          const level = levels[index] ?? 0;
          index += 1;
          if (level === 0 || node.isInline) return;
          decos.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: OK_SECTION_INDENT_CLASS,
              style: `--ok-section-indent-level:${level}`,
            }),
          );
        });
        return decos.length > 0 ? DecorationSet.create(state.doc, decos) : null;
      },
    },
  });
}

/** `--ok-indent-step` resolved to px, so keyframes carry real lengths. */
function indentStepPx(view: EditorView): number {
  const raw = getComputedStyle(view.dom).getPropertyValue('--ok-indent-step').trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return INDENT_STEP_FALLBACK_PX;
  if (raw.endsWith('rem')) {
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(root) ? value * root : INDENT_STEP_FALLBACK_PX;
  }
  return raw.endsWith('px') ? value : INDENT_STEP_FALLBACK_PX;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Glide the section indent instead of snapping it.
 *
 * A CSS transition cannot do this job here. Indenting a heading changes its
 * node attrs, so ProseMirror rebuilds that node's DOM element — and rebuilds
 * the following siblings' elements along with it. A fresh element has no
 * previous computed `padding-left` for a transition to start from, so the new
 * indent paints instantly. (The prose `text-indent` in
 * `paragraph-indent-shortcuts.ts` has no such problem: a leading tab leaves
 * the node markup untouched, the element survives, and CSS animates it.)
 *
 * Web Animations sidesteps the rebuild by naming the start value explicitly:
 * the previous state's level is still known here, so each moved block plays
 * from its old offset to the one CSS already gave it.
 */
function animateSectionIndentPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('headingSectionIndentAnimation'),
    view() {
      return {
        update(view, prevState) {
          if (prevState.doc === view.state.doc) return;
          if (prefersReducedMotion()) return;
          const before = sectionIndentLevels(prevState.doc);
          const after = sectionIndentLevels(view.state.doc);
          // Block counts differ only on a structural edit — inserting or
          // removing blocks is not an indent gesture, and index-matching the
          // two docs would animate unrelated blocks.
          if (before.length !== after.length) return;

          let step: number | null = null;
          let index = 0;
          view.state.doc.forEach((_node, pos) => {
            const from = before[index] ?? 0;
            const to = after[index] ?? 0;
            index += 1;
            if (from === to) return;
            const dom = view.nodeDOM(pos);
            // jsdom has no Element.animate; the indent still applies, unanimated.
            if (!(dom instanceof HTMLElement) || typeof dom.animate !== 'function') return;
            step ??= indentStepPx(view);
            dom.animate([{ paddingLeft: `${from * step}px` }, { paddingLeft: `${to * step}px` }], {
              duration: INDENT_ANIMATION_MS,
              easing: INDENT_ANIMATION_EASING,
            });
          });
        },
      };
    },
  });
}

/**
 * Resolve the caret when it sits at the very start of a top-level heading —
 * the only position where Tab means "indent this section". Headings have no
 * leading whitespace run to sit inside (the format cannot store one), so the
 * start is exactly offset 0.
 */
function headingCaret(editor: import('@tiptap/core').Editor): { pos: number; node: PmNode } | null {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection)) return null;
  const { $cursor } = selection;
  if ($cursor === null || $cursor.parentOffset !== 0) return null;
  // Depth 1 keeps this to headings the section walk actually paints; a heading
  // nested in a blockquote or list item would store an indent nothing renders.
  if ($cursor.depth !== 1 || $cursor.parent.type.name !== 'heading') return null;
  return { pos: $cursor.before(1), node: $cursor.parent };
}

/** Write the heading's own indent, normalizing 0 back to the absent form. */
function setOwnIndent(editor: import('@tiptap/core').Editor, pos: number, level: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (node === null) return;
  view.dispatch(
    state.tr
      .setNodeMarkup(pos, undefined, {
        ...node.attrs,
        sourceLeadingIndent: level === 0 ? null : level,
      })
      .scrollIntoView(),
  );
}

export const HeadingSectionIndent = Extension.create({
  name: 'headingSectionIndent',
  priority: 10,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const caret = headingCaret(this.editor);
        if (caret === null) return false;
        const level = ownIndent(caret.node);
        // At the format ceiling: decline so TabFocusTrap consumes the key and
        // the caret stays put, rather than pretending the press did something.
        if (level >= HEADING_INDENT_MAX) return false;
        setOwnIndent(this.editor, caret.pos, level + 1);
        return true;
      },
      'Shift-Tab': () => {
        const caret = headingCaret(this.editor);
        if (caret === null) return false;
        const level = ownIndent(caret.node);
        if (level <= 0) return false;
        setOwnIndent(this.editor, caret.pos, level - 1);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [headingSectionIndentPlugin(), animateSectionIndentPlugin()];
  },
});
