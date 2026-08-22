/**
 * Unified list + listItem TipTap extension.
 *
 * Single pair of node types matching mdast's nested `list` → `listItem+`
 * structure (replaces the BulletList/OrderedList/ListItem/TaskList/TaskItem
 * fragmentation).
 *
 * Schema names are mdast-canonical: `list` (not bulletList/orderedList)
 * and `listItem` (not taskItem). Bullet/ordered/task are distinguished
 * by attrs (`ordered`, `checked`).
 *
 * Commands are TipTap-idiomatic: toggleBulletList, toggleOrderedList,
 * toggleTaskList — matching existing UI callers in slash-command/items.ts
 * and bubble-menu/BlockTypeSelector.tsx.
 *
 * Keyboard shortcuts use prosemirror-schema-list utilities (wrapInList,
 * splitListItem, liftListItem, sinkListItem) which are designed for
 * nested list schemas.
 */

import { findParentNode, InputRule, mergeAttributes, Node, wrappingInputRule } from '@tiptap/core';
import { Fragment, type NodeType, type Node as PmNode } from '@tiptap/pm/model';
import { liftListItem as pmLiftListItem, wrapInList as pmWrapInList } from '@tiptap/pm/schema-list';
import { type EditorState, Plugin, type Transaction } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    list: {
      toggleBulletList: () => ReturnType;
      toggleOrderedList: () => ReturnType;
      toggleTaskList: () => ReturnType;
    };
  }
}

// ────────────────────────── Helpers ──────────────────────────

/** Check if a list node is a bullet list (not ordered, no checked items). */
function isBulletList(node: PmNode): boolean {
  return node.type.name === 'list' && !node.attrs.ordered;
}

/** Check if a list node is an ordered list. */
function isOrderedList(node: PmNode): boolean {
  return node.type.name === 'list' && !!node.attrs.ordered;
}

/** Check if a list has any task items (checked !== null). */
function hasTaskItems(node: PmNode): boolean {
  let found = false;
  node.forEach((child) => {
    if (child.type.name === 'listItem' && child.attrs.checked !== null) {
      found = true;
    }
  });
  return found;
}

/**
 * Toggle between a specific list kind and no-list.
 *
 * If the selection is inside a list matching `predicate`, unwrap.
 * If inside a different list kind, swap the attrs/items.
 * If not in a list, wrap.
 */
function toggleListKind(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  listType: NodeType,
  itemType: NodeType,
  predicate: (node: PmNode) => boolean,
  listAttrs: Record<string, unknown>,
  itemAttrsOverride?: Record<string, unknown> | null,
): boolean {
  const parentList = findParentNode((node) => node.type.name === 'list')(state.selection);

  if (parentList && predicate(parentList.node)) {
    // Already in target kind → unwrap (lift)
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) return false;
    return pmLiftListItem(itemType)(state, dispatch);
  }

  if (parentList) {
    // Inside a different list kind → swap attrs
    if (!dispatch) return true;
    const { tr } = state;
    // Update the list node's attrs
    tr.setNodeMarkup(parentList.pos, undefined, {
      ...parentList.node.attrs,
      ...listAttrs,
    });
    // If switching to/from task, update listItem checked attrs
    if (itemAttrsOverride !== undefined) {
      parentList.node.forEach((child, offset) => {
        if (child.type.name === 'listItem') {
          const itemPos = parentList.pos + 1 + offset;
          tr.setNodeMarkup(itemPos, undefined, {
            ...child.attrs,
            ...itemAttrsOverride,
          });
        }
      });
    }
    dispatch(tr);
    return true;
  }

  // Not in a list → wrap
  const canWrap = pmWrapInList(listType, listAttrs)(state, undefined);
  if (!canWrap) return false;
  if (!dispatch) return true;

  // Wrap and optionally set item attrs
  const result = pmWrapInList(listType, listAttrs)(state, (tr) => {
    if (itemAttrsOverride) {
      // After wrapping, walk up from the mapped position to find the new listItem
      const mappedPos = tr.mapping.map(state.selection.$from.pos);
      const $pos = tr.doc.resolve(mappedPos);
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);
        if (node.type.name === 'listItem') {
          tr.setNodeMarkup($pos.before(d), undefined, {
            ...node.attrs,
            ...itemAttrsOverride,
          });
          break;
        }
      }
    }
    dispatch(tr);
  });
  return result;
}

