/// <reference types="cypress" />
import * as Y from 'yjs';
import { messages } from '../../src/proto/messages';
// Keys expected by the app Yjs utils
const YjsEditorKey = {
  data_section: 'data_section',
  document: 'document',
  meta: 'meta',
  blocks: 'blocks',
  page_id: 'page_id',
  children_map: 'children_map',
  text_map: 'text_map',
};

/**
 * Enhanced WebSocket mock that simulates AppFlowy's collab protocol
 * This mock ensures that the Document component receives the necessary
 * Y.Doc structure to render properly during tests.
 */

// Message types from AppFlowy protocol
interface CollabMessage {
  objectId: string;
  collabType: number;
  syncRequest?: {
    stateVector?: Uint8Array;
    lastMessageId?: { timestamp: number; counter: number };
  };
  update?: {
    flags: number;
    payload: Uint8Array;
    messageId?: { timestamp: number; counter: number };
  };
  awarenessUpdate?: {
    payload: Uint8Array;
  };
}

interface ProtobufMessage {
  collabMessage?: CollabMessage;
}

// Helper to create initial document structure
function createInitialDocumentUpdate(objectId: string): Uint8Array {
  // Create a Y.Doc with the expected structure
  const doc = new Y.Doc({ guid: objectId });

  // Create the data_section map
  const dataSection = doc.getMap(YjsEditorKey.data_section);

  // Create the document map with initial structure
  const document = new Y.Map();

  // Set page_id as a plain string (app expects string, not Y.Text)
  document.set(YjsEditorKey.page_id, objectId);

  // Add blocks map for document content with a root page block
  const blocks = new Y.Map();
  const rootBlock = new Y.Map();
  rootBlock.set('id', objectId);
  rootBlock.set('ty', 0); // BlockType.Page
  rootBlock.set('children', objectId);
  rootBlock.set('data', '');
  rootBlock.set('parent', objectId);
  rootBlock.set('external_id', objectId);
  blocks.set(objectId, rootBlock);

  // Create a paragraph block for the editor to render
  const paragraphId = `${objectId}-p1`;
  const paragraphBlock = new Y.Map();
  paragraphBlock.set('id', paragraphId);
  paragraphBlock.set('ty', 1); // BlockType.Paragraph
  paragraphBlock.set('children', paragraphId);
  paragraphBlock.set('data', '{}');
  paragraphBlock.set('parent', objectId);
  paragraphBlock.set('external_id', paragraphId);
  blocks.set(paragraphId, paragraphBlock);

  document.set(YjsEditorKey.blocks, blocks);

  // Add meta information
  const meta = new Y.Map();
  const childrenMap = new Y.Map();

  // Add the paragraph as a child of the root page
  const rootChildrenArray = new Y.Array<string>();
  rootChildrenArray.push([paragraphId]);
  childrenMap.set(objectId, rootChildrenArray);

  // Add empty children array for the paragraph
  const paragraphChildrenArray = new Y.Array<string>();
  childrenMap.set(paragraphId, paragraphChildrenArray);

  meta.set(YjsEditorKey.children_map, childrenMap);

  // Add text for the paragraph
  const textMap = new Y.Map();
  const paragraphText = new Y.Text();
  textMap.set(paragraphId, paragraphText);
  meta.set(YjsEditorKey.text_map, textMap);

  document.set(YjsEditorKey.meta, meta);

  // Set the document in data_section
  dataSection.set(YjsEditorKey.document, document);

  // Log the structure for debugging
  console.log('[CollabWebSocketMock] Created initial document structure:', {
    objectId,
    hasDataSection: doc.getMap(YjsEditorKey.data_section) !== undefined,
    hasDocument: dataSection.get(YjsEditorKey.document) !== undefined,
    blocksCount: blocks.size,
    hasRootBlock: blocks.has(objectId),
  });

  // Encode the state as an update
  return Y.encodeStateAsUpdate(doc);
}

