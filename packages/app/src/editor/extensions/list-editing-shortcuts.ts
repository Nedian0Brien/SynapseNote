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
import { type Attrs, Fragment, type Node as PmNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

const LIST_ITEM = 'listItem';

function childOffset(node: PmNode, childIndex: number): number {
  let offset = 0;
  for (let index = 0; index < childIndex; index += 1) {
    offset += node.child(index).nodeSize;
  }
  return offset;
}

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

/**
 * Move the selected leading items of a list below the final item of an
 * immediately preceding list.
 *
 * ProseMirror's stock sinkListItem command can only indent an item beneath a
 * sibling in the same list node. Markdown represents a marker change such as
 * `1. parent` followed by `- child` as two adjacent list nodes, though, so the
 * visually obvious Tab operation otherwise becomes a no-op. Keep each marker
 * kind intact while bridging that node boundary.
 */
function sinkAcrossAdjacentListBoundary(editor: import('@tiptap/core').Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const itemDepth = listItemDepths(editor).at(-1);
  if (itemDepth === undefined) return false;
  const listDepth = itemDepth - 1;
  if (listDepth < 1) return false;

  const { $from, $to } = selection;
  const currentItem = $from.node(itemDepth);
  const currentList = $from.node(listDepth);
  if (
    currentItem.type.name !== LIST_ITEM ||
    currentList.type.name !== 'list' ||
    $to.depth < listDepth ||
    $to.node(listDepth) !== currentList ||
    $from.index(listDepth) !== 0
  ) {
    return false;
  }

  const lastSelectedIndex = $to.index(listDepth);
  if (lastSelectedIndex >= currentList.childCount) return false;
  const selectedEndOffset = childOffset(currentList, lastSelectedIndex + 1);
  const selectedItems = currentList.content.cut(0, selectedEndOffset);

  const parentDepth = listDepth - 1;
  const listIndex = $from.index(parentDepth);
  if (listIndex === 0) return false;

  const parent = $from.node(parentDepth);
  const previousList = parent.child(listIndex - 1);
  const previousItem = previousList.lastChild;
  if (previousList.type.name !== 'list' || previousItem?.type.name !== LIST_ITEM) return false;

  const currentListPos = $from.before(listDepth);
  const previousListPos = currentListPos - previousList.nodeSize;
  const currentItemPos = $from.before(itemDepth);
  const relativeFrom = selection.from - currentItemPos;
  const relativeTo = selection.to - currentItemPos;

  const previousItemOffset = previousList.content.size - previousItem.nodeSize;
  const previousItemPos = previousListPos + 1 + previousItemOffset;
  const previousItemLastChild = previousItem.lastChild;

  let updatedPreviousItem: PmNode;
  let nestedItemPos: number;
  if (
    previousItemLastChild?.type.name === 'list' &&
    previousItemLastChild.sameMarkup(currentList)
  ) {
    const nestedListOffset = previousItem.content.size - previousItemLastChild.nodeSize;
    const nestedListPos = previousItemPos + 1 + nestedListOffset;
    nestedItemPos = nestedListPos + 1 + previousItemLastChild.content.size;
    const updatedNestedList = previousItemLastChild.copy(
      previousItemLastChild.content.append(selectedItems),
    );
    updatedPreviousItem = previousItem.copy(
      previousItem.content.cut(0, nestedListOffset).append(Fragment.from(updatedNestedList)),
    );
  } else {
    const nestedListPos = previousItemPos + 1 + previousItem.content.size;
    nestedItemPos = nestedListPos + 1;
    updatedPreviousItem = previousItem.copy(
      previousItem.content.append(Fragment.from(currentList.copy(selectedItems))),
    );
  }

  const updatedPreviousList = previousList.copy(
    previousList.content.cut(0, previousItemOffset).append(Fragment.from(updatedPreviousItem)),
  );
  const replacement = [updatedPreviousList];
  if (selectedEndOffset < currentList.content.size) {
    replacement.push(currentList.copy(currentList.content.cut(selectedEndOffset)));
  }

  const tr = state.tr.replaceWith(
    previousListPos,
    currentListPos + currentList.nodeSize,
    Fragment.fromArray(replacement),
  );
  tr.setSelection(
    TextSelection.create(tr.doc, nestedItemPos + relativeFrom, nestedItemPos + relativeTo),
  );
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Reverse the mixed-marker boundary sink without adopting the outer list's
 * marker attrs. The stock liftListItem command sees the unified `list` node
 * type on both levels and therefore turns a nested bullet into an ordered
 * sibling (or vice versa).
 */
function liftAcrossMixedListBoundary(editor: import('@tiptap/core').Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const itemDepth = listItemDepths(editor).at(-1);
  if (itemDepth === undefined) return false;
  const nestedListDepth = itemDepth - 1;
  const parentItemDepth = nestedListDepth - 1;
  const outerListDepth = parentItemDepth - 1;
  if (outerListDepth < 1) return false;

  const { $from, $to } = selection;
  const currentItem = $from.node(itemDepth);
  const nestedList = $from.node(nestedListDepth);
  const parentItem = $from.node(parentItemDepth);
  const outerList = $from.node(outerListDepth);
  if (
    currentItem.type.name !== LIST_ITEM ||
    nestedList.type.name !== 'list' ||
    parentItem.type.name !== LIST_ITEM ||
    outerList.type.name !== 'list' ||
    nestedList.sameMarkup(outerList) ||
    $to.depth < nestedListDepth ||
    $to.node(nestedListDepth) !== nestedList ||
    $to.index(nestedListDepth) !== nestedList.childCount - 1 ||
    $from.index(outerListDepth) !== outerList.childCount - 1 ||
    parentItem.lastChild !== nestedList
  ) {
    return false;
  }

  const outerParentDepth = outerListDepth - 1;
  const outerParent = $from.node(outerParentDepth);
  const outerListIndex = $from.index(outerParentDepth);
  const outerListPos = $from.before(outerListDepth);
  const currentItemPos = $from.before(itemDepth);
  const relativeFrom = selection.from - currentItemPos;
  const relativeTo = selection.to - currentItemPos;

  const firstSelectedIndex = $from.index(nestedListDepth);
  const selectedStartOffset = childOffset(nestedList, firstSelectedIndex);
  const selectedItems = nestedList.content.cut(selectedStartOffset);
  const nestedListOffset = parentItem.content.size - nestedList.nodeSize;
  let updatedParentContent = parentItem.content.cut(0, nestedListOffset);
  if (selectedStartOffset > 0) {
    updatedParentContent = updatedParentContent.append(
      Fragment.from(nestedList.copy(nestedList.content.cut(0, selectedStartOffset))),
    );
  }
  const updatedParentItem = parentItem.copy(updatedParentContent);
  const parentItemOffset = outerList.content.size - parentItem.nodeSize;
  const updatedOuterList = outerList.copy(
    outerList.content.cut(0, parentItemOffset).append(Fragment.from(updatedParentItem)),
  );

  let liftedList = nestedList.copy(selectedItems);
  let replaceTo = outerListPos + outerList.nodeSize;
  const nextSibling =
    outerListIndex + 1 < outerParent.childCount ? outerParent.child(outerListIndex + 1) : null;
  if (nextSibling?.type.name === 'list' && nextSibling.sameMarkup(nestedList)) {
    liftedList = liftedList.copy(liftedList.content.append(nextSibling.content));
    replaceTo += nextSibling.nodeSize;
  }

  const liftedItemPos = outerListPos + updatedOuterList.nodeSize + 1;
  const tr = state.tr.replaceWith(
    outerListPos,
    replaceTo,
    Fragment.fromArray([updatedOuterList, liftedList]),
  );
  tr.setSelection(
    TextSelection.create(tr.doc, liftedItemPos + relativeFrom, liftedItemPos + relativeTo),
  );
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const ListEditingShortcuts = Extension.create({
  name: 'listEditingShortcuts',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (listItemDepths(this.editor).length === 0) return false;
        const parentListAttrs = nearestListAttrs(this.editor);
        if (!this.editor.commands.sinkListItem(LIST_ITEM)) {
          return sinkAcrossAdjacentListBoundary(this.editor);
        }
        // prosemirror-schema-list creates the nested wrapper with default attrs.
        // The unified SynapseNote list uses attrs to distinguish bullet vs
        // ordered lists, so copy the parent kind back onto the new wrapper.
        if (parentListAttrs) applyNestedListAttrs(this.editor, parentListAttrs);
        return true;
      },
      'Shift-Tab': () => {
        if (listItemDepths(this.editor).length === 0) return false;
        if (liftAcrossMixedListBoundary(this.editor)) return true;
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