/** Convert only the item whose first paragraph contains the typed marker. */
function convertListItemInput(
  state: EditorState,
  start: number,
  end: number,
  listAttrs: Record<string, unknown>,
  itemAttrs: Record<string, unknown>,
): boolean {
  const $start = state.doc.resolve(start);
  let itemDepth = -1;
  for (let depth = $start.depth; depth > 0; depth--) {
    if ($start.node(depth).type.name === 'listItem') {
      itemDepth = depth;
      break;
    }
  }
  if (itemDepth < 1 || $start.node(itemDepth - 1).type.name !== 'list') return false;
  if ($start.parent.type.name !== 'paragraph' || $start.parentOffset !== 0) return false;

  const listDepth = itemDepth - 1;
  const listPos = $start.before(listDepth);
  const itemIndex = $start.index(listDepth);
  const tr = state.tr.delete(start, end);
  const mappedListPos = tr.mapping.map(listPos);
  const mappedList = tr.doc.nodeAt(mappedListPos);
  if (!mappedList || mappedList.type.name !== 'list') return false;
  const item = mappedList.child(itemIndex);

  const converted = item.type.create(
    { ...item.attrs, checked: null, ...itemAttrs },
    item.content,
    item.marks,
  );
  const items = Array.from({ length: mappedList.childCount }, (_, index) =>
    mappedList.child(index),
  );
  const replacement: PmNode[] = [];
  if (itemIndex > 0)
    replacement.push(mappedList.copy(Fragment.fromArray(items.slice(0, itemIndex))));
  replacement.push(
    mappedList.type.create({ ...mappedList.attrs, ...listAttrs }, Fragment.from(converted)),
  );
  if (itemIndex + 1 < items.length) {
    replacement.push(mappedList.copy(Fragment.fromArray(items.slice(itemIndex + 1))));
  }
  tr.replaceWith(mappedListPos, mappedListPos + mappedList.nodeSize, replacement);
  return true;
}

function normalizeOrderedListStarts(state: EditorState): Transaction | null {
  const tr = state.tr;
  let changed = false;
  const normalize = (parent: PmNode, pos: number) => {
    let offset = 0;
    let carry: number | null = null;
    for (let index = 0; index < parent.childCount; index++) {
      const child = parent.child(index);
      const childPos = pos + 1 + offset;
      if (child.type.name === 'list') {
        if (child.attrs.ordered) {
          const sourceOrdinal = child.firstChild?.attrs.sourceOrdinal;
          const hasExplicitStart =
            typeof sourceOrdinal === 'number' &&
            Number.isFinite(sourceOrdinal) &&
            sourceOrdinal !== 1;
          const start: number =
            carry !== null && !hasExplicitStart ? carry : Number(child.attrs.start ?? 1);
          if (carry !== null && child.attrs.start !== start) {
            tr.setNodeMarkup(childPos, undefined, { ...child.attrs, start });
            changed = true;
          }
          carry = start + child.childCount;
        }
      } else {
        carry = null;
      }
      normalize(child, childPos);
      offset += child.nodeSize;
    }
  };
  normalize(state.doc, -1);
  return changed ? tr : null;
}

// ────────────────────────── List Node ──────────────────────────

