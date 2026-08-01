import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import type {
  HandoffOutcome,
  HandoffTarget,
  InstallState,
  OkignoreBinding,
} from '@nedian0brien/synapsenote-core';
import type {
  ContextMenuItem,
  ContextMenuOpenContext,
  FileTree as PierreFileTreeModel,
} from '@pierre/trees';
import {
  CopyPlus,
  EyeOff,
  FilePlus,
  FolderPlus,
  FoldVertical,
  Pencil,
  Share2,
  SquarePen,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { selectedTreePathsToDeleteTargets } from '@/components/file-tree/file-tree-commands';
import {
  folderPathToTreeDirectoryPath,
  relativePathForTreeItem,
  treeDirectoryPathToFolderPath,
  treeFilePathToDocumentDocName,
  treeItemToTarget,
} from '@/components/file-tree-adapter';
import { buildOkignorePatternFromTarget } from '@/components/file-tree-okignore';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import { type FileEntry, hasOkPathSegment } from '@/components/file-tree-utils';
import {
  appendPattern,
  parseOkignoreDoc,
  serializeOkignoreDoc,
} from '@/components/settings/okignore-doc';
import { TemplateMenuRows } from '@/components/template-menu-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { asDirectoryHandle } from '@/components/use-selection-mirror';
import { useFolderConfig } from '@/hooks/use-folder-config';
import { useGitSyncStatusDetailed } from '@/hooks/use-git-sync-status';
import { scheduleClipboardWrite } from '@/lib/share/clipboard-adapter';
import {
  buildDocShareInput,
  buildFolderShareInput,
  runShareAction,
  type ShareTargetInput,
} from '@/lib/share/run-share-action';
import { OpenInAgentContextSubmenu } from '../handoff/OpenInAgentContextSubmenu';
import {
  buildFolderHandoffInput,
  buildHandoffInput,
  type HandoffDispatchInput,
} from '../handoff/useHandoffDispatch';
import { FileTreeMenuPathActions, type FileTreeWorkspace } from './FileTreeMenuPathActions';

type Props = {
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
  anyActionBusy: boolean;
  workspace: FileTreeWorkspace | null;
  handoff: {
    readonly installStates: Record<HandoffTarget, InstallState>;
    readonly isElectronHost: boolean;
    readonly dispatch: (
      target: HandoffTarget,
      input: HandoffDispatchInput,
    ) => Promise<HandoffOutcome>;
  };
  model: PierreFileTreeModel;
  okignoreBinding: OkignoreBinding | null;
  onStartCreating: (kind: 'file' | 'folder', parentDir: string) => void;
  onCreateFromTemplate: (parentDir: string, templateName: string) => void;
  onDuplicate: (target: FileTreeTarget) => void;
  onDelete: (targets: FileTreeTarget[]) => void;
  onExpandSubtree: (treePath: string) => void;
  onCollapseSubtree: (treePath: string) => void;
  folderTreePaths: readonly string[];
  isAsset: boolean;
  documents: readonly FileEntry[];
};

export function FileTreeMenu({
  item,
  context,
  anyActionBusy,
  workspace,
  handoff,
  model,
  okignoreBinding,
  onStartCreating,
  onCreateFromTemplate,
  onDuplicate,
  onDelete,
  onExpandSubtree,
  onCollapseSubtree,
  folderTreePaths,
  isAsset,
  documents,
}: Props) {
  const { t } = useLingui();
  const target = treeItemToTarget(item, documents);
  const isFolder = item.kind === 'directory';
  const isOkRow = hasOkPathSegment(item.path);
  const parentDir = isFolder ? treeDirectoryPathToFolderPath(item.path) : '';
  const folderConfig = useFolderConfig(isFolder ? parentDir : null);
  const folderHasTemplates =
    folderConfig.state.status !== 'ready' ||
    (folderConfig.state.data.folder.templates_available?.length ?? 0) > 0;
  const selectedTargets = model.getSelectedPaths().includes(target.treePath)
    ? selectedTreePathsToDeleteTargets(model.getSelectedPaths(), documents)
    : [];
  const deleteTargets = selectedTargets.length > 1 ? selectedTargets : [target];
  const deleteLabel = plural(deleteTargets.length, { one: 'Delete', other: 'Delete # items' });
  const close = () => context.close();
  const closeForInlineSurface = () => context.close({ restoreFocus: false });
  const handoffInput: HandoffDispatchInput | null = isAsset
    ? null
    : isFolder
      ? buildFolderHandoffInput({ folderRelativePath: relativePathForTreeItem(item), workspace })
      : buildHandoffInput({
          docName: treeFilePathToDocumentDocName(item.path, documents),
          workspace,
        });
  const { status: gitSyncStatus } = useGitSyncStatusDetailed();
  const shareInput: ShareTargetInput | null = isAsset
    ? null
    : isFolder
      ? buildFolderShareInput(parentDir)
      : buildDocShareInput(treeFilePathToDocumentDocName(item.path, documents));
  const canShare = gitSyncStatus?.hasRemote === true && shareInput !== null;
  const folderRoot = folderPathToTreeDirectoryPath(item.path);
  const subtreePaths = isFolder
    ? folderTreePaths.filter((path) => path === folderRoot || path.startsWith(folderRoot))
    : [];
  const expandedCount = subtreePaths.filter((path) =>
    asDirectoryHandle(model.getItem(path))?.isExpanded(),
  ).length;
  const showExpand = isFolder && expandedCount < subtreePaths.length;
  const showCollapse = isFolder && expandedCount > 0;

  const hideItem =
    target.kind === 'asset' ? null : (
      <DropdownMenuItem
        data-testid="file-tree-menu-hide"
        disabled={!okignoreBinding}
        onSelect={() => {
          if (!okignoreBinding) return;
          close();
          const doc = parseOkignoreDoc(okignoreBinding.current());
          const updated = appendPattern(doc, buildOkignorePatternFromTarget(target));
          if (updated === doc) return;
          okignoreBinding.patch(serializeOkignoreDoc(updated));
          const basename = target.path.split('/').pop() || target.path;
          toast.success(isFolder ? t`Hidden folder “${basename}”` : t`Hidden “${basename}”`, {
            description: t`Manage hidden files in Settings → Ignore patterns.`,
            duration: 5000,
          });
        }}
      >
        <EyeOff aria-hidden="true" />
        {isFolder ? <Trans>Hide folder</Trans> : <Trans>Hide this file</Trans>}
      </DropdownMenuItem>
    );

  return (
    <DropdownMenu open modal={false} onOpenChange={(open) => !open && close()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          data-file-tree-context-menu-root="true"
          className="block size-px"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={0}
        align="start"
        data-file-tree-context-menu-root="true"
        className="min-w-52"
      >
        {isFolder && !isOkRow ? (
          <>
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                onStartCreating('file', parentDir);
              }}
            >
              <SquarePen aria-hidden="true" />
              <Trans>New file</Trans>
            </DropdownMenuItem>
            {folderHasTemplates ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={anyActionBusy}>
                  <FilePlus aria-hidden="true" />
                  <Trans>New from template</Trans>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <TemplateMenuRows
                    parentDir={parentDir}
                    onSelectTemplate={(name) => {
                      closeForInlineSurface();
                      onCreateFromTemplate(parentDir, name);
                    }}
                    ItemComponent={DropdownMenuItem}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                onStartCreating('folder', parentDir);
              }}
            >
              <FolderPlus aria-hidden="true" />
              <Trans>New folder</Trans>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <FileTreeMenuPathActions
          item={item}
          workspace={workspace}
          onClose={close}
          action="reveal"
        />
        {!isAsset ? (
          <OpenInAgentContextSubmenu
            input={handoffInput}
            installStates={handoff.installStates}
            isElectronHost={handoff.isElectronHost}
            dispatch={handoff.dispatch}
          />
        ) : null}
        {canShare ? (
          <DropdownMenuItem
            data-testid="file-tree-menu-share"
            onSelect={() => {
              close();
              void runShareAction(
                {
                  ...shareInput,
                  hasRemote: true,
                  onClickWhenNoRemote: () =>
                    toast.error(t`Connect this project to GitHub to share.`),
                },
                {
                  clipboardWrite: scheduleClipboardWrite,
                  toastSuccess: (message) => toast.success(message),
                  toastError: (message) => toast.error(message),
                  logEvent: (message) => console.log(message),
                },
              );
            }}
          >
            <Share2 aria-hidden="true" />
            <Trans>Share</Trans>
          </DropdownMenuItem>
        ) : null}
        <FileTreeMenuPathActions item={item} workspace={workspace} onClose={close} action="copy" />
        {showExpand || showCollapse ? <DropdownMenuSeparator /> : null}
        {showExpand ? (
          <DropdownMenuItem
            onSelect={() => {
              close();
              onExpandSubtree(item.path);
            }}
          >
            <UnfoldVertical aria-hidden="true" />
            <Trans>Expand all</Trans>
          </DropdownMenuItem>
        ) : null}
        {showCollapse ? (
          <DropdownMenuItem
            onSelect={() => {
              close();
              onCollapseSubtree(item.path);
            }}
          >
            <FoldVertical aria-hidden="true" />
            <Trans>Collapse all</Trans>
          </DropdownMenuItem>
        ) : null}
        {!isOkRow ? (
          <>
            <DropdownMenuSeparator />
            {target.kind !== 'asset' ? (
              <DropdownMenuItem
                disabled={anyActionBusy}
                onSelect={() => {
                  close();
                  onDuplicate(target);
                }}
              >
                <CopyPlus aria-hidden="true" />
                <Trans>Duplicate</Trans>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={anyActionBusy}
              onSelect={() => {
                closeForInlineSurface();
                model.startRenaming(item.path);
              }}
            >
              <Pencil aria-hidden="true" />
              <Trans>Rename</Trans>
            </DropdownMenuItem>
            {hideItem}
            <DropdownMenuItem
              variant="destructive"
              disabled={anyActionBusy}
              onSelect={() => {
                close();
                onDelete(deleteTargets);
              }}
            >
              <Trash2 aria-hidden="true" />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
