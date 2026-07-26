import { Trans } from '@lingui/react/macro';
import {
  type BacklinkEntry,
  BacklinksSuccessSchema,
  type DatabaseDefinition,
  type DatabaseProperty,
  type DatabasePropertyType,
  type DatabaseSource,
  DocumentReadSuccessSchema,
  type ProjectedDatabaseRecord,
  readFmRegionWithError,
  stripFrontmatter,
} from '@nedian0brien/synapsenote-core';
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  History,
  Link2,
  Maximize2,
  MessageSquare,
  PanelRightClose,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DatabaseAgentScopeMenu } from '@/components/DatabaseAgentScopeMenu';
import { DatabaseRecordHistoryDialog } from '@/components/DatabaseRecordHistoryDialog';
import { DatabaseRecordPageSurface } from '@/components/DatabaseRecordPageSurface';
import { DatabaseRecordPeekComments } from '@/components/DatabaseRecordPeekComments';
import { DatabaseRecordPeekEditor } from '@/components/DatabaseRecordPeekEditor';
import { DatabaseRecordPeekPropertyPopover } from '@/components/DatabaseRecordPeekPropertyPopover';
import { DatabaseRelationsDialog } from '@/components/DatabaseRelationsDialog';
import { DatabasePropertyTypeIcon } from '@/components/database-property-icons';
import { databaseInlineOptionColorClass } from '@/components/database-table-utils';
import { resolvePageCover, resolvePageIcon } from '@/components/page-header-utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOptionalDocumentContext } from '@/editor/DocumentContext';
import { describeDatabase } from '@/lib/database-catalog-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';
import { executeDatabaseMutation } from '@/lib/database-mutations/database-mutation-gateway';
import {
  createDatabaseAddPropertyDesiredState,
  createDatabasePropertyDefinitionForAdd,
} from '@/lib/database-mutations/database-property-commands';
import {
  databasePageTargetToHash,
  databaseRecordPathToHash,
  navigateToDatabaseHash,
} from '@/lib/database-navigation';
import type { DatabaseOverlayDismissReason } from '@/lib/database-overlay-store';
import {
  type DatabaseRecordNavigationState,
  databaseRecordNavigationHash,
  databaseRecordNavigationOriginHash,
  readDatabaseRecordNavigation,
} from '@/lib/database-record-navigation';
import { filePathToDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

const SIDE_PEEK_WIDTH_STORAGE_KEY = 'synapsenote:database-side-peek-width-v1';
const SIDE_PEEK_DEFAULT_FRACTION = 0.5;
const SIDE_PEEK_MAX_FRACTION = 0.9;
const SIDE_PEEK_NARROW_MAX_FRACTION = 0.94;
const SIDE_PEEK_MIN_WIDTH_PX = 576;
const SIDE_PEEK_KEYBOARD_STEP_PX = 24;

function sidePeekWidthBounds(viewportWidth: number): { min: number; max: number } {
  const maxFraction = viewportWidth <= 760 ? SIDE_PEEK_NARROW_MAX_FRACTION : SIDE_PEEK_MAX_FRACTION;
  const max = Math.max(0, viewportWidth * maxFraction);
  return { min: Math.min(SIDE_PEEK_MIN_WIDTH_PX, max), max };
}

function clampSidePeekWidth(width: number, viewportWidth = window.innerWidth): number {
  const { min, max } = sidePeekWidthBounds(viewportWidth);
  return Math.min(max, Math.max(min, width));
}

function readInitialSidePeekWidth(): number {
  if (typeof window === 'undefined') return SIDE_PEEK_MIN_WIDTH_PX;
  let stored: number | null = null;
  try {
    const raw = window.localStorage.getItem(SIDE_PEEK_WIDTH_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) stored = parsed;
    }
  } catch {
    // Storage may be unavailable in privacy-restricted embedded contexts.
  }
  return clampSidePeekWidth(stored ?? window.innerWidth * SIDE_PEEK_DEFAULT_FRACTION);
}

