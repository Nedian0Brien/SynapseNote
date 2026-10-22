/**
 * Right-click menu for the folder overview's items — the folder tiles and the
 * document cards in all three view modes.
 *
 * The overview shows the same files and folders the sidebar tree does, so a
 * right-click there has to offer the same actions. It does NOT reimplement
 * them: every mutating item delegates to the FileTree-owned spine through the
 * existing `file-tree-menu-action-events` bus, exactly like the native File
 * menu does. FileTree stays the single owner of rename / duplicate / trash
 * reconciliation (providers, IndexedDB, open tabs, sidebar rows, navigation);
 * this file only decides which verbs a given item offers.
 *
 * The non-mutating items reuse the same primitives the tree's row menu uses:
 * `OpenInAgentContextSubmenu` for Send to AI, `runShareAction` for Share, and
 * `path-menu-actions` for Reveal / Copy path.
 *
 * Menu primitive: a pointer-anchored `DropdownMenu`, NOT Radix's ContextMenu —
 * mirroring `FileTreeMenu`. `OpenInAgentContextSubmenu` renders DropdownMenu
 * submenu primitives, and mixing the two Radix stacks detaches keyboard nav.
 * A one-pixel fixed-position trigger placed at the click point gives the
 * dropdown its anchor, portaled to the body so a hover-lifted card (a
 * transformed ancestor) cannot capture its fixed positioning.
 *
 * Cost: the hook itself holds one piece of state per item, and the menu's own
 * hooks (workspace probe, install-state probe, git-remote status) live inside
 * `FolderItemMenu`, which Radix mounts only while the menu is open — so a
 * folder of 200 cards pays for none of them until a right-click.
 */

