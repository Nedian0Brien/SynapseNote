import {
  incrementJsxKeyboardDeleteFailed,
  incrementJsxPopoverCloseRestoreFailed,
} from '@nedian0brien/synapsenote-core';
import type { NodeViewProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { markUserTyping } from '../../observers';
import { consumeAutoOpen } from '../../slash-command/component-items';
import { updateElementJsxProps } from './jsx-component-view-attribute-policy';
import {
  shouldHandleJsxNodeViewKey,
  shouldSelectJsxLeafFromBodyClick,
} from './jsx-component-view-interaction-policy';
import { getElementJsxAttrs, isJsxInteractiveTarget } from './jsx-component-view-utils';

type InteractionDescriptor = {
  name: string;
};

/** Owns NodeView-local controls without taking ownership of rendered chrome. */
export function useJsxComponentViewInteractions({
  descriptor,
  editor,
  getPos,
  hasEditableProps,
  isInnermostSelected,
  isSelfClosingLeaf,
  node,
  pos,
  selectOnBodyClick,
  selected,
  showPlaceholder,
}: Pick<NodeViewProps, 'editor' | 'getPos' | 'node' | 'selected'> & {
  descriptor: InteractionDescriptor;
  hasEditableProps: boolean;
  isInnermostSelected: boolean;
  isSelfClosingLeaf: boolean;
  pos: number | undefined;
  selectOnBodyClick: boolean;
  showPlaceholder: boolean;
}) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wasSelected = useRef(false);

  useEffect(() => {
    if (selected && !wasSelected.current && hasEditableProps && consumeAutoOpen(pos)) {
      setPopoverOpen(true);
    }
    wasSelected.current = selected;
  }, [selected, hasEditableProps, pos]);

  const handleBodyClick = (event: MouseEvent<HTMLDivElement>) => {
    if (showPlaceholder) return;
    if (!isSelfClosingLeaf || !selectOnBodyClick) return;
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target)) return;
    if (target.closest('.jsx-component-chrome')) return;
    if (target.closest('.jsx-add-child-pill, .jsx-empty-child-placeholder')) return;
    if (isJsxInteractiveTarget(target)) return;
    if (typeof pos !== 'number') return;
    const currentNode = editor.state.doc.nodeAt(pos);
    if (!currentNode) return;
    const selectionIsInsideNode =
      editor.state.selection.from >= pos &&
      editor.state.selection.from < pos + currentNode.nodeSize;
    if (
      !shouldSelectJsxLeafFromBodyClick({
        isInteractiveTarget: false,
        isSelfClosingLeaf,
        selectOnBodyClick,
        selectionIsInsideNode,
        targetIsActionPill: false,
        targetIsChrome: false,
        targetIsInsideWrapper: true,
      })
    ) {
      return;
    }
    editor.chain().focus().setNodeSelection(pos).run();
  };

  const openPanel = () => {
    const livePos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof livePos !== 'number') return;
    editor.chain().focus().setNodeSelection(livePos).run();
    setPopoverOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const keyAction = shouldHandleJsxNodeViewKey({
      hasEditableProps,
      inTextInput: target.matches('input, textarea'),
      isInnermostSelected,
      isSelected: selected,
      key: event.key,
    });

    if (keyAction === 'delete') {
      if (!event.currentTarget.contains(target)) return;
      const livePos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof livePos !== 'number') return;
      event.preventDefault();
      try {
        const dispatched = editor.chain().focus().setNodeSelection(livePos).deleteSelection().run();
        if (!dispatched) {
          incrementJsxKeyboardDeleteFailed(descriptor.name);
          console.warn(
            JSON.stringify({
              event: 'jsx-component-keyboard-delete-failed',
              component: descriptor.name,
              rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
              reason: 'chain-dispatch-returned-false',
            }),
          );
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        incrementJsxKeyboardDeleteFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-keyboard-delete-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: error.message.slice(0, 500),
          }),
        );
      }
      return;
    }

    if (keyAction !== 'popover') return;
    if (target.closest('.jsx-component-chrome')) return;
    if (target.closest('input, textarea, select, button')) return;
    event.preventDefault();
    setPopoverOpen(true);
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setPopoverOpen(open);
    if (open) return;
    requestAnimationFrame(() => {
      const livePos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof livePos !== 'number') return;
      try {
        const currentNode = editor.state.doc.nodeAt(livePos);
        if (!currentNode) return;
        const nodeEnd = livePos + currentNode.nodeSize;
        const selectionFrom = editor.state.selection.from;
        if (selectionFrom < livePos || selectionFrom >= nodeEnd) return;
        if (isSelfClosingLeaf) {
          const $end = editor.state.doc.resolve(Math.min(nodeEnd, editor.state.doc.content.size));
          const nextSelection = TextSelection.near($end, 1);
          editor.view.dispatch(editor.state.tr.setSelection(nextSelection).scrollIntoView());
        } else {
          editor.chain().setNodeSelection(livePos).run();
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        incrementJsxPopoverCloseRestoreFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-popover-close-restore-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: error.message.slice(0, 500),
          }),
        );
      }
    });
  };

  const handleCloseAutoFocus = isSelfClosingLeaf
    ? (event: { preventDefault: () => void }) => {
        event.preventDefault();
        editor.view.focus();
      }
    : undefined;

  const handleModalSave = (propName: string, value: string) => {
    const livePos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof livePos !== 'number') return;
    const currentNode = editor.state.doc.nodeAt(livePos);
    if (!currentNode) return;
    const elementAttrs = getElementJsxAttrs(currentNode.attrs);
    if (!elementAttrs) return;
    try {
      const nextAttrs = updateElementJsxProps(elementAttrs, propName, value);
      editor.view.dispatch(editor.state.tr.setNodeMarkup(livePos, null, nextAttrs));
      markUserTyping();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      console.warn('[JsxComponentView] edit-save failed — position race', error);
    }
  };

  const handlePropChange = (propName: string, value: unknown) => {
    const livePos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof livePos !== 'number') return;
    const currentNode = editor.state.doc.nodeAt(livePos);
    if (!currentNode) return;
    const elementAttrs = getElementJsxAttrs(currentNode.attrs);
    if (!elementAttrs) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(
        livePos,
        null,
        updateElementJsxProps(elementAttrs, propName, value),
      ),
    );
    markUserTyping();
  };

  return {
    editModalOpen,
    handleBodyClick,
    handleCloseAutoFocus,
    handleKeyDown,
    handleModalSave,
    handlePopoverOpenChange,
    handlePropChange,
    openPanel,
    popoverOpen,
    setEditModalOpen,
    setPopoverOpen,
  };
}
