import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { APP_EVENTS } from '@/application/constants';
import { useDatabase, useDatabaseContext } from '@/application/database-yjs';
import { useAddDatabaseView, useUpdateDatabaseView } from '@/application/database-yjs/dispatch';
import { DatabaseViewLayout, View, ViewLayout, YDatabaseView, YjsDatabaseKey } from '@/application/types';
import { ReactComponent as ChevronLeft } from '@/assets/icons/alt_arrow_left.svg';
import { ReactComponent as ChevronRight } from '@/assets/icons/alt_arrow_right.svg';
import { ReactComponent as PlusIcon } from '@/assets/icons/plus.svg';
import { findView } from '@/components/_shared/outline/utils';
import { AFScroller } from '@/components/_shared/scroller';
import { ViewIcon } from '@/components/_shared/view-icon';
import { useDatabaseViewSync } from '@/components/app/hooks/useViewSync';
import RenameModal from '@/components/app/view-actions/RenameModal';
import { DatabaseActions } from '@/components/database/components/conditions';
import { DatabaseTabItem } from '@/components/database/components/tabs/DatabaseTabItem';
import DeleteViewConfirm from '@/components/database/components/tabs/DeleteViewConfirm';
import { useTabScroller } from '@/components/database/components/tabs/useTabScroller';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList } from '@/components/ui/tabs';

export interface DatabaseTabBarProps {
  viewIds: string[];
  selectedViewId?: string;
  setSelectedViewId?: (viewId: string) => void;
  viewName?: string;
  iidIndex: string;
  hideConditions?: boolean;
}

