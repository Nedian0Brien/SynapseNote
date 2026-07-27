import { Plural, Trans } from '@lingui/react/macro';
import type {
  DatabaseDiagnosticsResult,
  DatabaseRepairPlan,
  DatabaseRepairResult,
  DatabaseRepairUndoResult,
} from '@nedian0brien/synapsenote-server';
import { AlertCircle, Download, Loader2, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DiagnosticsStatus = 'idle' | 'loading' | 'success' | 'error';
type RepairStatus = 'idle' | 'previewing' | 'applying' | 'undoing' | 'applied' | 'undone' | 'error';

async function responseJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
        ? value.detail
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return value;
}

/**
 * Build the content-free artifact used by the in-product diagnostics export.
 * Record paths are deliberately omitted because a Markdown filename can be a
 * record title. This object contains operational metadata only; it is safe to
 * attach to a beta feedback report without exporting database content.
 */
export function createDatabaseDiagnosticsExport(
  data: DatabaseDiagnosticsResult,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    scope: 'database-diagnostics',
    index: {
      state: data.index.state,
      revision: data.index.revision,
      manifestRevision: data.index.manifestRevision,
      recordCount: data.index.recordCount,
      issueCount: data.index.issueCount,
      lastRebuiltAt: data.index.lastRebuiltAt,
      lastIncrementalAt: data.index.lastIncrementalAt,
    },
    issues: {
      total: data.issues.total,
      byCode: data.issues.byCode,
      sample: data.issues.sample.map(({ code, recordId }) => ({ code, recordId })),
    },
    schemas: data.schemas,
    tasks: data.tasks,
    telemetry: data.telemetry,
  };
}

