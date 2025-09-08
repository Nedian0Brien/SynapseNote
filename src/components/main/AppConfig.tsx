import { useLiveQuery } from 'dexie-react-hooks';
import { useSnackbar } from 'notistack';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { clearData, db } from '@/application/db';
import { getService } from '@/application/services';
import { AFServiceConfig } from '@/application/services/services.type';
import { EventType, on } from '@/application/session';
import { getTokenParsed, isTokenValid } from '@/application/session/token';
import { MetadataKey } from '@/application/user-metadata';
import { createInitialTimezone, UserTimezone } from '@/application/user-timezone.types';
import { InfoSnackbarProps } from '@/components/_shared/notify';
import { LoginModal } from '@/components/login';
import { AFConfigContext, defaultConfig } from '@/components/main/app.hooks';
import { useUserTimezone } from '@/components/main/hooks/useUserTimezone';
import { useAppLanguage } from '@/components/main/useAppLanguage';
import { createHotkey, HOT_KEY_NAME } from '@/utils/hotkeys';

function AppConfig({ children }: { children: React.ReactNode }) {
  const [appConfig] = useState<AFServiceConfig>(defaultConfig);
  const service = useMemo(() => getService(appConfig), [appConfig]);
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(isTokenValid());

  const userId = useMemo(() => {
    if (!isAuthenticated) return;
    return getTokenParsed()?.user?.id;
  }, [isAuthenticated]);

  const currentUser = useLiveQuery(async () => {
    if (!userId) return;
    return db.users.get(userId);
  }, [userId]);
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [loginCompletedRedirectTo, setLoginCompletedRedirectTo] = React.useState<string>('');

  const openLoginModal = useCallback((redirectTo?: string) => {
    setLoginOpen(true);
    setLoginCompletedRedirectTo(redirectTo || window.location.href);
  }, []);

  useEffect(() => {
    return on(EventType.SESSION_VALID, () => {
      console.log('session valid');
      setIsAuthenticated(true);
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void (async () => {
      if (!service) return;
      try {
        await service.getCurrentUser();
      } catch (e) {
        console.error(e);
      }
    })();
  }, [isAuthenticated, service]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'token') setIsAuthenticated(isTokenValid());
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  useEffect(() => {
    return on(EventType.SESSION_INVALID, () => {
      console.log('session invalid');
      setIsAuthenticated(false);
    });
  }, []);
  useAppLanguage();

  const [hasCheckedTimezone, setHasCheckedTimezone] = useState(false);

  // Handle initial timezone setup - only when timezone is not set
  const handleTimezoneSetup = useCallback(async (detectedTimezone: string) => {
    if (!isAuthenticated || !service || hasCheckedTimezone) return;

    try {
      // Get current user profile to check if timezone is already set
      const user = await service.getCurrentUser();
      const currentMetadata = user.metadata || {};

      // Check if user has timezone metadata
      const existingTimezone = currentMetadata[MetadataKey.Timezone] as UserTimezone | undefined;

      // Only set timezone if it's not already set (None in Rust = no timezone field or null)
      if (!existingTimezone || existingTimezone.timezone === null || existingTimezone.timezone === undefined) {
        // Create the UserTimezone struct format matching Rust
        const timezoneData = createInitialTimezone(detectedTimezone);

        const metadata = {
          [MetadataKey.Timezone]: timezoneData,
        };

        await service.updateUserProfile(metadata);
        console.debug('Initial timezone set in user profile:', timezoneData);
      } else {
        console.debug('User timezone already set, skipping update:', existingTimezone);
      }

      setHasCheckedTimezone(true);
    } catch (e) {
      console.error('Failed to check/update timezone:', e);
      // Still mark as checked to avoid repeated attempts
      setHasCheckedTimezone(true);
    }
  }, [isAuthenticated, service, hasCheckedTimezone]);

  // Detect timezone once on mount
  const _timezoneInfo = useUserTimezone({
    onTimezoneChange: handleTimezoneSetup,
    updateInterval: 0, // Disable periodic checks - only check once
  });

  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  useEffect(() => {
    window.toast = {
      success: (message: string | React.ReactNode) => {
        enqueueSnackbar(message, { variant: 'success' });
      },
      error: (message: string | React.ReactNode) => {
        enqueueSnackbar(message, { variant: 'error' });
      },
      warning: (message: string | React.ReactNode) => {
        enqueueSnackbar(message, { variant: 'warning' });
      },
      default: (message: string | React.ReactNode) => {
        enqueueSnackbar(message, { variant: 'default' });
      },

      info: (props: InfoSnackbarProps) => {
        enqueueSnackbar(props.message, props);
      },

      clear: () => {
        closeSnackbar();
      },
    };
  }, [closeSnackbar, enqueueSnackbar]);

  useEffect(() => {
    const handleClearData = (e: KeyboardEvent) => {
      switch (true) {
        case createHotkey(HOT_KEY_NAME.CLEAR_CACHE)(e):
          e.stopPropagation();
          e.preventDefault();
          void clearData().then(() => {
            window.location.reload();
          });
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleClearData);
    return () => {
      window.removeEventListener('keydown', handleClearData);
    };
  });

  return (
    <AFConfigContext.Provider
      value={{
        service,
        isAuthenticated,
        currentUser,
        openLoginModal,
      }}
    >
      {children}
      {loginOpen && (
        <Suspense>
          <LoginModal
            redirectTo={loginCompletedRedirectTo}
            open={loginOpen}
            onClose={() => {
              setLoginOpen(false);
            }}
          />
        </Suspense>
      )}
    </AFConfigContext.Provider>
  );
}

export default AppConfig;
