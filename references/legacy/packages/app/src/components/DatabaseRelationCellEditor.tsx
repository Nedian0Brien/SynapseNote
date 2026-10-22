import { Trans, useLingui } from '@lingui/react/macro';
import type {
  DatabaseProperty,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import { Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

type DatabaseRelationProperty = Extract<DatabaseProperty, { type: 'relation' }>;

function selectedIds(property: DatabaseRelationProperty, draft: string): string[] {
  if (property.cardinality === 'one') return draft === '' ? [] : [draft];
  try {
    const value: unknown = JSON.parse(draft);
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
  } catch {
    return [];
  }
}

export function DatabaseRelationCellEditor({
  property,
  draft,
  knownRecords = [],
  searchRecords,
  onDraftChange,
}: {
  property: DatabaseRelationProperty;
  draft: string;
  knownRecords?: readonly ProjectedDatabaseRelationRecord[];
  searchRecords?: (query: string) => Promise<readonly ProjectedDatabaseRelationRecord[]>;
  onDraftChange: (draft: string) => void;
}) {
  const { t } = useLingui();
  const selected = selectedIds(property, draft);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly ProjectedDatabaseRelationRecord[]>([]);
  const [loading, setLoading] = useState(searchRecords !== undefined);
  const [error, setError] = useState<string | null>(null);
  const searchRecordsRef = useRef(searchRecords);

  useEffect(() => {
    searchRecordsRef.current = searchRecords;
  }, [searchRecords]);

  useEffect(() => {
    const search = searchRecordsRef.current;
    if (!search) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => {
      void search(query.trim()).then(
        (records) => {
          if (!active) return;
          setResults(records);
          setLoading(false);
        },
        (cause) => {
          if (!active) return;
          setError(cause instanceof Error ? cause.message : t`Unable to search related records.`);
          setLoading(false);
        },
      );
    }, 150);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, t]);

  const byId = new Map<string, ProjectedDatabaseRelationRecord>();
  for (const record of [...knownRecords, ...results]) byId.set(record.id, record);
  const records = [...byId.values()].sort(
    (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  );
  const missingSelected = selected.filter((id) => !records.some((record) => record.id === id));
  const toggle = (recordId: string, checked: boolean) => {
    if (property.cardinality === 'one') {
      onDraftChange(checked ? recordId : '');
      return;
    }
    const next = new Set(selected);
    if (checked) next.add(recordId);
    else next.delete(recordId);
    onDraftChange(JSON.stringify([...next]));
  };

  return (
    <fieldset className="flex min-w-80 max-w-xl flex-col gap-2">
      <legend className="sr-only">{`Edit ${property.name}`}</legend>
      <div className="relative">
        <Search
          className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          className="pl-7"
          placeholder={t`Search related records`}
          aria-label={`Search records for ${property.name}`}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {loading ? (
          <Loader2
            className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin"
            aria-label={t`Searching related records`}
          />
        ) : null}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border p-2">
        {missingSelected.map((recordId) => (
          <div key={recordId} className="flex items-center gap-2 py-1 text-xs">
            <Checkbox
              checked
              aria-label={`Unavailable related record ${recordId}`}
              onCheckedChange={(checked) => toggle(recordId, checked === true)}
            />
            <span className="min-w-0 truncate">{recordId}</span>
            <span className="text-muted-foreground">
              <Trans>unavailable</Trans>
            </span>
          </div>
        ))}
        {records.map((record) => {
          const checked = selected.includes(record.id);
          const archived = record.archivedAt !== undefined;
          if (archived && !checked) return null;
          return (
            <div key={record.id} className="flex items-center gap-2 py-1 text-xs">
              <Checkbox
                checked={checked}
                disabled={archived && !checked}
                aria-label={`${record.title} for ${property.name}`}
                onCheckedChange={(value) => toggle(record.id, value === true)}
              />
              <span className="min-w-0 flex-1 truncate">{record.title}</span>
              {archived ? (
                <span className="text-muted-foreground">
                  <Trans>archived</Trans>
                </span>
              ) : null}
            </div>
          );
        })}
        {!loading && records.length === 0 && missingSelected.length === 0 ? (
          <p className="py-2 text-center text-muted-foreground text-xs">
            <Trans>No matching records.</Trans>
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {property.cardinality === 'one' ? (
          <Trans>Select one record. Showing up to 100 permission-visible matches.</Trans>
        ) : (
          <Trans>Select one or more records. Showing up to 100 permission-visible matches.</Trans>
        )}
      </p>
    </fieldset>
  );
}
