import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronRight, Database, Loader2, RefreshCw, Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import type { DatabaseCatalogCandidate } from '@/lib/database-catalog-client';
import { fetchDatabaseCatalog } from '@/lib/database-catalog-client';
import {
  DATABASE_NAVIGATION_CHANGE_EVENT,
  databasePageTargetFromHash,
  databasePageTargetToHash,
} from '@/lib/database-navigation';
import { ROUTE_NAVIGATION_CHANGE_EVENT } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

/**
 * A lightweight database navigator for the ordinary page sidebar.
 *
 * The management dialog remains the place for schema/admin work. This section
 * only exposes canonical database sources as navigable page targets, loads on
 * demand, and follows the same hash route used by full-page database views.
 */
export function DatabaseSidebarSection() {
  'use no memo';
  const { t } = useLingui();
  const [open, setOpen] = useState(() => databasePageTargetFromHash(window.location.hash) !== null);
  const [candidates, setCandidates] = useState<DatabaseCatalogCandidate[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState(() =>
    databasePageTargetFromHash(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => {
      const target = databasePageTargetFromHash(window.location.hash);
      setActiveTarget(target);
      if (target) setOpen(true);
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    window.addEventListener(ROUTE_NAVIGATION_CHANGE_EVENT, onHashChange);
    window.addEventListener(DATABASE_NAVIGATION_CHANGE_EVENT, onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
      window.removeEventListener(ROUTE_NAVIGATION_CHANGE_EVENT, onHashChange);
      window.removeEventListener(DATABASE_NAVIGATION_CHANGE_EVENT, onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!open || loadState === 'loading' || loadState === 'success') return;
    const controller = new AbortController();
    setLoadState('loading');
    setErrorMessage(null);
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((catalog) => {
        setCandidates(catalog.candidates);
        setLoadState('success');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : t`Could not load databases`);
        setLoadState('error');
      });
    return () => controller.abort();
  }, [loadState, open, t]);

  function openSource(databaseId: string, sourceId: string) {
    window.location.hash = databasePageTargetToHash({ databaseId, sourceId });
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/databases shrink-0"
      data-testid="database-sidebar-section"
    >
      <SidebarGroup className="min-h-0 px-0">
        <SidebarGroupLabel asChild className="shrink-0">
          <CollapsibleTrigger
            className="flex w-full items-center gap-1.5"
            data-testid="database-sidebar-trigger"
          >
            <Database className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <Trans>Databases</Trans>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/databases:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent className="px-2 pb-2">
          {loadState === 'loading' ? (
            <div
              className="flex items-center gap-2 px-2 py-2 text-muted-foreground text-xs"
              role="status"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              <Trans>Loading databases</Trans>
            </div>
          ) : null}
          {loadState === 'error' ? (
            <div
              className="flex items-center gap-2 px-2 py-2 text-destructive text-xs"
              role="alert"
            >
              <span className="min-w-0 flex-1">{errorMessage}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t`Retry loading databases`}
                onClick={() => setLoadState('idle')}
              >
                <RefreshCw aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {loadState === 'success' && candidates.length === 0 ? (
            <p className="px-2 py-2 text-muted-foreground text-xs">
              <Trans>No databases yet.</Trans>
            </p>
          ) : null}
          <ul className="flex flex-col gap-1" aria-label={t`Database sources`}>
            {candidates.map((database) =>
              database.sources.map((source) => {
                const selected =
                  activeTarget?.databaseId === database.id && activeTarget.sourceId === source.id;
                return (
                  <li key={source.id} className="min-w-0 list-none">
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-auto w-full min-w-0 items-start justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                        selected && 'bg-muted',
                      )}
                      onClick={() => openSource(database.id, source.id)}
                      data-testid={`database-sidebar-source-${source.id}`}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <Table2
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">
                        <span className="block truncate">{source.name}</span>
                        <span className="block truncate text-muted-foreground text-xs">
                          {database.name}
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              }),
            )}
          </ul>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
