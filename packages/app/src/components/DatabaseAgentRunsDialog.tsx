import { Trans } from '@lingui/react/macro';
import type { DatabaseAgentRun } from '@nedian0brien/synapsenote-core';
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { applyDatabaseUiUndo, previewDatabaseUiUndo } from '@/lib/database-mutation-client';
import { cn } from '@/lib/utils';

export interface DatabaseAgentRunSummary {
  id: string;
  state: DatabaseAgentRun['state'];
  revision: string;
  createdAt: string;
  updatedAt: string;
  intent: DatabaseAgentRun['intent'];
  scope: {
    databaseIds: string[];
    sourceCount: number;
    propertyCount: number;
    viewCount: number;
    recordCount: number;
  };
  plan: { id: string; riskLevel: DatabaseAgentRun['plan']['risk']['level'] };
  execution: { mutationId: string | null; actualDiffCount: number };
  verification: {
    status: DatabaseAgentRun['verification']['status'];
    checkCount: number;
    failedCheckCount: number;
  };
  failureCode: string | null;
  undo: { available: boolean };
  recovery?: {
    attempt: number;
    action: 'initial' | 'retry' | 'resume';
    sourceRunId: string | null;
  } | null;
}

async function responseJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const detail =
      value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
        ? value.detail
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return value;
}

export async function fetchDatabaseAgentRuns(
  signal?: AbortSignal,
): Promise<DatabaseAgentRunSummary[]> {
  const value = await responseJson(
    await fetch('/api/databases/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' }),
      signal,
    }),
  );
  if (!value || typeof value !== 'object' || !('action' in value) || value.action !== 'list') {
    throw new Error('Invalid Agent Runs list response');
  }
  const runs = (value as { runs?: unknown }).runs;
  if (!Array.isArray(runs)) throw new Error('Invalid Agent Runs list response');
  return runs as DatabaseAgentRunSummary[];
}

export async function fetchDatabaseAgentRun(
  runId: string,
  signal?: AbortSignal,
): Promise<DatabaseAgentRun> {
  const value = await responseJson(
    await fetch('/api/databases/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', runId }),
      signal,
    }),
  );
  if (!value || typeof value !== 'object' || !('action' in value) || value.action !== 'get') {
    throw new Error('Invalid Agent Run detail response');
  }
  const run = (value as { run?: DatabaseAgentRun }).run;
  if (!run || run.id !== runId) throw new Error('Agent Run response does not match its request');
  return run;
}

export async function recoverDatabaseAgentRun(input: {
  action: 'retry' | 'resume';
  runId: string;
  expectedRevision: string;
  planHash: string;
}): Promise<{
  action: 'retry' | 'resume';
  sourceRunId: string;
  run: DatabaseAgentRun;
  receipt: unknown;
}> {
  const value = await responseJson(
    await fetch('/api/databases/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: input.action,
        runId: input.runId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: `agent-run-${input.action}-${crypto.randomUUID()}`,
        approvalToken: `approve:${input.planHash}`,
      }),
    }),
  );
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid Agent Run recovery response');
  }
  const responseValue = value as {
    action?: unknown;
    sourceRunId?: unknown;
    run?: unknown;
    receipt?: unknown;
  };
  if (
    responseValue.action !== input.action ||
    responseValue.sourceRunId !== input.runId ||
    !responseValue.run ||
    typeof responseValue.run !== 'object'
  ) {
    throw new Error('Agent Run recovery response does not match its request');
  }
  return {
    action: input.action,
    sourceRunId: input.runId,
    run: responseValue.run as DatabaseAgentRun,
    receipt: responseValue.receipt,
  };
}

