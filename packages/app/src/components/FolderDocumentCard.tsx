import { Trans, useLingui } from '@lingui/react/macro';
import { DocumentReadSuccessSchema } from '@nedian0brien/synapsenote-core';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markFolderDocumentViewed } from '@/components/folder-document-last-viewed';
import {
  FOLDER_DOCUMENT_BODY_VERTICAL_PADDING,
  FOLDER_DOCUMENT_CARD_MAX_HEIGHT,
  folderDocumentEstimatedCardHeight,
  folderDocumentMeasuredCardHeight,
  folderDocumentPreviewMarkdown,
} from '@/components/folder-document-preview';
import { useFolderItemContextMenu } from '@/components/folder-item-context-menu';
import type { FolderOverviewEntry } from '@/components/folder-overview-data';
import { Skeleton } from '@/components/ui/skeleton';
import { hashFromDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

type FileEntry = Extract<FolderOverviewEntry, { kind: 'file' }>;
export type FolderDocumentPreviewState =
  | { status: 'waiting' | 'loading' }
  | { status: 'ready'; markdown: string }
  | { status: 'error' };

const previewCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 240;

function rememberPreview(key: string, markdown: string) {
  previewCache.set(key, markdown);
  if (previewCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = previewCache.keys().next().value;
  if (typeof oldest === 'string') previewCache.delete(oldest);
}

export function useFolderDocumentPreview(
  entry: FileEntry,
  targetRef: RefObject<Element | null>,
): FolderDocumentPreviewState {
  const cacheKey = `${entry.path}\u0000${entry.modified}`;
  const [shouldLoad, setShouldLoad] = useState(false);
  const [preview, setPreview] = useState<FolderDocumentPreviewState>(() => {
    const cached = previewCache.get(cacheKey);
    return cached ? { status: 'ready', markdown: cached } : { status: 'waiting' };
  });

  useEffect(() => {
    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPreview({ status: 'ready', markdown: cached });
      setShouldLoad(false);
      return;
    }
    setPreview({ status: 'waiting' });
    const node = targetRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((candidate) => candidate.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cacheKey, targetRef]);

  useEffect(() => {
    if (!shouldLoad || previewCache.has(cacheKey)) return;
    const controller = new AbortController();
    setPreview({ status: 'loading' });
    void fetch(`/api/document?docName=${encodeURIComponent(entry.path)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const document = DocumentReadSuccessSchema.parse(payload);
        rememberPreview(cacheKey, document.content);
        setPreview({ status: 'ready', markdown: document.content });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ status: 'error' });
      });
    return () => controller.abort();
  }, [cacheKey, entry.path, shouldLoad]);

  return preview;
}

export function FolderMarkdownPreview({
  contentRef,
  markdown,
  title,
}: {
  contentRef?: RefObject<HTMLDivElement | null>;
  markdown: string;
  title: string;
}) {
  const body = folderDocumentPreviewMarkdown(markdown, title);

  if (!body) {
    return (
      <div ref={contentRef} aria-hidden="true">
        <p className="pt-0.5 text-[7px] leading-[1.45] text-muted-foreground/55 italic">
          <Trans>Empty note</Trans>
        </p>
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      aria-hidden="true"
      className="pointer-events-none text-[7px] leading-[1.45] text-foreground/72 [overflow-wrap:anywhere] [&_a]:font-medium [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_blockquote]:my-1.5 [&_blockquote]:border-border [&_blockquote]:border-l [&_blockquote]:pl-2 [&_code]:rounded-sm [&_code]:bg-foreground/8 [&_code]:px-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-[9px] [&_h1]:leading-[1.3] [&_h1]:font-semibold [&_h2]:mt-1.5 [&_h2]:mb-1 [&_h2]:text-[8px] [&_h2]:leading-[1.32] [&_h2]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_h3]:text-[7.5px] [&_h3]:leading-[1.35] [&_h3]:font-semibold [&_h4]:mt-1 [&_h4]:mb-0.5 [&_h4]:font-semibold [&_hr]:my-2 [&_hr]:border-border/80 [&_img]:my-1.5 [&_img]:max-h-20 [&_img]:max-w-full [&_img]:rounded-sm [&_img]:object-contain [&_li]:my-0.5 [&_li>p]:my-0 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-3.5 [&_p]:my-1 [&_pre]:my-1.5 [&_pre]:overflow-hidden [&_pre]:rounded-sm [&_pre]:bg-foreground/6 [&_pre]:p-1.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:whitespace-pre-wrap [&_strong]:font-semibold [&_table]:my-1.5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border/70 [&_td]:px-1 [&_td]:py-0.5 [&_th]:border [&_th]:border-border/70 [&_th]:bg-foreground/5 [&_th]:px-1 [&_th]:py-0.5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-3.5 [&>:first-child]:mt-0 [&>:last-child]:mb-0"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, title: linkTitle }) => (
            <span title={linkTitle ?? undefined}>{children}</span>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

export function FolderDocumentCard({
  entry,
  height,
  mode,
  onHeightChange,
}: {
  entry: FileEntry;
  height?: number;
  mode: 'preview' | 'grid';
  onHeightChange?: (path: string, height: number) => void;
}) {
  const { t } = useLingui();
  const cardRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isClipped, setIsClipped] = useState(false);
  const preview = useFolderDocumentPreview(entry, cardRef);
  const { onContextMenu, menu } = useFolderItemContextMenu(
    { kind: 'file', docName: entry.path },
    entry.title,
  );

  useLayoutEffect(() => {
    if (mode !== 'preview' || preview.status !== 'ready') return;
    function measureRenderedPage() {
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const bodyHeight = contentRef.current?.scrollHeight ?? 0;
      const naturalHeight = headerHeight + FOLDER_DOCUMENT_BODY_VERTICAL_PADDING + bodyHeight;
      const nextHeight = folderDocumentMeasuredCardHeight(headerHeight, bodyHeight);
      setIsClipped(naturalHeight > FOLDER_DOCUMENT_CARD_MAX_HEIGHT);
      onHeightChange?.(entry.path, nextHeight);
    }

    measureRenderedPage();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureRenderedPage);
    if (headerRef.current) observer.observe(headerRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [entry.path, mode, onHeightChange, preview.status]);

  const cardHeight =
    mode === 'preview' ? (height ?? folderDocumentEstimatedCardHeight(entry.size)) : 192;

  return (
    <article
      ref={cardRef}
      onContextMenu={onContextMenu}
      className={cn(
        'group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-[13px] border border-black/7 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.045)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-black/12 hover:shadow-[0_3px_10px_rgba(15,23,42,0.09),0_16px_30px_rgba(15,23,42,0.07)] focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30 dark:border-white/9 dark:hover:border-white/16',
        mode === 'grid' && 'mb-0',
      )}
      style={{ height: cardHeight }}
      data-folder-document-card={entry.path}
      data-preview-state={preview.status}
      data-preview-clipped={isClipped ? 'true' : 'false'}
    >
      <a
        href={hashFromDocName(entry.path)}
        onClick={() => markFolderDocumentViewed(entry.path)}
        className="flex h-full flex-col focus-visible:outline-none"
        aria-label={t`Open ${entry.title}`}
      >
        <div ref={headerRef} className="px-3.5 pt-3">
          <h2 className="line-clamp-4 border-border/65 border-b pb-3 text-[13px] leading-[1.18] font-semibold tracking-[-0.015em] text-foreground/92">
            {entry.title}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-3.5 py-2.5">
          {preview.status === 'ready' ? (
            <FolderMarkdownPreview
              contentRef={contentRef}
              markdown={preview.markdown}
              title={entry.title}
            />
          ) : preview.status === 'error' ? (
            <div className="space-y-2 pt-1" aria-hidden="true">
              <div className="h-px w-full bg-border/70" />
              <div className="h-px w-4/5 bg-border/55" />
              <div className="h-px w-2/3 bg-border/40" />
            </div>
          ) : (
            <div className="space-y-1.5" role="status" aria-label={t`Loading preview`}>
              <Skeleton className="h-1.5 w-full rounded-sm" />
              <Skeleton className="h-1.5 w-5/6 rounded-sm" />
              <Skeleton className="h-1.5 w-11/12 rounded-sm" />
              <Skeleton className="h-1.5 w-3/5 rounded-sm" />
            </div>
          )}
        </div>
        {preview.status === 'ready' && isClipped ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent via-card/90 to-card"
          />
        ) : null}
      </a>
      {menu}
    </article>
  );
}
