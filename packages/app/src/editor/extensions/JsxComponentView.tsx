/** React NodeView facade: assemble descriptor state and delegate interactions and rendered surfaces. */
import { useLingui } from '@lingui/react/macro';
import {
  incrementJsxStuckCopyFailed,
  incrementJsxStuckDeleteFailed,
} from '@nedian0brien/synapsenote-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { Popover } from '../../components/ui/popover';
import { OPT_OUT_ATTR } from '../clipboard';
import { getEditorDocName } from '../extensions/doc-context';
import { normalizeDocRelativeMediaRenderProps } from '../extensions/media-render-props';
import { getDescriptor } from '../registry';
import {
  resolveDescriptorPlaceholder,
  shouldRenderPlaceholder,
} from '../registry/resolve-descriptor-placeholder';
import { ALIGNABLE_DESCRIPTOR_NAMES } from '../utils/alignable-descriptors';
import { formatContainerAriaLabel } from '../utils/editor-strings';
import { reconstructSource } from '../utils/reconstruct-source';
import { JsxComponentViewChrome } from './jsx-component-view/JsxComponentViewChrome';
import { JsxComponentViewContent } from './jsx-component-view/JsxComponentViewContent';
import { JsxComponentViewOverlays } from './jsx-component-view/JsxComponentViewOverlays';
import { deriveJsxAttributePolicy } from './jsx-component-view/jsx-component-view-attribute-policy';
import { extractPrimitiveProps, stableHash } from './jsx-component-view/jsx-component-view-utils';
import { useJsxComponentViewInteractions } from './jsx-component-view/use-jsx-component-view-interactions';
import { useJsxComponentViewLifecycle } from './jsx-component-view/use-jsx-component-view-lifecycle';

export {
  extractPrimitiveProps,
  getElementJsxAttrs,
  isJsxInteractiveTarget,
  stableHash,
} from './jsx-component-view/jsx-component-view-utils';

