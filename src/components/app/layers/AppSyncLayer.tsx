import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EventEmitter from 'events';
import { Awareness } from 'y-protocols/awareness';

import { APP_EVENTS } from '@/application/constants';
import { getTokenParsed } from '@/application/session/token';
import { db } from '@/application/db';
import { useAppflowyWebSocket, useBroadcastChannel, useSync } from '@/components/ws';
import { SyncInternalContext, SyncInternalContextType } from '../contexts/SyncInternalContext';
import { useAuthInternal } from '../contexts/AuthInternalContext';
import { notification } from '@/proto/messages';

interface AppSyncLayerProps {
  children: React.ReactNode;
}

// Second layer: WebSocket connection and synchronization
// Handles WebSocket connection, broadcast channel, sync context, and event management
// Depends on workspace ID and service from auth layer
export const AppSyncLayer: React.FC<AppSyncLayerProps> = ({ children }) => {
  const { service, currentWorkspaceId, isAuthenticated } = useAuthInternal();
  const [awarenessMap] = useState<Record<string, Awareness>>({});
  const eventEmitterRef = useRef<EventEmitter>(new EventEmitter());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const globalWindow = window as typeof window & {
      Cypress?: unknown;
      __APPFLOWY_EVENT_EMITTER__?: EventEmitter;
    };

    if (globalWindow.Cypress) {
      // Expose event emitter for Cypress so tests can simulate workspace notifications
      globalWindow.__APPFLOWY_EVENT_EMITTER__ = eventEmitterRef.current;
    }
  }, []);

  // Initialize WebSocket connection - currentWorkspaceId and service are guaranteed to exist when this component renders
  const webSocket = useAppflowyWebSocket({
    workspaceId: currentWorkspaceId!,
    clientId: service!.getClientId(),
    deviceId: service!.getDeviceId(),
  });

  // Initialize broadcast channel for multi-tab communication
  const broadcastChannel = useBroadcastChannel(`workspace:${currentWorkspaceId!}`);

  // Initialize sync context for collaborative editing
  const { registerSyncContext, lastUpdatedCollab } = useSync(webSocket, broadcastChannel, eventEmitterRef.current);

  // Handle WebSocket reconnection
  const reconnectWebSocket = useCallback(() => {
    webSocket.reconnect();
  }, [webSocket]);

  // Set up WebSocket reconnection event listener
  useEffect(() => {
    const currentEventEmitter = eventEmitterRef.current;

    currentEventEmitter.on(APP_EVENTS.RECONNECT_WEBSOCKET, reconnectWebSocket);

    return () => {
      currentEventEmitter.off(APP_EVENTS.RECONNECT_WEBSOCKET, reconnectWebSocket);
    };
  }, [reconnectWebSocket]);

  // Emit WebSocket status changes
  useEffect(() => {
    const currentEventEmitter = eventEmitterRef.current;

    currentEventEmitter.emit(APP_EVENTS.WEBSOCKET_STATUS, webSocket.readyState);
  }, [webSocket]);

  // Handle user profile change notifications
  // This provides automatic UI updates when user profile changes occur via WebSocket.
  //
  // Notification Flow:
  // 1. Server sends WorkspaceNotification with profileChange
  // 2. useSync processes notification from WebSocket OR BroadcastChannel
  // 3. useSync emits USER_PROFILE_CHANGED event via eventEmitter
  // 4. This handler receives the event and updates local database
  // 5. useLiveQuery in AppConfig detects database change
  // 6. All components using currentUser automatically re-render with new data
  //
  // Multi-tab Support:
  // - Active tab: WebSocket → useSync → this handler → database update
  // - Other tabs: BroadcastChannel → useSync → this handler → database update
  // - Result: All tabs show updated profile simultaneously
  //
  // UI Components that auto-update:
  // - Workspace dropdown (shows email)
  // - Collaboration user lists (shows names/avatars)
  // - Any component using useCurrentUser() hook
  useEffect(() => {
    if (!isAuthenticated || !currentWorkspaceId) return;

    const currentEventEmitter = eventEmitterRef.current;

    const handleUserProfileChange = async (profileChange: notification.IUserProfileChange) => {
      try {
        console.log('Received user profile change notification:', profileChange);

        // Extract user ID from authentication token
        const token = getTokenParsed();
        const userId = token?.user?.id;

        if (!userId) {
          console.warn('No user ID found for profile update');
          return;
        }

        // Retrieve current user data from local database cache
        const existingUser = await db.users.get(userId);

        if (!existingUser) {
          console.warn('No existing user found in database for profile update');
          return;
        }

        const updatedUser = {
          ...existingUser,
          name: profileChange.name || existingUser.name,
          email: profileChange.email || existingUser.email,
        };

        await db.users.put(updatedUser, userId);

        console.log('User profile updated in database:', updatedUser);
      } catch (error) {
        console.error('Failed to handle user profile change notification:', error);
      }
    };

    const handleWorkspaceMemberProfileChange = async (
      profileChange: notification.IWorkspaceMemberProfileChanged
    ) => {
      console.log('Received workspace member profile change notification:', profileChange);

      if (!currentWorkspaceId) {
        console.warn('No current workspace ID available');
        return;
      }

      const userUuid = profileChange.userUuid;

      if (!userUuid) {
        console.warn('Workspace member profile change missing user UUID');
        return;
      }

      try {
        const existingProfile = await db.workspace_member_profiles
          .where('[workspace_id+user_uuid]')
          .equals([currentWorkspaceId, userUuid])
          .first();

        const updatedProfile = {
          workspace_id: currentWorkspaceId,
          user_uuid: userUuid,
          person_id: existingProfile?.person_id ?? userUuid,
          name: profileChange.name ?? existingProfile?.name ?? '',
          email: existingProfile?.email ?? '',
          role: existingProfile?.role ?? 0,
          avatar_url: profileChange.avatarUrl ?? existingProfile?.avatar_url ?? null,
          cover_image_url: profileChange.coverImageUrl ?? existingProfile?.cover_image_url ?? null,
          custom_image_url: profileChange.customImageUrl ?? existingProfile?.custom_image_url ?? null,
          description: profileChange.description ?? existingProfile?.description ?? null,
          invited: existingProfile?.invited ?? false,
          last_mentioned_at: existingProfile?.last_mentioned_at ?? null,
          updated_at: Date.now(),
        };

        // Update workspace member profile in local database while preserving unspecified fields
        await db.workspace_member_profiles.put(updatedProfile);

        console.log('Workspace member profile updated in database:', {
          workspace_id: currentWorkspaceId,
          user_uuid: userUuid,
          avatar_url: updatedProfile.avatar_url,
        });

        // Note: No need to re-emit event here. Components using useCurrentUserWorkspaceAvatar
        // will automatically re-render when the database is updated via Dexie's reactive queries.
      } catch (error) {
        console.error('Failed to handle workspace member profile change notification:', error);
      }
    };

    // Subscribe to user profile change notifications from the event system
    currentEventEmitter.on(APP_EVENTS.USER_PROFILE_CHANGED, handleUserProfileChange);
    currentEventEmitter.on(APP_EVENTS.WORKSPACE_MEMBER_PROFILE_CHANGED, handleWorkspaceMemberProfileChange);

    // Cleanup subscription when component unmounts or dependencies change
    return () => {
      currentEventEmitter.off(APP_EVENTS.USER_PROFILE_CHANGED, handleUserProfileChange);
      currentEventEmitter.off(APP_EVENTS.WORKSPACE_MEMBER_PROFILE_CHANGED, handleWorkspaceMemberProfileChange);
    };
  }, [isAuthenticated, currentWorkspaceId, service]);

  // Context value for synchronization layer
  const syncContextValue: SyncInternalContextType = useMemo(
    () => ({
      webSocket,
      broadcastChannel,
      registerSyncContext,
      eventEmitter: eventEmitterRef.current,
      awarenessMap,
      lastUpdatedCollab,
    }),
    [webSocket, broadcastChannel, registerSyncContext, awarenessMap, lastUpdatedCollab]
  );

  return <SyncInternalContext.Provider value={syncContextValue}>{children}</SyncInternalContext.Provider>;
};
