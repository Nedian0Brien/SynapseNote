import { Trans } from '@lingui/react/macro';
import {
  DatabaseLinkedViewReferenceSchema,
  type DatabaseProperty,
  type DatabaseQueryResult,
  type DatabaseValue,
  type ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import {
  AlertCircle,
  Archive,
  Braces,
  ExternalLink,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  lazy,
  type KeyboardEvent as ReactKeyboardEvent,
  Suspense,
  useEffect,
  useState,
} from 'react';
import { DatabaseRecordPeek } from '@/components/DatabaseRecordPeek';
import type { DatabaseInitialRecordAction } from '@/components/DatabaseTableDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  type DatabaseCatalogCandidate,
  type DatabaseDescription,
  describeDatabase,
  fetchDatabaseCatalog,
} from '@/lib/database-catalog-client';
import {
  createDatabaseCellMutationDesiredState,
  createDatabaseRecordDesiredState,
} from '@/lib/database-cell-mutation';
import { createBlankDatabaseDesiredState } from '@/lib/database-creation';
import {
  readDatabaseLinkedView,
  rememberDatabaseLinkedView,
} from '@/lib/database-linked-view-cache';
import {
  applyDatabaseUiRedo,
  applyDatabaseUiUndo,
  executeDatabaseUiMutation,
  previewDatabaseUiRedo,
  previewDatabaseUiUndo,
} from '@/lib/database-mutation-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';
import {
  databasePageTargetToHash,
  databaseRecordPathToHash,
  databaseViewOpenBehavior,
} from '@/lib/database-navigation';
import { queryDatabase } from '@/lib/database-query-client';
import { rememberDatabaseRecordNavigation } from '@/lib/database-record-navigation';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import type { DatabaseUiProblem } from '@/lib/database-ui-problem';
import { classifyDatabaseUiProblem } from '@/lib/database-ui-problem';
import { subscribeToDatabaseChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';
import { useJsxComponentHost } from './jsx-host-context.tsx';

const LazyDatabaseTable = lazy(() =>
  import('@/components/DatabaseTableDialog').then((module) => ({
    default: module.DatabaseTable,
  })),
);

const LazyDatabaseContextInspectorDialog = lazy(() =>
  import('@/components/DatabaseContextInspectorDialog').then((module) => ({
    default: module.DatabaseContextInspectorDialog,
  })),
);

const LazyDatabaseBoard = lazy(() =>
  import('@/components/DatabaseBoard').then((module) => ({
    default: module.DatabaseBoard,
  })),
);

const LazyDatabaseTimeline = lazy(() =>
  import('@/components/DatabaseTimeline').then((module) => ({
    default: module.DatabaseTimeline,
  })),
);

const LazyDatabaseCalendar = lazy(() =>
  import('@/components/DatabaseCalendar').then((module) => ({
    default: module.DatabaseCalendar,
  })),
);

const LazyDatabaseList = lazy(() =>
  import('@/components/DatabaseList').then((module) => ({
    default: module.DatabaseList,
  })),
);

const LazyDatabaseGallery = lazy(() =>
  import('@/components/DatabaseGallery').then((module) => ({
    default: module.DatabaseGallery,
  })),
);

const LazyDatabaseChart = lazy(() =>
  import('@/components/DatabaseChart').then((module) => ({
    default: module.DatabaseChart,
  })),
);

const LazyDatabaseDashboard = lazy(() =>
  import('@/components/DatabaseDashboard').then((module) => ({
    default: module.DatabaseDashboard,
  })),
);

const LazyDatabaseForm = lazy(() =>
  import('@/components/DatabaseForm').then((module) => ({
    default: module.DatabaseForm,
  })),
);

const LazyDatabaseMap = lazy(() =>
  import('@/components/DatabaseMap').then((module) => ({
    default: module.DatabaseMap,
  })),
);

const LazyDatabaseFeed = lazy(() =>
  import('@/components/DatabaseFeed').then((module) => ({
    default: module.DatabaseFeed,
  })),
);

const LazyDatabaseTableDialog = lazy(() =>
  import('@/components/DatabaseTableDialog').then((module) => ({
    default: module.DatabaseTableDialog,
  })),
);

interface DatabaseViewProps {
  databaseId?: string;
  sourceId?: string;
  viewId?: string;
  mode?: 'inline' | 'full-page';
}

interface InlineDatabasePickerProps {
  message?: string;
  onSelected: (reference: { databaseId: string; sourceId: string; viewId: string }) => void;
  onCreateBlank?: () => void;
}

/**
 * Human-facing replacement for the raw database/source/view ID prop panel.
 * The component intentionally keeps the machine IDs out of the first-use
 * surface; they remain in the serialized MDX and in the advanced prop panel.
 */
function InlineDatabasePicker({ message, onSelected, onCreateBlank }: InlineDatabasePickerProps) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<DatabaseCatalogCandidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<{
    candidate: DatabaseCatalogCandidate;
    sourceId: string;
  } | null>(null);
  const [description, setDescription] = useState<DatabaseDescription | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCandidates(result.candidates);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load databases');
        setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const visibleCandidates = candidates.filter((candidate) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      candidate.name,
      candidate.purpose,
      ...candidate.sources.map((source) => source.name),
    ].some((value) => value.toLowerCase().includes(needle));
  });

  const chooseSource = (candidate: DatabaseCatalogCandidate, sourceId: string) => {
    setSelectedSource({ candidate, sourceId });
    setDescription(null);
    setError(null);
    void describeDatabase({ databaseId: candidate.id, sourceId })
      .then((nextDescription) => setDescription(nextDescription))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Unable to load saved views');
      });
  };

  return (
    <section
      className="my-3 rounded-lg border border-dashed bg-background p-4"
      contentEditable={false}
      data-database-view-picker
      aria-label="Choose a database view"
    >
      <div className="flex items-start gap-3">
        <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">Choose a database view</div>
          <p className="mt-1 text-muted-foreground text-xs">
            {message ?? 'Pick a database and saved view. Records stay shared with the source.'}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search databases"
          aria-label="Search databases"
        />
      </div>
      {onCreateBlank ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCreateBlank}>
            <Plus aria-hidden="true" /> Create new database
          </Button>
          <span className="text-muted-foreground text-xs">
            Start with a blank inline table; records stay shared with this page.
          </span>
        </div>
      ) : null}
      {status === 'loading' ? (
        <div className="mt-3 text-muted-foreground text-xs" role="status">
          Loading databases
        </div>
      ) : status === 'error' ? (
        <div className="mt-3 text-destructive text-xs" role="alert">
          {error}
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div className="mt-3 text-muted-foreground text-xs">No matching databases.</div>
      ) : (
        <div className="mt-3 grid gap-2">
          {visibleCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-md border p-2">
              <div className="font-medium text-sm">{candidate.name}</div>
              <div className="mt-0.5 text-muted-foreground text-xs">{candidate.purpose}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidate.sources.map((source) => (
                  <Button
                    key={source.id}
                    type="button"
                    size="sm"
                    variant={selectedSource?.sourceId === source.id ? 'secondary' : 'outline'}
                    onClick={() => chooseSource(candidate, source.id)}
                  >
                    {source.name}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedSource && description?.source ? (
        <div className="mt-3 rounded-md border bg-muted/20 p-2">
          <div className="font-medium text-sm">Choose a saved view</div>
          <div className="mt-2 grid gap-1.5">
            {description.database.views
              .filter((view) => view.sourceId === selectedSource.sourceId)
              .map((view) => (
                <Button
                  key={view.id}
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start text-left"
                  onClick={() =>
                    onSelected({
                      databaseId: selectedSource.candidate.id,
                      sourceId: selectedSource.sourceId,
                      viewId: view.id,
                    })
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{view.name}</span>
                    <span className="block text-muted-foreground text-xs">
                      {view.layout.type} · shared records, independent view settings
                    </span>
                  </span>
                </Button>
              ))}
          </div>
        </div>
      ) : null}
      {selectedSource && error ? (
        <div className="mt-2 text-destructive text-xs" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}

interface InlineDatabaseCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (reference: { databaseId: string; sourceId: string; viewId: string }) => void;
}

/**
 * Creates a blank database from an inline block without routing the user to
 * the administration workspace. The same exact-plan mutation seam is used as
 * the full-page creator; only the low-risk blank path is auto-approved.
 */
function InlineDatabaseCreationDialog({
  open,
  onOpenChange,
  onCreated,
}: InlineDatabaseCreationDialogProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (status !== 'idle') return;
    const desiredState: DatabaseDesiredStateDraftInput = createBlankDatabaseDesiredState({
      name: name.trim() || 'Untitled database',
    });
    const policy = {
      operation: 'blank-database-create' as const,
      actor: 'human' as const,
      principalId: 'user:local',
    };
    setStatus('creating');
    setError(null);
    void executeDatabaseUiMutation({
      desiredState,
      actor: { principalId: policy.principalId },
      idempotencyKey: `ui-inline-database-${Date.now()}`,
      assertions: {
        databaseAbsent: true,
        createdRecords: desiredState.sampleRecords?.length ?? 0,
      },
      review: () => databaseUiMutationReviewMode(policy) === 'automatic',
    })
      .then((outcome) => {
        if (outcome.status !== 'committed') {
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
        setError(cause instanceof Error ? cause.message : 'Unable to create the inline database');
      })
      .finally(() => setStatus('idle'));
  };

  if (!open) return null;

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
          <h3 className="font-medium text-sm">Create inline database</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Name it here. The editable table will replace this setup block in the current page.
          </p>
        </div>
      </div>
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
        Blank creation is direct-safe. Templates and imports remain available from the full database
        workspace for exact review.
      </p>
      {error ? (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
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
    </section>
  );
}

type LinkedViewState =
  | { status: 'loading' }
  | { status: 'error'; problem: DatabaseUiProblem }
  | {
      status: 'ready';
      description: DatabaseDescription;
      result: DatabaseQueryResult | null;
      stale: boolean;
    };

function linkedViewCacheKey(input: {
  databaseId: string;
  sourceId: string;
  viewId: string;
  mode?: 'inline' | 'full-page';
  showArchived: boolean;
}): string {
  return [
    input.databaseId,
    input.sourceId,
    input.viewId,
    input.mode ?? 'inline',
    input.showArchived ? 'archived' : 'active',
  ].join('\0');
}

function linkedViewProblem(cause: unknown): DatabaseUiProblem {
  const message =
    cause instanceof Error ? cause.message : 'Unable to load the linked database view';
  if (/linked database source no longer exists|linked saved view no longer exists/i.test(message)) {
    return { kind: 'missing', message, retryable: false };
  }
  return classifyDatabaseUiProblem(cause, message);
}

export function DatabaseView({ databaseId, sourceId, viewId, mode }: DatabaseViewProps) {
  'use no memo';
  const host = useJsxComponentHost();
  const reference = DatabaseLinkedViewReferenceSchema.safeParse({
    databaseId,
    sourceId,
    viewId,
    ...(mode ? { mode } : {}),
  });
  const [state, setState] = useState<LinkedViewState>({ status: 'loading' });
  const [refresh, setRefresh] = useState(0);
  const [fullDatabaseOpen, setFullDatabaseOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [initialRecordAction, setInitialRecordAction] = useState<DatabaseInitialRecordAction>();
  const [initialTablePaste, setInitialTablePaste] = useState<readonly DatabasePasteChange[]>();
  const [initialDatabaseSurface, setInitialDatabaseSurface] = useState<
    'properties' | 'view-settings' | 'view-manager' | 'filters'
  >();
  const [initialPropertyId, setInitialPropertyId] = useState<string>();
  const [initialSelectedRecordIds, setInitialSelectedRecordIds] = useState<readonly string[]>();
  const [replacementPickerOpen, setReplacementPickerOpen] = useState(false);
  const [inlineContextInspectorScope, setInlineContextInspectorScope] = useState<{
    recordId?: string;
    recordIds?: string[];
  } | null>(null);
  const [inlineCreationOpen, setInlineCreationOpen] = useState(false);
  const [focusInlineNewRecord, setFocusInlineNewRecord] = useState(false);
  const [inlineMutationStatus, setInlineMutationStatus] = useState<'idle' | 'saving'>('idle');
  const [inlineMutationError, setInlineMutationError] = useState<string | null>(null);
  const [inlineUndoToken, setInlineUndoToken] = useState<string | null>(null);
  const [inlineUndoStatus, setInlineUndoStatus] = useState<'idle' | 'checking' | 'applying'>(
    'idle',
  );
  const [inlineRedoToken, setInlineRedoToken] = useState<string | null>(null);
  const [inlineRedoStatus, setInlineRedoStatus] = useState<'idle' | 'checking' | 'applying'>(
    'idle',
  );
  const [inlineOptimisticCellValues, setInlineOptimisticCellValues] = useState<
    Map<string, DatabaseValue | undefined>
  >(() => new Map());
  const [inlineSelectedRecordIds, setInlineSelectedRecordIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [recordPeek, setRecordPeek] = useState<{
    record: ProjectedDatabaseRecord;
    mode: 'side_peek' | 'center_peek';
  } | null>(null);

  useEffect(() => {
    void refresh;
    const parsed = DatabaseLinkedViewReferenceSchema.safeParse({
      databaseId,
      sourceId,
      viewId,
      ...(mode ? { mode } : {}),
    });
    if (!parsed.success) {
      setState({
        status: 'error',
        problem: {
          kind: 'error',
          message: 'Set valid database, source, and saved-view IDs',
          retryable: false,
        },
      });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const cacheKey = linkedViewCacheKey({
      databaseId: parsed.data.databaseId,
      sourceId: parsed.data.sourceId,
      viewId: parsed.data.viewId,
      mode: parsed.data.mode,
      showArchived,
    });
    void describeDatabase(
      { databaseId: parsed.data.databaseId, sourceId: parsed.data.sourceId },
      { signal: controller.signal },
    )
      .then(async (description) => {
        if (!description.source || description.source.id !== parsed.data.sourceId) {
          throw new Error('The linked database source no longer exists');
        }
        const selectedView = description.database.views.find(
          (view) => view.id === parsed.data.viewId && view.sourceId === parsed.data.sourceId,
        );
        if (!selectedView) throw new Error('The linked saved view no longer exists in this source');
        const result =
          selectedView.layout.type === 'form' || selectedView.layout.type === 'dashboard'
            ? null
            : await queryDatabase(
                {
                  databaseId: parsed.data.databaseId,
                  sourceId: parsed.data.sourceId,
                  viewId: parsed.data.viewId,
                  query: {
                    sort: [],
                    includeArchived: showArchived,
                    page: { limit: parsed.data.mode === 'inline' ? 25 : 100 },
                  },
                },
                { signal: controller.signal },
              );
        rememberDatabaseLinkedView(cacheKey, { description, result });
        setState({ status: 'ready', description, result, stale: false });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const problem = linkedViewProblem(cause);
        const cached = readDatabaseLinkedView(cacheKey);
        if (cached && problem.kind === 'offline') {
          setState({
            status: 'ready',
            description: cached.description,
            result: cached.result,
            stale: true,
          });
          return;
        }
        setState({ status: 'error', problem });
      });
    return () => controller.abort();
  }, [databaseId, sourceId, viewId, mode, refresh, showArchived]);

  const applyReference = (
    next: { databaseId: string; sourceId: string; viewId: string },
    options: { focusNewRecord?: boolean } = {},
  ) => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number') return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        props: {
          ...((node.attrs.props as Record<string, unknown> | undefined) ?? {}),
          ...next,
          mode: 'inline',
        },
      }),
    );
    editor.view.focus();
    setFocusInlineNewRecord(options.focusNewRecord === true);
    setReplacementPickerOpen(false);
  };

  const setInlineMode = (nextMode: 'inline' | 'full-page') => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number') return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        props: {
          ...((node.attrs.props as Record<string, unknown> | undefined) ?? {}),
          mode: nextMode,
        },
      }),
    );
    editor.view.focus();
    setFocusInlineNewRecord(false);
  };

  const removeLinkedView = () => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number') return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    editor.view.focus();
  };

  useEffect(() => {
    const parsed = DatabaseLinkedViewReferenceSchema.safeParse({
      databaseId,
      sourceId,
      viewId,
      ...(mode ? { mode } : {}),
    });
    if (!parsed.success) return;
    return subscribeToDatabaseChanged((payload) => {
      if (
        payload.scope === 'workspace' ||
        payload.databaseIds.includes(parsed.data.databaseId) ||
        payload.sourceIds.includes(parsed.data.sourceId)
      ) {
        setRefresh((current) => current + 1);
      }
    });
  }, [databaseId, sourceId, viewId, mode]);

  if (!reference.success) {
    return (
      <>
        {!inlineCreationOpen ? (
          <InlineDatabasePicker
            onSelected={applyReference}
            onCreateBlank={() => setInlineCreationOpen(true)}
          />
        ) : null}
        <InlineDatabaseCreationDialog
          open={inlineCreationOpen}
          onOpenChange={setInlineCreationOpen}
          onCreated={(next) => applyReference(next, { focusNewRecord: true })}
        />
      </>
    );
  }

  const linkedSource = state.status === 'ready' ? state.description.source : null;
  const linkedDatabase = state.status === 'ready' ? state.description.database : null;
  const linkedView =
    state.status === 'ready'
      ? state.description.database.views.find((view) => view.id === reference.data.viewId)
      : undefined;
  const openRecord = (record: ProjectedDatabaseRecord) => {
    rememberDatabaseRecordNavigation({
      databaseId: reference.data.databaseId,
      sourceId: reference.data.sourceId,
      viewId: reference.data.viewId,
      paths: state.status === 'ready' ? (state.result?.records ?? []).map((item) => item.path) : [],
      currentPath: record.path,
    });
    if (!linkedView || databaseViewOpenBehavior(linkedView) === 'full_page') {
      window.location.hash = databaseRecordPathToHash(record.path);
      return;
    }
    const behavior = databaseViewOpenBehavior(linkedView);
    setRecordPeek({ record, mode: behavior === 'full_page' ? 'side_peek' : behavior });
  };

  const runInlineMutation = (
    desiredState: DatabaseDesiredStateDraftInput,
    policy: { operation: 'cell' | 'record-create'; optimisticCellKey?: string },
  ) => {
    if (
      inlineMutationStatus !== 'idle' ||
      inlineUndoStatus !== 'idle' ||
      inlineRedoStatus !== 'idle'
    ) {
      return;
    }
    setInlineMutationError(null);
    setInlineUndoToken(null);
    setInlineRedoToken(null);
    setInlineMutationStatus('saving');
    void executeDatabaseUiMutation({
      desiredState,
      actor: { principalId: 'user:local' },
      idempotencyKey: `ui-inline-${policy.operation}-${crypto.randomUUID()}`,
      review: () =>
        databaseUiMutationReviewMode({
          operation: policy.operation,
          actor: 'human',
          principalId: 'user:local',
        }) === 'automatic',
    })
      .then((outcome) => {
        if (outcome.status !== 'committed') {
          if (policy.optimisticCellKey) {
            setInlineOptimisticCellValues((current) => {
              if (!current.has(policy.optimisticCellKey as string)) return current;
              const next = new Map(current);
              next.delete(policy.optimisticCellKey as string);
              return next;
            });
          }
          setInlineMutationError('The inline database change was blocked by the current data.');
          return;
        }
        if (policy.optimisticCellKey) {
          setInlineOptimisticCellValues((current) => {
            if (!current.has(policy.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(policy.optimisticCellKey as string);
            return next;
          });
        }
        setInlineUndoToken(outcome.result.undoToken);
        setInlineRedoToken(null);
        setRefresh((current) => current + 1);
      })
      .catch((cause: unknown) => {
        if (policy.optimisticCellKey) {
          setInlineOptimisticCellValues((current) => {
            if (!current.has(policy.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(policy.optimisticCellKey as string);
            return next;
          });
        }
        setInlineMutationError(
          cause instanceof Error ? cause.message : 'Unable to save the inline database change',
        );
      })
      .finally(() => setInlineMutationStatus('idle'));
  };

  const undoInlineMutation = () => {
    if (
      !inlineUndoToken ||
      inlineUndoStatus !== 'idle' ||
      inlineRedoStatus !== 'idle' ||
      inlineMutationStatus !== 'idle'
    ) {
      return;
    }
    const token = inlineUndoToken;
    setInlineMutationError(null);
    setInlineUndoStatus('checking');
    void previewDatabaseUiUndo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Undo is no longer safe: ${reason}`);
        }
        setInlineUndoStatus('applying');
        return applyDatabaseUiUndo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-inline-undo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The inline database undo was refused');
        }
        setInlineUndoToken(null);
        setInlineRedoToken(token);
        setRefresh((current) => current + 1);
      })
      .catch((cause: unknown) => {
        setInlineMutationError(cause instanceof Error ? cause.message : 'Inline undo failed');
      })
      .finally(() => setInlineUndoStatus('idle'));
  };

  const redoInlineMutation = () => {
    if (
      !inlineRedoToken ||
      inlineRedoStatus !== 'idle' ||
      inlineUndoStatus !== 'idle' ||
      inlineMutationStatus !== 'idle'
    ) {
      return;
    }
    const token = inlineRedoToken;
    setInlineMutationError(null);
    setInlineRedoStatus('checking');
    void previewDatabaseUiRedo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Redo is no longer safe: ${reason}`);
        }
        setInlineRedoStatus('applying');
        return applyDatabaseUiRedo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-inline-redo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The inline database redo was refused');
        }
        setInlineRedoToken(null);
        setInlineUndoToken(token);
        setRefresh((current) => current + 1);
      })
      .catch((cause: unknown) => {
        setInlineMutationError(cause instanceof Error ? cause.message : 'Inline redo failed');
      })
      .finally(() => setInlineRedoStatus('idle'));
  };

  const editInlineCell = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    const optimisticCellKey = `${record.id}:${property.id}`;
    try {
      setInlineOptimisticCellValues((current) => {
        const next = new Map(current);
        next.set(optimisticCellKey, value);
        return next;
      });
      runInlineMutation(
        createDatabaseCellMutationDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          record,
          property,
          value,
        }),
        { operation: 'cell', optimisticCellKey },
      );
    } catch (cause) {
      setInlineOptimisticCellValues((current) => {
        const next = new Map(current);
        next.delete(optimisticCellKey);
        return next;
      });
      setInlineMutationError(cause instanceof Error ? cause.message : 'Unable to edit the cell');
    }
  };

  const createInlineRecord = (title: string) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    try {
      runInlineMutation(
        createDatabaseRecordDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          title,
          viewId: reference.data.viewId,
        }),
        { operation: 'record-create' },
      );
    } catch (cause) {
      setInlineMutationError(
        cause instanceof Error ? cause.message : 'Unable to create the inline database page',
      );
    }
  };

  const applyInlineViewChanges = (
    record: ProjectedDatabaseRecord,
    changes: readonly { property: DatabaseProperty; value: DatabaseValue | undefined }[],
  ) => {
    const [change] = changes;
    if (
      changes.length === 1 &&
      change &&
      state.status === 'ready' &&
      linkedSource &&
      linkedDatabase
    ) {
      try {
        runInlineMutation(
          createDatabaseCellMutationDesiredState({
            database: linkedDatabase,
            source: linkedSource,
            record,
            property: change.property,
            value: change.value,
          }),
          { operation: 'cell' },
        );
        return;
      } catch (cause) {
        setInlineMutationError(
          cause instanceof Error ? cause.message : 'Unable to save the inline database change',
        );
        return;
      }
    }
    setInitialRecordAction({
      kind: 'transition',
      recordId: record.id,
      changes: changes.map((change) => ({
        propertyId: change.property.id,
        ...(change.value === undefined ? {} : { value: change.value }),
      })),
    });
    setFullDatabaseOpen(true);
  };

  const pasteInlineCells = (changes: readonly DatabasePasteChange[]) => {
    if (changes.length === 0) return;
    if (changes.length === 1) {
      const [change] = changes;
      if (!change) return;
      editInlineCell(change.record, change.property, change.value);
      return;
    }
    setInitialTablePaste(changes);
    setInlineMutationError(null);
    setFullDatabaseOpen(true);
  };

  const openInlineDatabaseSurface = (
    surface: 'properties' | 'view-settings' | 'view-manager' | 'filters',
    propertyId?: string,
  ) => {
    setInitialDatabaseSurface(surface);
    setInitialPropertyId(propertyId);
    setFullDatabaseOpen(true);
  };

  const handleInlineHistoryKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target;
    const elementTarget = target instanceof HTMLElement ? target : null;
    if (
      elementTarget &&
      (elementTarget.tagName === 'INPUT' ||
        elementTarget.tagName === 'TEXTAREA' ||
        elementTarget.isContentEditable)
    ) {
      return;
    }
    if (event.shiftKey) {
      if (!inlineRedoToken) return;
      event.preventDefault();
      redoInlineMutation();
      return;
    }
    if (!inlineUndoToken) return;
    event.preventDefault();
    undoInlineMutation();
  };

  return (
    <section
      className={cn(
        'my-4 overflow-hidden rounded-lg border bg-background',
        reference.data.mode === 'full-page' &&
          'relative left-1/2 w-[min(96vw,90rem)] -translate-x-1/2',
      )}
      contentEditable={false}
      onKeyDown={handleInlineHistoryKeyDown}
      tabIndex={-1}
      aria-label="Linked database view"
      aria-busy={state.status === 'loading'}
      data-database-view-state={state.status}
      data-database-id={reference.data.databaseId}
      data-source-id={reference.data.sourceId}
      data-view-id={reference.data.viewId}
      data-view-mode={reference.data.mode}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">
            {state.status === 'ready' ? linkedView?.name : 'Linked database view'}
          </h3>
          {state.status === 'ready' ? (
            <p className="truncate text-muted-foreground text-xs">
              {state.description.database.name} · {state.description.source?.name}
            </p>
          ) : null}
          {state.status === 'ready' ? (
            <p className="truncate text-muted-foreground text-xs" data-linked-record-sharing>
              Shared records · edits affect the canonical database; this view keeps its own
              settings.
            </p>
          ) : null}
          {state.status === 'ready' &&
          linkedDatabase &&
          linkedDatabase.views.filter((candidate) => candidate.sourceId === reference.data.sourceId)
            .length > 1 ? (
            <nav
              className="mt-2 flex max-w-full gap-1 overflow-x-auto"
              aria-label="Linked database views"
              data-linked-database-view-tabs
            >
              {linkedDatabase.views
                .filter((candidate) => candidate.sourceId === reference.data.sourceId)
                .map((candidate) => (
                  <Button
                    key={candidate.id}
                    type="button"
                    size="xs"
                    variant={candidate.id === reference.data.viewId ? 'secondary' : 'ghost'}
                    aria-current={candidate.id === reference.data.viewId ? 'page' : undefined}
                    onClick={() =>
                      applyReference({
                        databaseId: reference.data.databaseId,
                        sourceId: reference.data.sourceId,
                        viewId: candidate.id,
                      })
                    }
                  >
                    {candidate.name}
                  </Button>
                ))}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="New database view"
                disabled={
                  inlineMutationStatus !== 'idle' ||
                  inlineUndoStatus !== 'idle' ||
                  inlineRedoStatus !== 'idle'
                }
                onClick={() => openInlineDatabaseSurface('view-manager')}
              >
                <Plus aria-hidden="true" />
              </Button>
            </nav>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {linkedView?.layout.type !== 'form' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={state.status !== 'ready'}
              onClick={() => {
                setInitialRecordAction({ kind: 'create' });
                setFullDatabaseOpen(true);
              }}
            >
              <Plus /> <Trans>New record</Trans>
            </Button>
          ) : null}
          {linkedView?.layout.type !== 'form' ? (
            <Button
              type="button"
              variant={showArchived ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={showArchived}
              disabled={state.status === 'loading'}
              onClick={() => setShowArchived((current) => !current)}
            >
              <Archive />
              {showArchived ? <Trans>Hide archived</Trans> : <Trans>Show archived</Trans>}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh linked database view"
            disabled={
              state.status === 'loading' ||
              (state.status === 'error' &&
                (state.problem.kind === 'permission' || state.problem.kind === 'missing'))
            }
            onClick={() => setRefresh((current) => current + 1)}
          >
            <RefreshCw className={cn(state.status === 'loading' && 'animate-spin')} />
          </Button>
          {state.status === 'ready' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReplacementPickerOpen(true)}
            >
              Change view
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (state.status === 'ready') {
                window.location.hash = databasePageTargetToHash(reference.data);
                return;
              }
              setInitialRecordAction(undefined);
              setFullDatabaseOpen(true);
            }}
          >
            <ExternalLink /> <Trans>Open full database</Trans>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Database view actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {reference.data.mode === 'inline' ? (
                <DropdownMenuItem onSelect={() => setInlineMode('full-page')}>
                  <ExternalLink /> <Trans>Convert to full page</Trans>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setInlineMode('inline')}>
                  <Trans>Convert to inline view</Trans>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setReplacementPickerOpen(true)}>
                <Search /> <Trans>Choose another view</Trans>
              </DropdownMenuItem>
              {state.status === 'ready' ? (
                <DropdownMenuItem onSelect={() => setInlineContextInspectorScope({})}>
                  <Braces /> <Trans>Inspect agent context</Trans>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => openInlineDatabaseSurface('properties')}>
                <Plus /> <Trans>Manage properties</Trans>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openInlineDatabaseSurface('view-settings')}>
                <Settings2 /> <Trans>View settings</Trans>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openInlineDatabaseSurface('view-manager')}>
                <Settings2 /> <Trans>Manage views</Trans>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openInlineDatabaseSurface('filters')}>
                <Filter /> <Trans>Filters</Trans>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={removeLinkedView}>
                <Trash2 /> <Trans>Remove linked view</Trans>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {state.status === 'ready' && state.stale ? (
        <div
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-900 text-xs dark:text-amber-100"
          role="status"
          data-testid="database-view-stale"
          data-database-view-stale="true"
        >
          Offline or unavailable · showing the last verified snapshot. The view will refresh when
          the connection returns.
        </div>
      ) : null}
      {inlineMutationStatus === 'saving' ? (
        <div className="border-b bg-muted/20 px-4 py-2 text-muted-foreground text-xs" role="status">
          Saving inline database change
        </div>
      ) : null}
      {inlineUndoToken || inlineRedoToken ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b bg-emerald-500/5 px-4 py-2 text-xs"
          role="status"
          data-testid="inline-save-feedback"
        >
          <span>
            {inlineUndoToken ? 'Inline database change saved' : 'Inline database change undone'}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={inlineUndoStatus !== 'idle' || inlineRedoStatus !== 'idle'}
            onClick={inlineUndoToken ? undoInlineMutation : redoInlineMutation}
          >
            {inlineUndoToken
              ? inlineUndoStatus === 'checking'
                ? 'Checking undo'
                : inlineUndoStatus === 'applying'
                  ? 'Undoing'
                  : 'Undo inline database change'
              : inlineRedoStatus === 'checking'
                ? 'Checking redo'
                : inlineRedoStatus === 'applying'
                  ? 'Redoing'
                  : 'Redo inline database change'}
          </Button>
        </div>
      ) : null}
      {inlineMutationError ? (
        <div
          className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-destructive text-xs"
          role="alert"
        >
          {inlineMutationError}
        </div>
      ) : null}
      {inlineSelectedRecordIds.size > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/5 px-4 py-2 text-xs"
          data-testid="inline-selection-toolbar"
          role="status"
        >
          <span>{inlineSelectedRecordIds.size} selected</span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setInitialSelectedRecordIds([...inlineSelectedRecordIds]);
                setFullDatabaseOpen(true);
              }}
            >
              Open bulk actions
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setInlineContextInspectorScope({ recordIds: [...inlineSelectedRecordIds] })
              }
            >
              <Braces /> <Trans>Inspect selected context</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setInlineSelectedRecordIds(new Set())}
            >
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      {replacementPickerOpen ? (
        <div className="p-3">
          {!inlineCreationOpen ? (
            <InlineDatabasePicker
              message="Choose a different database or saved view. Existing records remain shared."
              onSelected={applyReference}
              onCreateBlank={() => setInlineCreationOpen(true)}
            />
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReplacementPickerOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : state.status === 'loading' ? (
        <div
          className="flex min-h-40 items-center justify-center text-muted-foreground text-sm"
          role="status"
          data-database-state="loading"
          data-testid="database-view-loading"
        >
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Loading linked view
        </div>
      ) : state.status === 'error' ? (
        <div
          className="flex min-h-32 flex-wrap items-center gap-3 p-4 text-destructive text-sm"
          role="alert"
          data-testid="database-view-error"
          data-database-view-error-kind={state.problem.kind}
          data-database-view-retryable={String(state.problem.retryable)}
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-medium">
                {state.problem.kind === 'missing'
                  ? 'Linked database view is unavailable'
                  : state.problem.kind === 'permission'
                    ? 'Permission required'
                    : state.problem.kind === 'offline'
                      ? 'Database is offline'
                      : state.problem.kind === 'invalid_schema'
                        ? 'Database schema is invalid'
                        : state.problem.kind === 'stale_index'
                          ? 'Database index is not current'
                          : state.problem.kind === 'conflict'
                            ? 'Canonical state changed'
                            : 'Database request failed'}
              </div>
              <p className="mt-0.5 break-words opacity-90">{state.problem.message}</p>
              {state.problem.kind === 'permission' ? (
                <p className="mt-1 opacity-90">
                  Request access or use fields available to your current policy.
                </p>
              ) : null}
            </div>
          </div>
          {state.problem.kind === 'missing' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReplacementPickerOpen(true)}
            >
              Choose replacement
            </Button>
          ) : state.problem.kind !== 'permission' &&
            (state.problem.retryable || state.problem.kind === 'conflict') ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefresh((current) => current + 1)}
            >
              {state.problem.kind === 'stale_index'
                ? 'Check index again'
                : state.problem.kind === 'invalid_schema'
                  ? 'Reload schema'
                  : state.problem.kind === 'conflict'
                    ? 'Reload latest'
                    : 'Retry'}
            </Button>
          ) : null}
        </div>
      ) : linkedSource && linkedView ? (
        <div
          className={cn('overflow-auto p-3', reference.data.mode === 'inline' && 'max-h-[36rem]')}
        >
          <Suspense
            fallback={
              <div className="flex min-h-40 items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="mr-2 size-4 animate-spin" /> Loading table renderer
              </div>
            }
          >
            {linkedView.layout.type === 'form' ? (
              <LazyDatabaseForm
                key={state.description.schemaRevision}
                databaseId={state.description.database.id}
                source={linkedSource}
                view={linkedView}
                people={state.description.database.people}
              />
            ) : linkedView.layout.type === 'dashboard' ? (
              <LazyDatabaseDashboard
                key={state.description.schemaRevision}
                databaseId={state.description.database.id}
                database={state.description.database}
                view={linkedView}
                onOpen={openRecord}
              />
            ) : !state.result ? null : linkedView.layout.type === 'board' ? (
              <LazyDatabaseBoard
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
                onTransition={(transition) => {
                  applyInlineViewChanges(transition.record, transition.changes);
                }}
                mutationLocked={
                  inlineMutationStatus !== 'idle' ||
                  inlineUndoStatus !== 'idle' ||
                  inlineRedoStatus !== 'idle'
                }
                onDuplicate={(record) => {
                  setInitialRecordAction({ kind: 'duplicate', recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
                onArchive={(record, action) => {
                  setInitialRecordAction({ kind: action, recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
                onRequestMove={(record) => {
                  setInitialRecordAction({ kind: 'move', recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
                onDelete={(record) => {
                  setInitialRecordAction({ kind: 'delete', recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
              />
            ) : linkedView.layout.type === 'timeline' ? (
              <LazyDatabaseTimeline
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
                onChange={(change) => {
                  applyInlineViewChanges(change.record, change.changes);
                }}
                mutationLocked={
                  inlineMutationStatus !== 'idle' ||
                  inlineUndoStatus !== 'idle' ||
                  inlineRedoStatus !== 'idle'
                }
              />
            ) : linkedView.layout.type === 'calendar' ? (
              <LazyDatabaseCalendar
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
                onChange={(change) => {
                  applyInlineViewChanges(change.record, change.changes);
                }}
                mutationLocked={
                  inlineMutationStatus !== 'idle' ||
                  inlineUndoStatus !== 'idle' ||
                  inlineRedoStatus !== 'idle'
                }
              />
            ) : linkedView.layout.type === 'list' ? (
              <LazyDatabaseList
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
              />
            ) : linkedView.layout.type === 'gallery' ? (
              <LazyDatabaseGallery
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
              />
            ) : linkedView.layout.type === 'chart' ? (
              <LazyDatabaseChart
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
              />
            ) : linkedView.layout.type === 'map' ? (
              <LazyDatabaseMap
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                onOpen={openRecord}
              />
            ) : linkedView.layout.type === 'feed' ? (
              <LazyDatabaseFeed
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                view={linkedView}
                result={state.result}
                people={state.description.database.people}
                onOpen={openRecord}
              />
            ) : (
              <LazyDatabaseTable
                key={`${state.description.schemaRevision}:${state.result.snapshotRevision}`}
                source={linkedSource}
                databaseId={state.description.database.id}
                viewId={linkedView.id}
                result={state.result}
                people={state.description.database.people}
                optimisticCellValues={inlineOptimisticCellValues}
                mutationLocked={
                  inlineMutationStatus !== 'idle' ||
                  inlineUndoStatus !== 'idle' ||
                  inlineRedoStatus !== 'idle'
                }
                autoFocusNewRecord={reference.data.mode === 'inline' ? focusInlineNewRecord : false}
                selectedRecordIds={inlineSelectedRecordIds}
                viewPropertyIds={linkedView.projection.propertyIds}
                viewConfiguration={
                  linkedView.layout.type === 'table' ? linkedView.layout.configuration : undefined
                }
                onOpen={openRecord}
                onEdit={editInlineCell}
                onCreateRecord={createInlineRecord}
                onPaste={pasteInlineCells}
                onSelectionChange={setInlineSelectedRecordIds}
                onOpenContextInspector={(record) =>
                  setInlineContextInspectorScope({ recordId: record.id })
                }
                onManageProperties={(propertyId) =>
                  openInlineDatabaseSurface('properties', propertyId)
                }
                onDuplicate={(record) => {
                  setInitialRecordAction({ kind: 'duplicate', recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
                onArchive={(record, action) => {
                  setInitialRecordAction({ kind: action, recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
                onRequestMove={(record) => {
                  setInitialRecordAction({ kind: 'move', recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
                onDelete={(record) => {
                  setInitialRecordAction({ kind: 'delete', recordId: record.id });
                  setFullDatabaseOpen(true);
                }}
              />
            )}
          </Suspense>
        </div>
      ) : null}

      {recordPeek && linkedSource && linkedDatabase ? (
        <DatabaseRecordPeek
          key={`${recordPeek.record.id}:${recordPeek.mode}`}
          mode={recordPeek.mode}
          database={linkedDatabase}
          source={linkedSource}
          record={recordPeek.record}
          onClose={() => setRecordPeek(null)}
          onOpenFull={() => {
            rememberDatabaseRecordNavigation({
              databaseId: reference.data.databaseId,
              sourceId: reference.data.sourceId,
              viewId: reference.data.viewId,
              paths:
                state.status === 'ready'
                  ? (state.result?.records ?? []).map((item) => item.path)
                  : [],
              currentPath: recordPeek.record.path,
            });
            window.location.hash = databaseRecordPathToHash(recordPeek.record.path);
            setRecordPeek(null);
          }}
        />
      ) : null}

      <InlineDatabaseCreationDialog
        open={inlineCreationOpen}
        onOpenChange={setInlineCreationOpen}
        onCreated={(next) => applyReference(next, { focusNewRecord: true })}
      />

      <Suspense fallback={null}>
        {inlineContextInspectorScope && state.status === 'ready' ? (
          <LazyDatabaseContextInspectorDialog
            open
            onOpenChange={(open) => {
              if (!open) setInlineContextInspectorScope(null);
            }}
            scope={{
              databaseId: state.description.database.id,
              sourceId: state.description.source?.id,
              viewId: reference.data.viewId,
              ...(inlineContextInspectorScope.recordId
                ? { recordId: inlineContextInspectorScope.recordId }
                : {}),
              ...(inlineContextInspectorScope.recordIds?.length
                ? { recordIds: inlineContextInspectorScope.recordIds }
                : {}),
            }}
          />
        ) : null}
        {fullDatabaseOpen ? (
          <LazyDatabaseTableDialog
            open
            onOpenChange={(nextOpen) => {
              setFullDatabaseOpen(nextOpen);
              if (!nextOpen) {
                setInitialRecordAction(undefined);
                setInitialTablePaste(undefined);
                setInitialDatabaseSurface(undefined);
                setInitialPropertyId(undefined);
                setInitialSelectedRecordIds(undefined);
              }
            }}
            initialTarget={reference.data}
            initialRecordAction={initialRecordAction}
            initialTablePaste={initialTablePaste}
            initialDatabaseSurface={initialDatabaseSurface}
            initialPropertyId={initialPropertyId}
            initialSelectedRecordIds={initialSelectedRecordIds}
            onOpenRecord={(path) => {
              window.location.hash = databaseRecordPathToHash(path);
              setFullDatabaseOpen(false);
            }}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
