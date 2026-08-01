// biome-ignore-all lint/plugin/no-raw-html-interactive-element: filter pills intentionally use native buttons to preserve the existing compact command-dialog affordance.
import { Trans } from '@lingui/react/macro';
import { Hash, Sparkles } from 'lucide-react';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { NewItemDialog } from '@/components/NewItemDialog';
import { ReportBugDialog } from '@/components/ReportBugDialog';
import { SeedDialog } from '@/components/SeedDialog';
import { CommandDialog, CommandInput } from '@/components/ui/command';
import { cn } from '@/lib/utils.ts';
import { classifyOmnibarSearchHint } from '../command-palette-search';
import { CommandPaletteResults } from './CommandPaletteResults';
import { CommandPaletteSearchHint } from './CommandPaletteSearchHint';
import { useCommandPaletteState } from './CommandPaletteStateProvider';
import { computeVisibleSearchResults } from './command-palette-utils';

/** Owns dialog framing, query input, filter pills, and dependent overlay mounts. */
export function CommandPaletteSurface() {
  const state = useCommandPaletteState();
  const visibleSearchResults = computeVisibleSearchResults({
    searchResults: state.searchResults,
    fallbackSearchResults: state.fallbackSearchResults,
    searchStatus: state.searchStatus,
  });
  return (
    <>
      <CommandDialog
        open={state.open}
        onOpenChange={state.onOpenChange}
        title={state.t`Workspace Command Palette`}
        description={state.t`Search pages, databases, folders, and commands for the current workspace.`}
        className="sm:max-w-2xl"
        commandProps={{
          shouldFilter: false,
          className:
            '[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4',
        }}
        onEscapeKeyDown={state.onPaletteEscapeKeyDown}
      >
        <CommandInput
          ref={state.inputRef}
          value={state.query}
          onValueChange={state.setQuery}
          onKeyDown={state.onSemanticInputKeyDown}
          placeholder={
            state.isSemanticMode
              ? state.t`Search by meaning`
              : state.t`Search pages, databases, or commands`
          }
        />
        <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
          <button
            type="button"
            onClick={state.toggleTagMode}
            data-testid="command-palette-filter-tag"
            data-active={state.isTagMode}
            aria-pressed={state.isTagMode}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              state.isTagMode
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Hash className="size-3.5" />
            <span>
              <Trans>By tag</Trans>
            </span>
          </button>
          {state.semanticCapable ? (
            <button
              type="button"
              onClick={() =>
                state.isSemanticMode ? state.exitSemanticMode() : state.enterSemanticMode()
              }
              data-testid="command-palette-filter-semantic"
              data-active={state.isSemanticMode}
              aria-pressed={state.isSemanticMode}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                state.isSemanticMode
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Sparkles className="size-3.5" />
              <span>
                <Trans>By meaning</Trans>
              </span>
            </button>
          ) : null}
        </div>
        <CommandPaletteResults />
        <CommandPaletteSearchHint
          mode={classifyOmnibarSearchHint(state.trimmedDeferredQuery, visibleSearchResults, {
            truncated: state.searchTruncated,
          })}
          inExclusiveMode={state.inExclusiveMode}
          paletteModeKind={state.paletteMode.kind}
        />
      </CommandDialog>
      <NewItemDialog
        open={state.createDialogKind === 'file'}
        onOpenChange={(next) => {
          if (!next) state.setCreateDialogKind(null);
        }}
        kind="file"
        initialDir={state.initialCreateDir}
      />
      <NewItemDialog
        open={state.createDialogKind === 'folder'}
        onOpenChange={(next) => {
          if (!next) state.setCreateDialogKind(null);
        }}
        kind="folder"
        initialDir={state.initialCreateDir}
      />
      <SeedDialog open={state.seedDialogOpen} onOpenChange={state.setSeedDialogOpen} />
      {state.bridge ? (
        <CreateProjectDialog
          open={state.createProjectOpen}
          onOpenChange={state.setCreateProjectOpen}
          bridge={state.bridge}
        />
      ) : null}
      {state.bridge ? (
        <ReportBugDialog open={state.reportBugOpen} onOpenChange={state.setReportBugOpen} />
      ) : null}
    </>
  );
}
