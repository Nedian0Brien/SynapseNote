import type { DatabasePresenceEntry } from '@nedian0brien/synapsenote-core';

export function DatabasePresenceBadges({
  entries,
  scope,
}: {
  entries: readonly DatabasePresenceEntry[];
  scope: 'cell' | 'record' | 'schema';
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1" data-database-presence={scope}>
      {entries.slice(0, 4).map((entry) => (
        <span
          key={`${entry.actor.principalId ?? entry.actor.name}:${entry.actor.color}:${entry.databaseId}:${entry.sourceId}:${entry.recordId}:${entry.propertyId}`}
          className="inline-flex max-w-36 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
          title={`${entry.actor.name} · ${entry.operation}`}
          role="status"
          aria-label={`${entry.actor.name} is ${entry.operation}`}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.actor.color }}
            aria-hidden="true"
          />
          <span className="truncate">{entry.actor.name}</span>
        </span>
      ))}
      {entries.length > 4 ? (
        <span className="text-muted-foreground text-xs">+{entries.length - 4}</span>
      ) : null}
    </div>
  );
}
