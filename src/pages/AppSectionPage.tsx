import { useCallback, useEffect, useMemo, useState } from 'react';

import LoadingDots from '@/components/_shared/LoadingDots';
import SharedOutline from '@/components/_shared/outline/Outline';
import { Search } from '@/components/app/search';
import {
  useAppOutline,
  useAppRecent,
  useCurrentWorkspaceId,
  useToView,
  useUserWorkspaceInfo,
} from '@/components/app/app.hooks';
import type { AppSection } from '@/components/app/navigation/appSections';
import { SynapseGraphWorkspace } from '@/features/synapse-graph/SynapseGraphWorkspace';

type AppSectionPageProps = {
  section: AppSection;
};

function AppSectionPage({ section }: AppSectionPageProps) {
  const outline = useAppOutline();
  const toView = useToView();
  const workspaceId = useCurrentWorkspaceId();
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const { recentViews, loadRecentViews } = useAppRecent();
  const [loadingRecent, setLoadingRecent] = useState(false);
  const workspaceName = userWorkspaceInfo?.selectedWorkspace.name || 'Home';
  const visibleSpaces = useMemo(
    () => outline?.filter((view) => view.extra?.is_space && !view.extra?.is_hidden_space) ?? [],
    [outline]
  );
  const recent = recentViews?.slice(0, 6) ?? [];

  useEffect(() => {
    if (section !== 'home') return;
    let cancelled = false;

    void (async () => {
      setLoadingRecent(true);
      await loadRecentViews?.();
      if (!cancelled) {
        setLoadingRecent(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRecentViews, section]);

  const openView = useCallback(
    (viewId: string) => {
      void toView(viewId);
    },
    [toView]
  );

  if (section === 'search') {
    return (
      <div className='h-full w-full overflow-hidden px-8 py-6'>
        <Search mode='page' />
      </div>
    );
  }

  if (section === 'graph') {
    return (
      <SynapseGraphWorkspace
        presentation='inline'
        outline={outline}
        currentViewId={workspaceId}
        open
        refreshKey={workspaceId}
        onClose={() => undefined}
        onOpenView={openView}
      />
    );
  }

  if (section === 'library') {
    return (
      <div className='h-full w-full overflow-auto px-8 py-6'>
        <div className='mx-auto flex max-w-4xl flex-col gap-5'>
          <div className='flex flex-col gap-1 border-b border-border-primary pb-4'>
            <h1 className='text-xl font-semibold text-text-primary'>Library</h1>
            <p className='text-sm text-text-secondary'>{workspaceName}</p>
          </div>
          <div className='rounded-300 border border-border-primary bg-surface-container-layer-00'>
            <SharedOutline outline={outline} width={760} navigateToView={toView} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='h-full w-full overflow-auto px-8 py-6'>
      <div className='mx-auto flex max-w-4xl flex-col gap-8'>
        <div className='flex flex-col gap-1 border-b border-border-primary pb-4'>
          <h1 className='text-xl font-semibold text-text-primary'>{workspaceName}</h1>
          <p className='text-sm text-text-secondary'>Home</p>
        </div>

        <section className='flex flex-col gap-3'>
          <h2 className='text-sm font-medium text-text-secondary'>Recent</h2>
          {loadingRecent && !recentViews ? (
            <div className='flex h-24 items-center justify-center'>
              <LoadingDots />
            </div>
          ) : recent.length > 0 ? (
            <div className='flex flex-col divide-y divide-border-primary rounded-300 border border-border-primary bg-surface-container-layer-00'>
              {recent.map((view) => (
                <button
                  key={view.view_id}
                  type='button'
                  className='flex min-h-11 items-center justify-start px-4 text-left text-sm text-text-primary hover:bg-fill-content-hover'
                  onClick={() => openView(view.view_id)}
                >
                  <span className='truncate'>{view.name || 'Untitled'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className='rounded-300 border border-border-primary px-4 py-6 text-sm text-text-secondary'>
              No recent pages
            </div>
          )}
        </section>

        <section className='flex flex-col gap-3'>
          <h2 className='text-sm font-medium text-text-secondary'>Spaces</h2>
          {visibleSpaces.length > 0 ? (
            <div className='flex flex-col divide-y divide-border-primary rounded-300 border border-border-primary bg-surface-container-layer-00'>
              {visibleSpaces.map((view) => (
                <button
                  key={view.view_id}
                  type='button'
                  className='flex min-h-11 items-center justify-start px-4 text-left text-sm text-text-primary hover:bg-fill-content-hover'
                  onClick={() => openView(view.view_id)}
                >
                  <span className='truncate'>{view.name || 'Untitled'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className='rounded-300 border border-border-primary px-4 py-6 text-sm text-text-secondary'>
              No spaces yet
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default AppSectionPage;
