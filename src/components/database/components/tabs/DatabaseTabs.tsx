import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
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
import PageIcon from '@/components/_shared/view-icon/PageIcon';
import RenameModal from '@/components/app/view-actions/RenameModal';
import { DatabaseActions } from '@/components/database/components/conditions';
import DeleteViewConfirm from '@/components/database/components/tabs/DeleteViewConfirm';
import { DatabaseViewActions } from '@/components/database/components/tabs/ViewActions';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { TabLabel, Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    const views = useDatabase().get(YjsDatabaseKey.views);
    const context = useDatabaseContext();
    const onAddView = useAddDatabaseView();
    const { loadViewMeta, readOnly, showActions = true, eventEmitter } = context;
    const updatePage = useUpdateDatabaseView();
    const [meta, setMeta] = useState<View | null>(null);
    const scrollLeft = context.paddingStart;
    const [addLoading, setAddLoading] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>();
    const [renameViewId, setRenameViewId] = useState<string | null>();
    const [menuViewId, setMenuViewId] = useState<string | null>(null);

    const [tabsWidth, setTabsWidth] = useState<number | null>(null);
    const [tabsContainer, setTabsContainer] = useState<HTMLDivElement | null>(null);
    const [showScrollRightButton, setShowScrollRightButton] = useState(false);
    const [showScrollLeftButton, setShowScrollLeftButton] = useState(false);
    const [scrollerContainer, setScrollerContainer] = useState<HTMLDivElement | null>(null);

    const handleObserverScroller = useCallback(() => {
      if (scrollerContainer) {
        const scrollWidth = scrollerContainer.scrollWidth;
        const clientWidth = scrollerContainer.clientWidth;

        setShowScrollRightButton(
          scrollWidth > clientWidth && scrollerContainer.scrollLeft + 1 < scrollWidth - clientWidth
        );
        setShowScrollLeftButton(scrollerContainer.scrollLeft > 5);
      }
    }, [scrollerContainer]);

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

    useEffect(() => {
      if (!scrollerContainer) return;
      const onResize = () => {
        handleObserverScroller();
      };

      // Initial call to set the width
      onResize();

      const observer = new ResizeObserver(onResize);

      observer.observe(scrollerContainer);

      return () => {
        observer.disconnect();
      };
    }, [handleObserverScroller, scrollerContainer]);

    const reloadView = useCallback(async () => {
      if (loadViewMeta) {
        try {
          const meta = await loadViewMeta(iidIndex);

          setMeta(meta);
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

    const menuView = useMemo(() => {
      if (menuViewId === iidIndex) return meta;
      return meta?.children.find((v) => v.view_id === menuViewId);
    }, [iidIndex, menuViewId, meta]);

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

          await reloadView();
          setSelectedViewId?.(viewId);
          setTimeout(() => {
            document.getElementById(`view-tab-${viewId}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'center',
            });
          }, 200); // scroll to the new tab

          // eslint-disable-next-line
        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setAddLoading(false);
        }
      },
      [onAddView, setSelectedViewId, reloadView]
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
    if (viewIds.length === 0) return null;
    return (
      <div
        ref={ref}
        className={className}
        style={{
          paddingLeft: scrollLeft === undefined ? 96 : scrollLeft,
          paddingRight: scrollLeft === undefined ? 96 : scrollLeft,
        }}
      >
        <div className={`database-tabs flex w-full items-center gap-1.5 overflow-hidden border-b border-border-primary`}>
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
                tabIndex={-1}
                onClick={() => {
                  if (scrollerContainer) {
                    scrollerContainer.scrollTo({
                      left: scrollerContainer.scrollLeft - 200,
                      behavior: 'smooth',
                    });
                  }
                }}
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
                  tabIndex={-1}
                  onClick={() => {
                    if (scrollerContainer) {
                      scrollerContainer.scrollTo({
                        left: scrollerContainer.scrollLeft + 200,
                        behavior: 'smooth',
                      });
                    }
                  }}
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
              ref={(el: HTMLDivElement | null) => {
                setScrollerContainer(el);
                handleObserverScroller();
              }}
              onScroll={() => {
                handleObserverScroller();
              }}
            >
              <div
                ref={setTabsContainer}
                className={'w-fit'}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
              >
                <Tabs value={selectedViewId} className='relative flex h-full overflow-hidden'>
                  <TabsList className={'w-full'}>
                    {viewIds.map((viewId) => {
                      const view = views?.get(viewId) as YDatabaseView | null;

                      if (!view) return null;
                      const databaseLayout = Number(view.get(YjsDatabaseKey.layout)) as DatabaseViewLayout;
                      const folderView = viewId === iidIndex ? meta : meta?.children?.find((v) => v.view_id === viewId);

                      const name = folderView?.name || view.get(YjsDatabaseKey.name) || t('untitled');

                      return (
                        <TabsTrigger
                          key={viewId}
                          value={viewId}
                          id={`view-tab-${viewId}`}
                          data-testid={`view-tab-${viewId}`}
                          className={'min-w-[80px] max-w-[200px]'}
                        >
                          <TabLabel
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.button === 0 && selectedViewId !== viewId && setSelectedViewId) {
                                setSelectedViewId(viewId);
                                return;
                              }

                              if (viewId !== menuViewId) {
                                setMenuViewId(viewId);
                              } else {
                                setMenuViewId(null);
                              }
                            }}
                            className={'flex items-center gap-1.5 overflow-hidden'}
                          >
                            <PageIcon
                              iconSize={16}
                              view={
                                folderView || {
                                  layout:
                                    databaseLayout === DatabaseViewLayout.Board
                                      ? ViewLayout.Board
                                      : databaseLayout === DatabaseViewLayout.Calendar
                                      ? ViewLayout.Calendar
                                      : ViewLayout.Grid,
                                }
                              }
                              className={'!h-5 !w-5 text-base'}
                            />

                            <Tooltip delayDuration={500}>
                              <TooltipTrigger asChild>
                                <span
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                  }}
                                  className={'flex-1 truncate'}
                                >
                                  {name || t('grid.title.placeholder')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={10} side={'right'}>
                                {name}
                              </TooltipContent>
                            </Tooltip>
                          </TabLabel>
                          <DropdownMenu
                            modal
                            onOpenChange={(open) => {
                              if (!open) {
                                setMenuViewId(null);
                              }
                            }}
                            open={menuViewId === viewId}
                          >
                            <DropdownMenuTrigger asChild>
                              <div className={'pointer-events-none absolute bottom-0 left-0 opacity-0'} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              side={'bottom'}
                              align={'start'}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              {menuView && (
                                <DatabaseViewActions
                                  onClose={() => {
                                    setMenuViewId(null);
                                  }}
                                  onOpenDeleteModal={(viewId: string) => {
                                    setDeleteConfirmOpen(viewId);
                                  }}
                                  onOpenRenameModal={(viewId: string) => {
                                    setRenameViewId(viewId);
                                  }}
                                  deleteDisabled={viewId === iidIndex && visibleViewIds.length > 1}
                                  view={menuView}
                                  onUpdatedIcon={reloadView}
                                />
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TabsTrigger>
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
                    size={'icon'}
                    variant={'ghost'}
                    loading={addLoading}
                    className={'mx-1.5 mb-1.5 text-icon-secondary'}
                  >
                    {addLoading ? <Progress variant={'inherit'} /> : <PlusIcon className={'h-5 w-5'} />}
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
