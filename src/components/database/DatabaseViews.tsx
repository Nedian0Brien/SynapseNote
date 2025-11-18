import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { useDatabaseViewsSelector } from '@/application/database-yjs';
import { DatabaseViewLayout, YjsDatabaseKey } from '@/application/types';
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
  document.querySelector('.appflowy-scroll-container');

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
  }, [activeView, iidIndex, viewId]);

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


  const view = useMemo(() => {
    if (isLoading) return null;
    switch (layout) {
      case DatabaseViewLayout.Grid:
        return <Grid />;
      case DatabaseViewLayout.Board:
        return <Board />;
      case DatabaseViewLayout.Calendar:
        return <Calendar />;
    }
  }, [layout, isLoading]);

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
  }, [isLoading, viewVisible, layout, viewId, iidIndex]);

  // Scroll restoration with RAF enforcement
  // Board's autoScrollForElements interferes with scroll, so we enforce for multiple frames
  useEffect(() => {
    if (isLoading) return;
    if (lastScrollRef.current === null) return;

    const scrollElement = getScrollElement();

    if (!scrollElement) {
      lastScrollRef.current = null;
      return;
    }

    const targetScroll = lastScrollRef.current;
    let rafCount = 0;
    let rafId: number;

    // Temporarily prevent scroll events during restoration
    const preventScroll = (e: Event) => {
      if (scrollElement.scrollTop !== targetScroll) {
        e.preventDefault();
        scrollElement.scrollTop = targetScroll;
      }
    };

    scrollElement.addEventListener('scroll', preventScroll, { passive: false });

    // Use RAF loop to enforce scroll position
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
      // Run for 5 frames (~80ms) to catch delayed scroll changes from Board mount
      if (rafCount < 5) {
        rafId = requestAnimationFrame(enforceScroll);
      } else {
        logDebug('[DatabaseViews] scroll restoration completed', {
          final: scrollElement.scrollTop,
          target: targetScroll,
        });
        // Remove scroll listener and clean up
        scrollElement.removeEventListener('scroll', preventScroll);
        lastScrollRef.current = null;
        setViewVisible(true);
        // Release height lock to allow view to resize to its natural height
        if (!fixedHeight) {
          setLockedHeight(null);
        }
      }
    };

    rafId = requestAnimationFrame(enforceScroll);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      scrollElement.removeEventListener('scroll', preventScroll);
    };
  }, [isLoading, viewId, fixedHeight]);

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
  }, [lockedHeight, fixedHeight, isLoading, viewVisible, viewId, layout, iidIndex]);

  // Only use locked height during transitions (isLoading) or if fixedHeight is explicitly set
  // This prevents the empty space issue when filters/sorts expand/collapse
  const effectiveHeight = isLoading ? (lockedHeight ?? fixedHeight ?? null) : (fixedHeight ?? null);

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
              ? { height: `${effectiveHeight}px`, maxHeight: `${effectiveHeight}px` }
              : undefined
          }
        >
          <div
            className='h-full w-full'
            style={
              effectiveHeight !== null
                ? { height: `${effectiveHeight}px`, maxHeight: `${effectiveHeight}px` }
                : {}
            }
          >
            <Suspense fallback={null}>
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