// WebSocket mock class with collab protocol support
class CollabWebSocketMock {
  private url: string;
  private ws: WebSocket | null = null;
  private originalWebSocket: typeof WebSocket;
  private pendingDocs: Set<string> = new Set();
  private syncedDocs: Set<string> = new Set();
  private messageQueue: any[] = [];
  private responseDelay: number;
  private targetWindow: Window & typeof globalThis;

  constructor(targetWindow: Window & typeof globalThis, responseDelay: number = 50) {
    this.targetWindow = targetWindow;
    this.url = '';
    this.originalWebSocket = targetWindow.WebSocket;
    this.responseDelay = responseDelay;
    this.setupMock();
  }

  private setupMock() {
    const self = this;

    // Replace WebSocket constructor on AUT window
    (this.targetWindow as any).WebSocket = function (url: string, protocols?: string | string[]) {
      // Check if this is the AppFlowy WebSocket URL
      if (!url.includes('/ws/v2/')) {
        // Use real WebSocket for non-collab URLs
        return new self.originalWebSocket(url, protocols);
      }

      // Intercept collab socket
      self.url = url;
      // Create mock WebSocket instance
      const mockWs: any = {
        url: url,
        readyState: 0, // CONNECTING
        binaryType: 'arraybuffer',
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        listeners: new Map<string, Set<EventListener>>(),

        send: (data: any) => {
          if (mockWs.readyState !== 1) {
            throw new Error('WebSocket is not open');
          }
          // Heartbeat support: echo back plain text heartbeats
          if (typeof data === 'string' && data === 'echo') {
            const echoEvent = new MessageEvent('message', { data: 'echo' });
            setTimeout(() => {
              mockWs.onmessage?.(echoEvent);
              mockWs.dispatchEvent(echoEvent);
            }, 10);
            return;
          }
          self.handleMessage(mockWs, data);
        },

        close: (code?: number, reason?: string) => {
          if (mockWs.readyState === 2 || mockWs.readyState === 3) return;

          mockWs.readyState = 2; // CLOSING
          setTimeout(() => {
            mockWs.readyState = 3; // CLOSED
            const closeEvent = new CloseEvent('close', {
              code: code || 1000,
              reason: reason || '',
              wasClean: true,
            });
            mockWs.onclose?.(closeEvent);
            mockWs.dispatchEvent(closeEvent);
          }, 10);
        },

        addEventListener: (type: string, listener: EventListener) => {
          if (!mockWs.listeners.has(type)) {
            mockWs.listeners.set(type, new Set());
          }
          mockWs.listeners.get(type)!.add(listener);
        },

        removeEventListener: (type: string, listener: EventListener) => {
          mockWs.listeners.get(type)?.delete(listener);
        },

        dispatchEvent: (event: Event) => {
          const listeners = mockWs.listeners.get(event.type);
          if (listeners) {
            listeners.forEach((listener: EventListener) => listener(event));
          }
          return true;
        }
      };

      // Ensure instanceof checks pass
      try {
        (mockWs as any).constructor = (self.targetWindow as any).WebSocket;
        Object.setPrototypeOf(mockWs, (self.targetWindow as any).WebSocket.prototype);
      } catch (_) {
        // ignore
      }

      self.ws = mockWs;

      // Store mock on AUT window for debugging
      (self.targetWindow as any).__mockCollabWebSocket = mockWs;

      // Simulate connection opening
      setTimeout(() => {
        mockWs.readyState = 1; // OPEN
        const openEvent = new Event('open');
        mockWs.onopen?.(openEvent);
        mockWs.dispatchEvent(openEvent);
        console.log('[CollabWebSocketMock] WebSocket connection opened for URL:', url);

        // Log what page IDs we're dealing with
        const urlMatch = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g);
        if (urlMatch) {
          console.log('[CollabWebSocketMock] Found object IDs in URL:', urlMatch);
        }

        // Process any queued messages
        self.processMessageQueue(mockWs);
      }, 50);

      return mockWs;
    } as any;

