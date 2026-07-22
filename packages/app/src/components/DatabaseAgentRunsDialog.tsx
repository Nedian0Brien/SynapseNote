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

function StateIcon({ state }: { state: DatabaseAgentRun['state'] }) {
  if (state === 'succeeded') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (state === 'failed') return <AlertCircle className="size-4 text-destructive" />;
  if (state === 'executing') return <Loader2 className="size-4 animate-spin text-blue-600" />;
  return <Clock3 className="size-4 text-amber-600" />;
}

export function DatabaseAgentRunDetail({
  run,
  onUndone,
}: {
  run: DatabaseAgentRun;
  onUndone?: () => void;
}) {
  const [undoStatus, setUndoStatus] = useState<'idle' | 'checking' | 'applying' | 'error'>('idle');
  const [undoError, setUndoError] = useState<string | null>(null);

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
      <section>
        <h3 className="font-medium">
          <Trans>Scope</Trans>
        </h3>
        <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(run.scope, null, 2)}
        </pre>
      </section>
      <section>
        <h3 className="font-medium">
          <Trans>Proposed diff</Trans>
        </h3>
        {run.proposedDiff.complete ? (
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(run.proposedDiff.value, null, 2)}
          </pre>
        ) : (
          <p className="mt-1 text-muted-foreground text-sm">
            <Trans>The exact diff exceeded the local inspection limit.</Trans>{' '}
            {run.proposedDiff.originalBytes.toLocaleString()} bytes
          </p>
        )}
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
              />
            ) : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
