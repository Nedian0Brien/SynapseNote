import { Trans, useLingui } from '@lingui/react/macro';
import {
  ArrowDownUp,
  Columns3,
  Folder,
  FolderOpen,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { FolderDocumentCard } from '@/components/FolderDocumentCard';
import { FolderDocumentGallery } from '@/components/FolderDocumentGallery';
import { FolderDateGroupLabel, FolderDocumentList } from '@/components/FolderDocumentList';
import { FolderPropertiesCard } from '@/components/FolderPropertiesCard';
import { FolderTimelineCard } from '@/components/FolderTimelineCard';
import { useFolderItemContextMenu } from '@/components/folder-item-context-menu';
import {
  buildFolderOverviewData,
  type FolderOverviewEntry,
} from '@/components/folder-overview-data';
import { groupFolderDocumentsByModified } from '@/components/folder-overview-date-groups';
import { usePageList } from '@/components/PageListContext';
import { TemplatesCard } from '@/components/TemplatesCard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFolderConfig } from '@/hooks/use-folder-config';
import { emitCreateTopLevelFile } from '@/lib/create-file-events';
import { hashFromDocName } from '@/lib/doc-hash';

type SortKey = 'name' | 'modified';
type SortDir = 'asc' | 'desc';
type ViewMode = 'preview' | 'grid' | 'list';

function sortEntries(
  entries: FolderOverviewEntry[],
  key: SortKey,
  dir: SortDir,
): FolderOverviewEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    let comparison = 0;
    if (key === 'name') {
      comparison = a.title.localeCompare(b.title) || a.name.localeCompare(b.name);
    } else {
      const aModified = a.kind === 'file' ? a.modified : '';
      const bModified = b.kind === 'file' ? b.modified : '';
      comparison = aModified.localeCompare(bModified);
    }
    return dir === 'asc' ? comparison : -comparison;
  });
}

function FolderOverviewSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30"
      role="status"
      aria-busy="true"
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-8">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-xl" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-8 w-56 rounded-xl" />
      </div>
      <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <div className="columns-[11rem] gap-3">
          {[248, 312, 280, 360, 226, 336, 264, 304].map((height) => (
            <Skeleton
              key={height}
              className="mb-3 inline-block w-full break-inside-avoid rounded-[13px]"
              style={{ height }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FolderTile({ entry }: { entry: Extract<FolderOverviewEntry, { kind: 'folder' }> }) {
  const { onContextMenu, menu } = useFolderItemContextMenu(
    { kind: 'folder', folderPath: entry.path },
    entry.title,
  );
  return (
    <a
      href={hashFromDocName(entry.path)}
      onContextMenu={onContextMenu}
      className="group flex min-w-0 items-center gap-2 rounded-[11px] border border-black/7 bg-card/92 px-3 py-2.5 text-sm shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-black/12 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:border-white/9 dark:hover:border-white/16"
    >
      <Folder className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span className="truncate font-medium">{entry.title}</span>
      {menu}
    </a>
  );
}

function FolderTiles({ entries }: { entries: Extract<FolderOverviewEntry, { kind: 'folder' }>[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-label="Folders" className="mb-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2">
        {entries.map((entry) => (
          <FolderTile key={entry.path} entry={entry} />
        ))}
      </div>
    </section>
  );
}

export function FolderOverview({ folderPath }: { folderPath: string }) {
  const { t } = useLingui();
  const { folderPaths, loading, pages, pageTitles, pageMeta } = usePageList();
  const folderConfigHandle = useFolderConfig(folderPath);
  const { state: folderConfig, refresh: refreshFolderConfig } = folderConfigHandle;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [sortKey, setSortKey] = useState<SortKey>('modified');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const data = buildFolderOverviewData(folderPath, { pages, pageTitles, pageMeta, folderPaths });
  const heading = data.title || (folderPath === '' ? t`All Documents` : data.title);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEntries = sortEntries(data.children, sortKey, sortDir).filter((entry) => {
    if (!normalizedQuery) return true;
    return `${entry.title} ${entry.path}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  const folders = visibleEntries.filter(
    (entry): entry is Extract<FolderOverviewEntry, { kind: 'folder' }> => entry.kind === 'folder',
  );
  const documents = visibleEntries.filter(
    (entry): entry is Extract<FolderOverviewEntry, { kind: 'file' }> => entry.kind === 'file',
  );
  const documentDateGroups = groupFolderDocumentsByModified(documents);
  const description =
    folderConfig.status === 'ready' && typeof folderConfig.data.folder.description === 'string'
      ? folderConfig.data.folder.description.trim()
      : '';

  function openSearch() {
    setSearchOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function setSort(value: string) {
    const [key, dir] = value.split('-');
    if ((key === 'name' || key === 'modified') && (dir === 'asc' || dir === 'desc')) {
      setSortKey(key);
      setSortDir(dir);
    }
  }

  if (loading) return <FolderOverviewSkeleton />;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
        <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-xl border-black/8 bg-card shadow-sm dark:border-white/10"
              // This surface owns a folder, so it names one — every other
              // caller lets the sidebar pick its own create target.
              onClick={() => emitCreateTopLevelFile({ initialDir: folderPath })}
              aria-label={t`New document`}
              title={t`New document`}
            >
              <Plus className="size-4" />
            </Button>
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{heading}</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {searchOpen || query ? (
              <div className="order-4 flex h-8 w-[min(16rem,55vw)] items-center gap-1.5 rounded-xl border border-black/8 bg-card px-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30 dark:border-white/10">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t`Search this folder`}
                  aria-label={t`Search this folder`}
                  className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 rounded-md"
                  onClick={() => {
                    setQuery('');
                    setSearchOpen(false);
                  }}
                  aria-label={t`Close search`}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="order-4 size-8 rounded-xl border-black/8 bg-card shadow-sm dark:border-white/10"
                onClick={openSearch}
                aria-label={t`Search this folder`}
                title={t`Search this folder`}
              >
                <Search className="size-3.5" />
              </Button>
            )}

            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => {
                if (value === 'preview' || value === 'grid' || value === 'list') setViewMode(value);
              }}
              variant="outline"
              size="sm"
              className="order-1 h-8 rounded-xl border-black/8 bg-card p-0.5 shadow-sm dark:border-white/10"
              aria-label={t`Folder view`}
            >
              <ToggleGroupItem
                value="preview"
                className="size-7 rounded-[9px] border-0 px-0"
                aria-label={t`Preview view`}
                title={t`Preview view`}
              >
                <Columns3 className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="grid"
                className="size-7 rounded-[9px] border-0 px-0"
                aria-label={t`Grid view`}
                title={t`Grid view`}
              >
                <Grid2X2 className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                className="size-7 rounded-[9px] border-0 px-0"
                aria-label={t`List view`}
                title={t`List view`}
              >
                <List className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="order-2 size-8 rounded-xl border-black/8 bg-card shadow-sm dark:border-white/10"
                  aria-label={t`Sort folder`}
                  title={t`Sort folder`}
                >
                  <ArrowDownUp className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>
                  <Trans>Sort by</Trans>
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={`${sortKey}-${sortDir}`} onValueChange={setSort}>
                  <DropdownMenuRadioItem value="name-asc">
                    <Trans>Name A–Z</Trans>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name-desc">
                    <Trans>Name Z–A</Trans>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="modified-desc">
                    <Trans>Recently modified</Trans>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="modified-asc">
                    <Trans>Oldest modified</Trans>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="icon"
              className="order-3 size-8 rounded-xl border-black/8 bg-card shadow-sm dark:border-white/10"
              onClick={() => setDetailsOpen(true)}
              aria-label={t`Folder details`}
              title={t`Folder details`}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </div>
        </header>

        <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-6">
          {description ? (
            <p className="mb-5 rounded-[12px] bg-background/48 px-4 py-3 text-center text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}

          <FolderTiles entries={folders} />

          {documents.length > 0 ? (
            viewMode === 'list' ? (
              <FolderDocumentList groups={documentDateGroups} ariaLabel={t`Documents`} />
            ) : viewMode === 'preview' ? (
              <FolderDocumentGallery entries={documents} ariaLabel={t`Documents`} />
            ) : (
              <section aria-label={t`Documents`} className="space-y-5" data-folder-document-grid>
                {documentDateGroups.map((group) => (
                  <section key={group.key} aria-label={group.key}>
                    <h2 className="mb-3 px-1 text-[11px] font-medium text-muted-foreground/70">
                      <FolderDateGroupLabel group={group} />
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),15rem))] gap-3">
                      {group.entries.map((entry) => (
                        <FolderDocumentCard key={entry.path} entry={entry} mode={viewMode} />
                      ))}
                    </div>
                  </section>
                ))}
              </section>
            )
          ) : visibleEntries.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-border/80 bg-background/28 px-6 text-center">
              <FolderOpen className="size-5 text-muted-foreground/60" />
              <p className="text-sm font-medium">
                {normalizedQuery ? (
                  <Trans>No matching documents</Trans>
                ) : (
                  <Trans>This folder is empty.</Trans>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {normalizedQuery ? (
                  <Trans>Try a different name or path.</Trans>
                ) : (
                  <Trans>Create a document to start filling this space.</Trans>
                )}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent
          sizeMode="unconstrained"
          className="w-[min(94vw,42rem)] gap-0 overflow-y-auto p-0"
        >
          <SheetHeader className="border-b border-border/70 pr-14">
            <SheetTitle>
              <Trans>Folder details</Trans>
            </SheetTitle>
            <SheetDescription>{heading}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <FolderPropertiesCard
              folderPath={folderPath}
              state={folderConfig}
              onChange={refreshFolderConfig}
            />
            <TemplatesCard
              folderPath={folderPath}
              state={folderConfig}
              onChange={refreshFolderConfig}
            />
            <FolderTimelineCard folderPath={folderPath} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
