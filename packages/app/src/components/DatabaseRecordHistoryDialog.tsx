import { Trans } from '@lingui/react/macro';
import type { DatabaseSource } from '@nedian0brien/synapsenote-core';
import { GitBranch, HardDrive, History, Sparkles, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDatabaseDateTime } from '@/lib/database-display-format';
import {
  type DatabaseRecordHistoryEvent,
  fetchDatabaseRecordHistory,
} from '@/lib/database-record-history-client';

export function DatabaseRecordHistoryDialog({
  open,
  onOpenChange,
  docName,
  source,
  load = fetchDatabaseRecordHistory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docName: string;
  source: DatabaseSource;
  load?: typeof fetchDatabaseRecordHistory;
}) {
  const [events, setEvents] = useState<DatabaseRecordHistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setEvents(null);
    setError(null);
    void load({ docName, source, signal: controller.signal })
      .then(setEvents)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load record history');
        }
      });
    return () => controller.abort();
  }, [docName, load, open, source]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Record history</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Property-level changes derived from durable page versions.</Trans>
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!events ? (
          <p className="text-sm text-muted-foreground" role="status">
            <Trans>Loading record history</Trans>
          </p>
        ) : null}
        {events?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans>No record history yet.</Trans>
          </p>
        ) : null}
        <div className="space-y-3">
          {events?.map((event) => {
            const Icon =
              event.origin === 'git'
                ? GitBranch
                : event.origin === 'filesystem'
                  ? HardDrive
                  : event.actor.kind === 'agent'
                    ? Sparkles
                    : event.actor.kind === 'human'
                      ? User
                      : History;
            return (
              <article
                key={event.sha}
                className="rounded-md border p-3"
                data-record-history-event={event.sha}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4" />
                    <span>
                      {event.actor.kind} · {event.actor.principal_id}
                    </span>
                    <span className="text-muted-foreground">{event.origin}</span>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={event.timestamp}>
                    {formatDatabaseDateTime(event.timestamp)}
                  </time>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.message}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.changes.map((change) => (
                    <span
                      key={`${change.kind}:${change.propertyId ?? change.label}`}
                      className="rounded bg-muted px-2 py-1 text-xs"
                      data-property-attribution={change.propertyId}
                    >
                      {change.label}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
