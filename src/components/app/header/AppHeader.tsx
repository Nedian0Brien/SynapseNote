import { IconButton } from '@mui/material';
import { lazy, memo, Suspense, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { UIVariant } from '@/application/types';
import { ReactComponent as DoubleArrowRight } from '@/assets/icons/double_arrow_right.svg';
import { Breadcrumb } from '@/components/_shared/breadcrumb';
import { useOutlinePopover } from '@/components/_shared/outline/outline.hooks';
import OutlinePopover from '@/components/_shared/outline/OutlinePopover';
import BreadcrumbSkeleton from '@/components/_shared/skeleton/BreadcrumbSkeleton';
import { useAppRendered, useToView, useBreadcrumb } from '@/components/app/app.hooks';
import LockedBadge from '@/components/app/header/LockedBadge';
import { isAppSection } from '@/components/app/navigation/appSections';
import Recent from '@/components/app/recent/Recent';
import { SettingsDialog } from '@/components/app/settings';
import { ThemeModeContext } from '@/components/main/useAppThemeMode';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copyTextToClipboard } from '@/utils/copy';

const RightMenu = lazy(() => import('@/components/app/header/RightMenu'));

interface AppHeaderProps {
  onOpenDrawer: () => void;
  drawerWidth: number;
  openDrawer: boolean;
  onCloseDrawer: () => void;
}

const HEADER_HEIGHT = 48;

const SECTION_META = {
  home: {
    icon: 'home',
    label: 'Home',
  },
  library: {
    icon: 'folder_open',
    label: 'Library',
  },
  graph: {
    icon: 'hub',
    label: 'Graph',
  },
  agent: {
    icon: 'auto_awesome',
    label: 'Agent',
  },
} as const;

export function AppHeader({ onOpenDrawer, openDrawer, onCloseDrawer }: AppHeaderProps) {
  const location = useLocation();
  const themeMode = useContext(ThemeModeContext);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { openPopover, debounceClosePopover, handleOpenPopover, debounceOpenPopover, handleClosePopover } =
    useOutlinePopover({
      onOpenDrawer,
      openDrawer,
      onCloseDrawer,
    });

  const isTrash = window.location.pathname === '/app/trash';

  const crumbs = useBreadcrumb();

  const displayMenuButton = !openDrawer && window.innerWidth >= 480;

  const toView = useToView();
  const rendered = useAppRendered();

  const recent = useMemo(() => <Recent />, []);
  const section = location.pathname.split('/')[3];
  const sectionMeta = isAppSection(section) ? SECTION_META[section] : null;

  const copyCurrentUrl = useCallback(async () => {
    try {
      await copyTextToClipboard(window.location.href);
      toast.success('링크를 복사했습니다.');
    } catch {
      toast.error('링크를 복사하지 못했습니다.');
    }
  }, []);

  const shareCurrentUrl = useCallback(async () => {
    const payload = {
      title: sectionMeta?.label ?? document.title,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await copyTextToClipboard(payload.url);
        toast.success('링크를 복사했습니다.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('공유를 완료하지 못했습니다.');
    }
  }, [sectionMeta?.label]);

  if (sectionMeta) {
    return (
      <>
        <div className='topbar synapsenote-top-bar sticky top-0 z-[100]'>
          {!openDrawer ? (
            <button className='iconbtn' title='사이드바 열기' aria-label='사이드바 열기' onClick={onOpenDrawer}>
              <span className='icon'>dock_to_right</span>
            </button>
          ) : null}
          <div className='crumb'>
            <span className='icon'>{sectionMeta.icon}</span>
            <b>{sectionMeta.label}</b>
          </div>
          <div className='spacer' />
          <button className='iconbtn' title='공유' aria-label='공유' onClick={() => void shareCurrentUrl()}>
            <span className='icon'>ios_share</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='iconbtn' title='더보기' aria-label='더보기'>
                <span className='icon'>more_horiz</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onSelect={() => void copyCurrentUrl()}>링크 복사</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>설정 열기</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className='iconbtn'
            title='라이트/다크 전환'
            aria-label='라이트/다크 전환'
            onClick={() => themeMode?.setDark(!themeMode.isDark)}
          >
            <span className='icon'>contrast</span>
          </button>
        </div>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onRequestOpen={() => setSettingsOpen(true)} />
      </>
    );
  }

  return (
    <div
      style={{
        backdropFilter: 'saturate(180%) blur(16px)',
        background: 'var(--bg-header)',
        height: HEADER_HEIGHT,
        minHeight: HEADER_HEIGHT,
      }}
      className={'synapsenote-top-bar sticky top-0 z-[100] flex transform-gpu px-5'}
    >
      <div className={'flex w-full items-center justify-between gap-4 overflow-hidden'}>
        {displayMenuButton && (
          <OutlinePopover
            {...{
              onMouseEnter: handleOpenPopover,
              onMouseLeave: debounceClosePopover,
            }}
            open={openPopover}
            onClose={debounceClosePopover}
            content={recent}
          >
            <IconButton
              size={'small'}
              {...{
                onMouseEnter: debounceOpenPopover,
                onMouseLeave: debounceClosePopover,
                onClick: () => {
                  handleClosePopover();
                  onOpenDrawer();
                },
              }}
            >
              <DoubleArrowRight className={'text-text-secondary'} />
            </IconButton>
          </OutlinePopover>
        )}
        <div className={'h-full flex-1 overflow-hidden'}>
          {isTrash || (crumbs && crumbs.length === 0) ? null : !crumbs ? (
            <div className={'flex h-[48px] items-center'}>
              <BreadcrumbSkeleton />
            </div>
          ) : (
            <Breadcrumb toView={toView} variant={UIVariant.App} crumbs={crumbs} />
          )}
        </div>
        <LockedBadge />
        {rendered && (
          <Suspense fallback={null}>
            <RightMenu />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default memo(AppHeader);
