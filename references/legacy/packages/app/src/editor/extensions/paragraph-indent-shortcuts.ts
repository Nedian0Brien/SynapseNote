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
 * - Tab, with the caret anywhere in the paragraph, adds one tab character to
 *   the paragraph's leading run. Pressing it again deepens the indent. The
 *   character always joins the run at the head of the line, never the caret's
 *   own position: a tab dropped mid-sentence is not an indent, and only a
 *   leading run survives the markdown round-trip.
 * - Shift-Tab pulls one indent level back off the same run: a whole tab, or
 *   up to `SPACE_INDENT_WIDTH` trailing spaces when the paragraph was
 *   indented with spaces (what the markdown pipeline produces for a
 *   `&#x20;`-escaped leading run).
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
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** The block type that gets prose indentation. Headings keep their own
 *  `sourceLeadingIndent` fidelity attr and are deliberately excluded. */
const INDENTABLE_BLOCK = 'paragraph';

/** One Tab press writes one tab character. */
const INDENT_UNIT = '\t';

/** Shift-Tab removes at most this many trailing spaces from a space indent. */
const SPACE_INDENT_WIDTH = 4;

/**
 * Containers that move as a whole when the paragraph opening them is indented.
 *
 * Each draws its own left edge — a quote's rule, a callout's tinted box, a
 * footnote definition's block — so indenting only the text inside would slide
 * the words out from under their own frame. Each also stores the leading tab
 * through the round-trip: `> &#x9;` for a quote, `[^1]: &#x9;` for a footnote
 * definition, and inside the callout's own source bytes.
 *
 * `jsxComponent` covers callouts and every other block component. Listing the
 * type rather than the component name is self-limiting: the rule only fires
 * when a component's first child paragraph carries an indent, which can only
 * happen where the component exposes that paragraph for editing.
 */
const INDENT_CONTAINERS: ReadonlySet<string> = new Set([
  'blockquote',
  'footnoteDefinition',
  'jsxComponent',
]);

/**
 * Ancestors that make Tab mean something else, or make the indent unstorable.
 *
 * `listItem` — Tab already means "nest this item"; ListEditingShortcuts runs
 * first and returns false when the item cannot sink (a first item at the top
 * level), and indenting its text instead would rewrite the marker line.
 *
 * `commentBlock` — an HTML comment body drops the leading run on re-parse
 * (`<!-- \tbody -->` comes back as `body`), so the edit would vanish on the
 * next reload. The block is `display: none` in the editor besides.
 */
const INDENT_BLOCKED_ANCESTORS: ReadonlySet<string> = new Set(['listItem', 'commentBlock']);

/** Carries the level to `.ProseMirror p.ok-prose-indent` in `prose-base.css`. */
export const OK_PROSE_INDENT_CLASS = 'ok-prose-indent';

/** Same level, but moving a whole container rather than one first line. */
export const OK_PROSE_INDENT_CONTAINER_CLASS = 'ok-prose-indent-container';

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
 * whose class collapses it to zero width, and a node one carrying the level.
 *
 * The node decoration usually lands on the paragraph, where it renders as a
 * first-line `text-indent`. When the paragraph OPENS one of the containers in
 * `INDENT_CONTAINERS` it lands on the container instead, as a `margin-left`,
 * so the frame that container draws down its left edge travels with the words
 * instead of leaving them behind it. Later paragraphs in the same container
 * keep the first-line treatment — their run is an indent within the container,
 * not a move of it.
 *
 * Rebuilt per state transition like `chunkWrapperDecorationPlugin`; the walk
 * stops at inline nodes, so it visits block nodes only.
 */
export function proseIndentDecorationPlugin(): Plugin {
  return new Plugin({
    key: proseIndentDecorationKey,
    props: {
      decorations(state) {
        const decos: Decoration[] = [];
        state.doc.descendants((node, pos, parent, index) => {
          if (node.isInline) return false;
          if (node.type.name !== INDENTABLE_BLOCK) return true;
          const length = leadingIndentLength(node);
          if (length === 0) return false;
          const start = pos + 1;
          const level = indentLevelOf(node.textBetween(0, length));
          const opensContainer =
            parent !== null && INDENT_CONTAINERS.has(parent.type.name) && index === 0;
          // A first child starts one position after its parent's own position.
          const target = opensContainer
            ? { pos: pos - 1, size: parent.nodeSize, class: OK_PROSE_INDENT_CONTAINER_CLASS }
            : { pos, size: node.nodeSize, class: OK_PROSE_INDENT_CLASS };
          decos.push(
            Decoration.inline(start, start + length, { class: OK_PROSE_INDENT_RUN_CLASS }),
            Decoration.node(target.pos, target.pos + target.size, {
              class: target.class,
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
 * Resolve the paragraph Tab should indent.
 *
 * Anywhere inside it counts. Indenting is a statement about the line, not
 * about the character the caret happens to rest on, so requiring the start
 * would only make authors navigate before they can use the key. A selection
 * qualifies while it stays within one paragraph; spanning blocks is a
 * different gesture and is left to fall through.
 */
function indentTarget(
  editor: import('@tiptap/core').Editor,
): { runStart: number; indentLength: number } | null {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection)) return null;
  const { $from, $to } = selection;
  if ($from.parent !== $to.parent || $from.parent.type.name !== INDENTABLE_BLOCK) return null;

  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    if (INDENT_BLOCKED_ANCESTORS.has($from.node(depth).type.name)) return null;
  }

  return { runStart: $from.start(), indentLength: leadingIndentLength($from.parent) };
}

export const ParagraphIndentShortcuts = Extension.create({
  name: 'paragraphIndentShortcuts',
  priority: 10,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const target = indentTarget(this.editor);
        if (target === null) return false;

        const { state, view } = this.editor;
        const { selection } = state;
        // Grow the existing run rather than dropping a tab wherever the caret
        // sits — a tab in the middle of a sentence is never the indent the
        // author asked for, and only a LEADING run survives the round-trip.
        const at = target.runStart + target.indentLength;
        // replaceWith (not insertText) so the tab carries no marks: inheriting
        // a neighbouring `sourceLiteral` would fold two tabs under one
        // `&#x9;` sourceRaw and drop an indent level on serialize.
        const tr = state.tr.replaceWith(at, at, state.schema.text(INDENT_UNIT));
        // Typing must never land text before the run, which would strand the
        // tabs mid-line and lose the indent. A caret inside the run (the empty
        // paragraph included) therefore comes to rest just past it; a caret out
        // in the sentence keeps its own place through the mapping.
        if (selection.empty && selection.from <= at) {
          tr.setSelection(TextSelection.create(tr.doc, at + INDENT_UNIT.length));
        }
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      'Shift-Tab': () => {
        const target = indentTarget(this.editor);
        if (target === null || target.indentLength === 0) return false;

        const { state, view } = this.editor;
        const runEnd = target.runStart + target.indentLength;
        const removed = outdentWidth(state.doc.textBetween(target.runStart, runEnd));
        view.dispatch(state.tr.delete(runEnd - removed, runEnd).scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [proseIndentDecorationPlugin()];
  },
});
