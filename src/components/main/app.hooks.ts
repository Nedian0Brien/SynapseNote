import { AFService, AFServiceConfig } from '@/application/services/services.type';
import { User } from '@/application/types';
import { getConfigValue } from '@/utils/runtime-config';
import { createContext, useContext } from 'react';

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
    openLoginModal: (redirectTo?: string) => void;
  }
  | undefined
>(undefined);

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