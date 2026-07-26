import { Trans, useLingui } from '@lingui/react/macro';
import {
  Check,
  ChevronDown,
  Highlighter,
  LocateFixed,
  Pencil,
  Plus,
  Quote,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  consumePendingMemoComposerRequest,
  memoQuoteFromSelection,
  subscribeToMemoComposerRequests,
} from '@/components/memo-composer-events';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Panel, PanelBody, PanelCount, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  consumePendingMemoReveal,
  requestMemoNavigation,
  subscribeMemoReveal,
} from '@/editor/memo-navigation';
import {
  type NativeDocumentHighlight,
  readNativeDocumentHighlights,
  requestNativeHighlightMutation,
  subscribeNativeDocumentHighlights,
} from '@/editor/native-document-highlights';
import { lightRenderMarkdownPreview } from '@/editor/selection-context';
import { useSelectionContext } from '@/hooks/use-selection-context';
import {
  type DocumentMemoEntry,
  type DocumentMemoQuote,
  type DocumentMemoState,
  isDocumentHighlight,
  readDocumentMemoState,
  subscribeDocumentMemoState,
  writeDocumentMemoState,
} from '@/lib/document-memo-store';
import { cn } from '@/lib/utils';

const MEMO_QUOTE_COLLAPSE_CHARS = 320;
const MEMO_QUOTE_COLLAPSE_LINES = 6;

function createMemoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `memo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMemoDate(timestamp: number): string {
  if (timestamp <= 0) return '';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function quotePreview(quote: DocumentMemoQuote): string {
  return lightRenderMarkdownPreview(quote.markdown) || quote.markdown.trim();
}

function memoQuoteNeedsCollapse(quote: DocumentMemoQuote, preview: string): boolean {
  return (
    preview.length > MEMO_QUOTE_COLLAPSE_CHARS ||
    quote.markdown.split(/\r?\n/).length > MEMO_QUOTE_COLLAPSE_LINES
  );
}

interface MemoQuoteCardProps {
  highlight?: boolean;
  quote: DocumentMemoQuote;
  onRemove?: () => void;
  variant: 'composer' | 'saved';
}

function MemoQuoteCard({ highlight = false, quote, onRemove, variant }: MemoQuoteCardProps) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const preview = quotePreview(quote);
  const collapsible = memoQuoteNeedsCollapse(quote, preview);

  return (
    <aside
      aria-label={t`Original text`}
      data-memo-original-text={variant}
      className={cn(
        'border-l-2 pl-3',
        highlight ? 'border-amber-400/70' : 'border-primary/40',
        variant === 'composer' ? 'mt-3' : 'mb-3',
      )}
    >
      <header className="flex min-h-7 items-center gap-1.5">
        <Quote
          className={cn('size-3.5 shrink-0', highlight ? 'text-amber-600' : 'text-primary')}
          aria-hidden="true"
        />
        <p className="shrink-0 text-2xs font-semibold uppercase tracking-[0.1em] text-foreground/80">
          <Trans>Original text</Trans>
        </p>
        <p className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
          {quote.sourceLineStart === undefined ? (
            <Trans>Selected passage</Trans>
          ) : quote.sourceLineStart === quote.sourceLineEnd ? (
            <Trans>Line {quote.sourceLineStart}</Trans>
          ) : (
            <Trans>
              Lines {quote.sourceLineStart}–{quote.sourceLineEnd}
            </Trans>
          )}
        </p>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onRemove}
            aria-label={t`Remove attached selection`}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </header>

      <div className="pt-1">
        <p
          data-memo-original-text-content="true"
          className={cn(
            'whitespace-pre-wrap break-words text-xs leading-5 text-foreground/75',
            collapsible && !expanded && 'line-clamp-4',
            collapsible && expanded && 'max-h-64 overflow-y-auto subtle-scrollbar',
          )}
        >
          {preview}
        </p>
        {collapsible ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1.5 h-6 gap-1 px-0 text-2xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-expanded={expanded}
            aria-label={expanded ? t`Collapse original text` : t`Expand original text`}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? <Trans>Collapse</Trans> : <Trans>Expand</Trans>}
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

interface MemoPanelProps {
  docName: string;
  isSourceMode: boolean;
}

export function MemoPanel({ docName, isSourceMode }: MemoPanelProps) {
  const { t } = useLingui();
  const selection = useSelectionContext(docName, isSourceMode ? 'source' : 'wysiwyg');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const memoListRef = useRef<HTMLUListElement>(null);
  const [memoState, setMemoState] = useState<DocumentMemoState>(() =>
    readDocumentMemoState(docName),
  );
  const [nativeHighlights, setNativeHighlights] = useState<readonly NativeDocumentHighlight[]>(() =>
    readNativeDocumentHighlights(docName),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(next: DocumentMemoState) {
    setMemoState(next);
    setSaveFailed(!writeDocumentMemoState(docName, next));
  }

  const openComposerWithSelection = useEffectEvent(
    (request: ReturnType<typeof consumePendingMemoComposerRequest>) => {
      if (request === null || request.docName !== docName) return;
      persist({ ...memoState, draftQuote: request.quote });
      const focusComposer = () => composerRef.current?.focus();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusComposer);
      else queueMicrotask(focusComposer);
    },
  );

  useEffect(() => {
    const pending = consumePendingMemoComposerRequest(docName);
    if (pending !== null) openComposerWithSelection(pending);
    return subscribeToMemoComposerRequests((request) => {
      if (request.docName !== docName) return;
      consumePendingMemoComposerRequest(docName);
      openComposerWithSelection(request);
    });
  }, [docName]);

  useEffect(() => subscribeDocumentMemoState(docName, setMemoState), [docName]);
  useEffect(() => {
    setNativeHighlights(readNativeDocumentHighlights(docName));
    return subscribeNativeDocumentHighlights(docName, setNativeHighlights);
  }, [docName]);

  const nativeHighlightIds = new Set(nativeHighlights.map((entry) => entry.id));
  const highlightMemoIds = new Map<string, string>();
  const annotations: DocumentMemoEntry[] = [
    ...nativeHighlights.map((entry) => {
      const anchor = entry.quote.anchor;
      const attachedMemo = memoState.items.find((memo) => {
        const memoAnchor = memo.quote?.anchor;
        return (
          memo.target === 'highlight' &&
          anchor !== undefined &&
          memoAnchor !== undefined &&
          anchor.exact === memoAnchor.exact &&
          anchor.prefix === memoAnchor.prefix &&
          anchor.suffix === memoAnchor.suffix
        );
      });
      if (attachedMemo) highlightMemoIds.set(entry.id, attachedMemo.id);
      return {
        id: entry.id,
        body: attachedMemo?.body ?? '',
        quote: entry.quote,
        createdAt: attachedMemo?.createdAt ?? 0,
        updatedAt: attachedMemo?.updatedAt ?? 0,
      };
    }),
    ...memoState.items.filter(
      (entry) => !isDocumentHighlight(entry) && entry.target !== 'highlight',
    ),
  ];

  const revealAnnotation = useEffectEvent((memoId: string) => {
    setRevealedId(memoId);
    const reveal = () => {
      const card = Array.from(
        memoListRef.current?.querySelectorAll<HTMLElement>('[data-memo-card-id]') ?? [],
      ).find((element) => element.dataset.memoCardId === memoId);
      card?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else queueMicrotask(reveal);
    if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => setRevealedId(null), 1_600);
  });

  useEffect(() => {
    const pending = consumePendingMemoReveal(docName);
    if (pending) revealAnnotation(pending.memoId);
    const unsubscribe = subscribeMemoReveal((request) => {
      if (request.docName !== docName) return;
      consumePendingMemoReveal(docName);
      revealAnnotation(request.memoId);
    });
    return () => {
      unsubscribe();
      if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
    };
  }, [docName]);

  function attachSelection() {
    if (!selection) return;
    persist({
      ...memoState,
      draftQuote: memoQuoteFromSelection(selection),
    });
  }

  function addMemo() {
    const body = memoState.draft.trim();
    if (body === '') return;
    const now = Date.now();
    const entry: DocumentMemoEntry = {
      id: createMemoId(),
      body,
      quote: memoState.draftQuote,
      createdAt: now,
      updatedAt: now,
    };
    persist({
      draft: '',
      draftQuote: null,
      items: [entry, ...memoState.items],
    });
  }

  function addHighlight() {
    const anchor = memoState.draftQuote?.anchor;
    if (!anchor || anchor.surface !== 'wysiwyg') return;
    requestNativeHighlightMutation({ docName, action: 'add', anchor });
    persist({ ...memoState, draftQuote: null });
  }

  function startEditing(entry: DocumentMemoEntry) {
    setEditingId(entry.id);
    setEditBody(entry.body);
  }

  function saveEdit() {
    const body = editBody.trim();
    if (!editingId || body === '') return;
    const nativeHighlight = nativeHighlights.find((entry) => entry.id === editingId);
    if (nativeHighlight) {
      const attachedMemoId = highlightMemoIds.get(editingId);
      const now = Date.now();
      const items = attachedMemoId
        ? memoState.items.map((entry) =>
            entry.id === attachedMemoId ? { ...entry, body, updatedAt: now } : entry,
          )
        : [
            {
              id: createMemoId(),
              body,
              quote: nativeHighlight.quote,
              target: 'highlight' as const,
              createdAt: now,
              updatedAt: now,
            },
            ...memoState.items,
          ];
      persist({ ...memoState, items });
      setEditingId(null);
      setEditBody('');
      return;
    }
    persist({
      ...memoState,
      items: memoState.items.map((entry) =>
        entry.id === editingId ? { ...entry, body, updatedAt: Date.now() } : entry,
      ),
    });
    setEditingId(null);
    setEditBody('');
  }

  function deleteMemo() {
    if (!deleteId) return;
    const nativeHighlight = nativeHighlights.find((entry) => entry.id === deleteId);
    if (nativeHighlight?.quote.anchor) {
      requestNativeHighlightMutation({
        docName,
        action: 'remove',
        anchor: nativeHighlight.quote.anchor,
      });
      const attachedMemoId = highlightMemoIds.get(deleteId);
      if (attachedMemoId) {
        persist({
          ...memoState,
          items: memoState.items.filter((entry) => entry.id !== attachedMemoId),
        });
      }
      setDeleteId(null);
      return;
    }
    persist({
      ...memoState,
      items: memoState.items.filter((entry) => entry.id !== deleteId),
    });
    if (editingId === deleteId) {
      setEditingId(null);
      setEditBody('');
    }
    setDeleteId(null);
  }

  const deleteEntry = annotations.find((entry) => entry.id === deleteId) ?? null;

  return (
    <Panel aria-label={t`Document annotations`}>
      <PanelHeader className="border-b border-border/70 py-2.5">
        <PanelTitle>
          <Trans>Annotations</Trans>
        </PanelTitle>
        <PanelCount>{annotations.length}</PanelCount>
      </PanelHeader>

      <PanelBody className="px-3 py-3">
        <section
          aria-label={t`New annotation`}
          className="group/composer rounded-2xl border border-border/80 bg-card p-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
        >
          <header className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
              <StickyNote className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-5 text-foreground">
                <Trans>New annotation</Trans>
              </h3>
              <p className="text-2xs leading-4 text-muted-foreground">
                <Trans>Private to this device</Trans>
              </p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-2xs',
                saveFailed
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-border/70 bg-muted/35 text-muted-foreground',
              )}
              role={saveFailed ? 'alert' : 'status'}
              title={saveFailed ? t`Not saved` : t`Saved on this device`}
            >
              {!saveFailed ? <Check className="size-3" aria-hidden="true" /> : null}
              {saveFailed ? <Trans>Not saved</Trans> : <Trans>Saved</Trans>}
            </span>
          </header>

          {memoState.draftQuote ? (
            <MemoQuoteCard
              key={memoState.draftQuote.markdown}
              quote={memoState.draftQuote}
              variant="composer"
              onRemove={() => persist({ ...memoState, draftQuote: null })}
            />
          ) : null}

          <Textarea
            ref={composerRef}
            value={memoState.draft}
            onChange={(event) => persist({ ...memoState, draft: event.currentTarget.value })}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                addMemo();
              }
            }}
            aria-label={t`New memo`}
            placeholder={t`Write a note, question, or takeaway`}
            className="mt-3 min-h-28 max-h-56 resize-y field-sizing-fixed rounded-none border-0 bg-transparent px-1 py-0 text-sm leading-6 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />

          <footer className="mt-3 flex min-h-9 items-center gap-1.5 border-t border-border/60 pt-2.5">
            {selection && memoState.draftQuote === null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={attachSelection}
              >
                <Quote className="size-3.5" />
                <Trans>Attach selection</Trans>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="ml-auto h-8 px-3 shadow-xs"
              disabled={memoState.draft.trim() === ''}
              onClick={addMemo}
            >
              <Plus className="size-3.5" />
              <Trans>Add memo</Trans>
            </Button>
            {memoState.draftQuote ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3"
                onClick={addHighlight}
              >
                <Highlighter className="size-3.5" />
                <Trans>Add highlight</Trans>
              </Button>
            ) : null}
          </footer>
        </section>

        {annotations.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
            <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <StickyNote className="size-4.5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">
              <Trans>No annotations yet</Trans>
            </p>
            <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
              <Trans>Highlight a passage or keep a private reading note.</Trans>
            </p>
          </div>
        ) : (
          <ul
            ref={memoListRef}
            className="mt-3 flex list-none flex-col gap-2"
            aria-label={t`Saved annotations`}
          >
            {annotations.map((entry) => {
              const editing = editingId === entry.id;
              const highlight = nativeHighlightIds.has(entry.id);
              const navigable =
                !isSourceMode &&
                entry.quote !== null &&
                (entry.quote.anchor?.surface !== 'source' ||
                  entry.quote.sourceLineStart === undefined);
              const date = formatMemoDate(entry.updatedAt);
              return (
                <li
                  key={entry.id}
                  data-memo-card-id={entry.id}
                  onClick={(event) => {
                    if (!navigable || editing) return;
                    const target = event.target;
                    if (
                      target instanceof Element &&
                      target.closest('button, a, input, textarea, select, [contenteditable="true"]')
                    ) {
                      return;
                    }
                    requestMemoNavigation({ docName, memoId: entry.id });
                  }}
                  // Keyboard users have the explicit locate button in the
                  // footer. This parity handler also covers a host that makes
                  // the card itself focusable through platform navigation.
                  onKeyDown={(event) => {
                    if (!navigable || editing || event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    requestMemoNavigation({ docName, memoId: entry.id });
                  }}
                  className={cn(
                    'group rounded-2xl border border-border/80 bg-card p-3 shadow-xs transition-[border-color,box-shadow] hover:border-border hover:shadow-sm',
                    navigable && !editing && 'cursor-pointer',
                    highlight && 'border-amber-300/80 hover:border-amber-400 dark:border-amber-700',
                    revealedId === entry.id &&
                      (highlight
                        ? 'border-amber-500 ring-2 ring-amber-400/25'
                        : 'border-primary ring-2 ring-primary/25'),
                  )}
                >
                  {entry.quote ? (
                    <MemoQuoteCard highlight={highlight} quote={entry.quote} variant="saved" />
                  ) : null}

                  {editing ? (
                    <div>
                      <Textarea
                        value={editBody}
                        onChange={(event) => setEditBody(event.currentTarget.value)}
                        aria-label={t`Edit memo`}
                        className="min-h-20 resize-y field-sizing-fixed"
                      />
                      <div className="mt-2 flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(null);
                            setEditBody('');
                          }}
                        >
                          <Trans>Cancel</Trans>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={editBody.trim() === ''}
                          onClick={saveEdit}
                        >
                          <Trans>Save</Trans>
                        </Button>
                      </div>
                    </div>
                  ) : highlight ? (
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <Highlighter className="size-3.5" aria-hidden="true" />
                        <Trans>Highlight</Trans>
                      </p>
                      {entry.body ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                          {entry.body}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                      {entry.body}
                    </p>
                  )}

                  {!editing ? (
                    <footer className="mt-2 flex h-6 items-center">
                      {!highlight ? (
                        <time
                          dateTime={
                            entry.updatedAt > 0
                              ? new Date(entry.updatedAt).toISOString()
                              : undefined
                          }
                          className="text-2xs text-muted-foreground"
                          title={date}
                        >
                          {date || t`Earlier annotation`}
                        </time>
                      ) : null}
                      <div className="ml-auto flex opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {navigable ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() =>
                                  requestMemoNavigation({
                                    docName,
                                    memoId: entry.id,
                                  })
                                }
                                aria-label={t`Go to annotation in document`}
                              >
                                <LocateFixed className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <Trans>Go to annotation in document</Trans>
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              onClick={() => startEditing(entry)}
                              aria-label={
                                highlight && !entry.body ? t`Add memo to highlight` : t`Edit memo`
                              }
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {highlight && !entry.body ? (
                              <Trans>Add memo</Trans>
                            ) : (
                              <Trans>Edit memo</Trans>
                            )}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteId(entry.id)}
                              aria-label={t`Delete annotation`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <Trans>Delete annotation</Trans>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </footer>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>

      <Dialog open={deleteEntry !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Delete this annotation?</Trans>
            </DialogTitle>
            <DialogDescription>
              {deleteId && nativeHighlightIds.has(deleteId) ? (
                <Trans>This removes the highlight from the document and cannot be undone.</Trans>
              ) : (
                <Trans>This removes the annotation from this device and cannot be undone.</Trans>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="button" variant="destructive" onClick={deleteMemo}>
              <Trans>Delete annotation</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
