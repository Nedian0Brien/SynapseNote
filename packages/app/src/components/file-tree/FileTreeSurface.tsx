import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import type { ComponentProps, DragEvent, MutableRefObject, ReactNode } from 'react';
import { classifyEmptyTree, type FileEntry } from '@/components/file-tree-utils';
import { FileTreeEmptyState } from './FileTreeEmptyState';
import { FileTreeMenu } from './FileTreeMenu';
import { FileTreeHeaderNotice, FileTreeSkeleton } from './FileTreePresentation';
import { FileTreeViewport } from './FileTreeViewport';

type Props = {
  loading: boolean;
  documents: readonly FileEntry[];
  error: string | null;
  reconnecting: boolean;
  relaunchInFlight: boolean;
  truncatedShownCount: number | null;
  showHiddenFiles: boolean;
  showOnlyMarkdownFiles: boolean;
  unfilteredRootEntryCount: number;
  pageCount: number;
  emptyExternalFileDropActive: boolean;
  onEmptyExternalFileDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onEmptyExternalFileDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onEmptyExternalFileDrop: (event: DragEvent<HTMLDivElement>) => void;
  onCreateFirstFile: () => void;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  model: PierreFileTreeModel;
  resolvedTheme: string | undefined;
  creationDirCleared: boolean;
  onContentHeightChange?: (px: number) => void;
  onClickCapture: ComponentProps<typeof FileTreeViewport>['onClickCapture'];
  onMouseMove: ComponentProps<typeof FileTreeViewport>['onMouseMove'];
  onMouseLeave: ComponentProps<typeof FileTreeViewport>['onMouseLeave'];
  workspace: ComponentProps<typeof FileTreeMenu>['workspace'];
  handoff: ComponentProps<typeof FileTreeMenu>['handoff'];
  okignoreBinding: ComponentProps<typeof FileTreeMenu>['okignoreBinding'];
  onStartCreating: ComponentProps<typeof FileTreeMenu>['onStartCreating'];
  onCreateFromTemplate: ComponentProps<typeof FileTreeMenu>['onCreateFromTemplate'];
  onDuplicate: ComponentProps<typeof FileTreeMenu>['onDuplicate'];
  onDelete: ComponentProps<typeof FileTreeMenu>['onDelete'];
  onExpandSubtree: ComponentProps<typeof FileTreeMenu>['onExpandSubtree'];
  onCollapseSubtree: ComponentProps<typeof FileTreeMenu>['onCollapseSubtree'];
  folderTreePaths: readonly string[];
  assetTreePaths: ReadonlySet<string>;
  anyActionBusy: boolean;
  dialogs: ReactNode;
};

/** Chooses the loading, empty, and populated file-tree surfaces without owning tree state. */
export function FileTreeSurface({
  loading,
  documents,
  error,
  reconnecting,
  relaunchInFlight,
  truncatedShownCount,
  showHiddenFiles,
  showOnlyMarkdownFiles,
  unfilteredRootEntryCount,
  pageCount,
  emptyExternalFileDropActive,
  onEmptyExternalFileDragOver,
  onEmptyExternalFileDragLeave,
  onEmptyExternalFileDrop,
  onCreateFirstFile,
  hostRef,
  model,
  resolvedTheme,
  creationDirCleared,
  onContentHeightChange,
  onClickCapture,
  onMouseMove,
  onMouseLeave,
  workspace,
  handoff,
  okignoreBinding,
  onStartCreating,
  onCreateFromTemplate,
  onDuplicate,
  onDelete,
  onExpandSubtree,
  onCollapseSubtree,
  folderTreePaths,
  assetTreePaths,
  anyActionBusy,
  dialogs,
}: Props) {
  const { t, i18n } = useLingui();
  if (loading) return <FileTreeSkeleton />;
  const reconnectNotice = reconnecting
    ? relaunchInFlight
      ? t`Relaunching to install the update…`
      : t`Reconnecting…`
    : null;
  if (documents.length === 0) {
    return (
      <FileTreeEmptyState
        reconnectNotice={reconnectNotice}
        error={error}
        filteredToZero={
          classifyEmptyTree({
            visibility: { showHiddenFiles, showOnlyMarkdownFiles },
            unfilteredRootEntryCount,
            knownPageCount: pageCount,
          }) === 'filtered-to-zero'
        }
        externalDropActive={emptyExternalFileDropActive}
        onDragOver={onEmptyExternalFileDragOver}
        onDragLeave={onEmptyExternalFileDragLeave}
        onDrop={onEmptyExternalFileDrop}
        onCreateFirstFile={onCreateFirstFile}
      />
    );
  }
  let truncationNotice: string | null = null;
  if (truncatedShownCount !== null) {
    const formattedCount = new Intl.NumberFormat(i18n.locale).format(truncatedShownCount);
    truncationNotice = plural(truncatedShownCount, {
      one: 'Showing the first item in one folder — the rest of that folder is hidden.',
      other: `Showing the first ${formattedCount} items in one folder — the rest of that folder is hidden.`,
    });
  }
  return (
    <>
      <FileTreeViewport
        hostRef={hostRef}
        model={model}
        resolvedTheme={resolvedTheme}
        creationDirCleared={creationDirCleared}
        onContentHeightChange={onContentHeightChange}
        header={
          (error || reconnectNotice !== null || truncationNotice !== null) && (
            <>
              {reconnectNotice !== null ? (
                <FileTreeHeaderNotice kind="reconnecting">{reconnectNotice}</FileTreeHeaderNotice>
              ) : (
                error && <FileTreeHeaderNotice kind="error">{error}</FileTreeHeaderNotice>
              )}
              {truncationNotice !== null && (
                <FileTreeHeaderNotice kind="info">{truncationNotice}</FileTreeHeaderNotice>
              )}
            </>
          )
        }
        onClickCapture={onClickCapture}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        renderContextMenu={(item, context) => (
          <FileTreeMenu
            item={item}
            context={context}
            anyActionBusy={anyActionBusy}
            workspace={workspace}
            handoff={handoff}
            model={model}
            okignoreBinding={okignoreBinding}
            onStartCreating={onStartCreating}
            onCreateFromTemplate={onCreateFromTemplate}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onExpandSubtree={onExpandSubtree}
            onCollapseSubtree={onCollapseSubtree}
            folderTreePaths={folderTreePaths}
            isAsset={assetTreePaths.has(item.path)}
            documents={documents}
          />
        )}
      />
      {dialogs}
    </>
  );
}
