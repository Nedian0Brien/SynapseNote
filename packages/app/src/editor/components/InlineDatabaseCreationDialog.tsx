import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { Loader2, Plus } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createBlankDatabaseDesiredState,
  createDatabaseCreationId,
  createNotionDatabaseKey,
} from '@/lib/database-creation';
import { executeDatabaseUiMutation } from '@/lib/database-mutation-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';

export interface InlineDatabaseCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (reference: { databaseId: string; sourceId: string; viewId: string }) => void;
  autoStart?: boolean;
  creationId?: string;
  creationName?: string;
  onCreationIntent?: (intent: { id: string; name: string }) => void;
}

/**
 * Creates a blank database from an inline block without routing the user to
 * the administration workspace. The same exact-plan mutation seam is used as
 * the full-page creator; only the low-risk blank path is auto-approved.
 */
export function InlineDatabaseCreationDialog({
  open,
  onOpenChange,
  onCreated,
  autoStart = false,
  creationId,
  creationName,
  onCreationIntent,
}: InlineDatabaseCreationDialogProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localCreationId] = useState(() => creationId ?? createDatabaseCreationId());
  const [inlineDatabaseKey] = useState(() => createNotionDatabaseKey(localCreationId));
  const autoStartRef = useRef(false);
  const mutationRequestRef = useRef<{
    controller: AbortController;
    abortScheduled: boolean;
  } | null>(null);

  const submit = () => {
    if (status !== 'idle') return;
    const desiredName = creationName?.trim() || name.trim() || 'Untitled database';
    onCreationIntent?.({ id: localCreationId, name: desiredName });
    const desiredState: DatabaseDesiredStateDraftInput = createBlankDatabaseDesiredState({
      name: desiredName,
      key: inlineDatabaseKey,
    });
    const policy = {
      operation: 'blank-database-create' as const,
      actor: 'human' as const,
      principalId: 'user:local',
    };
    const controller = new AbortController();
    const request = { controller, abortScheduled: false };
    mutationRequestRef.current = request;
    setStatus('creating');
    setError(null);
    void executeDatabaseUiMutation(
      {
        desiredState,
        actor: { principalId: policy.principalId },
        idempotencyKey: `ui-inline-database-${localCreationId}`,
        assertions: {
          databaseAbsent: true,
          createdRecords: desiredState.sampleRecords?.length ?? 0,
        },
        review: () => databaseUiMutationReviewMode(policy) === 'automatic',
      },
      { signal: controller.signal },
    )
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.status !== 'committed' && outcome.status !== 'converged') {
          setError('The inline database creation plan was not committed');
          return;
        }
        const definition = outcome.draft.normalized.definition;
        const source = definition.sources[0];
        const view = definition.views?.find((candidate) => candidate.sourceId === source?.id);
        if (!source || !view) {
          setError('The created database has no source or saved view');
          return;
        }
        onCreated({ databaseId: definition.id, sourceId: source.id, viewId: view.id });
        setName('');
        onOpenChange(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to create the inline database');
      })
      .finally(() => {
        if (mutationRequestRef.current === request) mutationRequestRef.current = null;
        if (!controller.signal.aborted) setStatus('idle');
      });
  };
  const submitEvent = useEffectEvent(submit);

  useEffect(() => {
    if (!open) {
      autoStartRef.current = false;
      return;
    }
    if (autoStart && !autoStartRef.current && status === 'idle') {
      autoStartRef.current = true;
      submitEvent();
    }
  }, [autoStart, open, status]);

  useEffect(() => {
    const existingRequest = mutationRequestRef.current;
    if (existingRequest) existingRequest.abortScheduled = false;
    return () => {
      const request = mutationRequestRef.current;
      if (!request) return;
      // React StrictMode runs effect cleanup/setup synchronously as a probe.
      // Defer abort so the replay can keep the same in-flight creation alive;
      // a real unmount still aborts the request on the next microtask.
      request.abortScheduled = true;
      queueMicrotask(() => {
        if (!request.abortScheduled || mutationRequestRef.current !== request) return;
        request.controller.abort();
        mutationRequestRef.current = null;
      });
    };
  }, []);

  if (!open) return null;

  if (autoStart) {
    return (
      <section
        className="my-3 overflow-hidden rounded-lg border bg-background"
        contentEditable={false}
        data-database-inline-create
        data-notion-inline-database-creation
        data-testid="inline-database-create-dialog"
        aria-label="New inline database"
        aria-busy={status === 'creating'}
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">Untitled database</h3>
            <p className="text-muted-foreground text-xs">Table</p>
          </div>
          {status === 'creating' ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Preparing table
            </span>
          ) : null}
        </header>
        <div className="flex items-center gap-1 border-b px-3 py-2">
          <Button type="button" size="sm" variant="secondary" aria-current="page" disabled>
            Table
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Add database view"
            disabled
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="border-b px-4 py-3 font-medium">Title</th>
                <th className="w-12 border-b px-2 py-2 text-right">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Add property"
                    disabled
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-3" colSpan={2}>
                  <Input
                    aria-label="New page title"
                    placeholder="New page"
                    disabled={status === 'creating'}
                    className="max-w-md border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {error ? (
          <div
            className="flex items-center justify-between gap-3 border-t p-3 text-destructive text-xs"
            role="alert"
          >
            <span>{error}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="inline-database-create-retry"
              onClick={() => void submit()}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="my-3 rounded-lg border bg-background p-4"
      contentEditable={false}
      data-database-inline-create
      data-testid="inline-database-create-dialog"
      aria-label="Create inline database"
    >
      <div className="flex items-start gap-3">
        <Plus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-medium text-sm">
            {autoStart ? 'Untitled database' : 'Create inline database'}
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {autoStart
              ? 'Preparing an editable table in this page.'
              : 'Name it here. The editable table will replace this setup block in the current page.'}
          </p>
        </div>
      </div>
      {!autoStart ? (
        <>
          <label className="mt-4 grid gap-1.5 text-sm" htmlFor="inline-database-name">
            <span className="font-medium">Database name</span>
            <Input
              id="inline-database-name"
              value={name}
              autoFocus
              disabled={status !== 'idle'}
              placeholder="Untitled database"
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          </label>
          <p className="mt-2 text-muted-foreground text-xs">
            Blank creation is direct-safe. Templates and imports remain available from the full
            database workspace for exact review.
          </p>
        </>
      ) : null}
      {error ? (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {!autoStart ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={status !== 'idle'}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={status !== 'idle'} onClick={() => void submit()}>
            {status === 'creating' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {status === 'creating' ? 'Creating' : 'Create database'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
