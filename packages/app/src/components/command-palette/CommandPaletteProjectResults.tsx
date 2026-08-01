import { Trans } from '@lingui/react/macro';
import {
  Bug,
  Download,
  Folder,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  Plus,
  Settings,
} from 'lucide-react';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { formatShortcut } from '@/lib/keyboard-shortcuts';
import { SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';
import { matchesCommandQuery } from '../command-palette-search';
import { basenameOf } from '../project-switcher-recents';
import { useCommandPaletteState } from './CommandPaletteStateProvider';

/** Renders desktop project, recent-project, and worktree actions. */
export function CommandPaletteProjectResults() {
  const state = useCommandPaletteState();
  const visible = (id: string) => state.commandIds.has(id);
  const showProject = [
    'new-project',
    'open-folder',
    'switch-project',
    'settings',
    'install-claude',
    'report-bug',
  ].some(visible);
  return (
    <>
      {showProject ? (
        <CommandGroup heading={state.t`Project`}>
          {visible('new-project') && state.bridge ? (
            <CommandItem
              value="new project create scaffold"
              onSelect={() => {
                state.onOpenChange(false);
                state.setCreateProjectOpen(true);
              }}
              data-testid="command-palette-new-project"
            >
              <Plus />
              <span>
                <Trans>New project</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('open-folder') && state.bridge ? (
            <CommandItem
              value="open folder on disk project"
              onSelect={() =>
                state.runAction(async () => {
                  const path = await state.bridge?.dialog.openFolder();
                  if (!path) return;
                  await state.bridge?.project.open({
                    path,
                    target: 'new-window',
                    entryPoint: 'pick-existing',
                  });
                })
              }
              data-testid="command-palette-open-folder"
            >
              <FolderOpen />
              <span>
                <Trans>Open folder on disk</Trans>
              </span>
              <CommandShortcut>{formatShortcut('open-folder')}</CommandShortcut>
            </CommandItem>
          ) : null}
          {visible('switch-project') && state.bridge ? (
            <CommandItem
              value="switch-project navigator projects"
              onSelect={() =>
                state.runAction(
                  () => state.bridge?.navigator.open(),
                  state.t`Failed to open Project Navigator.`,
                )
              }
              data-testid="command-palette-switch-project"
            >
              <LayoutGrid />
              <span>
                <Trans>Switch project</Trans>
              </span>
              <CommandShortcut>{formatShortcut('switch-project')}</CommandShortcut>
            </CommandItem>
          ) : null}
          {visible('settings') ? (
            <CommandItem
              value="settings preferences config"
              onSelect={() => {
                state.onOpenChange(false);
                if (window.location.hash !== SETTINGS_OPEN_HASH)
                  window.location.hash = SETTINGS_OPEN_HASH;
              }}
              data-testid="command-palette-settings"
            >
              <Settings />
              <span>
                <Trans>Settings</Trans>
              </span>
              <CommandShortcut>{formatShortcut('settings')}</CommandShortcut>
            </CommandItem>
          ) : null}
          {visible('install-claude') ? (
            <CommandItem
              value="install claude desktop cowork app"
              onSelect={() => {
                state.onOpenChange(false);
                window.location.hash = '#install-claude-desktop';
              }}
              data-testid="command-palette-install-claude-desktop"
            >
              <Download />
              <span>
                <Trans>Install for Claude Chat &amp; Cowork (Desktop App)</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('report-bug') ? (
            <CommandItem
              value="report a bug issue feedback"
              onSelect={() => {
                state.onOpenChange(false);
                state.setReportBugOpen(true);
              }}
              data-testid="command-palette-report-bug"
            >
              <Bug />
              <span>
                <Trans>Report a bug</Trans>
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      ) : null}
      {state.showProjectRecents && state.bridge ? (
        <CommandGroup heading={state.t`Open recent project`}>
          {state.switchableProjects
            .filter((row) =>
              matchesCommandQuery(`${row.name} ${row.path}`, state.deferredQuery, [
                'open recent project',
              ]),
            )
            .slice(0, 10)
            .map((row) => {
              const isWorktree = row.isLinkedWorktree === true;
              const RowIcon = isWorktree ? GitBranch : Folder;
              const worktreeOf =
                isWorktree && row.mainRoot !== undefined ? basenameOf(row.mainRoot) : null;
              return (
                <CommandItem
                  key={row.path}
                  value={`${row.name} ${row.path} recent project`}
                  disabled={row.missing}
                  onSelect={() =>
                    state.runAction(
                      () =>
                        state.bridge?.project.open({
                          path: row.path,
                          target: 'new-window',
                          entryPoint: 'recents',
                        }),
                      state.t`Failed to open project.`,
                    )
                  }
                  data-testid={`command-palette-recent-${row.path}`}
                  className="items-start"
                >
                  <RowIcon className="mt-0.5" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{row.name}</span>
                    {worktreeOf !== null ? (
                      <span className="truncate text-muted-foreground text-xs">
                        <Trans>worktree of {worktreeOf}</Trans>
                      </span>
                    ) : null}
                    <span className="truncate text-muted-foreground text-xs">
                      {row.path}
                      {row.missing ? (
                        <>
                          {'  '}
                          <Trans>(missing)</Trans>
                        </>
                      ) : null}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
        </CommandGroup>
      ) : null}
      {state.matchedWorktrees.length > 0 && state.bridge ? (
        <CommandGroup heading={state.t`Worktrees`}>
          {state.matchedWorktrees.slice(0, 10).map((entry) => (
            <CommandItem
              key={entry.branch}
              value={`${entry.branch} worktree branch`}
              onSelect={() => state.openWorktreeEntry(entry)}
              data-testid={`command-palette-worktree-${entry.branch}`}
              className="items-start"
            >
              <GitBranch className="mt-0.5" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">{entry.branch}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {entry.worktreePath ?? state.t`Create worktree`}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}