    // Copy WebSocket static properties
    Object.setPrototypeOf(this.targetWindow.WebSocket, this.originalWebSocket);
    // Align prototype so `instanceof WebSocket` works
    try {
      (this.targetWindow as any).WebSocket.prototype = this.originalWebSocket.prototype;
    } catch (_) {
      // no-op
    }
    // Copy static constants (read-only properties)
    try {
      Object.defineProperty(this.targetWindow.WebSocket, 'CONNECTING', { value: 0, writable: false });
      Object.defineProperty(this.targetWindow.WebSocket, 'OPEN', { value: 1, writable: false });
      Object.defineProperty(this.targetWindow.WebSocket, 'CLOSING', { value: 2, writable: false });
      Object.defineProperty(this.targetWindow.WebSocket, 'CLOSED', { value: 3, writable: false });
    } catch (_) {
      // no-op if already defined
    }
  }

  private handleMessage(ws: any, data: ArrayBuffer | Uint8Array | string) {
    try {
      // Ignore heartbeat or text messages
      if (typeof data === 'string') {
        return;
      }

      const buffer = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

      const decoded = messages.Message.decode(buffer);
      const collabMsg = decoded.collabMessage;

      if (collabMsg?.syncRequest && collabMsg.objectId) {
        const objectId = collabMsg.objectId;
        const collabType = collabMsg.collabType ?? 0;
        setTimeout(() => {
          this.sendSyncResponse(ws, objectId, collabType);
        }, this.responseDelay);
      }
    } catch (error) {
      // If decoding fails, ignore silently to avoid breaking app
      // Useful when app sends non-collab binary messages
    }
  }

  private sendSyncResponse(ws: any, objectId: string, collabType: number) {
    if (this.syncedDocs.has(objectId)) return;

    const update = createInitialDocumentUpdate(objectId);
    const msg: messages.IMessage = {
      collabMessage: {
        objectId,
        collabType,
        update: {
          flags: 0,
          payload: update,
          messageId: { timestamp: Date.now(), counter: 1 },
        },
      },
    };
    const encoded = messages.Message.encode(msg).finish();
    const dataBuf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
    const messageEvent = new MessageEvent('message', { data: dataBuf });

    ws.onmessage?.(messageEvent);
    ws.dispatchEvent(messageEvent);
    this.syncedDocs.add(objectId);
  }

  private processMessageQueue(ws: any) {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.handleMessage(ws, msg);
    }
  }

  public restore() {
    this.targetWindow.WebSocket = this.originalWebSocket;
    delete (this.targetWindow as any).__mockCollabWebSocket;
    this.pendingDocs.clear();
    this.syncedDocs.clear();
  }

  public addPendingDocument(objectId: string) {
    this.pendingDocs.add(objectId);
  }
}

// Cypress commands for collab WebSocket mocking
declare global {
  namespace Cypress {
    interface Chainable {
      mockCollabWebSocket(responseDelay?: number): Chainable<void>;
      restoreCollabWebSocket(): Chainable<void>;
      waitForDocumentSync(objectId?: string, timeout?: number): Chainable<void>;
    }
  }
}

// Store mock instance globally
let collabMockInstance: CollabWebSocketMock | null = null;

// Add Cypress commands
if ((window as any).Cypress) {
  Cypress.Commands.add('mockCollabWebSocket', (responseDelay = 50) => {
    cy.window().then((win) => {
      if (!collabMockInstance) {
        collabMockInstance = new CollabWebSocketMock(win, responseDelay);
        (win as any).__collabMockInstance = collabMockInstance;
      }
    });
  });

  Cypress.Commands.add('restoreCollabWebSocket', () => {
    cy.window().then((win) => {
      if (collabMockInstance) {
        collabMockInstance.restore();
        collabMockInstance = null;
        delete (win as any).__collabMockInstance;
      }
    });
  });

  Cypress.Commands.add('waitForDocumentSync', (objectId?: string, timeout = 10000) => {
    // When mocking, just wait for the modal to be visible
    // The Document component might not render immediately even with mocked data
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible');
    cy.wait(1000); // Give time for the document to render
  });
}

export { CollabWebSocketMock };