export const ListNode = Node.create({
  name: 'list',
  group: 'block list',
  content: 'listItem+',
  priority: 60,

  addAttributes() {
    return {
      ordered: { default: false },
      start: { default: 1 },
      spread: { default: false },
      bulletMarker: { default: null },
      listMarkerDelimiter: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'ul',
        getAttrs: () => ({ ordered: false }),
      },
      {
        tag: 'ol',
        getAttrs: (el) => ({
          ordered: true,
          start: (el as HTMLElement).getAttribute('start')
            ? Number((el as HTMLElement).getAttribute('start'))
            : 1,
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tag = node.attrs.ordered ? 'ol' : 'ul';
    const extraAttrs: Record<string, unknown> = {};
    if (node.attrs.ordered && node.attrs.start !== 1) {
      extraAttrs.start = node.attrs.start;
    }
    return [tag, mergeAttributes(HTMLAttributes, extraAttrs), 0];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          return normalizeOrderedListStarts(newState);
        },
        view: (view) => {
          const timeoutId = setTimeout(() => {
            if (view.isDestroyed) return;
            const tr = normalizeOrderedListStarts(view.state);
            if (tr) view.dispatch(tr);
          }, 0);
          return {
            destroy: () => {
              clearTimeout(timeoutId);
            },
          };
        },
      }),
    ];
  },

  addCommands() {
    return {
      toggleBulletList:
        () =>
        ({ state, dispatch }) => {
          const listType = state.schema.nodes.list;
          const itemType = state.schema.nodes.listItem;
          if (!listType || !itemType) return false;
          return toggleListKind(
            state,
            dispatch,
            listType,
            itemType,
            (n) => isBulletList(n) && !hasTaskItems(n),
            { ordered: false },
            { checked: null }, // clear task status when switching to bullet
          );
        },
      toggleOrderedList:
        () =>
        ({ state, dispatch }) => {
          const listType = state.schema.nodes.list;
          const itemType = state.schema.nodes.listItem;
          if (!listType || !itemType) return false;
          return toggleListKind(
            state,
            dispatch,
            listType,
            itemType,
            (n) => isOrderedList(n),
            { ordered: true },
            { checked: null }, // clear task status when switching to ordered
          );
        },
      toggleTaskList:
        () =>
        ({ state, dispatch }) => {
          const listType = state.schema.nodes.list;
          const itemType = state.schema.nodes.listItem;
          if (!listType || !itemType) return false;
          return toggleListKind(
            state,
            dispatch,
            listType,
            itemType,
            (n) => isBulletList(n) && hasTaskItems(n),
            { ordered: false },
            { checked: false }, // enable task mode
          );
        },
    };
  },

  addInputRules() {
    return [
      // At an existing item's paragraph start, split just that item out of
      // its containing list before applying the newly typed list kind.
      new InputRule({
        find: /^\s*([-+*])(?!\s*\[[ xX]\])\s$/,
        handler: ({ state, range, match }) => {
          if (
            !convertListItemInput(
              state,
              range.from,
              range.to,
              {
                ordered: false,
                bulletMarker: match[1],
              },
              { sourceOrdinal: null },
            )
          )
            return null;
        },
      }),
      new InputRule({
        find: /^\s*(\d+)([.)])\s$/,
        handler: ({ state, range, match }) => {
          const start = Number(match[1]);
          if (
            !convertListItemInput(
              state,
              range.from,
              range.to,
              {
                ordered: true,
                start,
                listMarkerDelimiter: match[2],
              },
              { sourceOrdinal: start },
            )
          )
            return null;
        },
      }),
      // Bullet list: - , * , + (negative lookahead excludes task list pattern `- [ ] `)
      // joinPredicate: bullet and ordered lists share the single `list` node
      // type (distinguished by the `ordered` attr), so the default same-type
      // join would merge a freshly-typed list into ANY adjacent list. Only
      // join when the preceding list is the same kind — otherwise typing
      // `1. ` below a bullet list silently became an empty bullet item.
      wrappingInputRule({
        find: /^\s*([-+*])(?!\s*\[[ xX]\])\s$/,
        type: this.type,
        getAttributes: (match) => ({
          ordered: false,
          bulletMarker: match[1],
        }),
        joinPredicate: (_match, node) => node.attrs.ordered === false,
      }),
      // Ordered list: 1. or 1)
      wrappingInputRule({
        find: /^\s*(\d+)([.)])\s$/,
        type: this.type,
        getAttributes: (match) => ({
          ordered: true,
          start: Number(match[1]),
          listMarkerDelimiter: match[2],
        }),
        joinPredicate: (_match, node) => node.attrs.ordered === true,
      }),
      // Task list: - [ ] or - [x]
      new InputRule({
        find: /^\s*[-*+]\s\[([ xX])\]\s$/,
        handler: ({ state, range, match }) => {
          const listType = state.schema.nodes.list;
          if (!listType) return null;

          const checked = match[1] !== ' ';
          const tr = state.tr.delete(range.from, range.to);

          const $start = tr.doc.resolve(range.from);
          const blockRange = $start.blockRange();
          if (!blockRange) return null;

          const wrapping = findWrapping(blockRange, listType, { ordered: false });
          if (!wrapping) return null;

          tr.wrap(blockRange, wrapping);

          // Find the newly created listItem and set checked
          const $newPos = tr.doc.resolve(tr.mapping.map(range.from));
          for (let d = $newPos.depth; d > 0; d--) {
            const parentNode = $newPos.node(d);
            if (parentNode.type.name === 'listItem') {
              tr.setNodeMarkup($newPos.before(d), undefined, {
                ...parentNode.attrs,
                checked,
              });
              break;
            }
          }
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-8': () => this.editor.commands.toggleBulletList(),
      'Mod-Shift-7': () => this.editor.commands.toggleOrderedList(),
      'Mod-Shift-9': () => this.editor.commands.toggleTaskList(),
    };
  },
});

// ────────────────────────── ListItem Node ──────────────────────────

