import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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

import DatabaseConditions from 'src/components/database/components/conditions/DatabaseConditions';

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

  const [layout, setLayout] = useState<DatabaseViewLayout | null>(null);
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
    };

    observerEvent();

    activeView.observe(observerEvent);

    return () => {
      activeView.unobserve(observerEvent);
    };
  }, [activeView]);

  const view = useMemo(() => {
    // 使用 viewId 和 layout 的组合作为 key，确保在任一变化时都有动画
    const animationKey = `${layout}-${viewId}`;
    
    switch (layout) {
      case DatabaseViewLayout.Grid:
        return (
          <motion.div
            key={animationKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.15,
              ease: 'easeOut',
            }}
            className="h-full w-full"
          >
            <Grid />
          </motion.div>
        );
      case DatabaseViewLayout.Board:
        return (
          <motion.div
            key={animationKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.15,
              ease: 'easeOut',
            }}
            className="h-full w-full"
          >
            <Board />
          </motion.div>
        );
      case DatabaseViewLayout.Calendar:
        return (
          <motion.div
            key={animationKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.15,
              ease: 'easeOut',
            }}
            className="h-full w-full"
          >
            <Calendar />
          </motion.div>
        );
    }
  }, [layout, viewId]);

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
          setSelectedViewId={onChangeView}
          viewIds={viewIds}
        />
        <DatabaseConditions />

        <div className={'flex h-full w-full flex-1 flex-col overflow-hidden'}>
          <Suspense fallback={skeleton}>
            <ErrorBoundary fallbackRender={ElementFallbackRender}>
              <AnimatePresence mode="wait">
                {view}
              </AnimatePresence>
            </ErrorBoundary>
          </Suspense>
        </div>
      </DatabaseConditionsContext.Provider>
    </>
  );
}

export default DatabaseViews;
