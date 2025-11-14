import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { invalidToken } from '@/application/session/token';
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
  const isAuthenticated = useContext(AFConfigContext)?.isAuthenticated;
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
  useEffect(() => {
    if (!isAuthenticated) {
      logout();
    }
  }, [isAuthenticated, logout]);

  // Load user workspace info on mount
  useEffect(() => {
    void loadUserWorkspaceInfo();
  }, [loadUserWorkspaceInfo]);

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