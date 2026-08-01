import { Trans } from '@lingui/react/macro';
import { incrementJsxRenderFailure } from '@nedian0brien/synapsenote-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { PopoverAnchor } from '../../../components/ui/popover';
import { OPT_OUT_ATTR } from '../../clipboard';
import { DescriptorPlaceholder } from '../../components/DescriptorPlaceholder';
import { JsxComponentHostProvider } from '../../components/jsx-host-context';
import { getDescriptor } from '../../registry';
import type { JsxComponentDescriptor } from '../../registry/types';
import { createChildNode, focusInsertedComponent } from '../../slash-command/component-items';

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  descriptorName: string;
  onError: (error: Error) => void;
  rawComponentName: string;
  resetKey: string;
}

function ComponentErrorFallback({ children }: FallbackProps & { children?: ReactNode }) {
  return <div className="jsx-component-error-fallback">{children}</div>;
}

function ComponentErrorBoundary({
  children,
  descriptorName,
  onError,
  rawComponentName,
  resetKey,
}: ComponentErrorBoundaryProps) {
  return (
    <ErrorBoundary
      resetKeys={[resetKey]}
      onError={(error, info) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          JSON.stringify({
            event: 'jsx-render-failure',
            component: descriptorName,
            rawComponentName: String(rawComponentName ?? '').slice(0, 200),
            error: String(normalizedError),
            stack: info.componentStack,
          }),
        );
        incrementJsxRenderFailure(descriptorName);
        onError(normalizedError);
      }}
      fallbackRender={(fallbackProps) => (
        <ComponentErrorFallback {...fallbackProps}>{children}</ComponentErrorFallback>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/** Renders the live descriptor, placeholder surface, and child-slot affordance. */
export function JsxComponentViewContent({
  descriptor,
  editor,
  getPos,
  isInnermostSelected,
  node,
  onOpenPanel,
  onRenderError,
  renderProps,
  resetKey,
  resolvedPlaceholder,
  showPlaceholder,
}: Pick<NodeViewProps, 'editor' | 'getPos' | 'node'> & {
  descriptor: JsxComponentDescriptor;
  isInnermostSelected: boolean;
  onOpenPanel: () => void;
  onRenderError: (error: Error) => void;
  renderProps: Record<string, unknown>;
  resetKey: string;
  resolvedPlaceholder: { Icon: LucideIcon; label: string } | null;
  showPlaceholder: boolean;
}) {
  const Component = descriptor.Component;
  const insertChildAt = () => {
    const position = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
    return position + 1 + node.content.size;
  };
  const addChild = () => {
    const childName = descriptor.emptyChildName as string;
    const childJSON = createChildNode(childName);
    const insertPosition = insertChildAt();
    editor.chain().focus().insertContentAt(insertPosition, childJSON).run();
    focusInsertedComponent(editor, insertPosition, getDescriptor(childName));
  };

  return (
    <>
      {showPlaceholder && resolvedPlaceholder ? (
        <PopoverAnchor asChild>
          <DescriptorPlaceholder
            label={resolvedPlaceholder.label}
            Icon={resolvedPlaceholder.Icon}
            onClick={onOpenPanel}
            selected={isInnermostSelected}
          />
        </PopoverAnchor>
      ) : (
        <ComponentErrorBoundary
          resetKey={resetKey}
          onError={onRenderError}
          descriptorName={descriptor.name === '*' ? 'wildcard' : descriptor.name}
          rawComponentName={(node.attrs.componentName as string) ?? ''}
        >
          <JsxComponentHostProvider
            value={
              typeof getPos === 'function'
                ? {
                    editor,
                    getPos: () => {
                      const position = getPos();
                      return typeof position === 'number' ? position : undefined;
                    },
                    addChild: descriptor.emptyChildName ? addChild : null,
                  }
                : null
            }
          >
            <Component {...renderProps}>
              <NodeViewContent
                className={`component-children ${
                  !descriptor.hasChildren && node.childCount === 0 ? 'min-h-0 m-0 p-0' : ''
                }`}
                {...(!descriptor.hasChildren || descriptor.isSelfClosing
                  ? { contentEditable: false }
                  : {})}
              />
            </Component>
          </JsxComponentHostProvider>
        </ComponentErrorBoundary>
      )}

      {descriptor.emptyChildName && !(descriptor.name === 'Tabs' && node.childCount > 0) && (
        <button
          type="button"
          contentEditable={false}
          className={node.childCount === 0 ? 'jsx-empty-child-placeholder' : 'jsx-add-child-pill'}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={addChild}
          {...{ [OPT_OUT_ATTR]: 'true' }}
        >
          <span>
            <Trans>+ Add {descriptor.emptyChildName}</Trans>
          </span>
        </button>
      )}
    </>
  );
}
