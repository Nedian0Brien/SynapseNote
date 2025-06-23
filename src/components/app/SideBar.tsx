import React, { lazy } from 'react';

import { UIVariant } from '@/application/types';
import NewPage from '@/components/app/view-actions/NewPage';
import { Workspaces } from '@/components/app/workspaces';
import { OutlineDrawer } from '@/components/_shared/outline';

import Outline from 'src/components/app/outline/Outline';
import { Search } from 'src/components/app/search';

const SideBarBottom = lazy(() => import('@/components/app/SideBarBottom'));

interface SideBarProps {
  drawerWidth: number;
  drawerOpened: boolean;
  toggleOpenDrawer: (status: boolean) => void;
  onResizeDrawerWidth: (width: number) => void;
}

function SideBar({ drawerWidth, drawerOpened, toggleOpenDrawer, onResizeDrawerWidth }: SideBarProps) {
  const [scrollTop, setScrollTop] = React.useState<number>(0);

  const handleOnScroll = React.useCallback((scrollTop: number) => {
    setScrollTop(scrollTop);
  }, []);

  return (
    <OutlineDrawer
      onResizeWidth={onResizeDrawerWidth}
      width={drawerWidth}
      open={drawerOpened}
      variant={UIVariant.App}
      onClose={() => toggleOpenDrawer(false)}
      header={<Workspaces />}
      onScroll={handleOnScroll}
    >
      <div className={'flex w-full flex-1 flex-col gap-1'}>
        <div className={'sticky top-12 z-[1] flex-col items-center justify-around gap-2 bg-surface-layer-01 px-[10px]'}>
          <Search />
          <div
            style={{
              borderColor: scrollTop > 10 ? 'var(--border-primary)' : undefined,
            }}
            className={'flex w-full border-b border-transparent pb-3'}
          >
            <NewPage />
          </div>
        </div>

        <Outline width={drawerWidth} />

        <SideBarBottom />
      </div>
    </OutlineDrawer>
  );
}

export default SideBar;
