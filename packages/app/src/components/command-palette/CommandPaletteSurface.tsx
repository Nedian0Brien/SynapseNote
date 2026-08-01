// biome-ignore-all lint/plugin/no-raw-html-interactive-element: filter pills intentionally use native buttons to preserve the existing compact command-dialog affordance.
import { Trans, useLingui } from '@lingui/react/macro';
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
  const { t } = useLingui();
  const {
    bridge,
    createDialogKind,
    createProjectOpen,
    enterSemanticMode,
    exitSemanticMode,
    fallbackSearchResults,
    inExclusiveMode,
    initialCreateDir,
    inputRef,
    isSemanticMode,
    isTagMode,
    onOpenChange,
    onPaletteEscapeKeyDown,
    onSemanticInputKeyDown,
    open,
    paletteMode,
    query,
    reportBugOpen,
    searchResults,
    searchStatus,
    searchTruncated,
    seedDialogOpen,
    semanticCapable,
    setCreateDialogKind,
    setCreateProjectOpen,
    setQuery,
    setReportBugOpen,
    setSeedDialogOpen,
    toggleTagMode,
    trimmedDeferredQuery,
  } = useCommandPaletteState();
  const visibleSearchResults = computeVisibleSearchResults({
    searchResults,
    fallbackSearchResults,
    searchStatus,
  });
  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t`Workspace Command Palette`}
        description={t`Search pages, databases, folders, and commands for the current workspace.`}
        className="sm:max-w-2xl"
        commandProps={{
          shouldFilter: false,
          className:
            '[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4',
        }}
        onEscapeKeyDown={onPaletteEscapeKeyDown}
      >
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={onSemanticInputKeyDown}
          placeholder={
            isSemanticMode ? t`Search by meaning` : t`Search pages, databases, or commands`
          }
        />
        <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
          <button
            type="button"
            onClick={toggleTagMode}
            data-testid="command-palette-filter-tag"
            data-active={isTagMode}
            aria-pressed={isTagMode}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              isTagMode
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Hash className="size-3.5" />
            <span>
              <Trans>By tag</Trans>
            </span>
          </button>
          {semanticCapable ? (
            <button
              type="button"
              onClick={() => (isSemanticMode ? exitSemanticMode() : enterSemanticMode())}
              data-testid="command-palette-filter-semantic"
              data-active={isSemanticMode}
              aria-pressed={isSemanticMode}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                isSemanticMode
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
          mode={classifyOmnibarSearchHint(trimmedDeferredQuery, visibleSearchResults, {
            truncated: searchTruncated,
          })}
          inExclusiveMode={inExclusiveMode}
          paletteModeKind={paletteMode.kind}
        />
      </CommandDialog>
      <NewItemDialog
        open={createDialogKind === 'file'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="file"
        initialDir={initialCreateDir}
      />
      <NewItemDialog
        open={createDialogKind === 'folder'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="folder"
        initialDir={initialCreateDir}
      />
      <SeedDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen} />
      {bridge ? (
        <CreateProjectDialog
          open={createProjectOpen}
          onOpenChange={setCreateProjectOpen}
          bridge={bridge}
        />
      ) : null}
      {bridge ? <ReportBugDialog open={reportBugOpen} onOpenChange={setReportBugOpen} /> : null}
    </>
  );
}
