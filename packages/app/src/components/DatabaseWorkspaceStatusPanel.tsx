import { Trans } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { DatabaseConflictResolutionNotice } from '@/components/DatabaseConflictResolutionNotice';
import { DatabaseMigrationRecoveryPanel } from '@/components/DatabaseMigrationDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { databaseIndexProblem } from '@/lib/database-ui-problem';
import { DatabaseAtomicApprovalScope, DatabaseStateNotice } from './DatabaseTableGrid';
import { databasePlanHumanSummary } from './database-table-utils';
import type { DatabaseWorkspaceSuccessContext } from './database-workspace-context';

export function DatabaseWorkspaceStatusPanel({
  context,
}: {
  context: DatabaseWorkspaceSuccessContext;
}) {
  const {
    description,
    isPagePresentation,
    refreshNow,
    buttonStatus,
    buttonPlan,
    ghost,
    mutationStatus,
    finishReview,
    mutationConflict,
    setMutationError,
    mutationError,
    selection,
    pageError,
    result,
    candidates,
    setButtonPlan,
    commitButton,
    mutationReviewMode,
    mutationProgressVisible,
    setMutationConflict,
    onOpenChange,
    loadMore,
  } = context;

  return (
    <>
      {description.index.state === 'error' ? (
        <DatabaseStateNotice
          problem={databaseIndexProblem(
            'error',
            description.index.lastError?.message ?? 'Database index failed.',
          )}
          onAction={refreshNow}
          notionSurface={isPagePresentation}
        />
      ) : description.index.state === 'rebuilding' ? (
        <DatabaseStateNotice
          problem={databaseIndexProblem(
            'rebuilding',
            'Database index is rebuilding; shown rows may refresh.',
          )}
          notionSurface={isPagePresentation}
        />
      ) : null}
      {result && !result.isComplete ? (
        <div
          className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-sm"
          data-database-state="partial"
        >
          {isPagePresentation ? (
            <Trans>This view is paginated; not all matching pages are shown.</Trans>
          ) : (
            <Trans>This snapshot is paginated; not all matching records are shown.</Trans>
          )}
        </div>
      ) : null}
      {buttonStatus === 'planning' ? (
        <div
          className="flex items-center gap-2 rounded-md border p-3 text-muted-foreground text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <Trans>Planning exact Button actions</Trans>
        </div>
      ) : buttonPlan ? (
        <section
          className="space-y-3 rounded-md border border-primary/40 border-dashed bg-primary/5 p-3"
          data-testid="database-button-review"
          data-canonical="false"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">
              <Trans>Button plan · not executed</Trans>
            </Badge>
            <span className="font-medium text-sm">{buttonPlan.label}</span>
            <span className="font-mono text-muted-foreground text-xs">{buttonPlan.id}</span>
          </div>
          {buttonPlan.confirmation ? (
            <div className="text-sm">
              <div className="font-medium">{buttonPlan.confirmation.title}</div>
              {buttonPlan.confirmation.description ? (
                <p className="text-muted-foreground text-xs">
                  {buttonPlan.confirmation.description}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="text-muted-foreground text-xs">
            {buttonPlan.internalPlan?.diff.records.length ?? 0} database record changes ·{' '}
            {buttonPlan.externalSteps.length} external actions
          </div>
          {buttonPlan.externalSteps.map((step: any) => (
            <div key={step.actionId} className="rounded border bg-background p-2 text-xs">
              <div className="font-medium">
                {step.eventName} → {step.connectionId}
              </div>
              <div className="text-muted-foreground">
                {step.egressBytes} bytes · properties{' '}
                {Object.keys(step.payload.properties).join(', ') || 'none'}
                {step.payload.body === undefined ? '' : ' · includes body'}
              </div>
            </div>
          ))}
          {buttonPlan.externalSteps.length > 0 ? (
            <p className="text-amber-700 text-xs" role="status">
              <Trans>
                External actions run after the verified database commit and use durable idempotent
                delivery with bounded retry.
              </Trans>
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={buttonStatus === 'committing'}
              onClick={() => setButtonPlan(null)}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              size="sm"
              disabled={
                buttonStatus === 'committing' ||
                (buttonPlan.internalPlan !== null && !buttonPlan.internalPlan.committable) ||
                (buttonPlan.internalPlan === null && buttonPlan.externalSteps.length === 0)
              }
              onClick={commitButton}
            >
              {buttonStatus === 'committing' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              <Trans>Run Button</Trans>
            </Button>
          </div>
        </section>
      ) : null}
      {ghost ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 border-dashed bg-primary/5 p-3"
          data-testid="database-ghost-review"
          data-canonical="false"
        >
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">
                <Trans>Proposed · not saved</Trans>
              </Badge>
              <span className="font-mono text-muted-foreground text-xs">{ghost.planId}</span>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              <Trans>
                This ghost value is not canonical until the exact plan commits and the table
                refreshes.
              </Trans>
            </p>
            <p className="mt-1 font-medium text-xs" data-testid="database-human-plan-summary">
              {databasePlanHumanSummary(ghost.diff)}
            </p>
            <p
              className="mt-1 text-muted-foreground text-xs"
              data-testid="database-exact-change-scope"
            >
              Scope: {ghost.diff.records.length} record file(s), {ghost.diff.manifests.length}{' '}
              manifest(s), {ghost.diff.templates.length} template file(s) · risk {ghost.risk.level}
            </p>
            <DatabaseAtomicApprovalScope approvals={ghost.approvals} />
            {ghost.risk.reasons.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs" aria-label="Change risks">
                {ghost.risk.reasons.map((reason: any) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-muted-foreground text-xs">
              Recovery: a successful reversible commit exposes Undo last change; the durable
              transaction receipt retains its exact recovery scope.
            </p>
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
                <Trans>Commit change</Trans>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <Trans>Committing exact plan</Trans>
            </div>
          )}
        </div>
      ) : mutationStatus === 'planning' && mutationProgressVisible ? (
        <div
          className="flex items-center gap-2 rounded-md border p-3 text-muted-foreground text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {mutationReviewMode === 'automatic' ? (
            <Trans>Saving change</Trans>
          ) : (
            <Trans>Planning exact cell change</Trans>
          )}
        </div>
      ) : null}
      {mutationConflict ? (
        <DatabaseConflictResolutionNotice
          plan={mutationConflict.plan}
          onUseLatest={() => {
            setMutationConflict(null);
            setMutationError(null);
            refreshNow();
          }}
          onReplan={mutationConflict.replan}
        />
      ) : mutationError ? (
        <>
          <DatabaseStateNotice
            problem={mutationError}
            actionKind="reload"
            onAction={
              mutationError.kind === 'permission' || mutationError.kind === 'migration_required'
                ? undefined
                : () => {
                    setMutationError(null);
                    refreshNow();
                  }
            }
            notionSurface={isPagePresentation}
          />
          {mutationError.kind === 'migration_required' &&
          selection?.databaseId &&
          description?.index?.manifestRevision ? (
            <DatabaseMigrationRecoveryPanel
              databaseIds={[
                selection.databaseId,
                ...(candidates ?? []).map((candidate: { id: string }) => candidate.id),
              ]}
              databaseLabels={Object.fromEntries(
                (candidates ?? []).map((candidate: { id: string; name: string }) => [
                  candidate.id,
                  candidate.name,
                ]),
              )}
              expectedManifestRevision={description.index.manifestRevision}
            />
          ) : null}
        </>
      ) : null}
      {pageError ? (
        <DatabaseStateNotice
          problem={pageError}
          notionSurface={isPagePresentation}
          onAction={
            pageError.kind === 'permission'
              ? undefined
              : pageError.kind === 'missing'
                ? () => onOpenChange(false)
                : loadMore
          }
          actionKind={pageError.kind === 'missing' ? 'back' : 'recover'}
        />
      ) : null}
    </>
  );
}
