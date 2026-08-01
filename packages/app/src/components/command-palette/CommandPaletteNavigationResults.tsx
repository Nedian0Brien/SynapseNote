import { Trans } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { CommandEmpty, CommandGroup } from '@/components/ui/command';
import { makeOmnibarRecentKey } from '../command-palette-recents';
import { NavigationItem } from './CommandPaletteNavigationItem';
import { useCommandPaletteState } from './CommandPaletteStateProvider';
import { computeVisibleSearchResults } from './command-palette-utils';

/** Renders one ordered phase of the normal-mode navigation result family. */
export function CommandPaletteNavigationResults({ phase }: { phase: 'early' | 'late' }) {
  const state = useCommandPaletteState();
  const visibleSearchResults = computeVisibleSearchResults({
    searchResults: state.searchResults,
    fallbackSearchResults: state.fallbackSearchResults,
    searchStatus: state.searchStatus,
  });
  const showRecentNavigation =
    !state.inExclusiveMode && state.trimmedDeferredQuery === '' && state.visibleRecents.length > 0;
  const showNavigation = !state.inExclusiveMode && visibleSearchResults.length > 0;
  const showDatabaseNavigation =
    !state.inExclusiveMode &&
    state.trimmedDeferredQuery !== '' &&
    state.databaseSearchResults.length > 0;
  const showSearchPreparing =
    !state.inExclusiveMode &&
    state.trimmedDeferredQuery !== '' &&
    (state.pagesLoading ||
      state.searchIndexWarming ||
      state.databaseNavigationStatus === 'loading') &&
    !showNavigation &&
    !showDatabaseNavigation;
  const showSearchLoading =
    !state.inExclusiveMode &&
    state.trimmedDeferredQuery !== '' &&
    state.searchStatus === 'loading' &&
    !showNavigation &&
    !showDatabaseNavigation &&
    !showSearchPreparing;
  const hasAnyResults =
    state.inExclusiveMode ||
    showRecentNavigation ||
    showNavigation ||
    showDatabaseNavigation ||
    showSearchLoading ||
    showSearchPreparing ||
    state.commandIds.size > 0 ||
    state.showProjectRecents ||
    state.showAgentGroup ||
    state.matchedWorktrees.length > 0;
  if (phase === 'early') {
    return (
      <>
        {showSearchPreparing ? (
          <div
            className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm"
            role="status"
            aria-live="polite"
            data-testid="command-palette-search-preparing"
          >
            <Loader2 className="size-4 animate-spin" />
            <Trans>Preparing search</Trans>
          </div>
        ) : null}
        {showSearchLoading && !showNavigation ? (
          <CommandEmpty>
            <Trans>Searching</Trans>
          </CommandEmpty>
        ) : null}
        {!hasAnyResults ? (
          <CommandEmpty>
            {state.searchStatus === 'error' ? (
              <Trans>Search failed.</Trans>
            ) : (
              <Trans>No matching commands.</Trans>
            )}
          </CommandEmpty>
        ) : null}
        {showRecentNavigation ? (
          <CommandGroup heading={state.t`Recently opened`}>
            {state.visibleRecents.map((entry) => (
              <NavigationItem
                key={makeOmnibarRecentKey(entry.kind, entry.path)}
                entry={entry}
                onSelect={() => state.navigateToEntry(entry)}
              />
            ))}
          </CommandGroup>
        ) : null}
      </>
    );
  }

  return (
    <>
      {showNavigation ? (
        <CommandGroup heading={state.t`Search`}>
          {visibleSearchResults.map((entry) => (
            <NavigationItem
              key={makeOmnibarRecentKey(entry.kind, entry.path)}
              entry={entry}
              query={state.trimmedDeferredQuery}
              onSelect={() => state.navigateToEntry(entry)}
            />
          ))}
        </CommandGroup>
      ) : null}
      {showDatabaseNavigation ? (
        <CommandGroup heading={state.t`Databases`}>
          {state.databaseSearchResults.map((entry) => (
            <NavigationItem
              key={entry.path}
              entry={entry}
              query={state.trimmedDeferredQuery}
              onSelect={() => state.navigateToEntry(entry)}
            />
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}
