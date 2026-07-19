/**
 * Markdown-list keyboard behavior owned by the interactive app.
 *
 * The core schema keeps upstream-compatible list commands for parsing and
 * programmatic editors. The foreground editor adds the authoring policy users
 * expect here:
 *
 * - Tab / Shift-Tab indent or outdent the selected list item(s).
 * - Backspace at the start of an item's first paragraph removes the list
 *   structure instead of joining the text into the preceding item.
 *
 * This extension uses the default priority (100) and is registered after the
 * core extensions. At equal priority the later keymap runs first, while a
 * suggestion plugin registered later can still consume Tab before it.
 */

import { Extension } from '@tiptap/core';
import type { Attrs } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

const LIST_ITEM = 'listItem';

function listItemDepths(editor: import('@tiptap/core').Editor): number[] {
  const { $from } = editor.state.selection;
  const depths: number[] = [];
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    if ($from.node(depth).type.name === LIST_ITEM) depths.push(depth);
  }
  return depths;
}

function isAtListItemTextStart(editor: import('@tiptap/core').Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection) || selection.$cursor === null) return false;
  const { $cursor } = selection;
  if ($cursor.parentOffset !== 0) return false;

  const itemDepth = listItemDepths(editor).at(-1);
  if (itemDepth === undefined) return false;

  // Only the first textblock belongs to the marker boundary. Backspace at the
  // start of a later paragraph inside the same item keeps normal block-joining
  // semantics.
  return $cursor.depth === itemDepth + 1 && $cursor.index(itemDepth) === 0;
}

function nearestListAttrs(editor: import('@tiptap/core').Editor): Attrs | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'list') return { ...node.attrs };
  }
  return null;
}

function applyNestedListAttrs(editor: import('@tiptap/core').Editor, attrs: Attrs): void {
  const { state, view } = editor;
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'list') continue;
    view.dispatch(
      state.tr.setNodeMarkup($from.before(depth), undefined, {
        ...attrs,
        // A nested ordered list starts a fresh sequence even when its parent
        // was authored with a non-1 starting ordinal.
        start: attrs.ordered ? 1 : attrs.start,
      }),
    );
    return;
  }
}

export const ListEditingShortcuts = Extension.create({
  name: 'listEditingShortcuts',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (listItemDepths(this.editor).length === 0) return false;
        const parentListAttrs = nearestListAttrs(this.editor);
        if (!this.editor.commands.sinkListItem(LIST_ITEM)) return false;
        // prosemirror-schema-list creates the nested wrapper with default attrs.
        // The unified SynapseNote list uses attrs to distinguish bullet vs
        // ordered lists, so copy the parent kind back onto the new wrapper.
        if (parentListAttrs) applyNestedListAttrs(this.editor, parentListAttrs);
        return true;
      },
      'Shift-Tab': () => {
        if (listItemDepths(this.editor).length === 0) return false;
        return this.editor.commands.liftListItem(LIST_ITEM);
      },
      Backspace: () => {
        if (!isAtListItemTextStart(this.editor)) return false;

        // Preserve the familiar "undo the just-typed '- ' input rule" path.
        if (this.editor.commands.undoInputRule()) return true;

        // A nested item may need more than one lift before it is a paragraph.
        // Capture the depth up front; each successful lift updates the live
        // selection and removes one listItem ancestor.
        const levels = listItemDepths(this.editor).length;
        let lifted = false;
        for (let level = 0; level < levels; level += 1) {
          if (!this.editor.commands.liftListItem(LIST_ITEM)) break;
          lifted = true;
        }
        return lifted;
      },
    };
  },
});
