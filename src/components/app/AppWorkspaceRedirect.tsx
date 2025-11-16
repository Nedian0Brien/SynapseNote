import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useUserWorkspaceInfo } from '@/components/app/app.hooks';
import LoadingDots from '@/components/_shared/LoadingDots';

/**
 * Component that handles redirecting from /app to /app/:workspaceId
 * This is used when user lands on /app without a workspace ID (e.g., after OAuth login)
 * Waits for workspace info to load, then redirects to the selected workspace
 */
export function AppWorkspaceRedirect() {
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const navigate = useNavigate();

  useEffect(() => {
    if (!userWorkspaceInfo) {
      console.debug('[AppWorkspaceRedirect] Waiting for workspace info to load...');
      return;
    }

    const workspaceId = userWorkspaceInfo.selectedWorkspace?.id;

    if (!workspaceId) {
      console.warn('[AppWorkspaceRedirect] No selected workspace found in user info', userWorkspaceInfo);
      return;
    }

    console.debug('[AppWorkspaceRedirect] Redirecting to workspace', { workspaceId });
    navigate(`/app/${workspaceId}`, { replace: true });
  }, [userWorkspaceInfo, navigate]);

  // Show loading while waiting for workspace info
  return (
    <div className={'flex h-screen w-screen items-center justify-center'}>
      <LoadingDots className='flex items-center justify-center' />
    </div>
  );
}

export default AppWorkspaceRedirect;