export const DatabaseTabs = forwardRef<HTMLDivElement, DatabaseTabBarProps>(
  ({ viewIds, iidIndex, selectedViewId, setSelectedViewId }, ref) => {
    const { t } = useTranslation();
    const views = useDatabase()?.get(YjsDatabaseKey.views);
    const context = useDatabaseContext();
    const onAddView = useAddDatabaseView();
    const { loadViewMeta, readOnly, showActions = true, eventEmitter } = context;
    const updatePage = useUpdateDatabaseView();
    const [meta, setMeta] = useState<View | null>(null);
    const scrollLeftPadding = context.paddingStart;
    const [addLoading, setAddLoading] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>();
    const [renameViewId, setRenameViewId] = useState<string | null>();
    const [menuViewId, setMenuViewId] = useState<string | null>(null);

    const [tabsWidth, setTabsWidth] = useState<number | null>(null);
    const [tabsContainer, setTabsContainer] = useState<HTMLDivElement | null>(null);
    const tabRefs = useRef<Map<string, HTMLElement>>(new Map());

    const {
      setScrollerContainer,
      showScrollLeftButton,
      showScrollRightButton,
      scrollLeft,
      scrollRight,
      handleObserverScroller,
    } = useTabScroller();

    const { waitForViewData } = useDatabaseViewSync(views);

    const scrollToView = useCallback((viewId: string) => {
      const element = tabRefs.current.get(viewId);

      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
        return true;
      }
      return false;
    }, []);

    const [pendingScrollToViewId, setPendingScrollToViewId] = useState<string | null>(null);

    useEffect(() => {
      if (pendingScrollToViewId) {
        // Once the pending view is rendered and the ref is set, scroll to it
        // This effect runs whenever the tabRefs or pendingScrollToViewId changes
        const element = tabRefs.current.get(pendingScrollToViewId);

        if (element) {
          scrollToView(pendingScrollToViewId);
          setPendingScrollToViewId(null);
        }
      }
    }, [pendingScrollToViewId, viewIds, scrollToView]);

    useEffect(() => {
      const onResize = () => {
        if (tabsContainer) {
          const clientWidth = tabsContainer.clientWidth;

          setTabsWidth(clientWidth);
        }
      };

      // Initial call to set the width
      onResize();

      const observer = new ResizeObserver(onResize);

      if (tabsContainer) {
        observer.observe(tabsContainer);
      }

      return () => {
        if (tabsContainer) {
          observer.disconnect();
        }
      };
    }, [tabsContainer]);

    const reloadView = useCallback(async () => {
      if (loadViewMeta) {
        try {
          const meta = await loadViewMeta(iidIndex);

          setMeta(meta);
          return meta;
        } catch (e) {
          // do nothing
        }
      }
    }, [iidIndex, loadViewMeta]);

    useEffect(() => {
      const handleOutlineLoaded = (outline: View[]) => {
        const view = findView(outline, iidIndex);

        if (view) {
          setMeta(view);
        }
      };

      if (eventEmitter) {
        eventEmitter.on(APP_EVENTS.OUTLINE_LOADED, handleOutlineLoaded);
      }

      return () => {
        if (eventEmitter) {
          eventEmitter.off(APP_EVENTS.OUTLINE_LOADED, handleOutlineLoaded);
        }
      };
    }, [iidIndex, eventEmitter, reloadView]);

    const renameView = useMemo(() => {
      if (renameViewId === iidIndex) return meta;
      return meta?.children.find((v) => v.view_id === renameViewId);
    }, [iidIndex, meta, renameViewId]);

    const visibleViewIds = useMemo(() => {
      return viewIds.filter((viewId) => {
        const databaseView = views?.get(viewId) as YDatabaseView | null;

        return !!databaseView;
      });
    }, [viewIds, views]);

    const handleAddView = useCallback(
      async (layout: DatabaseViewLayout) => {
        setAddLoading(true);
        try {
          const viewId = await onAddView(layout);

          if (setSelectedViewId) {
            setSelectedViewId(viewId);
          }
          setPendingScrollToViewId(viewId);

        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setAddLoading(false);
        }
      },
      [onAddView, reloadView, waitForViewData, setSelectedViewId]
    );

    useEffect(() => {
      void reloadView();
    }, [reloadView]);

    const className = useMemo(() => {
      const classList = [
        '-mb-[0.5px] flex items-center  text-text-primary flex-col  max-sm:!px-6 min-w-0 overflow-hidden',
      ];

      return classList.join(' ');
    }, []);

    useEffect(() => {
      const preventDefault = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (menuViewId) {
        document.addEventListener('contextmenu', preventDefault);
      } else {
        document.removeEventListener('contextmenu', preventDefault);
      }

      return () => {
        document.removeEventListener('contextmenu', preventDefault);
      };
    }, [menuViewId]);

    const setTabRef = useCallback((viewId: string, el: HTMLElement | null) => {
      if (el) {
        tabRefs.current.set(viewId, el);
      } else {
        tabRefs.current.delete(viewId);
      }
    }, []);

    if (viewIds.length === 0) return null;
    return (
      <div
        ref={ref}
        className={className}
        style={{
          paddingLeft: scrollLeftPadding === undefined ? 96 : scrollLeftPadding,
          paddingRight: scrollLeftPadding === undefined ? 96 : scrollLeftPadding,
        }}
      >
        <div
          className={`database-tabs flex w-full items-center gap-1.5 overflow-hidden border-b border-border-primary`}
        >
          <div className='relative flex h-[34px] flex-1 items-end justify-start overflow-hidden'>
            {showScrollLeftButton && (
              <Button
                size={'icon'}
                style={{
                  boxShadow: 'var(--surface-primary) 16px 0px 16px',
                }}
                className={
                  'absolute left-0 top-0 z-10 bg-surface-primary text-icon-secondary hover:bg-surface-primary-hover '
                }
                variant={'ghost'}
                onClick={scrollLeft}
              >
                <ChevronLeft className={'h-5 w-5'} />
              </Button>
            )}
            {showScrollRightButton && (
              <div>
                <Button
                  size={'icon'}
                  style={{
                    boxShadow: 'var(--surface-primary) -16px 0px 16px',
                  }}
                  className={
                    'absolute right-9 top-0 z-10 bg-surface-primary text-icon-secondary hover:bg-surface-primary-hover'
                  }
                  variant={'ghost'}
                  onClick={scrollRight}
                >
                  <ChevronRight className={'h-5 w-5'} />
                </Button>
              </div>
            )}
            <AFScroller
              hideScrollbars
              style={{
                width: tabsWidth || undefined,
              }}
              className={'relative flex h-full flex-1'}
              overflowYHidden
              ref={setScrollerContainer}
              onScroll={handleObserverScroller}
            >
              <div
                ref={setTabsContainer}
                className={'w-fit'}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
              >
                <Tabs
                  value={selectedViewId || viewIds[0] || iidIndex}
                  onValueChange={(viewId) => {
                    if (setSelectedViewId) {
                      setSelectedViewId(viewId);
                    }
                  }}
                  className='relative flex h-full overflow-hidden'
                >
                  <TabsList className={'w-full'}>
                    {viewIds.map((viewId) => {
                      const view = views?.get(viewId) as YDatabaseView | null;

                      if (!view) return null;

                      return (
                        <DatabaseTabItem
                          key={viewId}
                          viewId={viewId}
                          view={view}
                          meta={meta}
                          iidIndex={iidIndex}
                          menuViewId={menuViewId}
                          readOnly={!!readOnly}
                          visibleViewIds={visibleViewIds}
                          onSetMenuViewId={setMenuViewId}
                          onOpenDeleteModal={setDeleteConfirmOpen}
                          onOpenRenameModal={setRenameViewId}
                          onReloadView={reloadView}
                          setTabRef={setTabRef}
                        />
                      );
                    })}
                  </TabsList>
                </Tabs>
              </div>
            </AFScroller>

            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid='add-view-button'
                    size={'icon'}
                    variant={'ghost'}
                    loading={addLoading}
                    className={'mx-1.5 mb-1.5 text-icon-secondary'}
                  >
                    {addLoading ? (
                      <Progress variant={'inherit'} />
                    ) : (
                      <PlusIcon className={'h-5 w-5'} />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side={'bottom'}
                  align={'start'}
                  className={'!min-w-[120px]'}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleAddView(DatabaseViewLayout.Grid);
                    }}
                  >
                    <ViewIcon layout={ViewLayout.Grid} size={'small'} />
                    {t('grid.menuName')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleAddView(DatabaseViewLayout.Board);
                    }}
                  >
                    <ViewIcon layout={ViewLayout.Board} size={'small'} />
                    {t('board.menuName')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleAddView(DatabaseViewLayout.Calendar);
                    }}
                  >
                    <ViewIcon layout={ViewLayout.Calendar} size={'small'} />
                    {t('calendar.menuName')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {!readOnly ? (
            <div style={{ opacity: showActions ? 1 : 0 }} className={'mb-1 ml-auto'}>
              <DatabaseActions />
            </div>
          ) : null}
        </div>

        {renameView && Boolean(renameViewId) && (
          <RenameModal
            open={Boolean(renameViewId)}
            onClose={() => {
              setRenameViewId(null);
            }}
            view={renameView}
            updatePage={async (viewId, payload) => {
              await updatePage(viewId, payload);
              void reloadView();
            }}
            viewId={renameViewId || ''}
          />
        )}

        <DeleteViewConfirm
          viewId={deleteConfirmOpen || ''}
          open={Boolean(deleteConfirmOpen)}
          onClose={() => {
            setDeleteConfirmOpen(null);
          }}
          onDeleted={() => {
            if (!meta) return;

            if (setSelectedViewId) {
              setSelectedViewId(meta.view_id);
            }

            void reloadView();
          }}
        />
      </div>
    );
  }
);

DatabaseTabs.displayName = 'DatabaseTabs';