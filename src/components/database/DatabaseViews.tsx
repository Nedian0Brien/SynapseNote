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
  fixedHeight,
}: {
  onChangeView: (viewId: string) => void;
  viewId: string;
  iidIndex: string;
  viewName?: string;
  visibleViewIds?: string[];
  fixedHeight?: number;
}) {
  const { childViews, viewIds } = useDatabaseViewsSelector(iidIndex, visibleViewIds);

  const [isLoading, setIsLoading] = useState(false);
  const [layout, setLayout] = useState<DatabaseViewLayout | null>(null);
  const [viewVisible, setViewVisible] = useState(true);
  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(fixedHeight ?? null);
  const lastScrollRef = useRef<number | null>(null);
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
      const currentHeight = viewContainerRef.current?.offsetHeight ?? null;
      logDebug('[DatabaseViews] layout set', {
        layout: Number(activeView.get(YjsDatabaseKey.layout)),
        viewId,
        iidIndex,
        currentHeight,
      });
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
      lastScrollRef.current = scrollElement?.scrollTop ?? null;
      logDebug('[DatabaseViews] captured scroll before view change', {
        scrollTop: lastScrollRef.current,
      });

      const currentHeight = viewContainerRef.current?.offsetHeight;
      const heightToLock = fixedHeight ?? currentHeight ?? null;
      setLockedHeight(heightToLock ?? null);
      logDebug('[DatabaseViews] handleViewChange height lock', {
        currentHeight,
        fixedHeight,
        heightToLock,
      });
      setIsLoading(true);
      setViewVisible(false); // Hide view during transition to prevent flash
      onChangeView(newViewId);
    },
    [fixedHeight, onChangeView]
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

  // Simple conditional rendering - Board's autoScrollForElements doesn't support keep-alive
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
    if (!isLoading && viewContainerRef.current) {
      const h = viewContainerRef.current.offsetHeight;
      if (h > 0) {
        logDebug('[DatabaseViews] measured container height', {
          height: h,
          viewId,
          iidIndex,
          layout,
        });
      }
    }
  }, [isLoading, viewVisible, layout, viewId]);

  // Scroll restoration with RAF enforcement
  // Even with keep-mounted, Board's autoScrollForElements can still interfere on first switch
  useEffect(() => {
    if (isLoading) return;
    if (lastScrollRef.current == null) return;

    const scrollElement = getScrollElement();
    if (!scrollElement) {
      lastScrollRef.current = null;
      return;
    }

    const targetScroll = lastScrollRef.current;
    let rafCount = 0;
    let rafId: number;

    // Use RAF loop to enforce scroll position
    // This handles Board's autoScrollForElements which may still interfere on first display
    const enforceScroll = () => {
      const currentScroll = scrollElement.scrollTop;
      const delta = Math.abs(currentScroll - targetScroll);

      if (delta > 0.5) {
        scrollElement.scrollTop = targetScroll;
        logDebug('[DatabaseViews] RAF restore scroll', {
          frame: rafCount,
          target: targetScroll,
          current: currentScroll,
          delta,
        });
      }

      rafCount++;
      // Run for 3 frames (~48ms) - shorter than before since views stay mounted
      if (rafCount < 3) {
        rafId = requestAnimationFrame(enforceScroll);
      } else {
        logDebug('[DatabaseViews] scroll restoration completed', {
          final: scrollElement.scrollTop,
          target: targetScroll,
        });
        lastScrollRef.current = null;
        setViewVisible(true);
      }
    };

    rafId = requestAnimationFrame(enforceScroll);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isLoading, viewId]);

  useEffect(() => {
    setLockedHeight(fixedHeight ?? null);
  }, [fixedHeight]);

  useEffect(() => {
    if (!viewContainerRef.current) return;
    const rect = viewContainerRef.current.getBoundingClientRect();
    logDebug('[DatabaseViews] container render', {
      height: rect.height,
      lockedHeight,
      fixedHeight,
      isLoading,
      viewVisible,
      viewId,
      layout,
    });
  }, [lockedHeight, fixedHeight, isLoading, viewVisible, viewId, layout]);

  const effectiveHeight = lockedHeight ?? fixedHeight ?? null;

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
          style={
            effectiveHeight !== null
              ? { height: `${effectiveHeight}px` }
              : undefined
          }
        >
          <div
            className='h-full w-full transition-opacity duration-100'
            style={{
              ...(effectiveHeight !== null
                ? { minHeight: `${effectiveHeight}px`, height: `${effectiveHeight}px` }
                : {}),
              opacity: viewVisible ? 1 : 0,
              pointerEvents: viewVisible ? undefined : 'none',
            }}
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
