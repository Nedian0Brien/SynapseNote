import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { ChevronDown, ExternalLink, Loader2, Plus } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createBlankDatabaseDesiredState, createNotionDatabaseKey } from '@/lib/database-creation';
import { executeDatabaseUiMutation } from '@/lib/database-mutation-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';
import {
  DATABASE_TABLE_ACTIONS_WIDTH,
  DATABASE_TABLE_DEFAULT_TITLE_WIDTH,
} from '@/lib/database-table-geometry';

/**
 * Track widths mirroring createDatabaseTableGeometry for a blank inline
 * source: one default-width title track plus the inline actions track.
 */
const placeholderTitleTrackWidth = DATABASE_TABLE_DEFAULT_TITLE_WIDTH;
const placeholderActionsTrackWidth = DATABASE_TABLE_ACTIONS_WIDTH.notion;
const placeholderTableMinWidth = placeholderTitleTrackWidth + placeholderActionsTrackWidth;

export interface InlineDatabaseCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (reference: { databaseId: string; sourceId: string; viewId: string }) => void;
  autoStart?: boolean;
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
}: InlineDatabaseCreationDialogProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [inlineDatabaseKey] = useState(() => createNotionDatabaseKey());
  const autoStartRef = useRef(false);
  const mutationRequestRef = useRef<{
    controller: AbortController;
    abortScheduled: boolean;
  } | null>(null);

  const submit = () => {
    if (status !== 'idle') return;
    const desiredState: DatabaseDesiredStateDraftInput = createBlankDatabaseDesiredState({
      name: name.trim() || 'Untitled database',
      ...(autoStart ? { key: inlineDatabaseKey } : {}),
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
        idempotencyKey: `ui-inline-database-${crypto.randomUUID()}`,
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
    // The placeholder mirrors the loaded empty inline surface block by block
    // so the create-to-ready swap does not shift geometry. Each block copies
    // the markup of the source component named beside it; keep them in sync.
    return (
      <section
        // Mirrors InlineDatabaseSurface's inline-mode section so the shared
        // [data-database-inline-surface] rules style the placeholder too.
        className="database-inline-surface relative my-4 overflow-visible bg-background"
        contentEditable={false}
        data-database-inline-create
        data-notion-inline-database-creation
        data-database-inline-surface=""
        data-testid="inline-database-create-dialog"
        aria-label="New inline database"
        aria-busy={status === 'creating'}
      >
        {/* Mirrors InlineDatabaseHeader's header row and fixed title slot. */}
        <header
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-0 pt-4 pb-2"
          data-database-inline-header
        >
          <div className="min-w-0 flex-1">
            <div className="flex h-9 min-w-0 items-center" data-database-inline-primary-slot>
              <h3
                className="m-0 truncate font-semibold text-xl tracking-tight"
                data-database-inline-title
              >
                Untitled database
              </h3>
              {status === 'creating' ? (
                <span className="ml-3 inline-flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Preparing table
                </span>
              ) : null}
            </div>
            {/* InlineDatabaseHeader omits the view tab strip while a source
                has a single saved view, so the placeholder omits it too. */}
          </div>
          {/* Mirrors InlineDatabaseToolbar's right-aligned actions row. */}
          <div
            className="relative flex flex-wrap items-center justify-end gap-1 pt-0.5 text-muted-foreground"
            data-database-inline-toolbar
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Open database"
              disabled
            >
              <ExternalLink aria-hidden="true" />
            </Button>
            <div className="flex items-stretch" data-database-inline-new-control>
              <Button
                type="button"
                size="sm"
                className="rounded-r-none px-3 font-semibold shadow-none"
                aria-label="New page"
                disabled
              >
                <Plus aria-hidden="true" /> New
              </Button>
              <Button
                type="button"
                size="icon-sm"
                className="rounded-l-none border-primary-foreground/20 border-l px-2 shadow-none"
                aria-label="Database view actions"
                disabled
              >
                <ChevronDown aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>
        {error ? (
          // Mirrors InlineDatabaseSurface's mutation-error banner, with the
          // in-place retry the creation placeholder owns.
          <div
            className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-destructive text-xs"
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
        {/* Mirrors DatabaseTableComposition's surface wrapper plus the Table
            element and container from DatabaseTableCanvas (inline surface). */}
        <div className="relative" data-database-table-surface="inline">
          <Table
            aria-label="Untitled database pages"
            className="table-fixed [&_td]:px-3 [&_td]:py-0 [&_th]:h-10 [&_th]:px-3"
            data-database-inline-table=""
            style={{ width: '100%', minWidth: `${placeholderTableMinWidth}px` }}
            containerClassName="max-h-[62vh] min-w-0 touch-pan-x overflow-x-auto overflow-y-auto overscroll-x-contain rounded-none border-0"
          >
            {/* Mirrors DatabaseTableColGroup's inline track order. */}
            <colgroup data-database-table-colgroup>
              <col
                data-database-table-property-track
                style={{ width: `${placeholderTitleTrackWidth}px` }}
              />
              <col
                data-database-table-actions-track
                style={{ width: `${placeholderActionsTrackWidth}px` }}
              />
              <col data-database-table-filler-track data-database-table-filler />
            </colgroup>
            {/* Mirrors DatabaseTableHeader's inline header row. */}
            <TableHeader className="sticky top-0 z-20 bg-background/95 [&_tr]:border-border/60">
              <TableRow noHover>
                {/* Title cell mirrors DatabasePropertyHeaderCell's inline
                    typography and title type icon. */}
                <TableHead
                  dir="auto"
                  className="!font-sans !normal-case sticky left-0 z-30 bg-background text-[13px] tracking-normal"
                  data-property-id="title"
                >
                  <div className="flex min-w-0 max-w-full items-center overflow-hidden">
                    <span
                      className="mr-1.5 inline-flex h-4 min-w-5 shrink-0 items-center justify-start font-semibold text-muted-foreground/80 text-xs tracking-tight"
                      aria-hidden="true"
                      data-database-property-type-icon="title"
                    >
                      Aa
                    </span>
                    <span className="min-w-0 truncate" data-database-property-name>
                      Title
                    </span>
                  </div>
                </TableHead>
                {/* Actions column mirrors DatabaseTableHeader's inline
                    add-property affordance (DatabasePropertyInsertPopover). */}
                <TableHead className="bg-background/95 p-0 text-left" data-database-actions-column>
                  <span className="sr-only">Actions</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-full w-full justify-start rounded-none px-3 font-normal text-muted-foreground"
                    aria-label="Add property"
                    disabled
                  >
                    <Plus aria-hidden="true" />
                    Add property
                  </Button>
                </TableHead>
                <TableHead
                  role="presentation"
                  aria-hidden="true"
                  className="pointer-events-none p-0"
                  data-database-table-filler
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Ghost row mirrors DatabaseTableNewRecordRow's inline
                  rendering, disabled until the created table takes over. */}
              <TableRow
                data-new-record-row
                data-canonical="false"
                className="border-border/60 border-dashed bg-transparent"
                style={{ height: 52 }}
              >
                <TableCell
                  className="sticky left-0 z-10 whitespace-nowrap px-2 py-0 font-medium"
                  data-property-id="title"
                >
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Plus className="size-4 shrink-0" aria-hidden="true" />
                    {/* The ghost row is presentational until the real surface
                        takes over, so it never becomes an empty click target. */}
                    <Input
                      aria-label="New page title"
                      placeholder="New page"
                      disabled
                      className="!bg-transparent h-[42px] border-0 px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                </TableCell>
                <TableCell className="p-0" />
                <TableCell
                  role="presentation"
                  aria-hidden="true"
                  className="pointer-events-none p-0"
                  data-database-table-filler
                />
              </TableRow>
            </TableBody>
          </Table>
        </div>
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
