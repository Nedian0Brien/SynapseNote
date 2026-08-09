/**
 * ParagraphIndentShortcuts — Tab / Shift-Tab indentation for plain prose.
 *
 * `ListEditingShortcuts` gives Tab a meaning inside list-shaped markdown
 * (nest / un-nest the item) and `CodeBlockFidelity` gives it one inside a
 * fence (insert `tabSize` spaces). A plain paragraph had neither: Tab fell
 * all the way through to `TabFocusTrap`, which consumed the keystroke to
 * keep focus in the editor and did nothing else. Authors who open a
 * paragraph with Tab — the ordinary first-line indent of prose, and the
 * default convention for Korean body text — got a dead key.
 *
 * Policy:
 *
 * - Tab, with the caret inside the paragraph's leading whitespace run
 *   (offset 0 included, so the very first press qualifies), inserts one tab
 *   character. Pressing it again deepens the indent, because the caret is
 *   still inside the run.
 * - Shift-Tab pulls one indent level back off the same run: a whole tab, or
 *   up to `SPACE_INDENT_WIDTH` trailing spaces when the paragraph was
 *   indented with spaces (what the markdown pipeline produces for a
 *   `&#x20;`-escaped leading run).
 * - The caret must sit in the leading run. Tab mid-sentence stays trapped —
 *   a stray tab inside a line is never what the keystroke meant.
 *
 * Why a literal character and not a block attribute: markdown has no
 * paragraph-indent construct, so an attribute would need an invented
 * carrier and would break the byte-fidelity contract on every foreign file.
 * A leading tab is real document text and round-trips exactly — the
 * serializer escapes the line-leading character as `&#x9;` (which would
 * otherwise re-parse as an indented code block) and re-parsing restores the
 * tab, carrying the `sourceLiteral` hint that `source-literal-mark.ts`
 * already whitelists for inline whitespace char-refs.
 *
 * Rendering: the stored run is NOT what you see. A tab glyph's width comes
 * from `tab-size`, and glyph advance is not a CSS property, so an indent drawn
 * that way can only ever snap between widths. The decoration below instead
 * collapses the leading run to nothing and re-draws the same distance as
 * `text-indent`, a real length that `prose-base.css` transitions — so Tab and
 * Shift-Tab glide instead of jumping, and the indent stays a pure function of
 * the stored characters.
 *
 * Priority 10 puts this below every intentional Tab handler — `ListItem`
 * (100), `Table` / `CodeBlockFidelity` (60), and the suggestion plugins —
 * and above `TabFocusTrap` (1), which stays the final fall-through for the
 * positions this extension declines.
 */

import { Extension } from '@tiptap/core';
import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The block type that gets prose indentation. Headings keep their own
 *  `sourceLeadingIndent` fidelity attr and are deliberately excluded. */
const INDENTABLE_BLOCK = 'paragraph';

/** One Tab press writes one tab character. */
const INDENT_UNIT = '\t';

/** Shift-Tab removes at most this many trailing spaces from a space indent. */
const SPACE_INDENT_WIDTH = 4;

/** Carries the level to `.ProseMirror p.ok-prose-indent` in `prose-base.css`. */
export const OK_PROSE_INDENT_CLASS = 'ok-prose-indent';

/** Collapses the stored run so it adds no width of its own. */
export const OK_PROSE_INDENT_RUN_CLASS = 'ok-prose-indent-run';

export const proseIndentDecorationKey = new PluginKey('proseIndentDecoration');

/**
 * Length of the block's leading tab/space run, in text characters.
 *
 * The run can span several text nodes: a re-parsed `&#x9;\tbody` arrives as a
 * `sourceLiteral`-marked tab followed by an unmarked one, so walk children
 * until one starts with something other than indentation.
 */
function leadingIndentLength(parent: PmNode): number {
  let length = 0;
  for (let index = 0; index < parent.childCount; index += 1) {
    const child = parent.child(index);
    if (!child.isText || child.text === undefined) break;
    const run = /^[\t ]*/.exec(child.text)?.[0].length ?? 0;
    length += run;
    if (run < child.text.length) break;
  }
  return length;
}

