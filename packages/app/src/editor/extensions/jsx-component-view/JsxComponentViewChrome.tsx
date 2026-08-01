import { useLingui } from '@lingui/react/macro';
import {
  incrementJsxKeyboardDeleteFailed,
  incrementJsxMoveFailed,
} from '@nedian0brien/synapsenote-core';
import type { NodeViewProps } from '@tiptap/core';
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Settings2, Trash2 } from 'lucide-react';
import { hashFromDocName } from '@/lib/doc-hash';
import { PopoverTrigger } from '../../../components/ui/popover';
import { OPT_OUT_ATTR } from '../../clipboard';
import type { JsxComponentDescriptor } from '../../registry/types';

type EditableSource = { propName: string; language: 'mermaid' | 'latex' } | null;

/** Hover chrome owns descriptor actions; the NodeView facade owns placement and state assembly. */
export function JsxComponentViewChrome({
  canMoveDown,
  canMoveUp,
  descriptor,
  editableSource,
  editor,
  hasEditableProps,
  node,
  pos,
  primitiveProps,
  setEditModalOpen,
  usesExplicitDragHandle,
}: Pick<NodeViewProps, 'editor' | 'node'> & {
  canMoveDown: boolean;
  canMoveUp: boolean;
  descriptor: JsxComponentDescriptor;
  editableSource: EditableSource;
  hasEditableProps: boolean;
  pos: number | undefined;
  primitiveProps: Record<string, unknown>;
  setEditModalOpen: (open: boolean) => void;
  usesExplicitDragHandle: boolean;
}) {
  const { t } = useLingui();
  const descriptorLabel = descriptor.displayName ?? descriptor.name;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView
    <div
      className="jsx-component-chrome"
      contentEditable={false}
      onMouseDown={(event) => event.stopPropagation()}
      {...(usesExplicitDragHandle
        ? {
            'data-jsx-drag-handle': '',
            'data-drag-handle': '',
            draggable: 'true',
          }
        : {})}
      {...{ [OPT_OUT_ATTR]: 'true' }}
    >
      {descriptor.name === 'Embed' &&
        typeof primitiveProps.src === 'string' &&
        /^https?:\/\//i.test(primitiveProps.src) && (
          <a
            href={primitiveProps.src as string}
            target="_blank"
            rel="noopener noreferrer"
            className="jsx-chrome-btn"
            aria-label={t`Open embedded URL in new tab`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}

      {descriptor.name === 'Mirror' &&
        typeof primitiveProps.src === 'string' &&
        primitiveProps.src.length > 0 &&
        (() => {
          const mirrorSrc = primitiveProps.src as string;
          return (
            <a
              href={hashFromDocName(
                mirrorSrc,
                typeof primitiveProps.anchor === 'string' && primitiveProps.anchor.length > 0
                  ? primitiveProps.anchor
                  : null,
              )}
              className="jsx-chrome-btn"
              aria-label={t`Open source doc: ${mirrorSrc}`}
              title={t`Open source: ${mirrorSrc}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          );
        })()}

      {canMoveUp && (
        <button
          type="button"
          className="jsx-chrome-btn"
          aria-label={t`Move up`}
          onClick={() => {
            try {
              if (typeof pos !== 'number') return;
              const $pos = editor.state.doc.resolve(pos);
              const index = $pos.index($pos.depth);
              if (index === 0) return;
              const parent = $pos.node($pos.depth);
              const previous = parent.child(index - 1);
              const from = pos - previous.nodeSize;
              const to = pos + node.nodeSize;
              const transaction = editor.state.tr;
              const current = editor.state.doc.slice(pos, pos + node.nodeSize);
              const before = editor.state.doc.slice(from, pos);
              transaction.replaceWith(from, to, current.content.append(before.content));
              editor.view.dispatch(transaction.scrollIntoView());
            } catch (error) {
              if (!(error instanceof RangeError)) throw error;
              incrementJsxMoveFailed('up');
              console.warn(
                JSON.stringify({
                  event: 'jsx-component-move-failed',
                  direction: 'up',
                  component: descriptor.name,
                  rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                  reason: error.message.slice(0, 500),
                }),
              );
            }
          }}
        >
          <ArrowUp size={12} aria-hidden="true" />
        </button>
      )}

      {canMoveDown && (
        <button
          type="button"
          className="jsx-chrome-btn"
          aria-label={t`Move down`}
          onClick={() => {
            try {
              if (typeof pos !== 'number') return;
              const $pos = editor.state.doc.resolve(pos);
              const index = $pos.index($pos.depth);
              const parent = $pos.node($pos.depth);
              if (index >= parent.childCount - 1) return;
              const next = parent.child(index + 1);
              const from = pos;
              const to = pos + node.nodeSize + next.nodeSize;
              const transaction = editor.state.tr;
              const current = editor.state.doc.slice(pos, pos + node.nodeSize);
              const following = editor.state.doc.slice(pos + node.nodeSize, to);
              transaction.replaceWith(from, to, following.content.append(current.content));
              editor.view.dispatch(transaction.scrollIntoView());
            } catch (error) {
              if (!(error instanceof RangeError)) throw error;
              incrementJsxMoveFailed('down');
              console.warn(
                JSON.stringify({
                  event: 'jsx-component-move-failed',
                  direction: 'down',
                  component: descriptor.name,
                  rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                  reason: error.message.slice(0, 500),
                }),
              );
            }
          }}
        >
          <ArrowDown size={12} aria-hidden="true" />
        </button>
      )}

      {editableSource && typeof pos === 'number' ? (
        <button
          type="button"
          className="jsx-chrome-btn"
          aria-label={t`Edit ${descriptorLabel} source`}
          data-testid="jsx-component-edit-btn"
          onClick={() => setEditModalOpen(true)}
        >
          <Pencil size={12} aria-hidden="true" />
        </button>
      ) : null}

      <button
        type="button"
        className="jsx-chrome-btn jsx-chrome-btn--delete"
        aria-label={t`Delete ${descriptorLabel}`}
        onClick={() => {
          if (typeof pos !== 'number') return;
          try {
            const dispatched = editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
            if (!dispatched) {
              incrementJsxKeyboardDeleteFailed(descriptor.name);
              console.warn(
                JSON.stringify({
                  event: 'jsx-component-chrome-delete-failed',
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
                event: 'jsx-component-chrome-delete-failed',
                component: descriptor.name,
                rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                reason: error.message.slice(0, 500),
              }),
            );
          }
        }}
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>

      {hasEditableProps && (
        <PopoverTrigger asChild>
          <button
            type="button"
            className="jsx-chrome-btn"
            data-jsx-gear=""
            aria-label={t`${descriptorLabel} properties`}
          >
            <Settings2 size={12} aria-hidden="true" />
          </button>
        </PopoverTrigger>
      )}
    </div>
  );
}