export function downloadDatabaseDiagnostics(data: DatabaseDiagnosticsResult): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }
  const blob = new Blob([JSON.stringify(createDatabaseDiagnosticsExport(data), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `synapsenote-database-diagnostics-${new Date().toISOString().replaceAll(':', '-')}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function fetchDatabaseDiagnostics(
  signal?: AbortSignal,
): Promise<DatabaseDiagnosticsResult> {
  const value = await responseJson(
    await fetch('/api/databases/diagnostics', { method: 'GET', signal }),
  );
  if (!value || typeof value !== 'object' || !('index' in value) || !('telemetry' in value)) {
    throw new Error('Invalid database diagnostics response');
  }
  return value as DatabaseDiagnosticsResult;
}

async function postRepair(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  return responseJson(
    await fetch('/api/databases/repair', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

export async function previewDatabaseRepair(
  documentIds?: Record<string, string>,
  signal?: AbortSignal,
): Promise<DatabaseRepairPlan> {
  const value = await postRepair(
    {
      action: 'preview',
      ...(documentIds && Object.keys(documentIds).length > 0 ? { documentIds } : {}),
    },
    signal,
  );
  if (!value || typeof value !== 'object' || !('plan' in value)) {
    throw new Error('Invalid database repair preview response');
  }
  return (value as { plan: DatabaseRepairPlan }).plan;
}

export async function undoDatabaseRepair(
  result: DatabaseRepairResult,
  signal?: AbortSignal,
): Promise<DatabaseRepairUndoResult> {
  const value = await postRepair(
    {
      action: 'undo',
      repairId: result.receipt.repairId,
      planHash: result.receipt.planHash,
      undoToken: result.receipt.undoToken,
      idempotencyKey: `ui-repair-undo-${crypto.randomUUID()}`,
      principalId: 'user:local',
    },
    signal,
  );
  if (!value || typeof value !== 'object' || !('result' in value)) {
    throw new Error('Invalid database repair undo response');
  }
  return (value as { result: DatabaseRepairUndoResult }).result;
}

export async function applyDatabaseRepair(
  plan: DatabaseRepairPlan,
  signal?: AbortSignal,
): Promise<DatabaseRepairResult> {
  const value = await postRepair(
    {
      action: 'apply',
      planId: plan.id,
      planHash: plan.hash,
      approvalToken: `approve:${plan.hash}`,
      idempotencyKey: `ui-repair-${crypto.randomUUID()}`,
      principalId: 'user:local',
    },
    signal,
  );
  if (!value || typeof value !== 'object' || !('result' in value)) {
    throw new Error('Invalid database repair apply response');
  }
  return (value as { result: DatabaseRepairResult }).result;
}

function Metric({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-medium">{value}</dd>
    </div>
  );
}

function averageMs(sum: number, count: number): string {
  return count === 0 ? '—' : `${Math.round(sum / count).toLocaleString()} ms`;
}

export function DatabaseDiagnosticsBody({
  data,
  status,
  error,
  onRetry,
  repairPlan,
  repairStatus,
  repairError,
  onPreviewRepair,
  onApplyRepair,
  onUndoRepair,
  repairResult,
  documentIdChoices,
  onDocumentIdChoice,
  onExport,
}: {
  data: DatabaseDiagnosticsResult | null;
  status: DiagnosticsStatus;
  error: string | null;
  onRetry: () => void;
  repairPlan: DatabaseRepairPlan | null;
  repairStatus: RepairStatus;
  repairError: string | null;
  onPreviewRepair: () => void;
  onApplyRepair: () => void;
  onUndoRepair: () => void;
  repairResult: DatabaseRepairResult | null;
  documentIdChoices: Readonly<Record<string, string>>;
  onDocumentIdChoice: (path: string, value: string) => void;
  onExport?: () => void;
}): React.JSX.Element {
  if (status === 'loading' && !data) {
    return (
      <div className="flex min-h-80 items-center justify-center" role="status" aria-busy="true">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        <Trans>Loading database diagnostics</Trans>
      </div>
    );
  }
  if (status === 'error' && !data) {
    return (
      <div
        className="flex min-h-80 flex-col items-center justify-center gap-3 text-center"
        role="alert"
      >
        <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
        <p className="font-medium">
          <Trans>Could not load database diagnostics</Trans>
        </p>
        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-80" />;
  }

  const { index, issues, schemas, tasks, telemetry } = data;

  return (
    <div className="space-y-5 overflow-y-auto" data-testid="database-diagnostics-body">
      <section aria-labelledby="diagnostics-index-heading">
        <div className="flex items-center justify-between gap-2">
          <h3 id="diagnostics-index-heading" className="text-sm font-medium">
            <Trans>Index state</Trans>
          </h3>
          <Button type="button" variant="outline" size="sm" onClick={() => onExport?.()}>
            <Download aria-hidden="true" />
            <Trans>Export diagnostics</Trans>
          </Button>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label={<Trans>State</Trans>} value={index.state} />
          <Metric label={<Trans>Records</Trans>} value={index.recordCount.toLocaleString()} />
          <Metric label={<Trans>Issues</Trans>} value={index.issueCount.toLocaleString()} />
          <Metric
            label={<Trans>Last rebuilt</Trans>}
            value={index.lastRebuiltAt ?? <Trans>Never</Trans>}
          />
        </dl>
        {index.lastError ? (
          <p className="mt-2 text-xs text-destructive">{index.lastError.message}</p>
        ) : null}
      </section>

      <section aria-labelledby="diagnostics-issues-heading">
        <h3 id="diagnostics-issues-heading" className="text-sm font-medium">
          <Trans>Invalid records</Trans>
        </h3>
        {issues.total === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <Trans>No invalid records detected.</Trans>
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(issues.byCode).map(([code, count]) => (
                <span key={code} className="rounded-full border px-2 py-0.5 font-mono">
                  {code}: {count}
                </span>
              ))}
            </div>
            <ul className="max-h-40 overflow-y-auto rounded-lg border text-xs">
              {issues.sample.map((issue, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: sample entries have no stable ID of their own
                  key={`${issue.path}-${index}`}
                  className="truncate border-b px-2 py-1 font-mono last:border-b-0"
                >
                  {issue.code} · {issue.path}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="diagnostics-schemas-heading">
        <h3 id="diagnostics-schemas-heading" className="text-sm font-medium">
          <Trans>Schema revisions</Trans>
        </h3>
        <ul className="mt-2 space-y-1 text-xs">
          {schemas.map((schema) => (
            <li key={schema.databaseId} className="flex items-center justify-between gap-2">
              <span>{schema.name}</span>
              <span className="truncate font-mono text-muted-foreground">
                {schema.schemaRevision}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="diagnostics-tasks-heading">
        <h3 id="diagnostics-tasks-heading" className="text-sm font-medium">
          <Trans>Recent tasks</Trans>
        </h3>
        {tasks.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <Trans>No tasks yet.</Trans>
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <span className="font-mono">{task.id}</span>
                <span>
                  {task.operation} · {task.state}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="diagnostics-telemetry-heading">
        <h3 id="diagnostics-telemetry-heading" className="text-sm font-medium">
          <Trans>Telemetry</Trans>
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric
            label={<Trans>Commits</Trans>}
            value={`${telemetry.commitSuccessCount} / ${telemetry.commitCount}`}
          />
          <Metric
            label={<Trans>Avg commit latency</Trans>}
            value={averageMs(telemetry.commitLatencyMsSum, telemetry.commitLatencyMsCount)}
          />
          <Metric label={<Trans>Conflicts</Trans>} value={telemetry.commitConflictCount} />
          <Metric label={<Trans>Rollbacks</Trans>} value={telemetry.commitRollbackCount} />
          <Metric label={<Trans>Index rebuilds</Trans>} value={telemetry.indexRebuildCount} />
          <Metric
            label={<Trans>Avg rebuild time</Trans>}
            value={averageMs(
              telemetry.indexRebuildDurationMsSum,
              telemetry.indexRebuildDurationMsCount,
            )}
          />
          <Metric
            label={<Trans>Context Packs truncated</Trans>}
            value={`${telemetry.contextPackTruncatedCount} / ${telemetry.contextPackCaptureCount}`}
          />
          <Metric
            label={<Trans>Automation failures</Trans>}
            value={telemetry.automationRunFailureCount}
          />
        </dl>
      </section>

      <section aria-labelledby="diagnostics-repair-heading">
        <h3 id="diagnostics-repair-heading" className="text-sm font-medium">
          <Trans>Repair actions</Trans>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreviewRepair}
            disabled={repairStatus === 'previewing' || repairStatus === 'applying'}
          >
            <Wrench className={repairStatus === 'previewing' ? 'animate-spin' : undefined} />
            <Trans>Preview repair</Trans>
          </Button>
          {repairPlan ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onApplyRepair}
              disabled={!repairPlan.committable || repairStatus === 'applying'}
            >
              {repairStatus === 'applying' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              <Trans>Apply repair</Trans>
            </Button>
          ) : null}
        </div>
        {repairPlan?.blockers.some((blocker) => blocker.code === 'missing_document_id') ? (
          <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3 text-xs">
            <p className="font-medium">
              <Trans>Choose IDs for linked documents</Trans>
            </p>
            {repairPlan.blockers
              .filter((blocker) => blocker.code === 'missing_document_id')
              .map((blocker) => (
                <label key={blocker.path} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono">{blocker.path}</span>
                  <Input
                    className="w-64 rounded border bg-background px-2 py-1 font-mono"
                    aria-label={`Document ID for ${blocker.path}`}
                    placeholder="doc_"
                    value={documentIdChoices[blocker.path] ?? ''}
                    onChange={(event) => onDocumentIdChoice(blocker.path, event.target.value)}
                  />
                </label>
              ))}
          </div>
        ) : null}
        {repairStatus === 'error' && repairError ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            {repairError}
          </p>
        ) : null}
        {repairStatus === 'applied' ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <Trans>Repair applied. Reopen this panel to see the refreshed state.</Trans>
          </p>
        ) : null}
        {repairResult ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onUndoRepair}
            disabled={repairStatus === 'undoing'}
          >
            {repairStatus === 'undoing' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            <Trans>Undo exact repair</Trans>
          </Button>
        ) : null}
        {repairStatus === 'undone' ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <Trans>Repair bytes restored exactly.</Trans>
          </p>
        ) : null}
        {repairPlan ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-6">
            <Metric
              label={<Trans>Stale identities</Trans>}
              value={repairPlan.summary.staleIdentities}
            />
            <Metric
              label={<Trans>Invalid values</Trans>}
              value={repairPlan.summary.invalidValues}
            />
            <Metric
              label={<Trans>Orphaned entries</Trans>}
              value={repairPlan.summary.orphanedIndexEntries}
            />
            <Metric
              label={<Trans>Blocked</Trans>}
              value={<Plural value={repairPlan.summary.blocked} one="# record" other="# records" />}
            />
            <Metric
              label={<Trans>Markdown rewrites</Trans>}
              value={repairPlan.summary.markdownRewrites}
            />
            <Metric
              label={<Trans>Identity issues</Trans>}
              value={repairPlan.summary.identityIssues}
            />
          </dl>
        ) : null}
      </section>
    </div>
  );
}

export function DatabaseDiagnosticsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [data, setData] = useState<DatabaseDiagnosticsResult | null>(null);
  const [status, setStatus] = useState<DiagnosticsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const [repairPlan, setRepairPlan] = useState<DatabaseRepairPlan | null>(null);
  const [repairStatus, setRepairStatus] = useState<RepairStatus>('idle');
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairResult, setRepairResult] = useState<DatabaseRepairResult | null>(null);
  const [documentIdChoices, setDocumentIdChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    void reloadEpoch;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setRepairPlan(null);
    setRepairStatus('idle');
    setRepairError(null);
    setRepairResult(null);
    setDocumentIdChoices({});
    void fetchDatabaseDiagnostics(controller.signal)
      .then((next) => {
        setData(next);
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      });
    return () => controller.abort();
  }, [open, reloadEpoch]);

  const handlePreviewRepair = (): void => {
    setRepairStatus('previewing');
    setRepairError(null);
    void previewDatabaseRepair(documentIdChoices)
      .then((plan) => {
        setRepairPlan(plan);
        setRepairStatus('idle');
      })
      .catch((cause: unknown) => {
        setRepairError(cause instanceof Error ? cause.message : String(cause));
        setRepairStatus('error');
      });
  };

  const handleApplyRepair = (): void => {
    if (!repairPlan) return;
    setRepairStatus('applying');
    setRepairError(null);
    void applyDatabaseRepair(repairPlan)
      .then((result) => {
        setRepairStatus('applied');
        setRepairResult(result);
        setRepairPlan(null);
      })
      .catch((cause: unknown) => {
        setRepairError(cause instanceof Error ? cause.message : String(cause));
        setRepairStatus('error');
      });
  };

  const handleUndoRepair = (): void => {
    if (!repairResult) return;
    setRepairStatus('undoing');
    setRepairError(null);
    void undoDatabaseRepair(repairResult)
      .then(() => setRepairStatus('undone'))
      .catch((cause: unknown) => {
        setRepairError(cause instanceof Error ? cause.message : String(cause));
        setRepairStatus('error');
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(48rem,calc(100dvh-2rem))] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Database diagnostics</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Index state, invalid records, schema revisions, recent tasks, and repair actions —
              content-free.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col overflow-hidden">
          <DatabaseDiagnosticsBody
            data={data}
            status={status}
            error={error}
            onRetry={() => setReloadEpoch((value) => value + 1)}
            repairPlan={repairPlan}
            repairStatus={repairStatus}
            repairError={repairError}
            onPreviewRepair={handlePreviewRepair}
            onApplyRepair={handleApplyRepair}
            onUndoRepair={handleUndoRepair}
            repairResult={repairResult}
            documentIdChoices={documentIdChoices}
            onDocumentIdChoice={(path, value) =>
              setDocumentIdChoices((current) => ({ ...current, [path]: value }))
            }
            onExport={() => {
              if (data) downloadDatabaseDiagnostics(data);
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