// Do NOT lower this extension's priority below TipTap's built-in `Keymap`
// (default 100) — Keymap binds Enter → splitBlock, and at priority < 100 it
// wins the chain and splits the listItem's paragraph in place, producing a
// second `<p>` inside the same `<li>` instead of a new list item. The
// default priority (100) matches stock TipTap and lets our splitListItem
// run first; a previous `priority: 60` here regressed Enter on every list
// type.
export const ListItemNode = Node.create({
  name: 'listItem',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      checked: { default: null },
      spread: { default: false },
      // Source-form fidelity attrs captured at parse time; null = canonical form. sourceMarkerSpacing is the
      // space run between marker and content (`-  item` → 2);
      // sourceOrdinal the typed ordered ordinal (`1. a\n1. b` → both 1);
      // sourceCheckboxChar 'X' for the uppercase task checkbox;
      // sourceContinuationIndent the nested-list continuation indent
      // (`- a\n    - b` → 4).
      sourceMarkerSpacing: { default: null, rendered: false },
      sourceOrdinal: { default: null, rendered: false },
      sourceCheckboxChar: { default: null, rendered: false },
      sourceContinuationIndent: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'li',
        getAttrs: (el) => {
          const checkbox = (el as HTMLElement).querySelector('input[type="checkbox"]');
          return {
            checked: checkbox ? (checkbox as HTMLInputElement).checked : null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    if (node.attrs.checked !== null) {
      return [
        'li',
        mergeAttributes(HTMLAttributes, {
          'data-type': 'taskItem',
          'data-checked': node.attrs.checked ? 'true' : 'false',
        }),
        [
          'label',
          { contenteditable: 'false' },
          [
            'input',
            {
              type: 'checkbox',
              ...(node.attrs.checked ? { checked: 'checked' } : {}),
            },
          ],
        ],
        ['div', 0],
      ];
    }
    return ['li', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ({ node, getPos, editor, HTMLAttributes }) => {
      const li = document.createElement('li');
      Object.entries(
        mergeAttributes(
          HTMLAttributes,
          node.attrs.checked !== null
            ? { 'data-type': 'taskItem', 'data-checked': String(!!node.attrs.checked) }
            : {},
        ),
      ).forEach(([key, val]) => {
        if (val != null) li.setAttribute(key, String(val));
      });

      let checkboxLabel: HTMLLabelElement | null = null;
      let checkbox: HTMLInputElement | null = null;
      const contentDiv = document.createElement('div');

      // `disabled` must mirror editability, not snapshot it at creation. A pure
      // setEditable() flip updates view.editable without a doc change, so
      // ProseMirror never calls this NodeView's update() — a checkbox created
      // while read-only (e.g. content injected before the editor goes live)
      // would stay disabled forever. setEditable() emits 'update', so resync on
      // it (and in update() below for any silent editability change).
      const syncDisabled = () => {
        if (checkbox) checkbox.disabled = !editor.isEditable;
      };

      if (node.attrs.checked !== null) {
        checkboxLabel = document.createElement('label');
        checkboxLabel.contentEditable = 'false';

        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!node.attrs.checked;
        syncDisabled();
        editor.on('update', syncDisabled);

        checkbox.addEventListener('change', () => {
          const pos = getPos();
          if (pos === undefined || typeof pos !== 'number') return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: checkbox?.checked ?? false,
            }),
          );
        });

        checkboxLabel.appendChild(checkbox);
        li.appendChild(checkboxLabel);
      }

      li.appendChild(contentDiv);

      return {
        dom: li,
        contentDOM: contentDiv,
        update(updatedNode: PmNode) {
          if (updatedNode.type !== node.type) return false;
          // Handle transition to/from task mode
          if ((updatedNode.attrs.checked !== null) !== (node.attrs.checked !== null)) {
            return false; // force re-create
          }
          if (checkbox && updatedNode.attrs.checked !== null) {
            checkbox.checked = !!updatedNode.attrs.checked;
            checkbox.disabled = !editor.isEditable;
            li.setAttribute('data-checked', String(!!updatedNode.attrs.checked));
          }
          node = updatedNode;
          return true;
        },
        destroy() {
          editor.off('update', syncDisabled);
        },
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => {
        // Only handle Tab when the cursor is inside a listItem — otherwise
        // pass through so other extensions (e.g., table) can handle it.
        const { $from } = this.editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'listItem') {
            return this.editor.commands.sinkListItem(this.name);
          }
        }
        return false;
      },
      'Shift-Tab': () => {
        const { $from } = this.editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'listItem') {
            return this.editor.commands.liftListItem(this.name);
          }
        }
        return false;
      },
    };
  },
});

/**
 * Combined export for registration in shared.ts.
 * Register both ListNode and ListItemNode to get the full list experience.
 */
export const List = ListNode;
export const ListItem = ListItemNode;
