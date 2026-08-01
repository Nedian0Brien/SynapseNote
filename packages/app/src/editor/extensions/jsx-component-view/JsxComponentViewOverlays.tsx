import { Trans, useLingui } from '@lingui/react/macro';
import type { ComponentProps } from 'react';
import { Button } from '../../../components/ui/button';
import { PopoverContent } from '../../../components/ui/popover';
import { CodePreviewEditModal } from '../../components/CodePreviewEditModal';
import { PropPanel } from '../../components/PropPanel';
import type { JsxComponentDescriptor } from '../../registry/types';

type EditableSource = { propName: string; language: 'mermaid' | 'latex' } | null;

/** Owns the editing modal and property popover after their interaction handlers are assembled. */
export function JsxComponentViewOverlays({
  currentProps,
  descriptor,
  editModalOpen,
  editableSource,
  hasEditableProps,
  onCloseAutoFocus,
  onDismiss,
  onModalSave,
  onPropChange,
  pos,
  primitiveProps,
  renderProps,
  setEditModalOpen,
  showPlaceholder,
}: {
  currentProps: Record<string, unknown>;
  descriptor: JsxComponentDescriptor;
  editModalOpen: boolean;
  editableSource: EditableSource;
  hasEditableProps: boolean;
  onCloseAutoFocus: ComponentProps<typeof PopoverContent>['onCloseAutoFocus'];
  onDismiss: () => void;
  onModalSave: (propName: string, value: string) => void;
  onPropChange: (propName: string, value: unknown) => void;
  pos: number | undefined;
  primitiveProps: Record<string, unknown>;
  renderProps: Record<string, unknown>;
  setEditModalOpen: (open: boolean) => void;
  showPlaceholder: boolean;
}) {
  const { t } = useLingui();
  const descriptorLabel = descriptor.displayName ?? descriptor.name;

  return (
    <>
      {editableSource && typeof pos === 'number' ? (
        <CodePreviewEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          initialValue={
            typeof currentProps[editableSource.propName] === 'string'
              ? (currentProps[editableSource.propName] as string)
              : ''
          }
          language={editableSource.language}
          title={t`Edit ${descriptorLabel} source`}
          renderPreview={(value) => {
            const Component = descriptor.Component;
            const previewProps = {
              ...renderProps,
              [editableSource.propName]: value,
              ...(descriptor.name === 'MermaidFence' && {
                className: 'border-0 bg-transparent rounded-none',
              }),
            };
            return (
              <div className="flex h-full w-full items-center justify-center p-4">
                <Component {...previewProps} />
              </div>
            );
          }}
          onSave={(value) => onModalSave(editableSource.propName, value)}
        />
      ) : null}
      {hasEditableProps && (
        <PopoverContent
          side={showPlaceholder ? 'bottom' : 'right'}
          align={showPlaceholder ? 'center' : 'start'}
          sideOffset={showPlaceholder ? -4 : 8}
          className="w-64 p-3 z-60 overflow-y-auto subtle-scrollbar max-h-(--radix-popper-available-height) overscroll-contain"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="text-xs font-medium text-muted-foreground mb-2">
            <Trans>{descriptorLabel} Properties</Trans>
          </div>
          <PropPanel
            descriptor={descriptor}
            values={primitiveProps}
            onDismiss={onDismiss}
            onChange={onPropChange}
          />
          <div className="mt-3 flex justify-end border-t border-border pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-7 px-3 text-xs"
            >
              <Trans>Done</Trans>
            </Button>
          </div>
        </PopoverContent>
      )}
    </>
  );
}
