import { Trans } from '@lingui/react/macro';
import {
  type BacklinkEntry,
  BacklinksSuccessSchema,
  type DatabaseDefinition,
  type DatabaseSource,
  DocumentReadSuccessSchema,
  type ProjectedDatabaseRecord,
  readFmRegionWithError,
  stripFrontmatter,
} from '@nedian0brien/synapsenote-core';
import { ExternalLink, GitBranch, History, Link2, Loader2, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DatabaseCommentsDialog } from '@/components/DatabaseCommentsDialog';
import { DatabaseRecordHistoryDialog } from '@/components/DatabaseRecordHistoryDialog';
import { DatabaseRelationsDialog } from '@/components/DatabaseRelationsDialog';
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
import { databaseRecordPathToHash } from '@/lib/database-navigation';
import { filePathToDocName } from '@/lib/doc-hash';

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
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.map(valueText).join(', ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function PeekBody({
  source,
  record,
  state,
  onOpenFull,
  onOpenComments,
  onOpenHistory,
  onOpenRelations,
  backlinksState,
}: {
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  state: PeekState;
  onOpenFull: () => void;
  onOpenComments: () => void;
  onOpenHistory: () => void;
  onOpenRelations: () => void;
  backlinksState: BacklinksState;
}) {
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const properties = source.properties.filter(
    (property) => property.type !== 'title' && property.id in record.values,
  );
  return (
    <>
      {state.status === 'ready' && state.cover.kind !== 'unsupported' ? (
        <img
          src={state.cover.value}
          alt=""
          className="h-32 w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4 pr-12">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate font-heading font-semibold text-xl">
            {state.status === 'ready' && state.icon.kind === 'emoji' ? (
              <span aria-hidden>{state.icon.value}</span>
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
          <p className="truncate text-muted-foreground text-xs">
            {source.name} · {record.path}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onOpenComments}>
            <MessageSquare /> <Trans>Comments</Trans>
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onOpenHistory}>
            <History /> <Trans>History</Trans>
          </Button>
          {source.properties.some((property) => property.type === 'relation') ? (
            <Button type="button" size="sm" variant="ghost" onClick={onOpenRelations}>
              <Link2 /> <Trans>Relations</Trans>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onOpenFull}>
            <ExternalLink /> <Trans>Open full page</Trans>
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-database-record-peek>
        {properties.length > 0 ? (
          <dl className="mb-5 grid gap-2 sm:grid-cols-2">
            {properties.map((property) => (
              <div key={property.id} className="rounded border bg-muted/30 px-3 py-2">
                <dt className="text-muted-foreground text-xs">{property.name}</dt>
                <dd className="mt-0.5 break-words text-sm">
                  {valueText(record.values[property.id])}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <section className="mb-5 rounded border p-3" aria-label="Backlinks">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <GitBranch className="size-4" /> <Trans>Backlinks</Trans>{' '}
            <span className="text-muted-foreground">{backlinksState.entries.length}</span>
          </h3>
          {backlinksState.status === 'loading' ? (
            <p className="flex items-center text-xs text-muted-foreground" role="status">
              <Loader2 className="mr-1 size-3 animate-spin" /> <Trans>Loading backlinks</Trans>
            </p>
          ) : backlinksState.status === 'error' ? (
            <p className="text-destructive text-xs" role="alert">
              {backlinksState.message}
            </p>
          ) : backlinksState.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              <Trans>No backlinks.</Trans>
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
        {state.status === 'loading' ? (
          <div
            className="flex min-h-40 items-center justify-center text-muted-foreground text-sm"
            role="status"
          >
            <Loader2 className="mr-2 size-4 animate-spin" /> <Trans>Loading record body</Trans>
          </div>
        ) : state.status === 'error' ? (
          <p
            className="rounded border border-destructive/30 p-3 text-destructive text-sm"
            role="alert"
          >
            {state.message}
          </p>
        ) : (
          <pre
            className="whitespace-pre-wrap break-words font-sans text-sm leading-7"
            data-record-body
          >
            {state.body || 'No body content'}
          </pre>
        )}
      </div>
    </>
  );
}

export function DatabaseRecordPeek({
  mode,
  database,
  source,
  record,
  onClose,
  onOpenFull,
}: {
  mode: 'side_peek' | 'center_peek';
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const [state, setState] = useState<PeekState>({ status: 'loading' });
  const [backlinksState, setBacklinksState] = useState<BacklinksState>({
    status: 'loading',
    entries: [],
  });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const docName = filePathToDocName(record.path);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void fetch(`/api/document?docName=${encodeURIComponent(docName)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error('Unable to load the canonical record document');
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
            message: cause instanceof Error ? cause.message : 'Unable to load record body',
          });
      });
    return () => controller.abort();
  }, [docName]);
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
  const body = (
    <PeekBody
      source={source}
      record={record}
      state={state}
      onOpenFull={onOpenFull}
      onOpenComments={() => setCommentsOpen(true)}
      onOpenHistory={() => setHistoryOpen(true)}
      onOpenRelations={() => setRelationsOpen(true)}
      backlinksState={backlinksState}
    />
  );
  const contextDialogs = (
    <>
      {commentsOpen ? (
        <DatabaseCommentsDialog
          open
          onOpenChange={setCommentsOpen}
          database={database}
          source={source}
          record={record}
        />
      ) : null}
      {historyOpen ? (
        <DatabaseRecordHistoryDialog
          open
          onOpenChange={setHistoryOpen}
          docName={docName}
          source={source}
        />
      ) : null}
      {relationsOpen ? (
        <DatabaseRelationsDialog
          open
          onOpenChange={setRelationsOpen}
          database={database}
          source={source}
          record={record}
        />
      ) : null}
    </>
  );
  if (mode === 'side_peek') {
    return (
      <>
        <Sheet open onOpenChange={(open) => !open && onClose()}>
          <SheetContent
            side="right"
            className="w-[min(48rem,92vw)] sm:max-w-3xl"
            aria-describedby="database-side-peek-description"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Database record</SheetTitle>
              <SheetDescription id="database-side-peek-description">
                Preview the canonical database record beside its view.
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
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="h-[min(48rem,calc(100dvh-2rem))] sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Database record</DialogTitle>
            <DialogDescription>
              Preview the canonical database record in a focused dialog.
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