/**
 * The run expressed in indent levels — one per tab, one per full space step.
 *
 * Fractional results are intentional: a two-space run that arrived from a
 * foreign file is half a level, and `calc()` renders it at half the width
 * rather than rounding the author's file up or down.
 */
export function indentLevelOf(run: string): number {
  let tabs = 0;
  let spaces = 0;
  for (const char of run) {
    if (char === '\t') tabs += 1;
    else if (char === ' ') spaces += 1;
  }
  return tabs + spaces / SPACE_INDENT_WIDTH;
}

/**
 * Draw the indent as a transitionable length.
 *
 * Two decorations per indented paragraph: an inline one over the stored run,
 * whose class collapses it to zero width, and a node one carrying the level
 * for the `text-indent` calc. Rebuilt per state transition like
 * `chunkWrapperDecorationPlugin`; the walk stops at inline nodes, so it visits
 * block nodes only.
 */
export function proseIndentDecorationPlugin(): Plugin {
  return new Plugin({
    key: proseIndentDecorationKey,
    props: {
      decorations(state) {
        const decos: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.isInline) return false;
          if (node.type.name !== INDENTABLE_BLOCK) return true;
          const length = leadingIndentLength(node);
          if (length === 0) return false;
          const start = pos + 1;
          const level = indentLevelOf(node.textBetween(0, length));
          decos.push(
            Decoration.inline(start, start + length, { class: OK_PROSE_INDENT_RUN_CLASS }),
            Decoration.node(pos, pos + node.nodeSize, {
              class: OK_PROSE_INDENT_CLASS,
              style: `--ok-prose-indent-level:${level}`,
            }),
          );
          return false;
        });
        return decos.length > 0 ? DecorationSet.create(state.doc, decos) : null;
      },
    },
  });
}

/** How much of `indent` one Shift-Tab press takes back. */
function outdentWidth(indent: string): number {
  if (indent.endsWith(INDENT_UNIT)) return INDENT_UNIT.length;
  const trailingSpaces = indent.length - indent.replace(/ +$/, '').length;
  return Math.min(Math.max(trailingSpaces, 1), SPACE_INDENT_WIDTH);
}

/**
 * Resolve the caret when it sits inside the leading indent run of a plain
 * paragraph — the only position where Tab means "indent this line".
 */
function indentCaret(
  editor: import('@tiptap/core').Editor,
): { $cursor: ResolvedPos; indentLength: number } | null {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection)) return null;
  const { $cursor } = selection;
  if ($cursor === null || $cursor.parent.type.name !== INDENTABLE_BLOCK) return null;

  // Inside a list item Tab already means "nest this item". ListEditingShortcuts
  // runs first and returns false when the item cannot sink (a first item at the
  // top level); indenting its text instead would rewrite the marker line.
  for (let depth = $cursor.depth - 1; depth > 0; depth -= 1) {
    if ($cursor.node(depth).type.name === 'listItem') return null;
  }

  const indentLength = leadingIndentLength($cursor.parent);
  if ($cursor.parentOffset > indentLength) return null;
  return { $cursor, indentLength };
}

export const ParagraphIndentShortcuts = Extension.create({
  name: 'paragraphIndentShortcuts',
  priority: 10,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const caret = indentCaret(this.editor);
        if (caret === null) return false;

        const { state, view } = this.editor;
        const { pos } = caret.$cursor;
        // replaceWith (not insertText) so the tab carries no marks: inheriting
        // a neighbouring `sourceLiteral` would fold two tabs under one
        // `&#x9;` sourceRaw and drop an indent level on serialize.
        const tr = state.tr.replaceWith(pos, pos, state.schema.text(INDENT_UNIT));
        tr.setSelection(TextSelection.create(tr.doc, pos + INDENT_UNIT.length));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      'Shift-Tab': () => {
        const caret = indentCaret(this.editor);
        if (caret === null || caret.indentLength === 0) return false;

        const { state, view } = this.editor;
        const runStart = caret.$cursor.start();
        const runEnd = runStart + caret.indentLength;
        const removed = outdentWidth(state.doc.textBetween(runStart, runEnd));
        view.dispatch(state.tr.delete(runEnd - removed, runEnd).scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [proseIndentDecorationPlugin()];
  },
});