type PeekState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      body: string;
      icon: ReturnType<typeof resolvePageIcon>;
      cover: ReturnType<typeof resolvePageCover>;
    };

type BacklinksState =
  | { status: 'loading'; entries: readonly BacklinkEntry[] }
  | { status: 'ready'; entries: readonly BacklinkEntry[] }
  | { status: 'error'; entries: readonly BacklinkEntry[]; message: string };

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Empty';
  if (Array.isArray(value)) return value.map(valueText).join(', ');
  if (typeof value === 'boolean') return value ? 'Checked' : 'Unchecked';
  if (typeof value === 'object') {
    if ('start' in value && typeof value.start === 'string') {
      const end = 'end' in value && typeof value.end === 'string' ? ` → ${value.end}` : '';
      return `${value.start}${end}`;
    }
    if ('name' in value && typeof value.name === 'string') return value.name;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function PeekPropertyValue({ property, value }: { property: DatabaseProperty; value: unknown }) {
  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  if (empty) return <span className="text-muted-foreground/70">Empty</span>;

  if (
    property.type === 'select' ||
    property.type === 'status' ||
    property.type === 'multi_select'
  ) {
    const values = Array.isArray(value) ? value : [value];
    return (
      <span className="flex min-w-0 flex-wrap gap-1.5">
        {values.map((entry) => {
          const option = property.options.find((candidate) => candidate.id === String(entry));
          return (
            <span
              key={String(entry)}
              className={cn(
                'inline-flex max-w-full items-center rounded px-2 py-0.5 text-xs',
                databaseInlineOptionColorClass(option?.color),
              )}
              data-database-peek-property-tag={property.id}
            >
              <span className="truncate">{option?.name ?? String(entry)}</span>
            </span>
          );
        })}
      </span>
    );
  }

  return <span className="break-words">{valueText(value)}</span>;
}

function PeekBody({
  database,
  source,
  record,
  state,
  onOpenFull,
  onFocusComments,
  commentsFocusRequest,
  onCreateProperty,
  onOpenHistory,
  onOpenRelations,
  onClose,
  onNavigateRecord,
  recordNavigation,
  backlinksState,
  notionSurface,
  docName,
  collabUrl,
  principalId,
  principalName,
}: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  state: PeekState;
  onOpenFull: () => void;
  onFocusComments: () => void;
  commentsFocusRequest: number;
  onCreateProperty: (input: { name: string; type: DatabasePropertyType }) => Promise<void>;
  onOpenHistory: () => void;
  onOpenRelations: () => void;
  onClose: () => void;
  onNavigateRecord?: (path: string) => void;
  recordNavigation: DatabaseRecordNavigationState | null;
  backlinksState: BacklinksState;
  notionSurface: boolean;
  docName: string;
  collabUrl: string | null;
  principalId: string | null;
  principalName: string | null;
}) {
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const databaseHref = recordNavigation
    ? databaseRecordNavigationOriginHash(recordNavigation)
    : databasePageTargetToHash({
        databaseId: database.id,
        sourceId: source.id,
      });
  const properties = source.properties.filter((property) => property.type !== 'title');
  const navigateToRecord = (index: number) => {
    if (!recordNavigation) return;
    const path = recordNavigation.paths[index];
    const hash = databaseRecordNavigationHash(recordNavigation, index);
    if (!path || !hash) return;
    if (onNavigateRecord) onNavigateRecord(path);
    else navigateToDatabaseHash(hash);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-database-peek-page>
      <header
        className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background/95 px-3 backdrop-blur-sm"
        data-database-peek-toolbar
      >
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Close page preview"
            title="Close page preview"
            onClick={onClose}
          >
            <PanelRightClose />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Open full page"
            title="Open full page"
            onClick={onOpenFull}
          >
            <Maximize2 />
          </Button>
          <nav
            className="ml-2 hidden min-w-0 items-center gap-1 truncate text-muted-foreground text-xs md:flex"
            aria-label="Database breadcrumbs"
            data-database-breadcrumbs
          >
            <a className="truncate hover:text-foreground" href={databaseHref}>
              {database.name}
            </a>
            <span aria-hidden="true">/</span>
            <span className="truncate">{source.name}</span>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {recordNavigation ? (
            <>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={recordNavigation.index === 0}
                aria-label={notionSurface ? 'Previous page' : 'Previous record'}
                title={notionSurface ? 'Previous page' : 'Previous record'}
                onClick={() => navigateToRecord(recordNavigation.index - 1)}
                data-database-record-navigation="previous"
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={recordNavigation.index === recordNavigation.paths.length - 1}
                aria-label={notionSurface ? 'Next page' : 'Next record'}
                title={notionSurface ? 'Next page' : 'Next record'}
                onClick={() => navigateToRecord(recordNavigation.index + 1)}
                data-database-record-navigation="next"
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
          <DatabaseAgentScopeMenu
            scope={{
              databaseId: database.id,
              sourceId: source.id,
              recordId: record.id,
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Comments"
            title="Comments"
            onClick={onFocusComments}
          >
            <MessageSquare />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="History"
            title="History"
            onClick={onOpenHistory}
          >
            <History />
          </Button>
          {source.properties.some((property) => property.type === 'relation') ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Relations"
              title="Relations"
              onClick={onOpenRelations}
            >
              <Link2 />
            </Button>
          ) : null}
        </div>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-database-record-peek
        data-testid="editor-scroll-container"
      >
        {state.status === 'ready' && state.cover.kind !== 'unsupported' ? (
          <img
            src={state.cover.value}
            alt=""
            className="h-44 w-full object-cover sm:h-52"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <main className="mx-auto w-full max-w-[44rem] px-6 pt-12 pb-24 sm:px-12 sm:pt-16">
          <h2
            className="flex items-center gap-3 break-words font-heading font-bold text-[2rem] leading-[1.2] tracking-[-0.02em]"
            data-database-peek-title
          >
            {state.status === 'ready' && state.icon.kind === 'emoji' ? (
              <span className="shrink-0" aria-hidden>
                {state.icon.value}
              </span>
            ) : null}
            {state.status === 'ready' &&
            (state.icon.kind === 'url' || state.icon.kind === 'path') ? (
              <img
                src={state.icon.value}
                alt=""
                className="size-8 rounded object-cover"
                referrerPolicy="no-referrer"
              />
            ) : null}
            {valueText(record.values[titleProperty?.id ?? ''])}
          </h2>
          {properties.length > 0 ? (
            <dl className="mt-8 space-y-0.5" data-database-peek-properties>
              {properties.map((property) => (
                <div
                  key={property.id}
                  className="group grid min-h-9 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] items-start gap-4 rounded px-1 py-1.5 hover:bg-muted/35"
                  data-database-peek-property={property.id}
                >
                  <dt className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
                    <DatabasePropertyTypeIcon type={property.type} className="size-4 shrink-0" />
                    <span className="truncate">{property.name}</span>
                  </dt>
                  <dd className="min-w-0 text-sm leading-6">
                    <PeekPropertyValue property={property} value={record.values[property.id]} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <DatabaseRecordPeekPropertyPopover onCreate={onCreateProperty} />

          <DatabaseRecordPeekComments
            database={database}
            source={source}
            record={record}
            principalId={principalId}
            principalName={principalName}
            focusRequest={commentsFocusRequest}
          />

          <section
            className="mt-4 min-h-[18rem] border-t border-border/60 pt-7"
            aria-label="Page content"
            data-database-peek-page-content
          >
            {state.status === 'error' ? (
              <p
                className="mb-3 rounded border border-destructive/30 p-3 text-destructive text-sm"
                role="alert"
              >
                {state.message}
              </p>
            ) : null}
            <DatabaseRecordPeekEditor
              docName={docName}
              initialBody={state.status === 'ready' ? state.body : ''}
              collabUrl={collabUrl}
              principalId={principalId}
            />
          </section>

          {backlinksState.status === 'error' || backlinksState.entries.length > 0 ? (
            <section className="mt-8" aria-label="Backlinks">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <GitBranch className="size-4" /> <Trans>Backlinks</Trans>{' '}
                <span className="text-muted-foreground">{backlinksState.entries.length}</span>
              </h3>
              {backlinksState.status === 'error' ? (
                <p className="text-destructive text-xs" role="alert">
                  {backlinksState.message}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {backlinksState.entries.slice(0, 10).map((backlink) => (
                    <Button
                      key={`${backlink.source}:${backlink.anchor ?? ''}`}
                      type="button"
                      size="sm"
                      variant="ghost"
                      asChild
                    >
                      <a href={databaseRecordPathToHash(backlink.source, backlink.anchor)}>
                        {backlink.source}
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export function DatabaseRecordPeek({
  mode,
  database,
  source,
  record,
  onClose,
  onOpenFull,
  onNavigateRecord,
  notionSurface = false,
}: {
  mode: 'side_peek' | 'center_peek';
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  onClose: (reason?: DatabaseOverlayDismissReason) => void;
  onOpenFull: () => void;
  onNavigateRecord?: (path: string) => void;
  notionSurface?: boolean;
}) {
  const documentContext = useOptionalDocumentContext();
  const dismissReasonRef = useRef<DatabaseOverlayDismissReason | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [sidePeekWidth, setSidePeekWidth] = useState(readInitialSidePeekWidth);
  const closeFromPrimitive = () => {
    const reason = dismissReasonRef.current ?? 'explicit';
    dismissReasonRef.current = null;
    onClose(reason);
  };
  const [state, setState] = useState<PeekState>({ status: 'loading' });
  const [backlinksState, setBacklinksState] = useState<BacklinksState>({
    status: 'loading',
    entries: [],
  });
  const [commentsFocusRequest, setCommentsFocusRequest] = useState(0);
  const [descriptionOverride, setDescriptionOverride] = useState<{
    databaseId: string;
    sourceId: string;
    database: DatabaseDefinition;
    source: DatabaseSource;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [recordNavigation, setRecordNavigation] = useState<DatabaseRecordNavigationState | null>(
    () => readDatabaseRecordNavigation(record.path),
  );
  const docName = filePathToDocName(record.path);
  const matchingDescriptionOverride =
    descriptionOverride?.databaseId === database.id && descriptionOverride.sourceId === source.id
      ? descriptionOverride
      : null;
  const activeDatabase = matchingDescriptionOverride?.database ?? database;
  const activeSource = matchingDescriptionOverride?.source ?? source;
  useEffect(() => {
    if (mode !== 'side_peek') return;
    const handleResize = () => {
      setSidePeekWidth((current) => clampSidePeekWidth(current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mode]);
  useEffect(() => {
    if (mode !== 'side_peek') return;
    try {
      window.localStorage.setItem(SIDE_PEEK_WIDTH_STORAGE_KEY, String(sidePeekWidth));
    } catch {
      // Keep resizing functional when localStorage is unavailable.
    }
  }, [mode, sidePeekWidth]);
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const startSidePeekResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const priorCursor = document.body.style.cursor;
    const priorUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (pointerEvent: PointerEvent) => {
      setSidePeekWidth(clampSidePeekWidth(window.innerWidth - pointerEvent.clientX));
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      document.body.style.cursor = priorCursor;
      document.body.style.userSelect = priorUserSelect;
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = finish;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const resizeSidePeekWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const { min, max } = sidePeekWidthBounds(window.innerWidth);
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = sidePeekWidth + SIDE_PEEK_KEYBOARD_STEP_PX;
    if (event.key === 'ArrowRight') next = sidePeekWidth - SIDE_PEEK_KEYBOARD_STEP_PX;
    if (event.key === 'Home') next = min;
    if (event.key === 'End') next = max;
    if (next === null) return;
    event.preventDefault();
    setSidePeekWidth(clampSidePeekWidth(next));
  };
  useEffect(() => {
    setRecordNavigation(readDatabaseRecordNavigation(record.path));
  }, [record.path]);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void fetch(`/api/document?docName=${encodeURIComponent(docName)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            notionSurface
              ? 'Unable to load the database page document'
              : 'Unable to load the canonical record document',
          );
        }
        const document = DocumentReadSuccessSchema.parse(payload);
        const frontmatter = readFmRegionWithError(document.content).map;
        setState({
          status: 'ready',
          body: stripFrontmatter(document.content).body,
          icon: resolvePageIcon(frontmatter.icon),
          cover: resolvePageCover(frontmatter.cover),
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message:
              cause instanceof Error
                ? cause.message
                : notionSurface
                  ? 'Unable to load page content'
                  : 'Unable to load record body',
          });
      });
    return () => controller.abort();
  }, [docName, notionSurface]);
  useEffect(() => {
    const controller = new AbortController();
    setBacklinksState({ status: 'loading', entries: [] });
    void fetch(`/api/backlinks?docName=${encodeURIComponent(docName)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error('Unable to load backlinks');
        setBacklinksState({
          status: 'ready',
          entries: BacklinksSuccessSchema.parse(payload).backlinks,
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setBacklinksState({
            status: 'error',
            entries: [],
            message: cause instanceof Error ? cause.message : 'Unable to load backlinks',
          });
        }
      });
    return () => controller.abort();
  }, [docName]);

  const createProperty = async (input: {
    name: string;
    type: DatabasePropertyType;
  }): Promise<void> => {
    const principalId = 'user:local';
    if (
      databaseUiMutationReviewMode({
        operation: 'property-create',
        actor: 'human',
        principalId,
      }) !== 'automatic'
    ) {
      throw new Error('This account cannot add a property without review');
    }
    const property = createDatabasePropertyDefinitionForAdd({
      name: input.name,
      type: input.type,
      existingKeys: activeSource.properties.map((candidate) => candidate.key),
    });
    const desiredState = createDatabaseAddPropertyDesiredState({
      database: activeDatabase,
      source: activeSource,
      property,
    });
    const outcome = await executeDatabaseMutation({
      desiredState,
      actor: { principalId },
      idempotencyKey: `ui-side-peek-add-property-${crypto.randomUUID()}`,
      target: { databaseId: activeDatabase.id, sourceId: activeSource.id },
      operationId: 'side-peek-add-property',
      review: () => true,
    });
    if (outcome.status === 'blocked') {
      throw new Error(
        outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
          'The property could not be added to the current database state',
      );
    }
    if (outcome.status === 'review_declined') {
      throw new Error('The property change was not approved');
    }
    const description = await describeDatabase({
      databaseId: activeDatabase.id,
      sourceId: activeSource.id,
    });
    if (!description.source) throw new Error('The updated database source is unavailable');
    setDescriptionOverride({
      databaseId: activeDatabase.id,
      sourceId: activeSource.id,
      database: description.database,
      source: description.source,
    });
  };
  const body = (
    <DatabaseRecordPageSurface
      mode={mode}
      databaseId={activeDatabase.id}
      sourceId={activeSource.id}
      recordId={record.id}
    >
      <PeekBody
        database={activeDatabase}
        source={activeSource}
        record={record}
        state={state}
        onOpenFull={onOpenFull}
        onFocusComments={() => setCommentsFocusRequest((current) => current + 1)}
        commentsFocusRequest={commentsFocusRequest}
        onCreateProperty={createProperty}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenRelations={() => setRelationsOpen(true)}
        onNavigateRecord={onNavigateRecord}
        onClose={() => onClose('explicit')}
        recordNavigation={recordNavigation}
        backlinksState={backlinksState}
        notionSurface={notionSurface}
        docName={docName}
        collabUrl={documentContext?.collabUrl ?? null}
        principalId={documentContext?.principal?.id ?? null}
        principalName={documentContext?.principal?.display_name ?? null}
      />
    </DatabaseRecordPageSurface>
  );
  const contextDialogs = (
    <>
      {historyOpen ? (
        <DatabaseRecordHistoryDialog
          open
          onOpenChange={setHistoryOpen}
          docName={docName}
          source={activeSource}
        />
      ) : null}
      {relationsOpen ? (
        <DatabaseRelationsDialog
          open
          onOpenChange={setRelationsOpen}
          database={activeDatabase}
          source={activeSource}
          record={record}
        />
      ) : null}
    </>
  );
  if (mode === 'side_peek') {
    return (
      <>
        <Sheet open onOpenChange={(open) => !open && closeFromPrimitive()}>
          <SheetContent
            side="right"
            sizeMode="unconstrained"
            showCloseButton={false}
            className="max-w-none gap-0 border-l border-border/70 bg-background p-0 shadow-[-16px_0_40px_rgb(0_0_0/0.16)] sm:max-w-none"
            style={{ width: `${sidePeekWidth}px` }}
            data-database-side-peek
            onKeyDownCapture={(event) => {
              if (event.key === 'Escape') dismissReasonRef.current = 'escape';
            }}
            onEscapeKeyDown={() => {
              dismissReasonRef.current = 'escape';
            }}
            onInteractOutside={(event) => {
              if (resizeCleanupRef.current) {
                event.preventDefault();
                return;
              }
              dismissReasonRef.current = 'outside';
            }}
          >
            {/* biome-ignore lint/a11y/useSemanticElements: an adjustable separator needs pointer/keyboard interaction and a child grip; <hr> cannot host that control. */}
            <div
              role="separator"
              aria-label="Resize page preview"
              aria-orientation="vertical"
              aria-valuemin={Math.round(sidePeekWidthBounds(window.innerWidth).min)}
              aria-valuemax={Math.round(sidePeekWidthBounds(window.innerWidth).max)}
              aria-valuenow={Math.round(sidePeekWidth)}
              tabIndex={0}
              className="absolute inset-y-0 left-0 z-30 w-2 cursor-col-resize touch-none outline-none"
              data-database-peek-resize-boundary
              onPointerDown={startSidePeekResize}
              onKeyDown={resizeSidePeekWithKeyboard}
            />
            <SheetHeader className="sr-only">
              <SheetTitle>{notionSurface ? 'Database page' : 'Database record'}</SheetTitle>
              <SheetDescription>
                {notionSurface
                  ? 'Preview the database page beside its view.'
                  : 'Preview the canonical database record beside its view.'}
              </SheetDescription>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
        {contextDialogs}
      </>
    );
  }
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && closeFromPrimitive()}>
        <DialogContent
          className="h-[min(48rem,calc(100dvh-2rem))] sm:max-w-3xl"
          onKeyDownCapture={(event) => {
            if (event.key === 'Escape') dismissReasonRef.current = 'escape';
          }}
          onEscapeKeyDown={() => {
            dismissReasonRef.current = 'escape';
          }}
          onInteractOutside={() => {
            dismissReasonRef.current = 'outside';
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{notionSurface ? 'Database page' : 'Database record'}</DialogTitle>
            <DialogDescription>
              {notionSurface
                ? 'Preview the database page in a focused dialog.'
                : 'Preview the canonical database record in a focused dialog.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            {body}
          </DialogBody>
        </DialogContent>
      </Dialog>
      {contextDialogs}
    </>
  );
}
