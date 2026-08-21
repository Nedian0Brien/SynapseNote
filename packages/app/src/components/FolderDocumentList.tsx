import { Trans, useLingui } from '@lingui/react/macro';
import { useRef } from 'react';
import {
  type FolderDocumentPreviewState,
  FolderMarkdownPreview,
  useFolderDocumentPreview,
} from '@/components/FolderDocumentCard';
import {
  markFolderDocumentViewed,
  readFolderDocumentLastViewed,
} from '@/components/folder-document-last-viewed';
import { folderDocumentPreviewText } from '@/components/folder-document-preview';
import { useFolderItemContextMenu } from '@/components/folder-item-context-menu';
import type { FolderOverviewEntry } from '@/components/folder-overview-data';
import type { FolderDateGroup } from '@/components/folder-overview-date-groups';
import { Skeleton } from '@/components/ui/skeleton';
import { hashFromDocName } from '@/lib/doc-hash';

type FileEntry = Extract<FolderOverviewEntry, { kind: 'file' }>;

function formatRelativeDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  return `${Math.floor(diffMonths / 12)}y`;
}

export function FolderDateGroupLabel({ group }: { group: FolderDateGroup }) {
  if (group.kind === 'past-7-days') return <Trans>Past 7 days</Trans>;
  if (group.kind === 'past-30-days') return <Trans>Past 30 days</Trans>;
  if (group.kind === 'undated') return <Trans>Undated</Trans>;
  return (
    <>
      {new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: group.month.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      }).format(group.month)}
    </>
  );
}

function DocumentPageThumbnail({
  entry,
  preview,
}: {
  entry: FileEntry;
  preview: FolderDocumentPreviewState;
}) {
  return (
    <div
      className="h-10 w-8 shrink-0 overflow-hidden rounded-[3px] border border-black/8 bg-card shadow-xs dark:border-white/10"
      aria-hidden="true"
    >
      <div className="w-[176px] origin-top-left scale-[0.13] p-2.5">
        <div className="mb-2 border-border/65 border-b pb-2 text-[13px] leading-[1.18] font-semibold">
          {entry.title}
        </div>
        {preview.status === 'ready' ? (
          <FolderMarkdownPreview markdown={preview.markdown} title={entry.title} />
        ) : null}
      </div>
    </div>
  );
}

function DocumentRow({ entry }: { entry: FileEntry }) {
  const { t } = useLingui();
  const rowRef = useRef<HTMLAnchorElement>(null);
  const preview = useFolderDocumentPreview(entry, rowRef);
  const { onContextMenu, menu } = useFolderItemContextMenu(
    { kind: 'file', docName: entry.path },
    entry.title,
  );
  const summary =
    preview.status === 'ready' ? folderDocumentPreviewText(preview.markdown, entry.title) : '';

  return (
    <a
      ref={rowRef}
      href={hashFromDocName(entry.path)}
      onClick={() => markFolderDocumentViewed(entry.path)}
      onContextMenu={onContextMenu}
      className="group grid min-h-16 grid-cols-[minmax(0,1fr)_6.75rem_6.75rem] items-center border-border/55 border-b px-1.5 text-[11px] transition-colors hover:bg-background/42 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem]"
      aria-label={t`Open ${entry.title}`}
      data-folder-document-list-row={entry.path}
    >
      <span className="flex min-w-0 items-center gap-3 py-2">
        <DocumentPageThumbnail entry={entry} preview={preview} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground/88">
            {entry.title}
          </span>
          {preview.status === 'ready' ? (
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/62">
              {summary || t`Empty note`}
            </span>
          ) : (
            <Skeleton className="mt-1 h-1.5 w-52 max-w-full rounded-sm" />
          )}
        </span>
      </span>
      <span className="hidden truncate text-muted-foreground/68 lg:block">
        {formatRelativeDate(readFolderDocumentLastViewed(entry.path))}
      </span>
      <span className="truncate text-muted-foreground/68">
        {formatRelativeDate(entry.modified)}
      </span>
      <span className="truncate text-muted-foreground/68">—</span>
      {menu}
    </a>
  );
}

export function FolderDocumentList({
  ariaLabel,
  groups,
}: {
  ariaLabel: string;
  groups: FolderDateGroup[];
}) {
  return (
    <section aria-label={ariaLabel} data-folder-document-list>
      <div className="grid grid-cols-[minmax(0,1fr)_6.75rem_6.75rem] border-border/55 border-b px-1.5 pb-2 text-[10px] text-muted-foreground/65 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem]">
        <span>
          <Trans>Name</Trans>
        </span>
        <span className="hidden lg:block">
          <Trans>Last viewed</Trans>
        </span>
        <span>
          <Trans>Modified</Trans> ↓
        </span>
        <span>
          <Trans>Created</Trans>
        </span>
      </div>
      <div className="space-y-4 pt-2">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.key}>
            <h2 className="px-1.5 pb-1.5 text-[11px] font-medium text-muted-foreground/70">
              <FolderDateGroupLabel group={group} />
            </h2>
            <div>
              {group.entries.map((entry) => (
                <DocumentRow key={entry.path} entry={entry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
