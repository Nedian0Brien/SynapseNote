import { Trans, useLingui } from '@lingui/react/macro';
import type { DatabaseSource } from '@nedian0brien/synapsenote-core';
import {
  Archive,
  ArrowDownAZ,
  Braces,
  Columns3,
  Download,
  Filter,
  GripVertical,
  History,
  Loader2,
  MoreHorizontalIcon,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Upload,
} from 'lucide-react';
import { DatabasePresenceBadges } from '@/components/DatabasePresenceBadges';
import { DatabaseViewQuerySummary } from '@/components/DatabaseViewQuerySummary';
import { DatabaseViewTabMenu } from '@/components/DatabaseViewTabMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createDatabaseDefaultViewChangeDesiredState } from '@/lib/database-cell-mutation';
import { cn } from '@/lib/utils';
import type { DatabaseWorkspaceSuccessContext } from './database-workspace-context';

export function DatabaseWorkspaceToolbar({ context }: { context: DatabaseWorkspaceSuccessContext }) {
  const { t } = useLingui();
  const {
    isPagePresentation,
    isCanvasPresentation,
    description,
    result,
    selectedView,
    selectedViewId,
    sourceViews,
    selectView,
    dragOverViewId,
    draggedViewId,
    setDragOverViewId,
    setDraggedViewId,
    mutationStatus,
    setViewManagerOpen,
    activeAgentScope,
    onOpenAgentRuns,
    onOpenContextInspector,
    selectedRecordIds,
    showArchived,
    setShowArchived,
    loading,
    csvInputRef,
    csvStatus,
    exportDatabase,
    undoStatus,
    redoStatus,
    runMutation,
    setFilterDialogOpen,
    setViewSettingsOpen,
    setNewRecordOpen,
    reorderSavedViewTo,
    handleSavedViewTabAction,
    remotePresence,
    buttonStatus,
    planDatabaseActionButton,
    setPropertiesDialogRenameId,
    setPropertiesDialogOpen,
    inspectImportFile,
    openDatabaseAgentScope,
    setAppearanceOpen,
    refreshNow,
    setTemplatesOpen,
    setAutomationsOpen,
    setPermissionsOpen,
    lastUndoToken,
    undoLastChange,
    lastRedoToken,
    redoLastChange,
  } = context;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {!isCanvasPresentation ? (
          <h2 className="font-semibold text-lg">{description.source.name}</h2>
        ) : null}
        <p className={cn('text-muted-foreground text-sm', isCanvasPresentation && 'sr-only')}>
          {description.source.recordMeaning}
        </p>
        <nav
          className="mt-2 flex max-w-full items-center gap-1 overflow-x-auto"
          aria-label="Database views"
          data-database-view-tabs
          data-database-primary-view-tabs
        >
          {!isCanvasPresentation ? (
            <Button
              type="button"
              size="sm"
              variant={selectedViewId ? 'ghost' : 'secondary'}
              role="tab"
              aria-selected={!selectedViewId}
              onClick={() => selectView('__all__')}
            >
              {isPagePresentation ? <Trans>All pages</Trans> : <Trans>All records</Trans>}
            </Button>
          ) : null}
          {sourceViews.map((view: any, index: number) => (
            <fieldset
              key={view.id}
              aria-label={`${view.name} view tab controls`}
              className={cn(
                'inline-flex items-center rounded-md border-0 p-0',
                dragOverViewId === view.id && 'ring-2 ring-primary/50',
              )}
              data-database-machine-object="view"
              data-view-id={view.id}
              data-view-drag-over={dragOverViewId === view.id ? 'true' : undefined}
              onDragOver={(event) => {
                if (!draggedViewId || draggedViewId === view.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverViewId(view.id);
              }}
              onDragLeave={() => {
                if (dragOverViewId === view.id) setDragOverViewId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceViewId = draggedViewId || event.dataTransfer.getData('text/plain');
                reorderSavedViewTo(sourceViewId, view.id);
              }}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={cn(
                  'cursor-grab touch-none active:cursor-grabbing',
                  isCanvasPresentation && 'sr-only',
                )}
                aria-label={`Drag ${view.name} view`}
                draggable
                disabled={mutationStatus !== 'idle'}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', view.id);
                  setDraggedViewId(view.id);
                  setDragOverViewId(null);
                }}
                onDragEnd={() => {
                  setDraggedViewId(null);
                  setDragOverViewId(null);
                }}
              >
                <GripVertical aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedViewId === view.id ? 'secondary' : 'ghost'}
                role="tab"
                aria-selected={selectedViewId === view.id}
                onClick={() => selectView(view.id)}
              >
                {view.favorite === true ? '★ ' : ''}
                {view.name}
              </Button>
              {selectedViewId === view.id ? (
                <DatabaseViewTabMenu
                  source={description.source as DatabaseSource}
                  view={view}
                  index={index}
                  count={sourceViews.length}
                  busy={mutationStatus !== 'idle'}
                  onAction={(action) => handleSavedViewTabAction(view, action)}
                />
              ) : null}
            </fieldset>
          ))}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="New database view"
            disabled={mutationStatus !== 'idle'}
            onClick={() => setViewManagerOpen(true)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </nav>
        {selectedView ? (
          <DatabaseViewQuerySummary
            source={description.source}
            view={selectedView}
            onOpenFilters={() => setFilterDialogOpen(true)}
            onOpenSorts={() => setViewSettingsOpen(true)}
          />
        ) : null}
        <DatabasePresenceBadges
          scope="schema"
          entries={remotePresence.filter(
            (entry: any) =>
              entry.databaseId === description.database.id &&
              entry.sourceId === description.source?.id &&
              entry.scope === 'schema',
          )}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="md:hidden" data-database-compact-view-switcher>
          <Select value={selectedViewId || '__all__'} onValueChange={selectView}>
            <SelectTrigger size="sm" className="min-w-40" aria-label="Saved database view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!isCanvasPresentation ? (
                <SelectItem value="__all__">
                  {isPagePresentation ? <Trans>All pages</Trans> : <Trans>All records</Trans>}
                </SelectItem>
              ) : null}
              {sourceViews.map((view: any) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.favorite === true ? '★ ' : ''}
                  {view.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {description.database.buttons
          .filter(
            (button: any) =>
              button.placement.kind === 'database' ||
              (button.placement.kind === 'source' &&
                button.placement.sourceId === description.source?.id),
          )
          .map((button: any) => (
            <Button
              key={button.id}
              variant="outline"
              size="sm"
              disabled={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
              onClick={() => planDatabaseActionButton(button.id)}
            >
              {button.name}
            </Button>
          ))}
        {isCanvasPresentation ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutationStatus !== 'idle'}
              aria-label="New page"
              onClick={() => setNewRecordOpen(true)}
            >
              <Plus aria-hidden="true" /> <Trans>New</Trans>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedView || mutationStatus !== 'idle'}
              onClick={() => setFilterDialogOpen(true)}
            >
              <Filter aria-hidden="true" /> <Trans>Filters</Trans>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedView || mutationStatus !== 'idle'}
              onClick={() => setViewSettingsOpen(true)}
            >
              <ArrowDownAZ aria-hidden="true" /> <Trans>Sort</Trans>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutationStatus !== 'idle'}
              onClick={() => {
                setPropertiesDialogRenameId(null);
                setPropertiesDialogOpen(true);
              }}
            >
              <Columns3 aria-hidden="true" /> <Trans>Properties</Trans>
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedView || mutationStatus !== 'idle'}
              onClick={() => setFilterDialogOpen(true)}
            >
              <Trans>Filters</Trans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedView || mutationStatus !== 'idle'}
              onClick={() => setViewSettingsOpen(true)}
            >
              <Trans>View settings</Trans>
            </Button>
          </>
        )}
        <Input
          ref={csvInputRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          className="hidden"
          aria-label="Import database CSV or TSV file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) inspectImportFile(file);
          }}
        />
        {!isCanvasPresentation ? (
          <Button
            variant="outline"
            size="sm"
            disabled={mutationStatus !== 'idle'}
            aria-label={isPagePresentation ? t`New page` : undefined}
            onClick={() => setNewRecordOpen(true)}
          >
            <Plus />
            {isPagePresentation ? <Trans>New</Trans> : <Trans>New record</Trans>}
          </Button>
        ) : null}
        {!isCanvasPresentation ? (
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            disabled={mutationStatus !== 'idle'}
            aria-pressed={showArchived}
            onClick={() => setShowArchived((value: any) => !value)}
          >
            <Archive />
            {showArchived ? <Trans>Hide archived</Trans> : <Trans>Show archived</Trans>}
          </Button>
        ) : null}
        {!isCanvasPresentation ? (
          <>
            <Badge variant={description.index.state === 'idle' ? 'gray' : 'warning'}>
              {description.index.state}
            </Badge>
            {result ? (
              <span className="text-muted-foreground text-xs">
                {result.returned} / {result.matched}
              </span>
            ) : null}
          </>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="More database actions"
              data-testid="database-more-actions"
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <Trans>Database actions</Trans>
            </DropdownMenuLabel>
            {isCanvasPresentation && activeAgentScope ? (
              <DropdownMenuItem
                onSelect={() =>
                  window.setTimeout(() => openDatabaseAgentScope(activeAgentScope), 0)
                }
              >
                <Sparkles aria-hidden="true" /> <Trans>Ask agent</Trans>
              </DropdownMenuItem>
            ) : null}
            {isCanvasPresentation && description?.source ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle'}
                onSelect={() => setAppearanceOpen(true)}
              >
                <Settings2 aria-hidden="true" /> <Trans>Customize page</Trans>
              </DropdownMenuItem>
            ) : null}
            {isCanvasPresentation && selectedView ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle'}
                onSelect={() => setViewSettingsOpen(true)}
              >
                <Settings2 aria-hidden="true" /> <Trans>View settings</Trans>
              </DropdownMenuItem>
            ) : null}
            {isCanvasPresentation ? (
              <DropdownMenuItem disabled={loading} onSelect={refreshNow}>
                <RefreshCw className={cn(loading && 'animate-spin')} /> <Trans>Refresh</Trans>
              </DropdownMenuItem>
            ) : null}
            {onOpenAgentRuns ? (
              <DropdownMenuItem onSelect={onOpenAgentRuns}>
                <History aria-hidden="true" /> <Trans>History</Trans>
              </DropdownMenuItem>
            ) : null}
            {onOpenContextInspector ? (
              <DropdownMenuItem
                onSelect={() => {
                  if (!description?.source) return;
                  onOpenContextInspector({
                    databaseId: description.database.id,
                    sourceId: description.source.id,
                    ...(selectedViewId ? { viewId: selectedViewId } : {}),
                  });
                }}
              >
                <Braces aria-hidden="true" /> <Trans>Inspect agent context</Trans>
              </DropdownMenuItem>
            ) : null}
            {onOpenContextInspector && selectedRecordIds.size > 0 ? (
              <DropdownMenuItem
                onSelect={() => {
                  if (!description?.source) return;
                  onOpenContextInspector({
                    databaseId: description.database.id,
                    sourceId: description.source.id,
                    ...(selectedViewId ? { viewId: selectedViewId } : {}),
                    recordIds: [...selectedRecordIds],
                  });
                }}
              >
                <Braces aria-hidden="true" /> <Trans>Inspect selected context</Trans>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={mutationStatus !== 'idle'}
              onSelect={() => setTemplatesOpen(true)}
            >
              <Table2 aria-hidden="true" /> <Trans>Templates</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={mutationStatus !== 'idle'}
              onSelect={() => setAutomationsOpen(true)}
            >
              <Trans>Automations</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={mutationStatus !== 'idle'}
              onSelect={() => setPermissionsOpen(true)}
            >
              <ShieldCheck aria-hidden="true" /> <Trans>Share</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={mutationStatus !== 'idle'}
              onSelect={() => setViewManagerOpen(true)}
            >
              <Trans>Manage views</Trans>
            </DropdownMenuItem>
            {isCanvasPresentation ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle'}
                onSelect={() => setShowArchived((value: any) => !value)}
              >
                <Archive aria-hidden="true" />
                {showArchived ? <Trans>Hide archived</Trans> : <Trans>Show archived</Trans>}
              </DropdownMenuItem>
            ) : null}
            {selectedView && description.source.defaultViewId !== selectedView.id ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle'}
                onSelect={() =>
                  runMutation(
                    createDatabaseDefaultViewChangeDesiredState({
                      database: description.database,
                      source: description.source as DatabaseSource,
                      viewId: selectedView.id,
                    }),
                    'ui-default-view',
                    'Default view change failed',
                    {
                      policy: {
                        operation: 'view',
                        actor: 'human',
                        principalId: 'user:local',
                      },
                    },
                  )
                }
              >
                <Star aria-hidden="true" /> <Trans>Make default</Trans>
              </DropdownMenuItem>
            ) : null}
            {description.source.defaultViewId ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle'}
                onSelect={() =>
                  runMutation(
                    createDatabaseDefaultViewChangeDesiredState({
                      database: description.database,
                      source: description.source as DatabaseSource,
                    }),
                    'ui-default-view-clear',
                    'Default view change failed',
                    {
                      policy: {
                        operation: 'view',
                        actor: 'human',
                        principalId: 'user:local',
                      },
                    },
                  )
                }
              >
                <Trans>Clear default</Trans>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={csvStatus !== 'idle' || mutationStatus !== 'idle'}
              onSelect={() => csvInputRef.current?.click()}
            >
              {csvStatus === 'importing' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              <Trans>Import CSV/TSV</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={csvStatus !== 'idle'}
              onSelect={() => exportDatabase('csv', 'current')}
            >
              <Download aria-hidden="true" /> <Trans>Export current CSV</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={csvStatus !== 'idle'}
              onSelect={() => exportDatabase('csv', 'all')}
            >
              <Download aria-hidden="true" /> <Trans>Export all CSV</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={csvStatus !== 'idle'}
              onSelect={() => exportDatabase('json', 'all')}
            >
              <Download aria-hidden="true" /> <Trans>Export JSON</Trans>
            </DropdownMenuItem>
            {lastUndoToken ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle' || undoStatus !== 'idle'}
                onSelect={undoLastChange}
              >
                {undoStatus !== 'idle' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                <Trans>Undo last change</Trans>
              </DropdownMenuItem>
            ) : null}
            {lastRedoToken ? (
              <DropdownMenuItem
                disabled={mutationStatus !== 'idle' || redoStatus !== 'idle'}
                onSelect={redoLastChange}
              >
                {redoStatus !== 'idle' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                <Trans>Redo last change</Trans>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
