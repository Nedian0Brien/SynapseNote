import { t } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import type { ContextMenuItem } from '@pierre/trees';
import { Copy, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { relativePathForTreeItem } from '@/components/file-tree-adapter';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { joinWorkspacePath } from '@/lib/workspace-paths';

export type FileTreeWorkspace = {
  contentDir: string;
  pathSeparator: '/' | '\\';
};

async function copyPath(text: string, kind: 'full' | 'relative') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(kind === 'full' ? t`Copied full path` : t`Copied relative path`, {
      description: text,
    });
  } catch (error) {
    console.warn('[FileTree] clipboard write failed:', error);
    toast.error(kind === 'full' ? t`Could not copy full path` : t`Could not copy relative path`);
  }
}

function revealLabel(platform: 'darwin' | 'win32' | 'linux') {
  if (platform === 'darwin') return t`Reveal in Finder`;
  if (platform === 'win32') return t`Reveal in File Explorer`;
  return t`Open containing folder`;
}

function RevealInFileManager({
  item,
  workspace,
  onClose,
}: {
  item: ContextMenuItem;
  workspace: FileTreeWorkspace | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const bridge = typeof window === 'undefined' ? undefined : window.okDesktop;
  if (!bridge) return null;
  const label = revealLabel(bridge.platform);
  const hint = workspace ? null : t`No workspace`;
  return (
    <DropdownMenuItem
      disabled={!workspace}
      aria-label={hint ? `${label}, ${hint}` : label}
      onSelect={() => {
        if (!workspace) return;
        onClose();
        void bridge.shell.showItemInFolder(
          joinWorkspacePath(
            workspace.contentDir,
            relativePathForTreeItem(item),
            workspace.pathSeparator,
          ),
        );
      }}
    >
      <FolderOpen aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {hint ? <span className="ml-2 text-muted-foreground text-xs">{hint}</span> : null}
    </DropdownMenuItem>
  );
}

export function FileTreeMenuPathActions({
  item,
  workspace,
  onClose,
  action = 'all',
}: {
  item: ContextMenuItem;
  workspace: FileTreeWorkspace | null;
  onClose: () => void;
  action?: 'all' | 'copy' | 'reveal';
}) {
  const relativePath = relativePathForTreeItem(item);
  return (
    <>
      {action !== 'copy' && (
        <RevealInFileManager item={item} workspace={workspace} onClose={onClose} />
      )}
      {action !== 'reveal' && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Copy aria-hidden="true" />
            <Trans>Copy path</Trans>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={!workspace}
              onSelect={() => {
                if (!workspace) return;
                onClose();
                void copyPath(
                  joinWorkspacePath(workspace.contentDir, relativePath, workspace.pathSeparator),
                  'full',
                );
              }}
            >
              <Trans>Full path</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onClose();
                void copyPath(relativePath, 'relative');
              }}
            >
              <Trans>Relative path</Trans>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  );
}
