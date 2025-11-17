import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { useDatabaseViewsSelector } from '@/application/database-yjs';
import { DatabaseViewLayout, YjsDatabaseKey } from '@/application/types';
import CalendarSkeleton from '@/components/_shared/skeleton/CalendarSkeleton';
import GridSkeleton from '@/components/_shared/skeleton/GridSkeleton';
import KanbanSkeleton from '@/components/_shared/skeleton/KanbanSkeleton';
import { Board } from '@/components/database/board';
import { DatabaseConditionsContext } from '@/components/database/components/conditions/context';
import { DatabaseTabs } from '@/components/database/components/tabs';
import { Calendar } from '@/components/database/fullcalendar';
import { Grid } from '@/components/database/grid';
import { ElementFallbackRender } from '@/components/error/ElementFallbackRender';
import { Progress } from '@/components/ui/progress';

import DatabaseConditions from 'src/components/database/components/conditions/DatabaseConditions';

const logDebug = (...args: Parameters<typeof console.debug>) => {
  if (import.meta.env.DEV) {
    console.debug(...args);
  }
};

const getScrollElement = () =>
  document.querySelector('.appflowy-scroll-container') as HTMLElement | null;

function DatabaseViews({
  onChangeView,
  viewId,
  iidIndex,
  viewName,
  visibleViewIds,
}: {
  onChangeView: (viewId: string) => void;
  viewId: string;
  iidIndex: string;
  viewName?: string;
  visibleViewIds?: string[];
}) {
  const { childViews, viewIds } = useDatabaseViewsSelector(iidIndex, visibleViewIds);

  const [isLoading, setIsLoading] = useState(false);
  const [layout, setLayout] = useState<DatabaseViewLayout | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const restoreRafRef = useRef<number>();
  const [viewVisible, setViewVisible] = useState(true);
  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const value = useMemo(() => {
    return Math.max(
      0,
      viewIds.findIndex((id) => id === viewId)
    );
  }, [viewId, viewIds]);

  const [conditionsExpanded, setConditionsExpanded] = useState<boolean>(false);
  const toggleExpanded = useCallback(() => {
    setConditionsExpanded((prev) => !prev);
  }, []);
  const [openFilterId, setOpenFilterId] = useState<string>();

  const activeView = useMemo(() => {
    return childViews[value];
  }, [childViews, value]);

  useEffect(() => {
    if (!activeView) return;

    const observerEvent = () => {
      setLayout(Number(activeView.get(YjsDatabaseKey.layout)) as DatabaseViewLayout);
      setIsLoading(false);
    };

    observerEvent();

    activeView.observe(observerEvent);

    return () => {
      activeView.unobserve(observerEvent);
    };
  }, [activeView]);

  const handleViewChange = useCallback(
    (newViewId: string) => {
      const scrollElement = getScrollElement();
      pendingScrollTopRef.current = scrollElement?.scrollTop ?? null;
      logDebug('[DatabaseViews] captured scroll before view change', {
        scrollTop: pendingScrollTopRef.current,
      });

      setLockedHeight(viewContainerRef.current?.offsetHeight ?? null);
      setViewVisible(false);
      setIsLoading(true);
      onChangeView(newViewId);
    },
    [onChangeView]
  );

  const skeleton = useMemo(() => {
    switch (layout) {
      case DatabaseViewLayout.Grid:
        return <GridSkeleton includeTitle={false} includeTabs={false} />;
      case DatabaseViewLayout.Board:
        return <KanbanSkeleton includeTitle={false} includeTabs={false} />;
      case DatabaseViewLayout.Calendar:
        return <CalendarSkeleton includeTitle={false} includeTabs={false} />;
      default:
        return null;
    }
  }, [layout]);

  const view = useMemo(() => {
    if (isLoading) return skeleton;
    switch (layout) {
      case DatabaseViewLayout.Grid:
        return <Grid />;
      case DatabaseViewLayout.Board:
        return <Board />;
      case DatabaseViewLayout.Calendar:
        return <Calendar />;
    }
  }, [layout, isLoading, skeleton]);

  useEffect(() => {
    if (isLoading) return;
    if (pendingScrollTopRef.current == null) return;

    const scrollElement = getScrollElement();
    if (!scrollElement) return;

    const target = pendingScrollTopRef.current;
    if (restoreRafRef.current !== undefined) {
      cancelAnimationFrame(restoreRafRef.current);
    }

    let start = performance.now();
    setViewVisible(false);
    const enforce = () => {
      const delta = scrollElement.scrollTop - target;
      if (Math.abs(delta) > 0.5) {
        scrollElement.scrollTop = target;
        logDebug('[DatabaseViews] enforcing scroll position', {
          target,
          applied: scrollElement.scrollTop,
          delta,
        });
      }

      if (performance.now() - start < 350) {
        restoreRafRef.current = requestAnimationFrame(enforce);
      } else {
        pendingScrollTopRef.current = null;
        restoreRafRef.current = undefined;
        setViewVisible(true);
        setLockedHeight(null);
        logDebug('[DatabaseViews] scroll enforcement completed', {
          final: scrollElement.scrollTop,
        });
      }
    };

    restoreRafRef.current = requestAnimationFrame(enforce);

    return () => {
      if (restoreRafRef.current !== undefined) {
        cancelAnimationFrame(restoreRafRef.current);
        restoreRafRef.current = undefined;
      }
    };
  }, [isLoading, layout, viewId]);

  return (
    <>
      <DatabaseConditionsContext.Provider
        value={{
          expanded: conditionsExpanded,
          toggleExpanded,
          openFilterId,
          setOpenFilterId,
        }}
      >
        <DatabaseTabs
          viewName={viewName}
          iidIndex={iidIndex}
          selectedViewId={viewId}
          setSelectedViewId={handleViewChange}
          viewIds={viewIds}
        />
        <DatabaseConditions />

        <div
          ref={viewContainerRef}
          className={'relative flex h-full w-full flex-1 flex-col overflow-hidden'}
          style={lockedHeight !== null ? { height: `${lockedHeight}px` } : undefined}
        >
          <div
            className='h-full w-full transition-opacity duration-75'
            style={{ opacity: viewVisible ? 1 : 0, pointerEvents: viewVisible ? undefined : 'none' }}
            aria-hidden={!viewVisible}
          >
            <Suspense fallback={skeleton}>
              <ErrorBoundary fallbackRender={ElementFallbackRender}>{view}</ErrorBoundary>
            </Suspense>
          </div>
          {isLoading && (
            <div className='absolute inset-0 z-50 flex items-center justify-center bg-background-primary/70 backdrop-blur-sm'>
              <Progress />
            </div>
          )}
        </div>
      </DatabaseConditionsContext.Provider>
    </>
  );
}

export default DatabaseViews;
