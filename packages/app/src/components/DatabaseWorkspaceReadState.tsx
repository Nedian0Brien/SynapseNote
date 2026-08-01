import { Trans } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatabaseAtomicApprovalScope, DatabaseStateNotice } from './DatabaseTableGrid';
import { databaseCreationPreviewValue, databasePlanHumanSummary } from './database-table-utils';
import type { DatabaseWorkspaceRenderContext } from './database-workspace-context';

export function DatabaseWorkspaceReadState({
  context,
}: {
  context: DatabaseWorkspaceRenderContext;
}) {
  const {
    ghost,
    creationPreview,
    mutationStatus,
    finishReview,
    scopedOfflineQueue,
    offlineQueueMessage,
    refreshNow,
    error,
    refreshProblem,
    tableStatus,
    isPagePresentation,
    description,
    discardQueuedWrites,
    catalogStatus,
    onOpenChange,
  } = context;

  return (
    <>
      {ghost && !description?.source ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 border-dashed bg-primary/5 p-3"
          data-testid="database-creation-ghost-review"
          data-canonical="false"
        >
          <div>
            <Badge variant="primary">
              <Trans>Proposed database · not saved</Trans>
            </Badge>
            <p className="mt-1 text-muted-foreground text-xs">
              {ghost.diff.manifests.length} manifest · {ghost.diff.records.length} records ·{' '}
              <Trans>review the exact plan before canonical creation</Trans>
            </p>
            <p
              className="mt-1 font-medium text-xs"
              data-testid="database-creation-human-plan-summary"
            >
              {databasePlanHumanSummary(ghost.diff)}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Scope: {ghost.diff.manifests.length} manifest(s), {ghost.diff.records.length} record
              file(s), {ghost.diff.templates.length} template file(s) · risk {ghost.risk.level}
            </p>
            <DatabaseAtomicApprovalScope approvals={ghost.approvals} />
            {creationPreview?.sampleRecords && creationPreview.sampleRecords.length > 0 ? (
              <section
                className="mt-3 rounded border bg-background/70 p-2"
                aria-label="Resulting page preview"
                data-testid="database-creation-resulting-page-preview"
              >
                <h3 className="font-medium text-xs">
                  <Trans>Resulting page preview</Trans>
                </h3>
                <p className="mt-1 text-muted-foreground text-xs">
                  <Trans>
                    The first pages will open in the editable database after this plan commits.
                  </Trans>
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {creationPreview.sampleRecords.slice(0, 4).map((record) => {
                    const source = creationPreview.sources.find(
                      (candidate) => candidate.key === record.sourceKey,
                    );
                    const properties = source?.properties.slice(0, 4) ?? [];
                    return (
                      <article
                        key={record.id ?? `${record.sourceKey}:${JSON.stringify(record.values)}`}
                        className="rounded border bg-background p-2 text-xs"
                      >
                        <div className="font-medium">Page preview</div>
                        <dl className="mt-1 grid gap-1">
                          {properties.map((property) => (
                            <div key={property.key} className="grid grid-cols-[auto_1fr] gap-2">
                              <dt className="text-muted-foreground">{property.name}</dt>
                              <dd className="truncate">
                                {databaseCreationPreviewValue(record.values[property.key])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <details className="mt-2 rounded border bg-background/60 px-2 py-1 text-xs">
              <summary className="cursor-pointer font-medium">
                <Trans>Exact plan details</Trans>
              </summary>
              <dl className="mt-2 grid gap-1 font-mono text-[11px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="break-all text-right">{ghost.planId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Plan hash</dt>
                  <dd className="break-all text-right">{ghost.planHash}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Snapshot</dt>
                  <dd className="break-all text-right">{ghost.snapshotRevision}</dd>
                </div>
              </dl>
            </details>
          </div>
          {mutationStatus === 'review' ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => finishReview(false)}>
                <Trans>Discard</Trans>
              </Button>
              <Button size="sm" onClick={() => finishReview(true)}>
                <Trans>Commit creation</Trans>
              </Button>
            </div>
          ) : (
            <Loader2 className="size-4 animate-spin" aria-label="Committing database creation" />
          )}
        </div>
      ) : null}
      {scopedOfflineQueue.length > 0 || offlineQueueMessage ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          data-database-offline-queue
          role="status"
        >
          <div>
            <div className="font-medium">
              <Trans>Offline write queue</Trans>
            </div>
            {scopedOfflineQueue.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {scopedOfflineQueue.filter((item) => item.state === 'queued').length} queued ·{' '}
                {scopedOfflineQueue.filter((item) => item.state === 'blocked').length} blocked.
                Reconnected writes are replanned against current property values and require exact
                review before commit.
              </p>
            ) : null}
            {offlineQueueMessage ? (
              <p className="text-muted-foreground text-xs">{offlineQueueMessage}</p>
            ) : null}
          </div>
          {scopedOfflineQueue.length > 0 ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mutationStatus !== 'idle'}
                onClick={refreshNow}
              >
                <Trans>Retry reconciliation</Trans>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={mutationStatus !== 'idle'}
                onClick={discardQueuedWrites}
              >
                <Trans>Discard queued writes</Trans>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error && (catalogStatus === 'error' || tableStatus === 'error') ? (
        <DatabaseStateNotice
          problem={error}
          onAction={
            error.kind === 'permission'
              ? undefined
              : error.kind === 'missing'
                ? () => onOpenChange(false)
                : refreshNow
          }
          actionKind={error.kind === 'missing' ? 'back' : 'recover'}
          notionSurface={isPagePresentation}
        />
      ) : null}
      {tableStatus === 'success' && refreshProblem ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          role="status"
          data-database-refresh-problem={refreshProblem.kind}
        >
          <span>
            <Trans>Refresh paused. The current database view remains available.</Trans>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={refreshNow}>
            <Trans>Retry refresh</Trans>
          </Button>
        </div>
      ) : null}
      {tableStatus === 'loading' ? (
        <div
          className="flex min-h-72 items-center justify-center text-muted-foreground"
          role="status"
          data-database-state="loading"
        >
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          {isPagePresentation ? <Trans>Loading pages</Trans> : <Trans>Loading records</Trans>}
        </div>
      ) : null}
    </>
  );
}
