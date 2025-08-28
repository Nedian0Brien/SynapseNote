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

        // Merge notification changes with existing user data
        // Only update fields that are present in the notification (selective update)
        const updatedUser = {
          ...existingUser,
          // Update name if provided in notification
          ...(profileChange.name !== undefined && { name: profileChange.name }),
          // Update email if provided in notification  
          ...(profileChange.email !== undefined && { email: profileChange.email }),
        };

        // Update database cache - this triggers useLiveQuery to re-render all UI components
        // displaying user profile information. No manual component updates needed.
        await db.users.put(updatedUser, userId);
        
        console.log('User profile updated in database:', updatedUser);
      } catch (error) {
        console.error('Failed to handle user profile change notification:', error);
      }
    };

    // Subscribe to user profile change notifications from the event system
    currentEventEmitter.on(APP_EVENTS.USER_PROFILE_CHANGED, handleUserProfileChange);

    // Cleanup subscription when component unmounts or dependencies change
    return () => {
      currentEventEmitter.off(APP_EVENTS.USER_PROFILE_CHANGED, handleUserProfileChange);
    };
  }, [isAuthenticated, currentWorkspaceId]);

  // Context value for synchronization layer
  const syncContextValue: SyncInternalContextType = useMemo(() => ({
    webSocket,
    broadcastChannel,
    registerSyncContext,
    eventEmitter: eventEmitterRef.current,
    awarenessMap,
    lastUpdatedCollab,
  }), [webSocket, broadcastChannel, registerSyncContext, awarenessMap, lastUpdatedCollab]);

  return (
    <SyncInternalContext.Provider value={syncContextValue}>
      {children}
    </SyncInternalContext.Provider>
  );
};