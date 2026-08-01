import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { FileText, Hash, Loader2, Sparkles } from 'lucide-react';
import { CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { makeOmnibarRecentKey } from '../command-palette-recents';
import { NavigationItem } from './CommandPaletteNavigationItem';
import { useCommandPaletteState } from './CommandPaletteStateProvider';
import { navigateToDocHash } from './command-palette-utils';

/** Renders the exclusive tag and explicit-submit semantic result families. */
export function CommandPaletteModeResults() {
  const { t } = useLingui();
  const {
    fireSemanticSearch,
    isSemanticMode,
    navigateToEntry,
    onOpenChange,
    paletteMode,
    query,
    semanticIndexedCount,
    semanticIndexing,
    semanticResults,
    semanticTotalCount,
    semanticView,
    setQuery,
    tagDocs,
    tagDocsStatus,
    tagListItems,
    tagsListStatus,
  } = useCommandPaletteState();
  const tagListQuery = paletteMode.kind === 'tag-list' ? paletteMode.query : '';
  const tagDocsName = paletteMode.kind === 'tag-docs' ? paletteMode.tagName : '';
  const semanticSubmitQuery = semanticView?.submit?.query ?? '';
  const semanticResultsLabel = semanticView?.results.forQuery ?? '';
  return (
    <>
      {isSemanticMode && semanticView ? (
        <>
          {semanticIndexing ? (
            <div
              className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs"
              role="status"
              aria-live="polite"
              data-testid="command-palette-semantic-indexing"
            >
              <Loader2 className="size-3.5 animate-spin" />
              <Trans>
                Indexing your pages — {semanticIndexedCount} of {semanticTotalCount} ready. Results
                may be incomplete.
              </Trans>
            </div>
          ) : null}
          {semanticView.submit ? (
            <CommandGroup>
              <CommandItem
                value="semantic-submit"
                onSelect={() => fireSemanticSearch(semanticSubmitQuery)}
                data-testid="command-palette-semantic-submit"
              >
                {semanticView.submit.kind === 'retry' ? (
                  <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Sparkles />
                    <Trans>Couldn&apos;t reach the embeddings provider — press ↵ to retry</Trans>
                  </span>
                ) : (
                  <>
                    <Sparkles />
                    <span className="min-w-0 flex-1 truncate">
                      <Trans>Search &quot;{semanticSubmitQuery}&quot; by meaning</Trans>
                    </span>
                    <CommandShortcut>↵</CommandShortcut>
                  </>
                )}
              </CommandItem>
            </CommandGroup>
          ) : null}
          {semanticView.notice === 'empty' ? (
            <CommandEmpty data-testid="command-palette-semantic-empty">
              <Trans>Type a query, then press ↵ to search your pages by meaning.</Trans>
            </CommandEmpty>
          ) : null}
          {semanticView.notice === 'searching' ? (
            <div
              className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm"
              role="status"
              aria-live="polite"
              data-testid="command-palette-semantic-searching"
            >
              <Loader2 className="size-4 animate-spin" />
              <Trans>Searching by meaning</Trans>
            </div>
          ) : null}
          {semanticView.notice === 'no-results' ? (
            <CommandEmpty data-testid="command-palette-semantic-no-results">
              <Trans>No pages matched &quot;{query.trim()}&quot; by meaning.</Trans>
            </CommandEmpty>
          ) : null}
          {semanticView.results.show ? (
            <CommandGroup
              heading={
                semanticView.results.dimmed
                  ? t({ message: `Showing results for "${semanticResultsLabel}"` })
                  : t`By meaning`
              }
            >
              <div
                data-testid="command-palette-semantic-results"
                data-dimmed={semanticView.results.dimmed}
              >
                {semanticResults.map((entry) => (
                  <NavigationItem
                    key={makeOmnibarRecentKey(entry.kind, entry.path)}
                    entry={entry}
                    disabled={semanticView.results.dimmed}
                    onSelect={() => navigateToEntry(entry)}
                  />
                ))}
              </div>
            </CommandGroup>
          ) : null}
        </>
      ) : null}
      {paletteMode.kind === 'tag-list' ? (
        <CommandGroup
          heading={
            paletteMode.query ? t({ message: `Tags matching "${tagListQuery}"` }) : t`All tags`
          }
        >
          {tagsListStatus === 'loading' ? (
            <CommandEmpty>
              <Trans>Loading tags</Trans>
            </CommandEmpty>
          ) : null}
          {tagsListStatus === 'error' ? (
            <CommandEmpty>
              <Trans>Failed to load tags. Press Escape and re-open to retry.</Trans>
            </CommandEmpty>
          ) : null}
          {tagsListStatus !== 'loading' && tagListItems.length === 0 ? (
            <CommandEmpty>
              {paletteMode.query
                ? t({ message: `No tags match "${tagListQuery}".` })
                : t`No tags yet — author \`#tagname\` in any doc to populate the index.`}
            </CommandEmpty>
          ) : null}
          {tagListItems.map((tag) => (
            <CommandItem
              key={`tag:${tag.name}`}
              value={`tag ${tag.name}`}
              onSelect={() => setQuery(`tag:${tag.name}`)}
              data-testid={`command-palette-tag-${tag.name}`}
            >
              <Hash />
              <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                <Plural value={tag.count} one="# doc" other="# docs" />
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {paletteMode.kind === 'tag-docs' ? (
        <CommandGroup heading={t({ message: `Docs tagged #${tagDocsName}` })}>
          {tagDocsStatus === 'loading' ? (
            <CommandEmpty>
              <Trans>Loading docs</Trans>
            </CommandEmpty>
          ) : null}
          {tagDocsStatus === 'error' ? (
            <CommandEmpty>
              <Trans>Failed to load docs. Press Escape and re-open to retry.</Trans>
            </CommandEmpty>
          ) : null}
          {tagDocsStatus === 'success' && tagDocs.length === 0 ? (
            <CommandEmpty>
              {t({ message: `No docs registered under #${tagDocsName}.` })}
            </CommandEmpty>
          ) : null}
          {tagDocs.map((doc) => {
            const title = doc.title || doc.docName.split('/').pop() || doc.docName;
            const viaTags = doc.matchingTags
              .filter((tag) => tag !== tagDocsName)
              .map((tag) => `#${tag}`)
              .join(', ');
            return (
              <CommandItem
                key={`tag-doc:${doc.docName}`}
                value={`tag-doc ${doc.docName}`}
                onSelect={() => {
                  onOpenChange(false);
                  navigateToDocHash(doc.docName);
                }}
                data-testid={`command-palette-tag-doc-${doc.docName}`}
                className="items-start"
              >
                <FileText className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{title}</span>
                  <span className="truncate text-muted-foreground text-xs">{doc.docName}</span>
                  {doc.matchingTags.some((tag) => tag !== tagDocsName) ? (
                    <span className="truncate text-muted-foreground text-[11px]">
                      <Trans>via {viaTags}</Trans>
                    </span>
                  ) : null}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      ) : null}
    </>
  );
}
