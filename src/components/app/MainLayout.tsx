import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation } from 'react-router-dom';

import { useOutlineDrawer } from '@/components/_shared/outline/outline.hooks';
import { AFScroller } from '@/components/_shared/scroller';
import { useAIChatContextOptional } from '@/components/ai-chat/AIChatProvider';
import { useOpenModalViewId, useAppViewId, useViewErrorStatus } from '@/components/app/app.hooks';
import { ConnectBanner } from '@/components/app/ConnectBanner';
import { AppHeader } from '@/components/app/header';
import Main from '@/components/app/Main';
import { isAppSection } from '@/components/app/navigation/appSections';
import SideBar from '@/components/app/SideBar';
import DeletedPageComponent from '@/components/error/PageHasBeenDeleted';
import RecordNotFound from '@/components/error/RecordNotFound';
import SomethingError from '@/components/error/SomethingError';

function MainLayout() {
  const location = useLocation();
  const { drawerOpened, drawerWidth, setDrawerWidth, toggleOpenDrawer } = useOutlineDrawer();
  const [compactLayout, setCompactLayout] = useState(() => window.innerWidth - drawerWidth <= 768);
  const aiChatContext = useAIChatContextOptional();
  const chatViewDrawerOpen = aiChatContext?.drawerOpen ?? false;
  const openViewDrawerWidth = aiChatContext?.drawerWidth ?? 0;

  const openPageModalViewId = useOpenModalViewId();
  const viewId = useAppViewId();
  const { notFound, deleted } = useViewErrorStatus();
  const openedSectionPathRef = useRef<string | null>(null);
  const routeSection = location.pathname.split('/')[3];
  const isAppSectionRoute = isAppSection(routeSection);

  useEffect(() => {
    const onResize = () => setCompactLayout(window.innerWidth - drawerWidth <= 768);

    onResize();
    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, [drawerWidth]);

  useEffect(() => {
    if (isAppSectionRoute && drawerOpened) {
      openedSectionPathRef.current = location.pathname;
      return;
    }

    if (isAppSectionRoute && !compactLayout && openedSectionPathRef.current !== location.pathname && !drawerOpened) {
      openedSectionPathRef.current = location.pathname;
      toggleOpenDrawer(true);
    }
  }, [compactLayout, drawerOpened, isAppSectionRoute, location.pathname, toggleOpenDrawer]);

  const main = useMemo(() => {
    if (deleted) {
      return <DeletedPageComponent />;
    }

    return notFound ? <RecordNotFound isViewNotFound viewId={viewId} /> : <Main />;
  }, [deleted, notFound, viewId]);

  const width = useMemo(() => {
    let diff = 0;

    if (drawerOpened && !compactLayout) {
      diff = drawerWidth;
    }

    if (chatViewDrawerOpen) {
      diff += openViewDrawerWidth;
    }

    return `calc(100% - ${diff}px)`;
  }, [compactLayout, drawerOpened, drawerWidth, openViewDrawerWidth, chatViewDrawerOpen]);

  return (
    <div className={'h-screen w-screen'}>
      <AFScroller
        overflowXHidden
        overflowYHidden={false}
        style={{
          transform: drawerOpened && !compactLayout ? `translateX(${drawerWidth}px)` : 'none',
          width,
          transition: 'width 0.2s ease-in-out, transform 0.2s ease-in-out',
        }}
        className={'synapsenote-layout synapsenote-scroll-container flex h-full transform flex-col bg-background-primary'}
      >
        <AppHeader
          onOpenDrawer={() => {
            toggleOpenDrawer(true);
          }}
          drawerWidth={drawerWidth}
          onCloseDrawer={() => {
            toggleOpenDrawer(false);
          }}
          openDrawer={drawerOpened}
        />
        {!isAppSectionRoute && <ConnectBanner />}

        {!openPageModalViewId && (
          <div
            className={'sticky-header-overlay'}
            style={{
              width: '100%',
              position: 'sticky',
              top: 48,
              left: 0,
              right: 0,
              zIndex: 50,
            }}
          />
        )}

        <ErrorBoundary FallbackComponent={SomethingError}>{main}</ErrorBoundary>
      </AFScroller>
      <SideBar
        onResizeDrawerWidth={setDrawerWidth}
        drawerWidth={drawerWidth}
        drawerOpened={drawerOpened}
        temporary={compactLayout}
        toggleOpenDrawer={toggleOpenDrawer}
      />
    </div>
  );
}

export default MainLayout;
