import { Trans } from '@lingui/react/macro';
import {
  Database,
  FilePlus2,
  FolderPlus,
  ListChecks,
  Network,
  Package,
  ScanSearch,
  Stethoscope,
  Table2,
} from 'lucide-react';
import { requestDocPanelTab } from '@/components/doc-panel-events';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { dispatchDatabaseSlashCommand } from '@/lib/database-events';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { formatShortcut } from '@/lib/keyboard-shortcuts';
import { useCommandPaletteState } from './CommandPaletteStateProvider';
import { filterCommandPaletteRegistry } from './command-palette-command-registry';

/** Renders core workspace commands and typed agent-dispatch actions. */
export function CommandPaletteCommandResults() {
  const state = useCommandPaletteState();
  const visible = (id: string) => state.commandIds.has(id);
  const showCommands = [
    'new-file',
    'new-folder',
    'new-database',
    'graph',
    'seed',
    'data-inspector',
    'agent-runs',
    'databases',
    'database-diagnostics',
  ].some(visible);
  const visibleTargets = VISIBLE_TARGETS.filter(
    (target) =>
      filterCommandPaletteRegistry(
        [
          {
            id: target.id,
            label: state.t`Open with AI ${target.displayName}`,
            aliases: [target.id, 'agent handoff', 'open in'],
            available: true,
          },
        ],
        state.deferredQuery,
      ).length > 0,
  );
  return (
    <>
      {showCommands ? (
        <CommandGroup heading={state.t`Commands`}>
          {visible('new-file') ? (
            <CommandItem
              value="new file create file"
              onSelect={() => {
                state.onOpenChange(false);
                state.setCreateDialogKind('file');
              }}
              data-testid="command-palette-new-file"
            >
              <FilePlus2 />
              <span>
                <Trans>New file</Trans>
              </span>
              <CommandShortcut>{formatShortcut('new-item')}</CommandShortcut>
            </CommandItem>
          ) : null}
          {visible('new-folder') ? (
            <CommandItem
              value="new folder create folder"
              onSelect={() => {
                state.onOpenChange(false);
                state.setCreateDialogKind('folder');
              }}
              data-testid="command-palette-new-folder"
            >
              <FolderPlus />
              <span>
                <Trans>New folder</Trans>
              </span>
              {state.bridge ? (
                <CommandShortcut>{formatShortcut('new-folder')}</CommandShortcut>
              ) : null}
            </CommandItem>
          ) : null}
          {visible('new-database') ? (
            <CommandItem
              value="new database create database new table database page"
              onSelect={() => {
                state.onOpenChange(false);
                dispatchDatabaseSlashCommand('new');
              }}
              data-testid="command-palette-new-database"
            >
              <Database />
              <span>
                <Trans>New database</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('graph') ? (
            <CommandItem
              value="open graph graph panel network"
              onSelect={() => {
                if (!state.activeDocName) return;
                state.onOpenChange(false);
                requestDocPanelTab('graph');
              }}
              data-testid="command-palette-open-graph"
            >
              <Network />
              <span>
                <Trans>Open graph</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('seed') ? (
            <CommandItem
              value="initialize starter pack scaffold seed"
              onSelect={() => {
                state.onOpenChange(false);
                state.setSeedDialogOpen(true);
              }}
              data-testid="command-palette-initialize-starter-pack"
            >
              <Package />
              <span>
                <Trans>Initialize starter pack</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('data-inspector') ? (
            <CommandItem
              value="inspect agent data context what agent saw context pack tokens redactions omissions"
              onSelect={() => {
                state.onOpenChange(false);
                state.onOpenDataInspector?.();
              }}
              data-testid="command-palette-open-data-inspector"
            >
              <ScanSearch />
              <span>
                <Trans>Inspect agent data context</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('agent-runs') ? (
            <CommandItem
              value="open agent runs database history proposed diff verification undo"
              onSelect={() => {
                state.onOpenChange(false);
                state.onOpenAgentRuns?.();
              }}
              data-testid="command-palette-open-agent-runs"
            >
              <ListChecks />
              <span>
                <Trans>Open Agent Runs</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('databases') ? (
            <CommandItem
              value="open databases table records properties browse data"
              onSelect={() => {
                state.onOpenChange(false);
                state.onOpenDatabases?.();
              }}
              data-testid="command-palette-open-databases"
            >
              <Table2 />
              <span>
                <Trans>Open databases</Trans>
              </span>
            </CommandItem>
          ) : null}
          {visible('database-diagnostics') ? (
            <CommandItem
              value="open database diagnostics index state invalid records schema revisions tasks repair"
              onSelect={() => {
                state.onOpenChange(false);
                state.onOpenDatabaseDiagnostics?.();
              }}
              data-testid="command-palette-open-database-diagnostics"
            >
              <Stethoscope />
              <span>
                <Trans>Open database diagnostics</Trans>
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      ) : null}
      {state.showAgentGroup ? (
        <CommandGroup heading={state.t`Open with AI`}>
          {visibleTargets.map((target) => {
            const installState = state.installStates[target.id];
            const enabled = installState.installed === true && state.handoffInput !== null;
            const hint =
              installState.installed === null
                ? state.t`Detecting`
                : installState.installed === false
                  ? state.t`Not installed`
                  : null;
            const accessibleLabel = hint
              ? state.t`Open with AI ${target.displayName}, ${hint}`
              : state.t`Open with AI ${target.displayName}`;
            return (
              <CommandItem
                key={target.id}
                value={`send to ai ${target.displayName} ${target.id} agent open in`}
                disabled={!enabled}
                onSelect={() => {
                  if (!enabled || !state.handoffInput) return;
                  state.onOpenChange(false);
                  void state.dispatchHandoff(target.id, state.handoffInput);
                }}
                data-testid={`command-palette-open-in-${target.id}`}
                aria-label={accessibleLabel}
              >
                <span className="flex-1">
                  <Trans>Open with AI {target.displayName}</Trans>
                </span>
                {hint ? (
                  <span aria-hidden="true" className="ml-auto text-muted-foreground text-xs">
                    {hint}
                  </span>
                ) : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      ) : null}
    </>
  );
}
