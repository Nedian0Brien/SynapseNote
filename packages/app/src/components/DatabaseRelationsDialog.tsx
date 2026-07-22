import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDefinition,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { databaseRecordPathToHash } from '@/lib/database-navigation';
import {
  type DatabaseRelationNavigationResult,
  resolveDatabaseRelationNavigation,
} from '@/lib/database-relation-navigation';

export function DatabaseRelationsDialog({
  open,
  onOpenChange,
  database,
  source,
  record,
  resolveRelations = resolveDatabaseRelationNavigation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  resolveRelations?: typeof resolveDatabaseRelationNavigation;
}) {
  const [result, setResult] = useState<DatabaseRelationNavigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setResult(null);
    setError(null);
    void resolveRelations({ database, source, record }).then(
      (next) => {
        if (active) setResult(next);
      },
      (cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load relations');
      },
    );
    return () => {
      active = false;
    };
  }, [database, open, record, resolveRelations, source]);
  const propertyNames = [...new Set(result?.items.map((item) => item.propertyName) ?? [])];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Related records</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Open permission-visible Relation targets without creating Markdown links.</Trans>
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!result ? (
          <p className="text-sm text-muted-foreground" role="status">
            <Trans>Loading related records</Trans>
          </p>
        ) : null}
        {result && result.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans>No visible related records.</Trans>
          </p>
        ) : null}
        {propertyNames.map((propertyName) => (
          <section key={propertyName} className="space-y-1">
            <h3 className="text-sm font-medium">{propertyName}</h3>
            {result?.items
              .filter((item) => item.propertyName === propertyName)
              .map((item) => (
                <Button
                  key={`${item.propertyId}:${item.recordId}`}
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  asChild
                >
                  <a href={databaseRecordPathToHash(item.path)}>
                    <ExternalLink /> {item.title}
                  </a>
                </Button>
              ))}
          </section>
        ))}
        {result && (result.unavailable > 0 || result.truncated) ? (
          <p className="text-xs text-muted-foreground">
            {result.unavailable > 0
              ? `${result.unavailable} related target(s) are unavailable or not permitted. `
              : ''}
            {result.truncated ? 'More relation targets exist beyond this bounded list.' : ''}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
