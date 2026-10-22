import { Database, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DatabaseCatalogCandidate } from '@/lib/database-catalog-client';
import { cn } from '@/lib/utils';
import type { DatabaseTableSelection } from './database-table-types';

export function DatabaseWorkspaceSourceList({
  candidates,
  selected,
  onSelect,
}: {
  candidates: readonly DatabaseCatalogCandidate[];
  selected: DatabaseTableSelection | null;
  onSelect: (selection: DatabaseTableSelection) => void;
}) {
  return (
    <nav aria-label="Databases" className="space-y-4">
      {candidates.map((database) => (
        <section key={database.id}>
          <div className="mb-1 flex items-center gap-2 px-2 font-medium text-sm">
            <Database className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{database.name}</span>
          </div>
          <div className="space-y-1">
            {database.sources.map((source) => (
              <Button
                key={source.id}
                variant="ghost"
                className={cn(
                  'h-auto w-full justify-start px-3 py-2 text-left',
                  selected?.sourceId === source.id && 'bg-muted',
                )}
                onClick={() => onSelect({ databaseId: database.id, sourceId: source.id })}
              >
                <Table2 className="size-4" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{source.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {source.recordMeaning}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