import { Trans, useLingui } from '@lingui/react/macro';
import { Copy, CopyPlus, FolderOpen, Pencil, Share2, SquarePen, Trash2 } from 'lucide-react';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
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
import { useGitSyncStatusDetailed } from '@/hooks/use-git-sync-status';
import { emitCreateTopLevelFile } from '@/lib/create-file-events';
import {
  emitFileTreeMenuActionDelete,
  emitFileTreeMenuActionDuplicate,
  emitFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import { scheduleClipboardWrite } from '@/lib/share/clipboard-adapter';
import {
  buildDocShareInput,
  buildFolderShareInput,
  runShareAction,
  type ShareTargetInput,
} from '@/lib/share/run-share-action';
import { useWorkspace } from '@/lib/use-workspace';
import { joinWorkspacePath } from '@/lib/workspace-paths';
import { OpenInAgentContextSubmenu } from './handoff/OpenInAgentContextSubmenu';
import {
  buildFolderHandoffInput,
  buildHandoffInput,
  useHandoffDispatch,
} from './handoff/useHandoffDispatch';
import { isElectronHostDefault, useInstalledAgents } from './handoff/useInstalledAgents';
import type { ResolvedNavigationTarget } from './navigation-targets';
import { usePageList } from './PageListContext';
import { copyPathToClipboard, revealInFileManagerLabel } from './path-menu-actions';

/**
 * What the menu acts on, in the overview's own vocabulary: a docName for a
 * file, a folder path for a folder. The file's extension is resolved from the
 * page list when the menu opens, so callers never carry it.
 */
export type FolderItemMenuTarget =
  | { readonly kind: 'file'; readonly docName: string }
  | { readonly kind: 'folder'; readonly folderPath: string };

/** The relative path on disk — what Copy path and Reveal need. */
function relativePathFor(target: FolderItemMenuTarget, docExt: string): string {
  return target.kind === 'folder' ? target.folderPath : `${target.docName}${docExt}`;
}

/**
 * The bus payload. Files are always plain docs here: a folder's index note is
 * shown as the folder tile, not as its own card, so `folder-index` never
 * originates from this surface.
 */
function navigationTargetFor(target: FolderItemMenuTarget): ResolvedNavigationTarget {
  return target.kind === 'folder'
    ? { kind: 'folder', target: target.folderPath, folderPath: target.folderPath }
    : { kind: 'doc', target: target.docName, docName: target.docName };
}

function FolderItemMenu({
  target,
  title,
  onClose,
}: {
  target: FolderItemMenuTarget;
  title: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { pageMeta } = usePageList();
  const workspace = useWorkspace();
  const { states: installStates } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const { status: gitSyncStatus } = useGitSyncStatusDetailed();
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;

  const isFolder = target.kind === 'folder';
  // `.md` is the fallback the rest of the app uses for an unknown doc — a
  // freshly created page can reach this menu before its metadata lands.
  const docExt = target.kind === 'file' ? (pageMeta.get(target.docName)?.docExt ?? '.md') : '';
  const relativePath = relativePathFor(target, docExt);
  const navigationTarget = navigationTargetFor(target);

  const handoffInput = isFolder
    ? buildFolderHandoffInput({ folderRelativePath: target.folderPath, workspace })
    : buildHandoffInput({ docName: target.docName, workspace });

  const shareInput: ShareTargetInput = isFolder
    ? buildFolderShareInput(target.folderPath)
    : buildDocShareInput(target.docName);
  const hasRemote = gitSyncStatus?.hasRemote === true;

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <DropdownMenuContent
      sideOffset={0}
      align="start"
      className="min-w-52"
      data-folder-item-menu={relativePath}
    >
      {isFolder ? (
        <>
          <DropdownMenuItem
            onSelect={() => run(() => emitCreateTopLevelFile({ initialDir: target.folderPath }))}
          >
            <SquarePen aria-hidden="true" />
            <Trans>New file</Trans>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      ) : null}

      {hasRemote ? (
        <DropdownMenuItem
          data-testid="folder-item-menu-share"
          onSelect={() =>
            run(() => {
              void runShareAction(
                {
                  ...shareInput,
                  hasRemote,
                  // Only rendered with a remote, so this is a defensive path:
                  // the status can go stale between render and click.
                  onClickWhenNoRemote: () => {
                    toast.error(t`Connect this project to GitHub to share.`);
                  },
                },
                {
                  clipboardWrite: scheduleClipboardWrite,
                  toastSuccess: (message) => toast.success(message),
                  toastError: (message) => toast.error(message),
                  logEvent: (message) => console.log(message),
                },
              );
            })
          }
        >
          <Share2 aria-hidden="true" />
          <Trans>Share</Trans>
        </DropdownMenuItem>
      ) : null}

      <OpenInAgentContextSubmenu
        input={handoffInput}
        installStates={installStates}
        isElectronHost={isElectronHostDefault()}
        dispatch={dispatch}
      />

      {bridge ? (
        <DropdownMenuItem
          disabled={!workspace}
          onSelect={() =>
            run(() => {
              if (!workspace) return;
              void bridge.shell.showItemInFolder(
                joinWorkspacePath(workspace.contentDir, relativePath, workspace.pathSeparator),
              );
            })
          }
        >
          <FolderOpen aria-hidden="true" />
          <span className="flex-1">{revealInFileManagerLabel(bridge.platform)}</span>
        </DropdownMenuItem>
      ) : null}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Copy aria-hidden="true" />
          <Trans>Copy path</Trans>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            disabled={!workspace}
            onSelect={() =>
              run(() => {
                if (!workspace) return;
                void copyPathToClipboard(
                  joinWorkspacePath(workspace.contentDir, relativePath, workspace.pathSeparator),
                  'full',
                );
              })
            }
          >
            <Trans>Full path</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => run(() => void copyPathToClipboard(relativePath, 'relative'))}
          >
            <Trans>Relative path</Trans>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />

      {!isFolder ? (
        <DropdownMenuItem
          data-testid="folder-item-menu-duplicate"
          onSelect={() => run(() => emitFileTreeMenuActionDuplicate(navigationTarget))}
        >
          <CopyPlus aria-hidden="true" />
          <Trans>Duplicate</Trans>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        data-testid="folder-item-menu-rename"
        onSelect={() => run(() => emitFileTreeMenuActionRename(navigationTarget))}
      >
        <Pencil aria-hidden="true" />
        <Trans>Rename</Trans>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="folder-item-menu-delete"
        variant="destructive"
        onSelect={() => run(() => emitFileTreeMenuActionDelete(navigationTarget))}
        aria-label={t`Delete ${title}`}
      >
        <Trash2 aria-hidden="true" />
        <Trans>Delete</Trans>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/**
 * Attaches the overview's right-click menu to one item.
 *
 * Returns the handler to spread onto the item's own element (so no extra
 * wrapper element can disturb the masonry / grid / list layouts) plus the menu
 * node to render inside it. The menu node is `null` until the first
 * right-click, so a closed menu costs nothing.
 */
export function useFolderItemContextMenu(
  target: FolderItemMenuTarget,
  title: string,
): { onContextMenu: (event: MouseEvent) => void; menu: ReactNode } {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    // Stop the browser's own menu AND any ancestor item's handler — nested
    // right-clicks (a card inside a section) must open exactly one menu.
    event.stopPropagation();
    setAnchor({ x: event.clientX, y: event.clientY });
  };

  const menu =
    anchor === null
      ? null
      : // Portaled to the body, not left inside the item.
        //
        // The anchor positions itself with viewport coordinates, and `fixed`
        // only means "the viewport" while no ancestor has a transform. The
        // overview's cards and folder tiles lift on hover
        // (`hover:-translate-y-0.5`) — which is exactly the state the pointer is
        // in when the right-click lands — so an anchor rendered inside the card
        // resolved against the CARD instead, and the menu opened offset by the
        // card's own position on screen. Rendering the whole menu under `body`
        // puts the anchor out of reach of any such ancestor. Radix already
        // portals the content; this moves the anchor with it. The menu stays in
        // the React tree of the item, so its context and event handlers are
        // unchanged.
        createPortal(
          <DropdownMenu
            open
            modal={false}
            onOpenChange={(open) => {
              if (!open) setAnchor(null);
            }}
          >
            <DropdownMenuTrigger asChild>
              {/* Pointer anchor: a zero-size fixed element at the click point, so
                  the menu opens where the user clicked rather than at the item's
                  corner. */}
              <span
                aria-hidden="true"
                data-folder-item-menu-anchor="true"
                className="fixed block size-px"
                style={{ left: anchor.x, top: anchor.y }}
              />
            </DropdownMenuTrigger>
            <FolderItemMenu target={target} title={title} onClose={() => setAnchor(null)} />
          </DropdownMenu>,
          document.body,
        );

  return { onContextMenu, menu };
}
