import { createContext, useContext } from 'react';

import { AFService, AFServiceConfig } from '@/application/services/services.type';
import { User } from '@/application/types';
import { getConfigValue } from '@/utils/runtime-config';

const baseURL = getConfigValue('APPFLOWY_BASE_URL', 'https://test.appflowy.cloud');
const gotrueURL = getConfigValue('APPFLOWY_GOTRUE_BASE_URL', 'https://test.appflowy.cloud/gotrue');

export const defaultConfig: AFServiceConfig = {
  cloudConfig: {
    baseURL,
    gotrueURL,
    wsURL: '', // Legacy field - not used, keeping for backward compatibility
  },
};

export const AFConfigContext = createContext<
  | {
    service: AFService | undefined;
    isAuthenticated: boolean;
    currentUser?: User;
    updateCurrentUser: (user: User) => Promise<void>;
    openLoginModal: (redirectTo?: string) => void;
  }
  | undefined
>(undefined);

export function useAppConfig() {
  const context = useContext(AFConfigContext);

  if (!context) {
    throw new Error('useAppConfig must be used within a AFConfigContext');
  }

  return {
    service: context.service,
    isAuthenticated: context.isAuthenticated,
    currentUser: context.currentUser,
    updateCurrentUser: context.updateCurrentUser,
    openLoginModal: context.openLoginModal,
  };
}

export function useCurrentUser() {
  const context = useContext(AFConfigContext);

  if (!context) {
    throw new Error('useCurrentUser must be used within a AFConfigContext');
  }

  return context.currentUser;
}

export function useService() {
  const context = useContext(AFConfigContext);

  if (!context) {
    throw new Error('useService must be used within a AFConfigContext');
  }

  return context.service;
}