export function JsxComponentView({ node, editor, extension, getPos, selected }: NodeViewProps) {
  const { t } = useLingui();
  const descriptor = getDescriptor(node.attrs.componentName as string);
  const lifecycle = useJsxComponentViewLifecycle({ descriptor, editor, getPos, node, selected });
  const {
    canMoveDown,
    canMoveUp,
    hasChildSelected,
    isChildOfComponent,
    isDraggingSelf,
    isInnermostSelected,
    isRangeEncompassed,
    needsConversion,
    pos,
    selectionOrigin,
    setRenderError,
    stuck,
  } = lifecycle;
  const currentProps = (node.attrs.props as Record<string, unknown>) ?? {};
  const hasEditableProps = descriptor.props.some(
    (prop) => !('hidden' in prop && prop.hidden) && prop.type !== 'reactnode',
  );
  const attributePolicy = deriveJsxAttributePolicy({
    currentProps,
    isAlignable: ALIGNABLE_DESCRIPTOR_NAMES.has(descriptor.name),
    props: descriptor.props,
  });
  const needsConfig = hasEditableProps && attributePolicy.needsConfig;
  const showPlaceholder = shouldRenderPlaceholder(descriptor, currentProps);
  const resolvedPlaceholder = showPlaceholder ? resolveDescriptorPlaceholder(descriptor) : null;
  const isSelfClosingLeaf = !descriptor.hasChildren || Boolean(descriptor.isSelfClosing);
  const selectOnBodyClick = descriptor.interaction?.selectOnBodyClick ?? true;
  const usesExplicitDragHandle = descriptor.interaction?.drag === 'handle';
  const editableSource: { propName: string; language: 'mermaid' | 'latex' } | null =
    descriptor.name === 'MermaidFence'
      ? { propName: 'chart', language: 'mermaid' }
      : descriptor.name === 'Math' ||
          descriptor.name === 'DollarMath' ||
          descriptor.name === 'MathFence'
        ? { propName: 'formula', language: 'latex' }
        : null;
  const {
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
  } = useJsxComponentViewInteractions({
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
  });
  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.reactNodePropNames);
  const translatedProps =
    descriptor.surface === 'compat' ? descriptor.translateProps(primitiveProps) : primitiveProps;
  const configuredDocName = (extension.options as { docName?: unknown }).docName;
  const sourceDocName =
    typeof configuredDocName === 'string' && configuredDocName
      ? configuredDocName
      : getEditorDocName(editor);
  const renderProps = normalizeDocRelativeMediaRenderProps(
    descriptor.name,
    translatedProps,
    sourceDocName,
  );
  const resetKey = `${descriptor.name}::${stableHash(primitiveProps)}`;

  if (stuck) {
    const componentName = node.attrs.componentName as string;
    const descriptorLabel = descriptor.displayName ?? descriptor.name;
    const label =
      descriptor.name === '*'
        ? t`<${componentName}> isn't a known component. Copy the source to use it elsewhere, or delete the block.`
        : t`<${descriptorLabel}> failed to render (likely a bad prop). Copy the source to see what went wrong, or delete the block.`;
    const copySource = () => {
      try {
        const source = reconstructSource(node);
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(source);
        }
      } catch (error) {
        incrementJsxStuckCopyFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-stuck-copy-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason:
              error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          }),
        );
      }
    };
    const deleteNode = () => {
      const livePos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof livePos !== 'number') return;
      try {
        editor.chain().focus().setNodeSelection(livePos).deleteSelection().run();
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        incrementJsxStuckDeleteFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-stuck-delete-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: error.message.slice(0, 500),
          }),
        );
      }
    };
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div
          className="text-xs font-mono text-muted-foreground px-2 py-2 border border-destructive/40 rounded bg-destructive/5 flex items-center gap-2"
          contentEditable={false}
          {...{ [OPT_OUT_ATTR]: 'true' }}
        >
          <span className="flex-1">{label}</span>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={copySource}
          >
            {t`Copy source`}
          </button>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={deleteNode}
          >
            {t`Delete`}
          </button>
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  if (needsConversion) {
    const componentName = node.attrs.componentName as string;
    const descriptorLabel = descriptor.displayName ?? descriptor.name;
    const label =
      descriptor.name === '*'
        ? t`Unknown component: ${componentName} — source editable below`
        : t`${descriptorLabel} — render error, source editable below`;
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div className="text-xs font-mono text-muted-foreground px-2 py-1" contentEditable={false}>
          {label}
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  const componentLabel = descriptor.displayName ?? descriptor.name;
  const isGroupContainer = Boolean(descriptor.emptyChildName);
  const groupAriaLabel = isGroupContainer
    ? formatContainerAriaLabel(componentLabel, descriptor.emptyChildName, node.childCount)
    : undefined;

  return (
    <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
      <NodeViewWrapper
        className="jsx-component-wrapper my-2"
        data-jsx-component=""
        data-component-type={descriptor.name.toLowerCase()}
        data-align={attributePolicy.dataAlign}
        data-selected={isInnermostSelected ? 'true' : undefined}
        data-has-child-selected={hasChildSelected ? 'true' : undefined}
        data-range-selected={isRangeEncompassed ? 'true' : undefined}
        data-selection-origin={selectionOrigin}
        data-dragging={isDraggingSelf ? 'true' : undefined}
        data-needs-config={needsConfig ? 'true' : undefined}
        role={isGroupContainer ? 'group' : undefined}
        aria-label={groupAriaLabel}
        tabIndex={isInnermostSelected ? 0 : -1}
        {...(!isChildOfComponent && !usesExplicitDragHandle
          ? { 'data-drag-handle': '', draggable: 'true' }
          : {
              draggable: 'false',
              onDragStart: (event: React.DragEvent) => event.preventDefault(),
            })}
        data-component-name={descriptor.name}
        data-jsx-interaction={descriptor.interaction?.mode ?? 'atomic'}
        data-pdf-math-formula={
          editableSource?.language === 'latex' &&
          typeof currentProps[editableSource.propName] === 'string'
            ? currentProps[editableSource.propName]
            : undefined
        }
        onClick={handleBodyClick}
        onKeyDown={handleKeyDown}
      >
        <JsxComponentViewChrome
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          descriptor={descriptor}
          editableSource={editableSource}
          editor={editor}
          hasEditableProps={hasEditableProps}
          node={node}
          pos={pos}
          primitiveProps={primitiveProps}
          setEditModalOpen={setEditModalOpen}
          usesExplicitDragHandle={usesExplicitDragHandle}
        />
        <JsxComponentViewContent
          descriptor={descriptor}
          editor={editor}
          getPos={getPos}
          isInnermostSelected={isInnermostSelected}
          node={node}
          onOpenPanel={openPanel}
          onRenderError={setRenderError}
          renderProps={renderProps}
          resetKey={resetKey}
          resolvedPlaceholder={resolvedPlaceholder}
          showPlaceholder={showPlaceholder}
        />
      </NodeViewWrapper>
      <JsxComponentViewOverlays
        currentProps={currentProps}
        descriptor={descriptor}
        editModalOpen={editModalOpen}
        editableSource={editableSource}
        hasEditableProps={hasEditableProps}
        onCloseAutoFocus={handleCloseAutoFocus}
        onDismiss={() => setPopoverOpen(false)}
        onModalSave={handleModalSave}
        onPropChange={handlePropChange}
        pos={pos}
        primitiveProps={primitiveProps}
        renderProps={renderProps}
        setEditModalOpen={setEditModalOpen}
        showPlaceholder={showPlaceholder}
      />
    </Popover>
  );
}
