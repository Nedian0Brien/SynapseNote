import { useCallback, useEffect, useRef, useState } from 'react';
import { validate as uuidValidate } from 'uuid';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

import { handleMessage, initSync, SyncContext } from '@/application/services/js-services/sync-protocol';
import {Types} from "@/application/types";
import { AppflowyWebSocketType } from '@/components/ws/useAppflowyWebSocket';
import {BroadcastChannelType} from "@/components/ws/useBroadcastChannel";
import {messages} from "@/proto/messages";

export interface RegisterSyncContext {
  /**
   * The Y.Doc instance to be used for collaboration.
   * It must have a valid guid (UUID v4).
   */
  doc: Y.Doc,
  awareness?: awarenessProtocol.Awareness,
  collabType: Types,
  emit?: (reply: messages.IMessage) => void
}

export type UpdateCollabInfo = {
  /**
   * The objectId of the Y.Doc instance.
   * It must be a valid UUID v4.
   */
  objectId: string,
  collabType: Types,
  /**
   * The timestamp when the corresponding update has been known to the server.
   */
  publishedAt?: Date,
}

export type SyncContextType = {
  registerSyncContext: (context: RegisterSyncContext) => SyncContext,
  lastUpdatedCollab: UpdateCollabInfo | null,
}

export const useSync = (ws: AppflowyWebSocketType, bc: BroadcastChannelType): SyncContextType => {
  const { sendMessage, lastMessage } = ws;
  const { postMessage, lastBroadcastMessage } = bc;
  const registeredContexts = useRef<Map<string, SyncContext>>(new Map());
  const [lastUpdatedCollab, setLastUpdatedCollab] = useState<UpdateCollabInfo | null>(null);

  useEffect(() => {
    const message = lastMessage?.collabMessage;

    if (message) {
      const objectId = message.objectId!;
      const context = registeredContexts.current.get(objectId);

      if (context) {
        handleMessage(context, message);
      }

      const updateTimestamp = message.update?.messageId?.timestamp;
      const publishedAt = updateTimestamp ? new Date(updateTimestamp) : undefined;

      console.log('Received collab message:', message.collabType, publishedAt, message);

      setLastUpdatedCollab({objectId, publishedAt, collabType: message.collabType as Types});
    }
  }, [lastMessage, registeredContexts, setLastUpdatedCollab]);

  useEffect(() => {
    const message = lastBroadcastMessage?.collabMessage;

    if (message) {
      const objectId = message.objectId!;
      const context = registeredContexts.current.get(objectId);

      if (context) {
        handleMessage(context, message);
      }

      const updateTimestamp = message.update?.messageId?.timestamp;
      const publishedAt = updateTimestamp ? new Date(updateTimestamp) : undefined;

      console.log('Received broadcasted collab message:', message.collabType, publishedAt, message);

      setLastUpdatedCollab({objectId, publishedAt, collabType: message.collabType as Types});
    }

  }, [lastBroadcastMessage, registeredContexts, setLastUpdatedCollab]);

  const registerSyncContext = useCallback(((context: RegisterSyncContext): SyncContext => {
    if (!uuidValidate(context.doc.guid)) {
      throw new Error(`Invalid Y.Doc guid: ${context.doc.guid}. It must be a valid UUID v4.`);
    }

    const existingContext = registeredContexts.current.get(context.doc.guid);

    // If the context is already registered, return it
    if (existingContext !== undefined) {
      return existingContext;
    }

    console.log(`Registering sync context for objectId ${context.doc.guid} with collabType ${context.collabType}`);
    context.emit = (message) => {
      sendMessage(message);
      postMessage(message);
    };

    // SyncContext extends RegisterSyncContext by attaching the emit function and destroy handler
    const syncContext = context as SyncContext;

    registeredContexts.current.set(syncContext.doc.guid, syncContext);
    context.doc.on('destroy', () => {
      // Remove the context from the registered contexts when the Y.Doc is destroyed
      registeredContexts.current.delete(context.doc.guid);
    });

    // Initialize the sync process for the new context
    initSync(syncContext);

    return syncContext;
  }), [registeredContexts, sendMessage, postMessage]);

  return {registerSyncContext, lastUpdatedCollab};
}