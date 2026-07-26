import { Trans } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { databasePageTargetToHash, replaceDatabaseHash } from '@/lib/database-navigation';
import { DatabaseWorkspaceSourceList } from './DatabaseWorkspaceSourceList';
import type { DatabaseWorkspaceRenderContext } from './database-workspace-context';

export function DatabaseWorkspaceSidebar({ context }: { context: DatabaseWorkspaceRenderContext }) {
  const {
    catalogStatus,
    candidates,
    selection,
    isCanvasPresentation,
    isPagePresentation,
    setTableCalculations,
    tableViewStatesRef,
    setTableViewStates,
    setSelectedViewId,
    setFilterDialogOpen,
    setViewSettingsOpen,
    setViewManagerOpen,
    setPropertyDeletionPreview,
    setPropertiesDialogOpen,
    setSelectedRecordIds,
    setSelection,
  } = context;

  return (
    <>
      {!isCanvasPresentation ? (
        <aside className="overflow-y-auto border-b p-3 md:border-r md:border-b-0">
          {catalogStatus === 'loading' && candidates.length === 0 ? (
            <div
              className="flex items-center gap-2 p-3 text-muted-foreground"
              role="status"
              data-database-state="loading"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <Trans>Loading databases</Trans>
            </div>
          ) : null}
          {catalogStatus === 'success' && candidates.length === 0 ? (
            <div className="p-3 text-muted-foreground text-sm" data-database-state="empty">
              <Trans>No databases yet.</Trans>
            </div>
          ) : null}
          <DatabaseWorkspaceSourceList
            candidates={candidates}
            selected={selection}
            onSelect={(nextSelection) => {
              if (isPagePresentation) {
                // Catalog selection is the first concrete target in the
                // page-first workspace. Persist it in the canonical hash
                // before the async description loads so a browser reload
                // can restore the same database instead of falling back to
                // the ordinary editor home screen.
                const route = databasePageTargetToHash({
                  databaseId: nextSelection.databaseId,
                  sourceId: nextSelection.sourceId,
                });
                replaceDatabaseHash(route);
              }
              setTableCalculations({});
              tableViewStatesRef.current.clear();
              setTableViewStates(new Map());
              setSelectedViewId('');
              setFilterDialogOpen(false);
              setViewSettingsOpen(false);
              setViewManagerOpen(false);
              setPropertyDeletionPreview(null);
              setPropertiesDialogOpen(false);
              setSelectedRecordIds(new Set());
              setSelection(nextSelection);
            }}
          />
        </aside>
      ) : null}
    </>
  );
}
