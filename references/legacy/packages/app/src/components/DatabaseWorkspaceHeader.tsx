import { Trans, useLingui } from '@lingui/react/macro';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Star,
} from 'lucide-react';
import { DatabaseAgentScopeMenu } from '@/components/DatabaseAgentScopeMenu';
import { DatabaseMachineIdsDetails } from '@/components/DatabaseMachineIdsDetails';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  databasePageTargetToHash,
  navigateToDatabaseHash,
  setDatabasePageFavorite,
} from '@/lib/database-navigation';
import { cn } from '@/lib/utils';
import type { DatabaseWorkspaceRenderContext } from './database-workspace-context';

export function DatabaseWorkspaceHeader({ context }: { context: DatabaseWorkspaceRenderContext }) {
  const { t } = useLingui();
  const {
    isCanvasPresentation,
    databasePageIcon,
    databasePageTitle,
    setPageTitleDraft,
    setPageTitleEditing,
    description,
    selection,
    mutationStatus,
    mutationProgressVisible,
    saveFeedback,
    activeAgentScope,
    pageFavorite,
    onOpenChange,
    loading,
    selectedViewId,
    isPagePresentation,
    pageTitleEditing,
    pageTitleInputRef,
    pageTitleDraft,
    commitPageTitle,
    selectedView,
    agentMenuOpen,
    handleAgentMenuChange,
    setCreationOpen,
    setPageFavorite,
    setAppearanceOpen,
    refreshNow,
  } = context;

  return (
    <DialogHeader
      className={cn(isPagePresentation && 'border-b px-4 py-3 sm:px-6')}
      data-database-page-chrome={isPagePresentation ? '' : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
        <div className="min-w-0">
          {isPagePresentation ? (
            <nav
              aria-label={t`Database breadcrumbs`}
              data-testid="database-page-breadcrumbs"
              className="mb-1 flex min-w-0 items-center gap-1 text-muted-foreground text-xs"
            >
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="-ml-2 h-6 px-2"
                onClick={() => {
                  if (isCanvasPresentation) {
                    navigateToDatabaseHash('');
                    return;
                  }
                  onOpenChange(false);
                }}
                data-testid="database-page-back"
              >
                <ChevronLeft aria-hidden="true" />
                <Trans>Databases</Trans>
              </Button>
              {description?.database ? (
                <>
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{description.database.name}</span>
                </>
              ) : null}
              {description?.source ? (
                <>
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{description.source.name}</span>
                </>
              ) : null}
            </nav>
          ) : null}
          <DialogTitle
            data-testid={isPagePresentation ? 'database-page-title' : undefined}
            className={cn(isPagePresentation && 'flex items-center gap-2')}
          >
            {isPagePresentation ? (
              <>
                {databasePageIcon.kind === 'emoji' ? (
                  <span
                    className="flex size-5 shrink-0 items-center justify-center text-lg"
                    aria-hidden="true"
                    data-testid="database-page-icon"
                    data-kind="emoji"
                  >
                    {databasePageIcon.value}
                  </span>
                ) : databasePageIcon.kind === 'url' || databasePageIcon.kind === 'path' ? (
                  <img
                    src={databasePageIcon.value}
                    alt=""
                    className="size-5 shrink-0 rounded object-cover"
                    aria-hidden="true"
                    data-testid="database-page-icon"
                    data-kind={databasePageIcon.kind}
                    draggable={false}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Database
                    className="size-5 shrink-0 text-primary"
                    aria-hidden="true"
                    data-testid="database-page-icon"
                    data-kind="default"
                  />
                )}
                {pageTitleEditing ? (
                  <Input
                    ref={pageTitleInputRef}
                    value={pageTitleDraft}
                    aria-label="Database page title"
                    data-testid="database-page-title-input"
                    className="h-8 min-w-48 max-w-xl text-base"
                    onChange={(event) => setPageTitleDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitPageTitle();
                      if (event.key === 'Escape') {
                        setPageTitleDraft(databasePageTitle);
                        setPageTitleEditing(false);
                      }
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 min-w-0 justify-start truncate px-1 text-left hover:underline"
                    aria-label={databasePageTitle}
                    title={t`Rename database page`}
                    data-testid="database-page-title-value"
                    onClick={() => {
                      setPageTitleDraft(databasePageTitle);
                      setPageTitleEditing(true);
                    }}
                  >
                    {databasePageTitle}
                  </Button>
                )}
              </>
            ) : (
              <Trans>Databases</Trans>
            )}
          </DialogTitle>
          {isCanvasPresentation ? (
            <DialogDescription className="sr-only">Database table</DialogDescription>
          ) : (
            <DialogDescription>
              {isPagePresentation ? (
                <Trans>Database pages share their content with every linked view.</Trans>
              ) : (
                <Trans>
                  Browse canonical Markdown records through a snapshot-consistent table.
                </Trans>
              )}
            </DialogDescription>
          )}
          {selection && !isCanvasPresentation ? (
            <DatabaseMachineIdsDetails
              className="mt-2 max-w-xl"
              entries={[
                {
                  kind: 'database',
                  label: <Trans>Database</Trans>,
                  value: selection.databaseId,
                },
                { kind: 'source', label: <Trans>Source</Trans>, value: selection.sourceId },
                { kind: 'view', label: <Trans>View</Trans>, value: selectedView?.id },
              ]}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {(mutationStatus !== 'idle' && mutationProgressVisible) || saveFeedback ? (
            <span
              className="inline-flex items-center gap-1.5 self-center text-muted-foreground text-xs"
              role="status"
              aria-live="polite"
              data-testid="database-save-indicator"
              data-database-save-indicator
              data-database-save-state={
                mutationStatus !== 'idle' ? 'saving' : (saveFeedback ?? undefined)
              }
            >
              {mutationStatus === 'planning' || mutationStatus === 'committing' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  <Trans>Saving change</Trans>
                </>
              ) : mutationStatus === 'review' ? (
                <>
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  <Trans>Review required</Trans>
                </>
              ) : saveFeedback === 'queued' ? (
                <>
                  <Check className="size-3.5" aria-hidden="true" />
                  <Trans>Saved locally · queued for reconnect</Trans>
                </>
              ) : saveFeedback === 'failed' ? (
                <>
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  <Trans>Save failed</Trans>
                </>
              ) : (
                <>
                  <Check className="size-3.5" aria-hidden="true" />
                  <Trans>Saved</Trans>
                </>
              )}
            </span>
          ) : null}
          {activeAgentScope && !isPagePresentation ? (
            <DatabaseAgentScopeMenu
              scope={activeAgentScope}
              open={agentMenuOpen}
              onOpenChange={handleAgentMenuChange}
            />
          ) : null}
          {!isCanvasPresentation ? (
            <Button
              variant="default"
              size="sm"
              data-testid="database-create-button"
              onClick={() => setCreationOpen(true)}
            >
              <Plus /> <Trans>Create database</Trans>
            </Button>
          ) : null}
          {description?.source && selection && !isCanvasPresentation ? (
            <Button
              type="button"
              variant={pageFavorite ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={
                pageFavorite ? t`Remove database page favorite` : t`Favorite database page`
              }
              aria-pressed={pageFavorite}
              data-testid="database-page-favorite"
              onClick={() => {
                const next = !pageFavorite;
                setPageFavorite(next);
                setDatabasePageFavorite(selection, next);
              }}
            >
              <Star aria-hidden="true" />
            </Button>
          ) : null}
          {isPagePresentation && !isCanvasPresentation && description?.source ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mutationStatus !== 'idle'}
              onClick={() => setAppearanceOpen(true)}
              data-testid="database-page-customize"
            >
              <Settings2 aria-hidden="true" /> <Trans>Customize page</Trans>
            </Button>
          ) : null}
          {description?.source && selection && !isCanvasPresentation ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigateToDatabaseHash(
                  databasePageTargetToHash({
                    databaseId: description.database.id,
                    sourceId: description.source?.id ?? selection.sourceId,
                    ...(selectedViewId ? { viewId: selectedViewId } : {}),
                  }),
                );
                onOpenChange(false);
              }}
            >
              <ExternalLink /> <Trans>Open page</Trans>
            </Button>
          ) : null}
          {!isCanvasPresentation ? (
            <Button variant="outline" size="sm" disabled={loading} onClick={refreshNow}>
              <RefreshCw className={cn(loading && 'animate-spin')} />
              <Trans>Refresh</Trans>
            </Button>
          ) : null}
        </div>
      </div>
    </DialogHeader>
  );
}
