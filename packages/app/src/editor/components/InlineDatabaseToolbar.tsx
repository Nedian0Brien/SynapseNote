import { Trans } from '@lingui/react/macro';
import type {
  DatabaseView as CoreDatabaseView,
  DatabaseLinkedViewSettings,
  DatabasePropertyType,
  DatabaseQueryResult,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import {
  Archive,
  ArrowDownAZ,
  Braces,
  ChevronDown,
  Columns3,
  Copy,
  ExternalLink,
  Filter,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { DatabaseAgentScopeMenu } from '@/components/DatabaseAgentScopeMenu';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DatabaseViewLifecycleChange } from '@/lib/database-cell-mutation';
import { databasePageTargetToHash, navigateToDatabaseHash } from '@/lib/database-navigation';
import type { DatabaseReadModelState } from '@/lib/database-read-model';
import { InlineDatabaseFilterPopover } from './InlineDatabaseFilterPopover';
import { InlineDatabasePropertiesPopover } from './InlineDatabasePropertiesPopover';
import { InlineDatabaseSettingsPanel } from './InlineDatabaseSettingsPanel';
import { InlineDatabaseSortPopover } from './InlineDatabaseSortPopover';
import { InlineDatabaseViewManagerPopover } from './InlineDatabaseViewManagerPopover';

type InlineDatabaseSurface =
  | 'properties'
  | 'options'
  | 'view-settings'
  | 'view-manager'
  | 'filters';

function InlineDatabaseMenuItem({
  children,
  disabled,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={
        destructive
          ? 'w-full justify-start font-normal text-destructive hover:bg-destructive/10 hover:text-destructive'
          : 'w-full justify-start font-normal'
      }
      disabled={disabled}
      role="menuitem"
      onClick={onSelect}
    >
      {children}
    </Button>
  );
}

function InlineDatabaseMenuSeparator() {
  return <hr className="-mx-1 my-1 border-0 border-border border-t" />;
}

interface InlineDatabaseToolbarProps {
  state: DatabaseReadModelState;
  activeLinkedView?: CoreDatabaseView;
  linkedSource?: DatabaseSource | null;
  linkedSourceViews: readonly CoreDatabaseView[];
  activeInlineAgentScope: DatabaseAgentScope;
  inlineAgentLabel?: string;
  inlineAgentMenuOpen: boolean;
  onInlineAgentMenuChange: (open: boolean) => void;
  inlineViewActionsLabel: string;
  inlineOpenDatabaseLabel: string;
  inlineSearchLabel: string;
  inlineFilterOpen: boolean;
  inlineFilterTargetId?: string;
  inlineSortOpen: boolean;
  inlineSortTargetId?: string;
  inlinePropertiesOpen: boolean;
  inlineVisiblePropertyIds: readonly string[];
  inlineSearchOpen: boolean;
  setInlineSearchOpen: Dispatch<SetStateAction<boolean>>;
  inlineSearchQuery: string;
  setInlineSearchQuery: Dispatch<SetStateAction<string>>;
  searchNeedle: string;
  renderedResult: DatabaseQueryResult | null;
  onLoadMore: () => void;
  reference: {
    data: { databaseId: string; sourceId: string; viewId: string; mode: 'inline' | 'full-page' };
  };
  showArchived: boolean;
  setShowArchived: Dispatch<SetStateAction<boolean>>;
  setInlineContextInspectorScope: Dispatch<
    SetStateAction<{ recordId?: string; recordIds?: string[]; propertyIds?: string[] } | null>
  >;
  setReplacementPickerOpen: Dispatch<SetStateAction<boolean>>;
  setInlineMode: (mode: 'inline' | 'full-page') => void;
  openInlineAgentScope: (scope: DatabaseAgentScope) => void;
  openInlineDatabaseSurface: (
    surface: InlineDatabaseSurface,
    propertyId?: string,
    viewAction?: DatabaseViewManagerInitialAction,
    options?: { advanced?: boolean },
  ) => void;
  inlineViewManagerOpen: boolean;
  inlineSettingsOpen: boolean;
  onInlineSettingsOpenChange: (open: boolean) => void;
  inlineActionsMenuOpen: boolean;
  onInlineActionsMenuOpenChange: (open: boolean) => void;
  inlineMutationBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  inlineUndoStatus: 'idle' | 'checking' | 'applying';
  inlineRedoStatus: 'idle' | 'checking' | 'applying';
  undoInlineMutation: () => void;
  redoInlineMutation: () => void;
  inlineViewManagerInitialAction?: DatabaseViewManagerInitialAction;
  onInlineViewManagerOpenChange: (open: boolean) => void;
  onInlineViewChange: (change: DatabaseViewLifecycleChange) => void;
  onInlineDefaultViewChange: (viewId?: string) => void;
  onInlineViewSelect: (viewId: string) => void;
  focusInlineNewRecord: () => void;
  persistLinkedViewOverrides: (next: DatabaseLinkedViewSettings | undefined) => void;
  addInlineProperty: (input: { name: string; type: DatabasePropertyType }) => void;
  onOpenAdvancedProperties: (propertyId?: string) => void;
  removeLinkedView: () => void;
  onOpenFilterAdvanced: (propertyId?: string) => void;
  onFilterOpenChange: (open: boolean) => void;
  onSortOpenChange: (open: boolean) => void;
  onPropertiesOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

/** Toolbar-only presentation for the document-native database header. */
export function InlineDatabaseToolbar({
  state,
  activeLinkedView,
  linkedSource,
  linkedSourceViews,
  activeInlineAgentScope,
  inlineAgentLabel,
  inlineAgentMenuOpen,
  onInlineAgentMenuChange,
  inlineViewActionsLabel,
  inlineOpenDatabaseLabel,
  inlineSearchLabel,
  inlineFilterOpen,
  inlineFilterTargetId,
  inlineSortOpen,
  inlineSortTargetId,
  inlinePropertiesOpen,
  inlineVisiblePropertyIds,
  inlineSearchOpen,
  setInlineSearchOpen,
  inlineSearchQuery,
  setInlineSearchQuery,
  searchNeedle,
  renderedResult,
  onLoadMore,
  reference,
  showArchived,
  setShowArchived,
  setInlineContextInspectorScope,
  setReplacementPickerOpen,
  setInlineMode,
  openInlineAgentScope,
  openInlineDatabaseSurface,
  inlineViewManagerOpen,
  inlineSettingsOpen,
  onInlineSettingsOpenChange,
  inlineActionsMenuOpen,
  onInlineActionsMenuOpenChange,
  inlineMutationBusy,
  canUndo,
  canRedo,
  inlineUndoStatus,
  inlineRedoStatus,
  undoInlineMutation,
  redoInlineMutation,
  inlineViewManagerInitialAction,
  onInlineViewManagerOpenChange,
  onInlineViewChange,
  onInlineDefaultViewChange,
  onInlineViewSelect,
  focusInlineNewRecord,
  persistLinkedViewOverrides,
  addInlineProperty,
  onOpenAdvancedProperties,
  removeLinkedView,
  onOpenFilterAdvanced,
  onFilterOpenChange,
  onSortOpenChange,
  onPropertiesOpenChange,
  onRefresh,
}: InlineDatabaseToolbarProps) {
  const openAfterMenu = (action: () => void) => {
    onInlineActionsMenuOpenChange(false);
    window.setTimeout(action, 0);
  };

  return (
    <div
      className="relative flex flex-wrap items-center justify-end gap-1 pt-0.5 text-muted-foreground"
      data-database-inline-toolbar
    >
      <DatabaseAgentScopeMenu
        scope={activeInlineAgentScope}
        ariaLabel={inlineAgentLabel}
        open={inlineAgentMenuOpen}
        onOpenChange={onInlineAgentMenuChange}
        hiddenTrigger
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={inlineOpenDatabaseLabel}
        onClick={() => {
          if (state.status === 'ready') {
            navigateToDatabaseHash(databasePageTargetToHash(reference.data));
            return;
          }
          openInlineDatabaseSurface('options');
        }}
      >
        <ExternalLink aria-hidden="true" />
      </Button>
      <InlineDatabaseSettingsPanel
        open={inlineSettingsOpen}
        onOpenChange={onInlineSettingsOpenChange}
        activeView={activeLinkedView}
        linkedSource={linkedSource}
        visiblePropertyCount={inlineVisiblePropertyIds.length}
        totalPropertyCount={linkedSource?.properties.length ?? inlineVisiblePropertyIds.length}
        onOpenFilters={() => onFilterOpenChange(true)}
        onOpenSort={() => onSortOpenChange(true)}
        onOpenProperties={() => onPropertiesOpenChange(true)}
        onOpenAdvancedSettings={() =>
          openInlineDatabaseSurface('view-settings', undefined, undefined, { advanced: true })
        }
        onOpenSavedViews={() => onInlineViewManagerOpenChange(true)}
      />
      {linkedSource ? (
        <InlineDatabaseViewManagerPopover
          open={inlineViewManagerOpen}
          onOpenChange={onInlineViewManagerOpenChange}
          source={linkedSource}
          views={linkedSourceViews}
          activeViewId={reference.data.viewId}
          busy={inlineMutationBusy}
          initialAction={inlineViewManagerInitialAction}
          onSelectView={onInlineViewSelect}
          onChange={onInlineViewChange}
          onDefaultViewChange={onInlineDefaultViewChange}
        />
      ) : null}
      {state.status === 'ready' && activeLinkedView ? (
        <>
          {linkedSource ? (
            <InlineDatabaseFilterPopover
              open={inlineFilterOpen}
              source={linkedSource}
              initialWhere={activeLinkedView.where}
              initialPropertyId={inlineFilterTargetId}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-events-none absolute top-1/2 right-16 size-px -translate-y-1/2 overflow-hidden p-0 opacity-0"
                  aria-label="Filters"
                  tabIndex={-1}
                >
                  <Filter />
                </Button>
              }
              onOpenChange={onFilterOpenChange}
              onSave={(where) =>
                persistLinkedViewOverrides({
                  where: where ?? null,
                })
              }
              onOpenAdvanced={() => onOpenFilterAdvanced(inlineFilterTargetId)}
            />
          ) : null}
          {linkedSource ? (
            <InlineDatabaseSortPopover
              open={inlineSortOpen}
              source={linkedSource}
              initialSort={activeLinkedView.sort}
              initialPropertyId={inlineSortTargetId}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-events-none absolute top-1/2 right-16 size-px -translate-y-1/2 overflow-hidden p-0 opacity-0"
                  aria-label="Sort"
                  tabIndex={-1}
                >
                  <ArrowDownAZ />
                </Button>
              }
              onOpenChange={onSortOpenChange}
              onSave={(sort) => persistLinkedViewOverrides({ sort: [...sort] })}
            />
          ) : null}
          {linkedSource ? (
            <InlineDatabasePropertiesPopover
              open={inlinePropertiesOpen}
              source={linkedSource}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-events-none absolute top-1/2 right-16 size-px -translate-y-1/2 overflow-hidden p-0 opacity-0"
                  aria-label="Properties"
                  tabIndex={-1}
                >
                  <Columns3 />
                </Button>
              }
              visiblePropertyIds={inlineVisiblePropertyIds}
              onOpenChange={onPropertiesOpenChange}
              onVisiblePropertyIdsChange={(propertyIds) =>
                persistLinkedViewOverrides({
                  projection: { ...activeLinkedView.projection, propertyIds: [...propertyIds] },
                })
              }
              onAddProperty={addInlineProperty}
              onOpenAdvanced={onOpenAdvancedProperties}
            />
          ) : null}
        </>
      ) : null}
      {state.status === 'ready' ? (
        <Popover open={inlineSearchOpen} onOpenChange={setInlineSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={inlineSearchQuery ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="pointer-events-none absolute top-1/2 right-16 size-px -translate-y-1/2 overflow-hidden p-0 opacity-0"
              aria-label={inlineSearchLabel}
              data-database-inline-search-trigger
              tabIndex={-1}
            >
              <Search aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <Input
              autoFocus
              value={inlineSearchQuery}
              placeholder="Search pages"
              aria-label="Search pages"
              onChange={(event) => setInlineSearchQuery(event.currentTarget.value)}
            />
            <p className="mt-1.5 px-1 text-muted-foreground text-xs">
              {searchNeedle
                ? `${renderedResult?.matched ?? renderedResult?.records.length ?? 0} ${renderedResult?.matched === 1 ? 'page' : 'pages'} in this view`
                : 'Search all pages in this view'}
            </p>
            {searchNeedle && renderedResult?.nextCursor ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                disabled={state.refreshing}
                onClick={onLoadMore}
              >
                {state.refreshing ? 'Loading more' : 'Load more'}
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
      <div className="flex items-stretch" data-database-inline-new-control>
        {activeLinkedView?.layout.type !== 'form' ? (
          <Button
            type="button"
            size="sm"
            className="rounded-r-none px-3 font-semibold shadow-none"
            aria-label="New page"
            disabled={state.status !== 'ready'}
            onClick={focusInlineNewRecord}
          >
            <Plus aria-hidden="true" /> <Trans>New</Trans>
          </Button>
        ) : null}
        <Popover open={inlineActionsMenuOpen} onOpenChange={onInlineActionsMenuOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              className="rounded-l-none border-primary-foreground/20 border-l px-2 shadow-none"
              aria-label={inlineViewActionsLabel}
              data-database-inline-actions-trigger
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(22rem,70vh)] w-64 overflow-y-auto p-1 subtle-scrollbar"
            role="menu"
            aria-label={inlineViewActionsLabel}
          >
            {state.status === 'ready' && linkedSource && activeLinkedView ? (
              <>
                <InlineDatabaseMenuItem
                  onSelect={() => openAfterMenu(() => onFilterOpenChange(true))}
                >
                  <Filter /> <Trans>Filters</Trans>
                </InlineDatabaseMenuItem>
                <InlineDatabaseMenuItem
                  onSelect={() => openAfterMenu(() => onSortOpenChange(true))}
                >
                  <ArrowDownAZ /> <Trans>Sort</Trans>
                </InlineDatabaseMenuItem>
                <InlineDatabaseMenuItem
                  onSelect={() => openAfterMenu(() => onPropertiesOpenChange(true))}
                >
                  <Columns3 /> <Trans>Properties</Trans>
                </InlineDatabaseMenuItem>
                <InlineDatabaseMenuItem
                  onSelect={() => openAfterMenu(() => setInlineSearchOpen(true))}
                >
                  <Search /> <Trans>Search</Trans>
                </InlineDatabaseMenuItem>
                <InlineDatabaseMenuSeparator />
              </>
            ) : null}
            {canUndo ? (
              <InlineDatabaseMenuItem
                disabled={inlineUndoStatus !== 'idle' || inlineRedoStatus !== 'idle'}
                onSelect={() => openAfterMenu(undoInlineMutation)}
              >
                <Undo2 />
                {inlineUndoStatus === 'checking'
                  ? 'Checking undo'
                  : inlineUndoStatus === 'applying'
                    ? 'Undoing'
                    : 'Undo change'}
              </InlineDatabaseMenuItem>
            ) : null}
            {canRedo ? (
              <InlineDatabaseMenuItem
                disabled={inlineUndoStatus !== 'idle' || inlineRedoStatus !== 'idle'}
                onSelect={() => openAfterMenu(redoInlineMutation)}
              >
                <Redo2 />
                {inlineRedoStatus === 'checking'
                  ? 'Checking redo'
                  : inlineRedoStatus === 'applying'
                    ? 'Redoing'
                    : 'Redo change'}
              </InlineDatabaseMenuItem>
            ) : null}
            {canUndo || canRedo ? <InlineDatabaseMenuSeparator /> : null}
            {reference.data.mode === 'inline' ? (
              <InlineDatabaseMenuItem
                onSelect={() => openAfterMenu(() => setInlineMode('full-page'))}
              >
                <ExternalLink /> <Trans>Convert to full page</Trans>
              </InlineDatabaseMenuItem>
            ) : (
              <InlineDatabaseMenuItem onSelect={() => openAfterMenu(() => setInlineMode('inline'))}>
                <Trans>Convert to inline view</Trans>
              </InlineDatabaseMenuItem>
            )}
            <InlineDatabaseMenuItem
              onSelect={() => openAfterMenu(() => setReplacementPickerOpen(true))}
            >
              <Search /> <Trans>Choose another view</Trans>
            </InlineDatabaseMenuItem>
            {state.status === 'ready' ? (
              <InlineDatabaseMenuItem
                onSelect={() => openAfterMenu(() => openInlineAgentScope(activeInlineAgentScope))}
              >
                <Sparkles /> <Trans>Ask agent</Trans>
              </InlineDatabaseMenuItem>
            ) : null}
            {state.status === 'ready' ? (
              <InlineDatabaseMenuItem onSelect={() => openAfterMenu(onRefresh)}>
                <RefreshCw /> <Trans>Refresh</Trans>
              </InlineDatabaseMenuItem>
            ) : null}
            {state.status === 'ready' ? (
              <InlineDatabaseMenuItem
                onSelect={() => openAfterMenu(() => setInlineContextInspectorScope({}))}
              >
                <Braces /> <Trans>Inspect agent context</Trans>
              </InlineDatabaseMenuItem>
            ) : null}
            {activeLinkedView?.layout.type !== 'form' ? (
              <InlineDatabaseMenuItem
                disabled={state.status === 'loading'}
                onSelect={() => openAfterMenu(() => setShowArchived((current) => !current))}
              >
                <Archive />{' '}
                {showArchived ? <Trans>Hide archived</Trans> : <Trans>Show archived</Trans>}
              </InlineDatabaseMenuItem>
            ) : null}
            <InlineDatabaseMenuItem
              onSelect={() =>
                openAfterMenu(() =>
                  openInlineDatabaseSurface('properties', undefined, undefined, { advanced: true }),
                )
              }
            >
              <Plus /> <Trans>Manage properties</Trans>
            </InlineDatabaseMenuItem>
            <InlineDatabaseMenuItem
              onSelect={() =>
                openAfterMenu(() =>
                  openInlineDatabaseSurface('view-settings', undefined, undefined, {
                    advanced: true,
                  }),
                )
              }
            >
              <Settings2 /> <Trans>View settings</Trans>
            </InlineDatabaseMenuItem>
            <InlineDatabaseMenuItem
              onSelect={() => openAfterMenu(() => openInlineDatabaseSurface('view-manager'))}
            >
              <Settings2 /> <Trans>Manage views</Trans>
            </InlineDatabaseMenuItem>
            <InlineDatabaseMenuItem
              onSelect={() =>
                openAfterMenu(() =>
                  openInlineDatabaseSurface('view-manager', undefined, {
                    kind: 'duplicate',
                    viewId: reference.data.viewId,
                  }),
                )
              }
            >
              <Copy /> <Trans>Duplicate view configuration</Trans>
            </InlineDatabaseMenuItem>
            <InlineDatabaseMenuItem
              onSelect={() =>
                openAfterMenu(() =>
                  openInlineDatabaseSurface('filters', undefined, undefined, { advanced: true }),
                )
              }
            >
              <Filter /> <Trans>Advanced filters</Trans>
            </InlineDatabaseMenuItem>
            <InlineDatabaseMenuSeparator />
            <InlineDatabaseMenuItem destructive onSelect={() => openAfterMenu(removeLinkedView)}>
              <Trash2 /> <Trans>Remove linked view</Trans>
            </InlineDatabaseMenuItem>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
