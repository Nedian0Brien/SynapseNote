import * as random from 'lib0/random';
import { useCallback, useMemo, useState } from 'react';
import useWebSocket from 'react-use-websocket';

import { getTokenParsed } from '@/application/session/token';
import { messages } from '@/proto/messages';
import { getConfigValue } from '@/utils/runtime-config';

const wsURL = getConfigValue('APPFLOWY_WS_BASE_URL', 'ws://localhost:8000/ws/v2');

// WebSocket close code enum
enum CloseCode {
  NormalClose = 1000,
  EndpointLeft = 1001,
  ProtocolError = 1002,
  UnsupportedDataType = 1003,
  Reserved = 1004,
  NoStatusCode = 1005,
  AbnormalClose = 1006,
  InvalidFramePayloadData = 1007,
  PolicyViolation = 1008,
  MessageTooBig = 1009,
  ClientExpectedServerToNegotiateOneOrMoreExtensions = 1010,
  ServerEncounteredAnUnexpectedCondition = 1011,
  TLSHandshakeFailed = 1015,
}

const RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 1000;

export type AppflowyWebSocketType = {
  /**
   * The last received message from the WebSocket.
   * It is decoded from the binary format to a `messages.Message` object.
   */
  lastMessage: messages.Message | null;
  /**
   * Function to send a message through the WebSocket.
   * The message is encoded to binary format before sending.
   * @param msg - The message to send, in the format of `messages.IMessage`.
   * @param keep - Should the message be cached if the WebSocket is not open? (default: true)
   */
  sendMessage: (msg: messages.IMessage, keep?: boolean) => void;
  /**
   * The current ready state of the WebSocket.
   * It can be one of the following values:
   * - 0: CONNECTING
   * - 1: OPEN
   * - 2: CLOSING
   * - 3: CLOSED
   */
  readyState: number;
  /**
   * The options used to create the WebSocket connection.
   */
  options: Options;

  /**
   * The number of reconnect attempts.
   */
  reconnectAttempt: number;
  /**
   * Function to manually trigger a reconnection.
   */
  reconnect: () => void;
};

export interface Options {
  /**
   * UUID v4 representing the unique identifier of currently opened workspace.
   */
  workspaceId: string;
  /**
   * WebSocket server URL to connect to. Should start with `ws://` or `wss://`.
   */
  url?: string;
  /**
   * Client ID is a unique identifier for the client. This can be used as `Y.Doc`
   * client ID. Must not be shared between browser tabs or different clients.
   * It is used to identify the client in the WebSocket connection.
   * If not provided, a random uint32 will be generated.
   */
  clientId?: number;
  /**
   * Unique device identifier. If not provided, a random UUID v4 will be generated.
   */
  deviceId?: string;
  /**
   * Token used for authentication. If not provided, the token will be fetched from the session.
   */
  token?: string;
}

export const useAppflowyWebSocket = (options: Options): AppflowyWebSocketType => {
  options.url = options.url || wsURL;
  options.token = options.token || getTokenParsed()?.access_token;
  options.clientId = options.clientId || random.uint32();
  options.deviceId = options.deviceId || random.uuidv4();
  console.debug('🔗 Start WebSocket connection', {
    url: options.url,
    workspaceId: options.workspaceId,
    deviceId: options.deviceId,
  });
  const url = `${options.url}/${options.workspaceId}/?clientId=${options.clientId}&deviceId=${options.deviceId}&token=${options.token}`;
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const { lastMessage, sendMessage, readyState, getWebSocket } = useWebSocket(url, {
    share: true,
    heartbeat: {
      message: 'echo',
      returnMessage: 'echo',
      timeout: 60000, // disconnect after 60 seconds of no response
      interval: 25000, // send ping every 25 seconds
    },
    // Reconnect configuration
    shouldReconnect: (closeEvent) => {
      console.log('Connection closed, code:', closeEvent.code, 'reason:', closeEvent.reason);

      // Determine if reconnect is needed based on the close code
      if (closeEvent.code === CloseCode.NormalClose) {
        // Normal close, no reconnect
        console.debug('✅ Normal close, no reconnect');
        return false;
      }

      if (closeEvent.code === CloseCode.EndpointLeft) {
        // Endpoint left, reconnect
        console.debug('✅ Endpoint left, reconnect');
        return true;
      }

      if (closeEvent.code >= CloseCode.ProtocolError && closeEvent.code <= CloseCode.TLSHandshakeFailed) {
        console.debug('✅ Protocol error, reconnect');
        // Protocol error, reconnect
        return true;
      }

      return true; // Other cases reconnect
    },

    reconnectAttempts: RECONNECT_ATTEMPTS,

    // Exponential backoff reconnect interval
    reconnectInterval: (attemptNumber) => {
      setReconnectAttempt(attemptNumber);
      const delay = Math.min(RECONNECT_INTERVAL * Math.pow(1.5, attemptNumber), 30000);

      console.log(`Reconnect attempt ${attemptNumber}, delay ${delay}ms`);
      return delay;
    },

    // Connection event callback
    onOpen: () => {
      console.log('✅ WebSocket connection opened', { deviceId: options.deviceId });
      setReconnectAttempt(0);
    },

    onClose: (event) => {
      console.log('❌ WebSocket connection closed', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        deviceId: options.deviceId,
      });
    },

    onError: (event) => {
      console.error('❌ WebSocket error', { event, deviceId: options.deviceId });
    },

    onReconnectStop: (numAttempts) => {
      console.log('❌ Reconnect stopped, attempt number:', numAttempts);
    },
  });
  const websocket = getWebSocket() as WebSocket | null;

  if (websocket && websocket.binaryType !== 'arraybuffer') {
    websocket.binaryType = 'arraybuffer';
  }

  const sendProtobufMessage = useCallback(
    (message: messages.IMessage, keep = true): void => {
      console.debug('sending sync message:', message);

      const protobufMessage = messages.Message.encode(message).finish();

      sendMessage(protobufMessage, keep);
    },
    [sendMessage]
  );

  const manualReconnect = useCallback(() => {
    console.log('Manual reconnect triggered');
    const ws = getWebSocket();

    if (ws) {
      // Close the current connection and let the automatic reconnect logic handle the reconnection
      ws.close(1000, 'Manual reconnect');
    }
  }, [getWebSocket]);
  const lastProtobufMessage = useMemo(
    () => (lastMessage ? messages.Message.decode(new Uint8Array(lastMessage.data)) : null),
    [lastMessage]
  );

  return {
    lastMessage: lastProtobufMessage,
    sendMessage: sendProtobufMessage,
    readyState,
    options,
    reconnectAttempt,
    reconnect: manualReconnect,
  };
};
