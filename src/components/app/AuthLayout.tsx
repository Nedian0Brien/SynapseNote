import { memo } from 'react';
import { useLocation } from 'react-router-dom';

import { AppProvider } from '@/components/app/app.hooks';
import MainLayout from '@/components/app/MainLayout';
import MobileMainLayout from '@/components/app/MobileMainLayout';
import { isAppSection } from '@/components/app/navigation/appSections';
import { getPlatform } from '@/utils/platform';

export function AuthLayout () {
  const location = useLocation();
  const isMobile = getPlatform().isMobile;
  const routeSection = location.pathname.split('/')[3];
  const useDesktopShell = isAppSection(routeSection);

  return (
    <AppProvider>
      {isMobile && !useDesktopShell ? <MobileMainLayout /> : <MainLayout />}
    </AppProvider>
  );
}

export default memo(AuthLayout);
