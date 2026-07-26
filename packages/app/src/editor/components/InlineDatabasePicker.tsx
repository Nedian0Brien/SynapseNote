import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DatabaseCatalogCandidate, DatabaseDescription } from '@/lib/database-catalog-client';
import { describeDatabase, fetchDatabaseCatalog } from '@/lib/database-catalog-client';

export interface InlineDatabasePickerProps {
  message?: string;
  onSelected: (reference: { databaseId: string; sourceId: string; viewId: string }) => void;
  onCreateBlank?: () => void;
}

/**
 * Human-facing replacement for the raw database/source/view ID prop panel.
 * The component intentionally keeps the machine IDs out of the first-use
 * surface; they remain in the serialized MDX and in the advanced prop panel.
 */
export function InlineDatabasePicker({
  message,
  onSelected,
  onCreateBlank,
}: InlineDatabasePickerProps) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<DatabaseCatalogCandidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<{
    candidate: DatabaseCatalogCandidate;
    sourceId: string;
  } | null>(null);
  const [description, setDescription] = useState<DatabaseDescription | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCandidates(result.candidates);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load databases');
        setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const visibleCandidates = candidates.filter((candidate) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      candidate.name,
      candidate.purpose,
      ...candidate.sources.map((source) => source.name),
    ].some((value) => value.toLowerCase().includes(needle));
  });

  const chooseSource = (candidate: DatabaseCatalogCandidate, sourceId: string) => {
    setSelectedSource({ candidate, sourceId });
    setDescription(null);
    setError(null);
    void describeDatabase({ databaseId: candidate.id, sourceId })
      .then((nextDescription) => setDescription(nextDescription))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Unable to load saved views');
      });
  };

  return (
    <section
      className="my-3 rounded-lg border border-dashed bg-background p-4"
      contentEditable={false}
      data-database-view-picker
      aria-label="Choose a database view"
    >
      <div className="flex items-start gap-3">
        <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">Choose a database view</div>
          <p className="mt-1 text-muted-foreground text-xs">
            {message ?? 'Pick a database and saved view. Pages stay shared with the source.'}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search databases"
          aria-label="Search databases"
        />
      </div>
      {onCreateBlank ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCreateBlank}>
            <Plus aria-hidden="true" /> Create new database
          </Button>
          <span className="text-muted-foreground text-xs">
            Start with a blank inline table; pages stay shared with this page.
          </span>
        </div>
      ) : null}
      {status === 'loading' ? (
        <div className="mt-3 text-muted-foreground text-xs" role="status">
          Loading databases
        </div>
      ) : status === 'error' ? (
        <div className="mt-3 text-destructive text-xs" role="alert">
          {error}
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div className="mt-3 text-muted-foreground text-xs">No matching databases.</div>
      ) : (
        <div className="mt-3 grid gap-2">
          {visibleCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-md border p-2">
              <div className="font-medium text-sm">{candidate.name}</div>
              <div className="mt-0.5 text-muted-foreground text-xs">{candidate.purpose}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidate.sources.map((source) => (
                  <Button
                    key={source.id}
                    type="button"
                    size="sm"
                    variant={selectedSource?.sourceId === source.id ? 'secondary' : 'outline'}
                    onClick={() => chooseSource(candidate, source.id)}
                  >
                    {source.name}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedSource && description?.source ? (
        <div className="mt-3 rounded-md border bg-muted/20 p-2">
          <div className="font-medium text-sm">Choose a saved view</div>
          <div className="mt-2 grid gap-1.5">
            {description.database.views
              .filter((view) => view.sourceId === selectedSource.sourceId)
              .map((view) => (
                <Button
                  key={view.id}
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start text-left"
                  onClick={() =>
                    onSelected({
                      databaseId: selectedSource.candidate.id,
                      sourceId: selectedSource.sourceId,
                      viewId: view.id,
                    })
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{view.name}</span>
                    <span className="block text-muted-foreground text-xs">
                      {view.layout.type} · shared pages, independent view settings
                    </span>
                  </span>
                </Button>
              ))}
          </div>
        </div>
      ) : null}
      {selectedSource && error ? (
        <div className="mt-2 text-destructive text-xs" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
