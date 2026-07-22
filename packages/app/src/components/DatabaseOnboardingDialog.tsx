import { Trans } from '@lingui/react/macro';
import type {
  DatabaseOnboardingItem,
  DatabaseOnboardingPreview,
} from '@nedian0brien/synapsenote-server';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type DatabaseSourceOnboardingTarget,
  previewDatabaseSourceOnboarding,
  startDatabaseSourceOnboarding,
} from '@/lib/database-onboarding-client';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export function databaseOnboardingItemIsBlocked(item: DatabaseOnboardingItem): boolean {
  return (
    item.action === 'reject' ||
    (item.action === 'modify' &&
      item.plannedChanges.some((change) => change.type !== 'assign_record_id'))
  );
}

export function DatabaseOnboardingDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DatabaseSourceOnboardingTarget | null;
}) {
  const [preview, setPreview] = useState<DatabaseOnboardingPreview | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'starting' | 'started'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<{ id: string; state: string } | null>(null);

  const loadPreview = async () => {
    if (!target) return;
    setStatus('loading');
    setError(null);
    setTask(null);
    try {
      const next = await previewDatabaseSourceOnboarding(target);
      setPreview(next);
      setStatus('ready');
    } catch (cause) {
      setPreview(null);
      setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'Unable to preview source onboarding');
    }
  };

  useEffect(() => {
    if (!open || !target) return;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setTask(null);
    void previewDatabaseSourceOnboarding(target, { signal: controller.signal }).then(
      (next) => {
        setPreview(next);
        setStatus('ready');
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        setPreview(null);
        setStatus('idle');
        setError(cause instanceof Error ? cause.message : 'Unable to preview source onboarding');
      },
    );
    return () => controller.abort();
  }, [open, target]);

  const blockers = preview?.items.filter(databaseOnboardingItemIsBlocked) ?? [];
  const canStart = status === 'ready' && preview?.complete === true && blockers.length === 0;

  const start = async () => {
    if (!target || !canStart) return;
    setStatus('starting');
    setError(null);
    try {
      const queued = await startDatabaseSourceOnboarding(target);
      setTask({ id: queued.id, state: queued.state });
      setStatus('started');
    } catch (cause) {
      setStatus('ready');
      setError(cause instanceof Error ? cause.message : 'Unable to start source onboarding');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Review existing folder</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Preview every file first. Existing records remain unchanged until you approve the
              onboarding task.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {status === 'loading' ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <Trans>Scanning the folder without changing files</Trans>
            </div>
          ) : null}

          {preview ? (
            <>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Onboarding preview summary</legend>
                <Badge variant="outline">{preview.summary.include} include</Badge>
                <Badge variant="outline">{preview.summary.modify} modify</Badge>
                <Badge variant="outline">{preview.summary.exclude} exclude</Badge>
                <Badge variant={preview.summary.reject > 0 ? 'destructive' : 'outline'}>
                  {preview.summary.reject} reject
                </Badge>
              </fieldset>

              {!preview.complete ? (
                <div
                  className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <Trans>
                    The scan reached its {preview.entryLimit} entry limit. No partial onboarding can
                    start.
                  </Trans>
                </div>
              ) : blockers.length > 0 ? (
                <div
                  className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
                  role="alert"
                >
                  <div className="flex items-center gap-2 font-medium text-destructive text-sm">
                    <AlertCircle className="size-4" aria-hidden="true" />
                    {blockers.length} blocking file{blockers.length === 1 ? '' : 's'} must be fixed
                  </div>
                  <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
                    {blockers.slice(0, 50).map((item) => (
                      <li key={item.path} className="rounded border bg-background p-2">
                        <code className="break-all text-xs">{item.path}</code>
                        <ul className="mt-1 text-muted-foreground text-xs">
                          {item.reasons.map((reason) => (
                            <li
                              key={`${reason.code}:${reason.propertyId ?? ''}:${reason.propertyKey ?? ''}:${reason.message}`}
                            >
                              {reason.message}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  className="flex gap-2 rounded-md border border-green-600/30 bg-green-600/5 p-3 text-sm"
                  role="status"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-green-600"
                    aria-hidden="true"
                  />
                  <Trans>
                    No blockers. Starting will assign stable record IDs to the reviewed files and
                    refresh the database index.
                  </Trans>
                </div>
              )}
            </>
          ) : null}

          {task ? (
            <div className="rounded-md border p-3 text-sm" role="status">
              <Trans>Onboarding task queued</Trans>: <code>{task.id}</code> · {task.state}
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {status === 'started' ? <Trans>Done</Trans> : <Trans>Close</Trans>}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!target || status === 'loading' || status === 'starting'}
              onClick={() => void loadPreview()}
            >
              <RefreshCw
                className={status === 'loading' ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              <Trans>Refresh preview</Trans>
            </Button>
            <Button type="button" disabled={!canStart} onClick={() => void start()}>
              {status === 'starting' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              <Trans>Start onboarding</Trans>
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
