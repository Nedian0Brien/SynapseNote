import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { invalidToken, isTokenValid } from '@/application/session/token';
import { UserWorkspaceInfo } from '@/application/types';
import { AFConfigContext, useService } from '@/components/main/app.hooks';

import { AuthInternalContext, AuthInternalContextType } from '../contexts/AuthInternalContext';

interface AppAuthLayerProps {
  children: React.ReactNode;
}

// First layer: Authentication and service initialization
// Handles user authentication, workspace info, and service setup
// Does not depend on workspace ID - establishes basic authentication context
export const AppAuthLayer: React.FC<AppAuthLayerProps> = ({ children }) => {
  const context = useContext(AFConfigContext);
  const isAuthenticated = context?.isAuthenticated;
  const location = useLocation();
  const service = useService();
  const navigate = useNavigate();
  const params = useParams();

  const [userWorkspaceInfo, setUserWorkspaceInfo] = useState<UserWorkspaceInfo | undefined>(undefined);

  // Calculate current workspace ID from URL params or user info
  const currentWorkspaceId = useMemo(
    () => params.workspaceId || userWorkspaceInfo?.selectedWorkspace.id,
    [params.workspaceId, userWorkspaceInfo?.selectedWorkspace.id]
  );

  // Handle user logout
  const logout = useCallback(() => {
    invalidToken();
    navigate(`/login?redirectTo=${encodeURIComponent(window.location.href)}`);
  }, [navigate]);

  // Load user workspace information
  const loadUserWorkspaceInfo = useCallback(async () => {
    if (!service) return;
    try {
      const res = await service?.getUserWorkspaceInfo();

      setUserWorkspaceInfo(res);
      return res;
    } catch (e) {
      console.error(e);
    }
  }, [service]);

  // Handle workspace change
  const onChangeWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!service) return;
      if (userWorkspaceInfo && !userWorkspaceInfo.workspaces.some((w) => w.id === workspaceId)) {
        window.location.href = `/app/${workspaceId}`;
        return;
      }

      await service?.openWorkspace(workspaceId);

      await loadUserWorkspaceInfo();

      localStorage.removeItem('last_view_id');

      navigate(`/app/${workspaceId}`);
    },
    [loadUserWorkspaceInfo, navigate, service, userWorkspaceInfo]
  );

  // If the user is not authenticated, log out the user
  // But check localStorage token first to avoid redirect loops after login
  // This handles the race condition where token exists but React state hasn't synced yet
  useEffect(() => {
    // Don't check if we're already on login/auth pages
    if (location.pathname === '/login' || location.pathname.startsWith('/auth/callback')) {
      return;
    }

    // Wait a bit for context to be ready (in case it's still initializing)
    // This prevents false negatives when context hasn't loaded yet
    const timeoutId = setTimeout(() => {
      // Check token on mount and whenever isAuthenticated changes
      const hasToken = isTokenValid();

      // Only redirect if both conditions are true:
      // 1. Context exists and says not authenticated (don't redirect if context is undefined/not ready)
      // 2. No token exists in localStorage
      // This prevents redirect loops when token exists but state hasn't synced
      if (context && !isAuthenticated && !hasToken) {
        logout();
      }
      // If token exists but isAuthenticated is false/undefined, wait for state to sync
      // The state will sync via:
      // - Initial state in AppConfig (isTokenValid() on mount)
      // - SESSION_VALID event listener
      // - Storage event listener (for cross-tab updates)
      // - Sync effect in AppConfig that checks token on mount
    }, 50); // Small delay to allow context to initialize

    return () => clearTimeout(timeoutId);
  }, [isAuthenticated, location.pathname, logout, context]);

  // Load user workspace info on mount
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadUserWorkspaceInfo().catch((e) => {
      console.error('[AppAuthLayer] Failed to load workspace info:', e);
    });
  }, [loadUserWorkspaceInfo, isAuthenticated]);

  // Context value for authentication layer
  const authContextValue: AuthInternalContextType = useMemo(
    () => ({
      service,
      userWorkspaceInfo,
      currentWorkspaceId,
      isAuthenticated: !!isAuthenticated,
      onChangeWorkspace,
    }),
    [service, userWorkspaceInfo, currentWorkspaceId, isAuthenticated, onChangeWorkspace]
  );

  return <AuthInternalContext.Provider value={authContextValue}>{children}</AuthInternalContext.Provider>;
};