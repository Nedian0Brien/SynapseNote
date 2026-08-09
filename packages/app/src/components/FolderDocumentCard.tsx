import { Trans, useLingui } from '@lingui/react/macro';
import { DocumentReadSuccessSchema } from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import {
  buildFolderDocumentPreview,
  type FolderDocumentPreviewBlock,
  folderDocumentCardHeight,
} from '@/components/folder-document-preview';
import type { FolderOverviewEntry } from '@/components/folder-overview-data';
import { Skeleton } from '@/components/ui/skeleton';
import { hashFromDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

type FileEntry = Extract<FolderOverviewEntry, { kind: 'file' }>;
type PreviewState =
  | { status: 'waiting' | 'loading' }
  | { status: 'ready'; blocks: FolderDocumentPreviewBlock[] }
  | { status: 'error' };

const previewCache = new Map<string, FolderDocumentPreviewBlock[]>();
const MAX_CACHE_ENTRIES = 240;

function rememberPreview(key: string, blocks: FolderDocumentPreviewBlock[]) {
  previewCache.set(key, blocks);
  if (previewCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = previewCache.keys().next().value;
  if (typeof oldest === 'string') previewCache.delete(oldest);
}

function PreviewBlocks({ blocks }: { blocks: FolderDocumentPreviewBlock[] }) {
  if (blocks.length === 0) {
    return (
      <p className="pt-1 text-[10px] leading-4 text-muted-foreground/55 italic">
        <Trans>Empty note</Trans>
      </p>
    );
  }

  return (
    <div className="space-y-2.5" aria-hidden="true">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}-${block.text.slice(0, 16)}`;
        if (block.kind === 'heading') {
          return (
            <p
              key={key}
              className={cn(
                'font-semibold text-foreground/88',
                block.level <= 2 ? 'text-[11px] leading-[1.35]' : 'text-[10px] leading-[1.35]',
              )}
            >
              {block.text}
            </p>
          );
        }
        if (block.kind === 'list') {
          return (
            <div key={key} className="flex gap-1.5 text-[9px] leading-[1.42] text-foreground/68">
              <span className="shrink-0 text-foreground/42">
                {block.ordered ? `${index + 1}.` : '•'}
              </span>
              <span>{block.text}</span>
            </div>
          );
        }
        if (block.kind === 'code') {
          return (
            <pre
              key={key}
              className="overflow-hidden rounded-md bg-muted/55 px-2 py-1.5 font-mono text-[8px] leading-[1.45] text-foreground/58 whitespace-pre-wrap"
            >
              {block.text}
            </pre>
          );
        }
        return (
          <p key={key} className="text-[9px] leading-[1.48] text-foreground/64">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function FolderDocumentCard({
  entry,
  mode,
}: {
  entry: FileEntry;
  mode: 'preview' | 'grid';
}) {
  const { t } = useLingui();
  const cardRef = useRef<HTMLElement>(null);
  const cacheKey = `${entry.path}\u0000${entry.modified}`;
  const [shouldLoad, setShouldLoad] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(() => {
    const cached = previewCache.get(cacheKey);
    return cached ? { status: 'ready', blocks: cached } : { status: 'waiting' };
  });

  useEffect(() => {
    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPreview({ status: 'ready', blocks: cached });
      setShouldLoad(false);
      return;
    }
    setPreview({ status: 'waiting' });
    const node = cardRef.current;
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
  }, [cacheKey]);

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
        const blocks = buildFolderDocumentPreview(document.content, entry.title);
        rememberPreview(cacheKey, blocks);
        setPreview({ status: 'ready', blocks });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ status: 'error' });
      });
    return () => controller.abort();
  }, [cacheKey, entry.path, entry.title, shouldLoad]);

  const height = mode === 'preview' ? folderDocumentCardHeight(entry.size, entry.path) : 272;

  return (
    <article
      ref={cardRef}
      className={cn(
        'group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-[13px] border border-black/7 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.045)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-black/12 hover:shadow-[0_3px_10px_rgba(15,23,42,0.09),0_16px_30px_rgba(15,23,42,0.07)] focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30 dark:border-white/9 dark:hover:border-white/16',
        mode === 'grid' && 'mb-0',
      )}
      style={{ height }}
      data-folder-document-card={entry.path}
      data-preview-state={preview.status}
    >
      <a
        href={hashFromDocName(entry.path)}
        className="flex h-full flex-col focus-visible:outline-none"
        aria-label={t`Open ${entry.title}`}
      >
        <div className="border-b border-border/65 px-3 py-3">
          <h2 className="line-clamp-4 text-[13px] leading-[1.18] font-semibold tracking-[-0.015em] text-foreground/92">
            {entry.title}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
          {preview.status === 'ready' ? (
            <PreviewBlocks blocks={preview.blocks} />
          ) : preview.status === 'error' ? (
            <div className="space-y-2 pt-1" aria-hidden="true">
              <div className="h-px w-full bg-border/70" />
              <div className="h-px w-4/5 bg-border/55" />
              <div className="h-px w-2/3 bg-border/40" />
            </div>
          ) : (
            <div className="space-y-2" role="status" aria-label={t`Loading preview`}>
              <Skeleton className="h-2.5 w-full rounded-sm" />
              <Skeleton className="h-2.5 w-5/6 rounded-sm" />
              <Skeleton className="h-2.5 w-11/12 rounded-sm" />
              <Skeleton className="h-2.5 w-3/5 rounded-sm" />
            </div>
          )}
        </div>
      </a>
    </article>
  );
}
