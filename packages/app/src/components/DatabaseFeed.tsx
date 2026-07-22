import { Trans } from '@lingui/react/macro';
import type {
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDatabaseDateTime } from '@/lib/database-display-format';
import { cn } from '@/lib/utils';

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => valueText(item)).join(', ');
  if (typeof value === 'object') {
    if ('start' in value && typeof value.start === 'string') return value.start;
    return JSON.stringify(value);
  }
  return String(value);
}

function chronologyText(value: unknown): string {
  const raw = valueText(value);
  const instant = Date.parse(raw);
  return Number.isFinite(instant) ? formatDatabaseDateTime(instant) : raw;
}

function authorText(value: unknown, people: readonly ProjectedDatabasePerson[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  const ids = Array.isArray(value) ? value : [value];
  return ids.map((id) => people.find((person) => person.id === id)?.name ?? String(id)).join(', ');
}

function sessionKey(viewId: string): string {
  return `synapsenote:database-feed-read:${viewId}`;
}

function initialRead(viewId: string): Set<string> {
  try {
    const value = sessionStorage.getItem(sessionKey(viewId));
    return new Set(value ? (JSON.parse(value) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function DatabaseFeed({
  source,
  view,
  result,
  people = result.people ?? [],
  onOpen,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  onOpen?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const [read, setRead] = useState<Set<string>>(() => initialRead(view.id));
  if (view.layout.type !== 'feed') return null;
  const configuration = view.layout.configuration;
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const chronologyProperty = source.properties.find(
    (property) => property.id === configuration.chronologyPropertyId,
  );
  const authorProperty = configuration.authorPropertyId
    ? source.properties.find((property) => property.id === configuration.authorPropertyId)
    : undefined;
  if (!titleProperty || !chronologyProperty) {
    return (
      <div role="alert" className="rounded border border-destructive/30 p-4 text-destructive">
        <Trans>This Feed view has an invalid Title or chronology property.</Trans>
      </div>
    );
  }
  const properties = view.projection.propertyIds
    .map((id) => source.properties.find((property) => property.id === id))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined &&
        property.id !== titleProperty.id &&
        property.id !== chronologyProperty.id &&
        property.id !== authorProperty?.id,
    )
    .slice(0, 4);
  const markRead = (recordId: string) => {
    if (configuration.readTracking !== 'session') return;
    setRead((current) => {
      const next = new Set(current).add(recordId);
      try {
        sessionStorage.setItem(sessionKey(view.id), JSON.stringify([...next]));
      } catch {
        // Session read state is optional and never blocks opening a canonical record.
      }
      return next;
    });
  };
  const open = (record: ProjectedDatabaseRecord) => {
    markRead(record.id);
    onOpen?.(record);
  };

  return (
    <section
      className="mx-auto max-w-3xl space-y-3"
      aria-label={`${view.name} Feed`}
      data-database-feed
    >
      {result.records.map((record) => {
        const unread = configuration.readTracking === 'session' && !read.has(record.id);
        return (
          <article
            key={record.id}
            className={cn(
              'relative rounded-xl border bg-card shadow-sm',
              configuration.density === 'compact' ? 'p-3' : 'p-5',
              unread && 'border-primary/40',
            )}
            data-feed-card={record.id}
            data-read={unread ? 'false' : 'true'}
          >
            {unread ? (
              <>
                <span className="absolute top-3 right-3 size-2 rounded-full bg-primary" />
                <span className="sr-only">Unread</span>
              </>
            ) : null}
            <div className="flex items-start justify-between gap-3 pr-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">
                  {authorText(record.values[authorProperty?.id ?? ''], people) ?? source.name} ·{' '}
                  <time>{chronologyText(record.values[chronologyProperty.id])}</time>
                </p>
                <h3 className="mt-1 text-balance font-semibold text-lg">
                  {valueText(record.values[titleProperty.id])}
                </h3>
                <p className="mt-1 truncate text-muted-foreground text-xs" title={record.path}>
                  {source.name} · {record.path}
                </p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Open feed item"
                onClick={() => open(record)}
              >
                <ExternalLink />
              </Button>
            </div>
            {configuration.showProperties && properties.length > 0 ? (
              <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                {properties.map((property) => (
                  <div key={property.id} className="min-w-0 rounded bg-muted/40 px-2 py-1.5">
                    <dt className="text-muted-foreground text-[11px]">{property.name}</dt>
                    <dd className="truncate text-sm">{valueText(record.values[property.id])}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {configuration.readTracking === 'session' && unread ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() => markRead(record.id)}
              >
                <Check /> <Trans>Mark read for this session</Trans>
              </Button>
            ) : null}
          </article>
        );
      })}
      {result.records.length === 0 ? (
        <p className="rounded border border-dashed p-8 text-center text-muted-foreground text-sm">
          <Trans>No feed items match this view.</Trans>
        </p>
      ) : null}
      {!result.isComplete ? (
        <p className="text-center text-muted-foreground text-xs">
          Showing {result.returned.toLocaleString()} of {result.matched.toLocaleString()} items.
          Load the next page to continue.
        </p>
      ) : null}
    </section>
  );
}
