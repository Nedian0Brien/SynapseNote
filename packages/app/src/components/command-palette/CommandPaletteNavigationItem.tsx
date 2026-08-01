import { Database } from 'lucide-react';
import type { DatabaseNavigationEntry } from '@/components/database-navigation-entries';
import { FileEntryIcon } from '@/components/file-entry-icon';
import { CommandItem } from '@/components/ui/command';
import type { OmnibarRecentEntry } from '../command-palette-recents';
import {
  splitTextByQueryMatches,
  type WorkspaceEntry,
  type WorkspaceSearchEntry,
} from '../command-palette-search';

/** Renders one typed file, folder, database, or recent-navigation result row. */
export function NavigationItem({
  disabled = false,
  entry,
  onSelect,
  query = '',
}: {
  disabled?: boolean;
  entry: WorkspaceEntry | WorkspaceSearchEntry | OmnibarRecentEntry | DatabaseNavigationEntry;
  onSelect: () => void;
  query?: string;
}) {
  const isDatabaseEntry = entry.kind === 'database';
  const title = isDatabaseEntry
    ? entry.name
    : 'title' in entry && entry.title
      ? entry.title
      : (entry.path.split('/').pop() ?? entry.path);
  const snippet = isDatabaseEntry
    ? `${entry.databaseName} · ${entry.sourceName}`
    : 'snippet' in entry
      ? entry.snippet
      : undefined;
  const docExt = 'docExt' in entry ? entry.docExt : undefined;
  const bodyIndexed = 'bodyIndexed' in entry ? entry.bodyIndexed : undefined;
  return (
    <CommandItem
      value={`${entry.kind} ${entry.path}`}
      onSelect={onSelect}
      disabled={disabled}
      data-testid={`command-palette-nav-${entry.kind}-${entry.path}`}
      className="items-start"
    >
      {isDatabaseEntry ? (
        <Database className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <FileEntryIcon
          bodyIndexed={bodyIndexed}
          className="mt-0.5 size-4"
          docExt={docExt}
          kind={entry.kind}
          path={entry.path}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">
          <HighlightedText query={query} text={title} />
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {isDatabaseEntry ? (
            <>
              <HighlightedText query={query} text={entry.databaseName} />
              <span aria-hidden="true"> · </span>
              <HighlightedText query={query} text={entry.sourceName} />
            </>
          ) : (
            <HighlightedText query={query} text={entry.path} />
          )}
        </span>
        {snippet ? (
          <span className="max-h-10 overflow-hidden text-muted-foreground text-xs leading-relaxed">
            <HighlightedText query={query} text={snippet} />
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  return (
    <>
      {splitTextByQueryMatches(text, query).map((segment) => {
        const key = `${segment.start}:${segment.match ? 'match' : 'plain'}`;
        return segment.match ? (
          <mark key={key} className="rounded-sm bg-primary/10 px-0.5 font-semibold text-primary">
            {segment.text}
          </mark>
        ) : (
          <span key={key}>{segment.text}</span>
        );
      })}
    </>
  );
}