function StateIcon({ state }: { state: DatabaseAgentRun['state'] }) {
  if (state === 'succeeded') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (state === 'failed') return <AlertCircle className="size-4 text-destructive" />;
  if (state === 'executing') return <Loader2 className="size-4 animate-spin text-blue-600" />;
  return <Clock3 className="size-4 text-amber-600" />;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function agentRunScopeSummary(scope: DatabaseAgentRun['scope']): string {
  return [
    countLabel(scope.databaseIds.length, 'database'),
    countLabel(scope.sourceIds.length, 'source'),
    countLabel(scope.propertyIds.length, 'property'),
    countLabel(scope.viewIds.length, 'view'),
    countLabel(scope.recordIds.length, 'record'),
  ].join(' · ');
}

function agentRunOriginLabel(actor: DatabaseAgentRun['actor']): string {
  if (actor.kind === 'agent') return 'Agent suggestion';
  if (actor.kind === 'human') return 'Human change';
  return `${actor.kind[0]?.toUpperCase() ?? ''}${actor.kind.slice(1)} change`;
}

function agentRunPlanSummary(run: DatabaseAgentRun): string {
  const risk = `${run.plan.risk.level[0]?.toUpperCase() ?? ''}${run.plan.risk.level.slice(1)} risk`;
  const approvals =
    run.plan.approvals.length === 0
      ? 'no extra approval scopes'
      : `${run.plan.approvals.length} approval scope${run.plan.approvals.length === 1 ? '' : 's'}`;
  return `${risk} · ${approvals} · one exact plan`;
}

const agentApprovalLabels: Record<string, string> = {
  create_database: 'Create database',
  delete_database: 'Delete database',
  alter_schema: 'Change schema',
  autonomous_policy: 'Autonomous write policy',
  sample_record_write: 'Write sample records',
  verification_change: 'Change verification',
  delete_record: 'Delete records',
};

export function DatabaseAgentRunDetail({
  run,
  onUndone,
  onRecovered,
}: {
  run: DatabaseAgentRun;
  onUndone?: () => void;
  onRecovered?: (runId: string) => void;
}) {
  const [undoStatus, setUndoStatus] = useState<'idle' | 'checking' | 'applying' | 'error'>('idle');
  const [undoError, setUndoError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<'idle' | 'retrying' | 'resuming' | 'error'>(
    'idle',
  );
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const recoverRun = (action: 'retry' | 'resume') => {
    if (run.state !== 'failed' || recoveryStatus !== 'idle') return;
    setRecoveryError(null);
    setRecoveryStatus(action === 'retry' ? 'retrying' : 'resuming');
    void recoverDatabaseAgentRun({
      action,
      runId: run.id,
      expectedRevision: run.revision,
      planHash: run.plan.hash,
    })
      .then((outcome) => {
        setRecoveryStatus('idle');
        onRecovered?.(outcome.run.id);
      })
      .catch((cause: unknown) => {
        setRecoveryError(
          cause instanceof Error ? cause.message : 'Unable to recover this Agent Run',
        );
        setRecoveryStatus('error');
      });
  };

  const undoRun = () => {
    if (!run.undo.token || undoStatus !== 'idle') return;
    const token = run.undo.token;
    setUndoError(null);
    setUndoStatus('checking');
    void previewDatabaseUiUndo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Undo is no longer safe: ${reason}`);
        }
        setUndoStatus('applying');
        return applyDatabaseUiUndo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `agent-run-undo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The database undo was refused');
        }
        setUndoStatus('idle');
        onUndone?.();
      })
      .catch((cause: unknown) => {
        setUndoError(cause instanceof Error ? cause.message : 'Unable to undo this Agent Run');
        setUndoStatus('error');
      });
  };

  return (
    <div className="space-y-5" data-testid="database-agent-run-detail">
      <section>
        <h3 className="font-medium">
          <Trans>Intent</Trans>
        </h3>
        <p className="mt-1 text-muted-foreground">{run.intent.summary}</p>
        <p className="mt-1 text-muted-foreground text-xs">
          <Trans>Raw prompts are not stored.</Trans>
        </p>
      </section>
      <section data-testid="database-agent-run-plan-summary">
        <h3 className="font-medium">
          <Trans>Plan summary</Trans>
        </h3>
        <p className="mt-1 font-medium text-muted-foreground text-sm">{agentRunPlanSummary(run)}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          <Trans>The plan stays bounded to the reviewed scope and is checked before commit.</Trans>
        </p>
        <details className="mt-2 rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            <Trans>Show plan details</Trans>
          </summary>
          <dl className="mt-2 grid gap-1 font-mono">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="break-all text-right">{run.plan.id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Plan hash</dt>
              <dd className="break-all text-right">{run.plan.hash}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Snapshot</dt>
              <dd className="break-all text-right">{run.plan.snapshotRevision}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="text-right">{new Date(run.plan.expiresAt).toLocaleString()}</dd>
            </div>
            {run.plan.risk.reasons.length > 0 ? (
              <div className="mt-1">
                <dt className="text-muted-foreground">Risk reasons</dt>
                <dd>
                  <ul className="mt-1 list-disc pl-5">
                    {run.plan.risk.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      </section>
      <section
        className="rounded-md border border-primary/30 bg-primary/5 p-3"
        data-testid="database-agent-run-provenance"
        data-agent-proposal-origin={run.actor.kind}
      >
        <h3 className="font-medium">
          <Trans>Proposal source</Trans>
        </h3>
        <p className="mt-1 text-sm">
          {agentRunOriginLabel(run.actor)} ·{' '}
          {run.actor.kind === 'agent' ? (
            <Trans>This proposal is separate from human edits until it is approved.</Trans>
          ) : (
            <Trans>This change is attributed to a human review action.</Trans>
          )}
        </p>
        <details className="mt-2 rounded-md border bg-background/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            <Trans>Show source details</Trans>
          </summary>
          <dl className="mt-2 grid gap-1 font-mono">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Principal</dt>
              <dd className="break-all text-right">{run.actor.principalId}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Session</dt>
              <dd className="break-all text-right">{run.actor.sessionId ?? '—'}</dd>
            </div>
          </dl>
        </details>
      </section>
      <section>
        <h3 className="font-medium">
          <Trans>Scope</Trans>
        </h3>
        <p
          className="mt-1 font-medium text-muted-foreground text-sm"
          data-testid="database-agent-run-scope-summary"
        >
          {agentRunScopeSummary(run.scope)}
        </p>
        <details className="mt-2 rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            <Trans>Show exact scope</Trans>
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-muted p-3">
            {JSON.stringify(run.scope, null, 2)}
          </pre>
        </details>
      </section>
      <section>
        <h3 className="font-medium">
          <Trans>Proposed diff</Trans>
        </h3>
        {run.proposedDiff.complete ? (
          <>
            <p
              className="mt-1 font-medium text-muted-foreground text-sm"
              data-testid="database-agent-run-diff-summary"
            >
              Exact diff captured · {run.proposedDiff.originalBytes.toLocaleString()} bytes
            </p>
            <details className="mt-2 rounded-md border px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                <Trans>Show proposed diff</Trans>
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3">
                {JSON.stringify(run.proposedDiff.value, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <p className="mt-1 text-muted-foreground text-sm">
            <Trans>The exact diff exceeded the local inspection limit.</Trans>{' '}
            {run.proposedDiff.originalBytes.toLocaleString()} bytes
          </p>
        )}
      </section>
      <section
        className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3"
        data-testid="database-agent-proposal-group"
      >
        <h3 className="font-medium">
          <Trans>Review group</Trans>
        </h3>
        <p className="mt-1 text-muted-foreground text-sm">
          <Trans>
            All changes in this exact plan are one review group and commit together. Review the
            group before approving any write.
          </Trans>
        </p>
        <p className="mt-2 text-muted-foreground text-xs">
          {run.plan.approvals.length === 0
            ? 'One exact plan · no extra approval scopes'
            : `${run.plan.approvals.length} approval scope${run.plan.approvals.length === 1 ? '' : 's'} in this group`}
        </p>
        {run.plan.approvals.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-xs">
            {run.plan.approvals.map((approval) => (
              <li key={approval.code}>
                {agentApprovalLabels[approval.code] ?? approval.code}
                {approval.required ? ' · required' : ' · optional'}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="font-medium">
            <Trans>Execution</Trans>
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {run.execution.mutationId ?? '—'} · {run.execution.actualDiff.length}{' '}
            <Trans>file changes</Trans>
          </p>
        </div>
        <div>
          <h3 className="font-medium">
            <Trans>Verification</Trans>
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {run.verification.status} · {run.verification.checks.length} <Trans>checks</Trans>
          </p>
        </div>
      </section>
      {run.recovery && run.recovery.action !== 'initial' ? (
        <section
          className="rounded-md border border-primary/30 bg-primary/5 p-3"
          data-testid="database-agent-run-recovery-receipt"
        >
          <h3 className="font-medium">
            <Trans>Recovery receipt</Trans>
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            <Trans>
              Attempt {run.recovery.attempt} · {run.recovery.action} from{' '}
              {run.recovery.sourceRunId ?? 'the original run'}
            </Trans>
          </p>
          <details className="mt-2 rounded-md border px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              <Trans>Show recovery receipt</Trans>
            </summary>
            <dl className="mt-2 grid gap-1 font-mono">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Plan hash</dt>
                <dd className="break-all text-right">{run.plan.hash}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Mutation</dt>
                <dd className="break-all text-right">
                  {run.execution.mutationId ?? 'not applied'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Verification</dt>
                <dd className="text-right">{run.verification.status}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Undo</dt>
                <dd className="text-right">{run.undo.available ? 'available' : 'not available'}</dd>
              </div>
            </dl>
          </details>
        </section>
      ) : null}
      {run.failure ? (
        <section className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <h3 className="font-medium text-destructive">
            <Trans>Failure</Trans>
          </h3>
          <p className="mt-1 text-sm">
            {run.failure.code}: {run.failure.message}
          </p>
        </section>
      ) : null}
      {run.state === 'failed' ? (
        <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <h3 className="font-medium">
            <Trans>Recover this run</Trans>
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            <Trans>
              Retry or resume the exact approved plan as a new attempt. The failed run stays in the
              audit history, and the plan hash is rechecked before any database write.
            </Trans>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => recoverRun('retry')}
              disabled={recoveryStatus !== 'idle' && recoveryStatus !== 'error'}
              data-testid="database-agent-run-retry"
            >
              {recoveryStatus === 'retrying' ? <Loader2 className="animate-spin" /> : null}
              {recoveryStatus === 'retrying' ? (
                <Trans>Retrying run</Trans>
              ) : (
                <Trans>Retry run</Trans>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => recoverRun('resume')}
              disabled={recoveryStatus !== 'idle' && recoveryStatus !== 'error'}
              data-testid="database-agent-run-resume"
            >
              {recoveryStatus === 'resuming' ? <Loader2 className="animate-spin" /> : null}
              {recoveryStatus === 'resuming' ? (
                <Trans>Resuming run</Trans>
              ) : (
                <Trans>Resume run</Trans>
              )}
            </Button>
          </div>
          {recoveryStatus === 'error' && recoveryError ? (
            <p className="mt-2 text-destructive text-sm" role="alert">
              {recoveryError}
            </p>
          ) : null}
        </section>
      ) : null}
      <section>
        <h3 className="font-medium">
          <Trans>Undo</Trans>
        </h3>
        {run.undo.available && run.undo.token ? (
          <div className="mt-2 space-y-2">
            <p className="text-muted-foreground text-sm">
              <Trans>Preview the current revision before reversing this run.</Trans>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={undoRun}
              disabled={undoStatus === 'checking' || undoStatus === 'applying'}
              data-testid="database-agent-run-undo"
            >
              {undoStatus === 'checking' || undoStatus === 'applying' ? (
                <Loader2 className="animate-spin" />
              ) : null}
              {undoStatus === 'checking' ? (
                <Trans>Checking undo safety</Trans>
              ) : undoStatus === 'applying' ? (
                <Trans>Undoing run</Trans>
              ) : (
                <Trans>Undo committed changes</Trans>
              )}
            </Button>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                <Trans>Show undo token</Trans>
              </summary>
              <code className="mt-1 block break-all text-muted-foreground">{run.undo.token}</code>
            </details>
            {undoStatus === 'error' && undoError ? (
              <p className="text-destructive text-sm" role="alert">
                {undoError}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-muted-foreground text-sm">
            <Trans>Not available</Trans>
          </p>
        )}
      </section>
    </div>
  );
}

export function DatabaseAgentRunsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [runs, setRuns] = useState<DatabaseAgentRunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DatabaseAgentRun | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void refresh;
    if (!open) return;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void fetchDatabaseAgentRuns(controller.signal)
      .then((next) => {
        setRuns(next);
        setSelectedId((current) =>
          current && next.some((run) => run.id === current) ? current : (next[0]?.id ?? null),
        );
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load Agent Runs');
        setStatus('error');
      });
    return () => controller.abort();
  }, [open, refresh]);

  useEffect(() => {
    void refresh;
    if (!open || !selectedId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void fetchDatabaseAgentRun(selectedId, controller.signal)
      .then((run) => {
        setDetail(run);
        setDetailLoading(false);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setDetailError(cause instanceof Error ? cause.message : 'Unable to load Agent Run');
          setDetailLoading(false);
        }
      });
    return () => controller.abort();
  }, [open, selectedId, refresh]);

  useEffect(() => {
    if (
      !open ||
      status !== 'success' ||
      !runs.some((run) => run.state === 'awaiting_approval' || run.state === 'executing')
    ) {
      return;
    }
    const timeout = window.setTimeout(() => setRefresh((value) => value + 1), 3_000);
    return () => window.clearTimeout(timeout);
  }, [open, runs, status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle>
                <Trans>Agent Runs</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>
                  Inspect database intent, scope, diffs, execution, verification, failures, and
                  undo.
                </Trans>
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>
              <RefreshCw /> <Trans>Refresh</Trans>
            </Button>
          </div>
        </DialogHeader>
        <DialogBody className="grid min-h-[28rem] gap-4 p-0 md:grid-cols-[18rem_1fr]">
          <div className="overflow-y-auto border-b p-3 md:border-r md:border-b-0">
            {status === 'loading' ? (
              <div className="flex items-center gap-2 p-3 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <Trans>Loading Agent Runs</Trans>
              </div>
            ) : null}
            {status === 'error' ? (
              <div className="p-3 text-destructive text-sm">{error}</div>
            ) : null}
            {status === 'success' && runs.length === 0 ? (
              <div className="p-3 text-muted-foreground text-sm">
                <Trans>No database agent runs yet.</Trans>
              </div>
            ) : null}
            {runs.map((run) => (
              <Button
                key={run.id}
                variant="ghost"
                onClick={() => setSelectedId(run.id)}
                className={cn(
                  'mb-1 h-auto w-full justify-start gap-2 rounded-md p-3 text-left hover:bg-muted',
                  selectedId === run.id && 'bg-muted',
                )}
              >
                <StateIcon state={run.state} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">{run.intent.summary}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {run.state} · {new Date(run.updatedAt).toLocaleString()}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          <div className="min-w-0 overflow-y-auto p-5">
            {detailLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <Trans>Loading run detail</Trans>
              </div>
            ) : detailError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                {detailError}
              </div>
            ) : detail ? (
              <DatabaseAgentRunDetail
                run={detail}
                onUndone={() => setRefresh((value) => value + 1)}
                onRecovered={(runId) => {
                  setSelectedId(runId);
                  setRefresh((value) => value + 1);
                }}
              />
            ) : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
