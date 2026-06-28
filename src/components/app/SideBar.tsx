import React, { lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Role, UIVariant } from '@/application/types';
import { OutlineDrawer } from '@/components/_shared/outline';
import { ReactComponent as FileIcon } from '@/assets/icons/file.svg';
import { ReactComponent as GraphIcon } from '@/assets/icons/hashtag.svg';
import { ReactComponent as HomeIcon } from '@/assets/icons/home.svg';
import { ReactComponent as SearchIcon } from '@/assets/icons/search.svg';
import { useUserWorkspaceInfo } from '@/components/app/app.hooks';
import { getAppSectionPath, type AppSection } from '@/components/app/navigation/appSections';
import NewPage from '@/components/app/view-actions/NewPage';
import { Workspaces } from '@/components/app/workspaces';
import { NotificationBell } from '@/components/notifications';
import { cn } from '@/lib/utils';

import Outline from 'src/components/app/outline/Outline';
import { Search } from 'src/components/app/search';


const SideBarBottom = lazy(() => import('@/components/app/SideBarBottom'));

const appNavigationItems: Array<{
  section: AppSection;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = [
  { section: 'home', label: 'Home', icon: HomeIcon },
  { section: 'library', label: 'Library', icon: FileIcon },
  { section: 'graph', label: 'Graph', icon: GraphIcon },
  { section: 'search', label: 'Search', icon: SearchIcon },
];

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

  const userWorkspaceInfo = useUserWorkspaceInfo();

  const role = userWorkspaceInfo?.selectedWorkspace.role;

  return (
    <OutlineDrawer
      onResizeWidth={onResizeDrawerWidth}
      width={drawerWidth}
      open={drawerOpened}
      variant={UIVariant.App}
      onClose={() => toggleOpenDrawer(false)}
      header={
        <div className="flex flex-1 items-center overflow-hidden">
          <Workspaces />
        </div>
      }
      rightActions={<NotificationBell />}
      onScroll={handleOnScroll}
    >
      <div className={'flex w-full flex-1 flex-col gap-1'}>
        <div
          className={'sticky top-12 z-[1] mx-1 flex-col items-center justify-around gap-2 bg-surface-container-layer-00'}
        >
          <AppNavigationTabs />
          <Search mode='shortcut' />
          {role === Role.Guest ? null : (
            <div
              style={{
                borderColor: scrollTop > 10 ? 'var(--border-primary)' : undefined,
              }}
              className={'flex w-full border-b border-transparent pb-3'}
            >
              <NewPage />
            </div>
          )}
        </div>

        <Outline width={drawerWidth} />

        {role === Role.Guest ? null : <SideBarBottom />}
      </div>
    </OutlineDrawer>
  );
}

export default SideBar;

function AppNavigationTabs() {
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const workspaceId = userWorkspaceInfo?.selectedWorkspace.id;
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav aria-label='Primary' className='flex w-full flex-col gap-1 pb-2'>
      {appNavigationItems.map(({ section, label, icon: Icon }) => {
        const path = getAppSectionPath(workspaceId, section);
        const active = location.pathname === path;

        return (
          <button
            key={section}
            type='button'
            className={cn(
              'flex min-h-8 w-full items-center justify-start gap-2 rounded-300 px-3 text-sm text-text-secondary hover:bg-fill-content-hover hover:text-text-primary',
              active && 'bg-fill-theme-select text-text-primary'
            )}
            disabled={!workspaceId}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              navigate(path);
            }}
          >
            <Icon className='h-4 w-4 shrink-0' />
            <span className='truncate'>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
