import {
    DatabaseViewLayout,
    View,
    ViewLayout,
    YDatabaseView,
    YjsDatabaseKey,
} from '@/application/types';
import PageIcon from '@/components/_shared/view-icon/PageIcon';
import { DatabaseViewActions } from '@/components/database/components/tabs/ViewActions';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TabLabel, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface DatabaseTabItemProps {
    viewId: string;
    view: YDatabaseView;
    meta: View | null;
    iidIndex: string;
    menuViewId: string | null;
    readOnly: boolean;
    visibleViewIds: string[];
    onSetMenuViewId: (id: string | null) => void;
    onOpenDeleteModal: (id: string) => void;
    onOpenRenameModal: (id: string) => void;
    onReloadView: () => void;
    setTabRef: (id: string, el: HTMLElement | null) => void;
}

export const DatabaseTabItem = memo(
    ({
        viewId,
        view,
        meta,
        iidIndex,
        menuViewId,
        readOnly,
        visibleViewIds,
        onSetMenuViewId,
        onOpenDeleteModal,
        onOpenRenameModal,
        onReloadView,
        setTabRef,
    }: DatabaseTabItemProps) => {
        const { t } = useTranslation();
        const rawLayoutValue = view.get(YjsDatabaseKey.layout);
        const databaseLayout = Number(rawLayoutValue) as DatabaseViewLayout;
        const folderView =
            viewId === iidIndex ? meta : meta?.children?.find((v) => v.view_id === viewId);

        // Get the default name based on layout if no name is available
        const getDefaultNameByLayout = () => {
            switch (databaseLayout) {
                case DatabaseViewLayout.Grid:
                    return 'Grid';
                case DatabaseViewLayout.Board:
                    return 'Board';
                case DatabaseViewLayout.Calendar:
                    return 'Calendar';
                default:
                    return t('untitled');
            }
        };

        // Always prioritize Yjs name (it's immediately available and always correct)
        // folderView.name comes from async API and can be stale
        // Fall back to default name based on layout type
        const name = view.get(YjsDatabaseKey.name) || getDefaultNameByLayout();

        // Compute the layout that will be passed to PageIcon
        const computedLayout =
            databaseLayout === DatabaseViewLayout.Board
                ? ViewLayout.Board
                : databaseLayout === DatabaseViewLayout.Calendar
                    ? ViewLayout.Calendar
                    : ViewLayout.Grid;

        // Create the view object that will be passed to PageIcon
        // IMPORTANT: Don't spread the entire folderView to avoid layout conflicts
        // Only include the icon property (PageIcon doesn't use name)
        const pageIconView = {
            icon: folderView?.icon,
            layout: computedLayout,
        };


        const menuView = useMemo(() => {
            if (menuViewId === iidIndex) return meta;
            return meta?.children.find((v) => v.view_id === menuViewId);
        }, [iidIndex, menuViewId, meta]);

        return (
            <TabsTrigger
                key={viewId}
                value={viewId}
                id={`view-tab-${viewId}`}
                data-testid={`view-tab-${viewId}`}
                className={'min-w-[80px] max-w-[200px]'}
                ref={(el) => {
                    setTabRef(viewId, el);
                }}
            >
                <TabLabel
                    onPointerDown={(e) => {
                        // For left-click, let Radix UI tabs handle it via onValueChange
                        if (e.button === 0) {
                            return;
                        }

                        // For right-click and other buttons, prevent default and handle menu
                        e.preventDefault();
                        e.stopPropagation();

                        if (readOnly) return;

                        if (viewId !== menuViewId) {
                            onSetMenuViewId(viewId);
                        } else {
                            onSetMenuViewId(null);
                        }
                    }}
                    className={'flex items-center gap-1.5 overflow-hidden'}
                >
                    <PageIcon
                        key={`${viewId}-${computedLayout}`}
                        iconSize={16}
                        view={pageIconView}
                        className={'!h-5 !w-5 text-base leading-[1.3rem]'}
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
                            onSetMenuViewId(null);
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
                                    onSetMenuViewId(null);
                                }}
                                onOpenDeleteModal={(viewId: string) => {
                                    onOpenDeleteModal(viewId);
                                }}
                                onOpenRenameModal={(viewId: string) => {
                                    onOpenRenameModal(viewId);
                                }}
                                deleteDisabled={viewId === iidIndex && visibleViewIds.length > 1}
                                view={menuView}
                                onUpdatedIcon={onReloadView}
                            />
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </TabsTrigger>
        );
    }
);

DatabaseTabItem.displayName = 'DatabaseTabItem';

