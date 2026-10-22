import { t } from '@lingui/core/macro';
import type { DatabaseView as CoreDatabaseView } from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import { DatabaseViewQuerySummary } from '@/components/DatabaseViewQuerySummary';
import { type DatabaseViewTabAction, DatabaseViewTabMenu } from '@/components/DatabaseViewTabMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DatabaseDescription } from '@/lib/database-catalog-client';
import type { DatabaseReadModelState } from '@/lib/database-read-model';
import { cn } from '@/lib/utils';

type InlineDatabaseReference = {
  data: {
    databaseId: string;
    sourceId: string;
    viewId: string;
    mode: 'inline' | 'full-page';
  };
};

export interface InlineDatabaseHeaderProps {
  state: DatabaseReadModelState;
  reference: InlineDatabaseReference;
  linkedDatabase: DatabaseDescription['database'] | null;
  linkedSource: DatabaseDescription['source'];
  linkedSourceViews: readonly CoreDatabaseView[];
  activeLinkedView?: CoreDatabaseView;
  inlineNewViewLabel: string;
  inlineTitleEditing: boolean;
  inlineTitleDraft: string;
  inlineMutationStatus: 'idle' | 'saving';
  inlineUndoStatus: 'idle' | 'checking' | 'applying';
  inlineRedoStatus: 'idle' | 'checking' | 'applying';
  setInlineTitleDraft: (value: string) => void;
  setInlineTitleEditing: (editing: boolean) => void;
  commitInlineTitle: () => void;
  applyReference: (next: { databaseId: string; sourceId: string; viewId: string }) => void;
  handleInlineViewTabAction: (view: CoreDatabaseView, action: DatabaseViewTabAction) => void;
  openInlineDatabaseSurface: (
    surface: 'properties' | 'options' | 'view-settings' | 'view-manager' | 'filters',
    propertyId?: string,
    viewAction?: DatabaseViewManagerInitialAction,
    options?: { advanced?: boolean },
  ) => void;
  toolbar: ReactNode;
  selectionToolbar?: ReactNode;
}

export function InlineDatabaseHeader({
  state,
  reference,
  linkedDatabase,
  linkedSource,
  linkedSourceViews,
  activeLinkedView,
  inlineNewViewLabel,
  inlineTitleEditing,
  inlineTitleDraft,
  inlineMutationStatus,
  inlineUndoStatus,
  inlineRedoStatus,
  setInlineTitleDraft,
  setInlineTitleEditing,
  commitInlineTitle,
  applyReference,
  handleInlineViewTabAction,
  openInlineDatabaseSurface,
  toolbar,
  selectionToolbar,
}: InlineDatabaseHeaderProps) {
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-0 pt-4 pb-2"
      data-database-inline-header
    >
      <div className="min-w-0 flex-1">
        <div className="flex h-9 min-w-0 items-center" data-database-inline-primary-slot>
          {selectionToolbar ?? (
            <h3
              className="m-0 truncate font-semibold text-xl tracking-tight"
              data-database-inline-title
            >
              {state.status === 'ready' && inlineTitleEditing ? (
                <Input
                  value={inlineTitleDraft}
                  autoFocus
                  aria-label="Inline database title"
                  className="h-8 max-w-sm"
                  disabled={inlineMutationStatus !== 'idle'}
                  onChange={(event) => setInlineTitleDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitInlineTitle();
                    if (event.key === 'Escape') {
                      setInlineTitleDraft(
                        state.description.source?.name ?? state.description.database.name,
                      );
                      setInlineTitleEditing(false);
                    }
                  }}
                />
              ) : state.status === 'ready' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto max-w-full justify-start truncate rounded-none px-0 py-0.5 text-left font-semibold text-xl tracking-tight hover:bg-transparent"
                  aria-label={state.description.source?.name ?? state.description.database.name}
                  title={t`Rename inline database`}
                  onClick={() => {
                    setInlineTitleDraft(
                      state.description.source?.name ?? state.description.database.name,
                    );
                    setInlineTitleEditing(true);
                  }}
                >
                  {state.description.source?.name ?? state.description.database.name}
                </Button>
              ) : (
                'Linked database view'
              )}
            </h3>
          )}
        </div>
        {selectionToolbar && state.status === 'ready' ? (
          <h3 className="sr-only" data-database-inline-title>
            {state.description.source?.name ?? state.description.database.name}
          </h3>
        ) : null}
        {state.status === 'ready' ? (
          <p className="sr-only" data-database-source-context>
            {state.description.database.name} · {state.description.source?.name}
          </p>
        ) : null}
        {state.status === 'ready' ? (
          <p className="sr-only" data-linked-record-sharing>
            Shared pages · edits affect the database; this view keeps its own settings.
          </p>
        ) : null}
        {state.status === 'ready' &&
        linkedDatabase &&
        linkedSource &&
        (linkedSourceViews.length > 1 || activeLinkedView?.layout.type !== 'table') ? (
          <nav
            className="mt-3 flex max-w-full gap-1 overflow-x-auto"
            aria-label="Linked database views"
            data-linked-database-view-tabs
          >
            {linkedSourceViews.map((candidate, index) => (
              <Fragment key={candidate.id}>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className={cn(
                    'rounded-sm border border-transparent px-2 py-1 text-xs',
                    candidate.id === reference.data.viewId
                      ? 'border-border bg-muted/50 font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
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
                {candidate.id === reference.data.viewId ? (
                  <DatabaseViewTabMenu
                    source={linkedSource}
                    view={candidate}
                    index={index}
                    count={linkedSourceViews.length}
                    busy={
                      inlineMutationStatus !== 'idle' ||
                      inlineUndoStatus !== 'idle' ||
                      inlineRedoStatus !== 'idle'
                    }
                    onAction={(action) => handleInlineViewTabAction(candidate, action)}
                  />
                ) : null}
              </Fragment>
            ))}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={inlineNewViewLabel}
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
        {state.status === 'ready' && linkedSource && activeLinkedView ? (
          <DatabaseViewQuerySummary
            source={linkedSource}
            view={activeLinkedView}
            onOpenFilters={() => openInlineDatabaseSurface('filters')}
            onOpenSorts={() => openInlineDatabaseSurface('view-settings')}
          />
        ) : null}
      </div>
      {toolbar}
    </header>
  );
}
