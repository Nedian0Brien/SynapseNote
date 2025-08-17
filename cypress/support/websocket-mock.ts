/// <reference types="cypress" />

interface MockWebSocketConfig {
  enabled: boolean;
  url?: string | RegExp;
  responseDelay?: number;
  autoRespond?: boolean;
  mockResponses?: Map<string, any>;
}

interface MockWebSocketInstance {
  url: string;
  readyState: number;
  binaryType: BinaryType;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  send: (data: any) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  dispatchEvent: (event: Event) => boolean;
}

class MockWebSocket implements MockWebSocketInstance {
  url: string;
  readyState: number = 0; // CONNECTING
  binaryType: BinaryType = 'arraybuffer';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  private listeners: Map<string, Set<EventListener>> = new Map();
  private config: MockWebSocketConfig;
  private sentMessages: any[] = [];

  constructor(url: string, protocols?: string | string[], config?: MockWebSocketConfig) {
    this.url = url;
    this.config = config || { enabled: true };
    
    // Store the mock instance for Cypress access
    if ((window as any).Cypress) {
      (window as any).__mockWebSocket = this;
      (window as any).__mockWebSocketMessages = this.sentMessages;
    }

    // Simulate connection opening
    setTimeout(() => {
      this.readyState = 1; // OPEN
      const openEvent = new Event('open');
      this.onopen?.(openEvent);
      this.dispatchEvent(openEvent);
      
      // Log connection opened
      console.log('[MockWebSocket] Connection opened:', url);
    }, this.config.responseDelay || 100);
  }

  send(data: any): void {
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not open');
    }
    
    this.sentMessages.push(data);
    console.log('[MockWebSocket] Message sent:', data);
    
    // Auto-respond with echo if configured
    if (this.config.autoRespond) {
      setTimeout(() => {
        this.receiveMessage(data);
      }, this.config.responseDelay || 50);
    }
    
    // Check for mock responses
    if (this.config.mockResponses) {
      const messageStr = typeof data === 'string' ? data : JSON.stringify(data);
      for (const [pattern, response] of this.config.mockResponses) {
        if (messageStr.includes(pattern)) {
          setTimeout(() => {
            this.receiveMessage(response);
          }, this.config.responseDelay || 50);
          break;
        }
      }
    }
  }

  receiveMessage(data: any): void {
    const messageEvent = new MessageEvent('message', { data });
    this.onmessage?.(messageEvent);
    this.dispatchEvent(messageEvent);
    console.log('[MockWebSocket] Message received:', data);
  }

  close(code: number = 1000, reason?: string): void {
    if (this.readyState === 2 || this.readyState === 3) {
      return; // Already closing or closed
    }
    
    this.readyState = 2; // CLOSING
    
    setTimeout(() => {
      this.readyState = 3; // CLOSED
      const closeEvent = new CloseEvent('close', {
        code,
        reason,
        wasClean: true,
      });
      this.onclose?.(closeEvent);
      this.dispatchEvent(closeEvent);
      console.log('[MockWebSocket] Connection closed:', code, reason);
    }, 10);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
    return true;
  }
}

// WebSocket mock management functions
export function setupWebSocketMock(config?: Partial<MockWebSocketConfig>): void {
  const defaultConfig: MockWebSocketConfig = {
    enabled: true,
    autoRespond: false,
    responseDelay: 100,
    mockResponses: new Map(),
    ...config,
  };

  if (!defaultConfig.enabled) {
    console.log('[MockWebSocket] Mocking disabled');
    return;
  }

  // Store original WebSocket
  const OriginalWebSocket = window.WebSocket;
  (window as any).__OriginalWebSocket = OriginalWebSocket;

  // Replace WebSocket with mock
  (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
    // Check if URL matches the pattern to mock
    if (defaultConfig.url) {
      const shouldMock = typeof defaultConfig.url === 'string' 
        ? url.includes(defaultConfig.url)
        : defaultConfig.url.test(url);
      
      if (!shouldMock) {
        console.log('[MockWebSocket] URL not matched, using real WebSocket:', url);
        return new OriginalWebSocket(url, protocols);
      }
    }
    
    console.log('[MockWebSocket] Creating mock WebSocket for:', url);
    return new MockWebSocket(url, protocols, defaultConfig);
  };

  // Copy static properties
  Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
  Object.keys(OriginalWebSocket).forEach(key => {
    (window.WebSocket as any)[key] = (OriginalWebSocket as any)[key];
  });

  console.log('[MockWebSocket] WebSocket mocking enabled');
}

export function restoreWebSocket(): void {
  if ((window as any).__OriginalWebSocket) {
    window.WebSocket = (window as any).__OriginalWebSocket;
    delete (window as any).__OriginalWebSocket;
    delete (window as any).__mockWebSocket;
    delete (window as any).__mockWebSocketMessages;
    console.log('[MockWebSocket] WebSocket restored to original');
  }
}

export function getMockWebSocketInstance(): MockWebSocketInstance | null {
  return (window as any).__mockWebSocket || null;
}

export function getMockWebSocketMessages(): any[] {
  return (window as any).__mockWebSocketMessages || [];
}

// Cypress commands
declare global {
  namespace Cypress {
    interface Chainable {
      mockWebSocket(config?: Partial<MockWebSocketConfig>): Chainable<void>;
      restoreWebSocket(): Chainable<void>;
      getWebSocketMessages(): Chainable<any[]>;
      sendWebSocketMessage(data: any): Chainable<void>;
      waitForWebSocketMessage(predicate?: (msg: any) => boolean, timeout?: number): Chainable<any>;
    }
  }
}

// Add Cypress commands
if ((window as any).Cypress) {
  Cypress.Commands.add('mockWebSocket', (config?: Partial<MockWebSocketConfig>) => {
    cy.window().then((win) => {
      (win as any).setupWebSocketMock = setupWebSocketMock;
      (win as any).setupWebSocketMock(config);
    });
  });

  Cypress.Commands.add('restoreWebSocket', () => {
    cy.window().then((win) => {
      (win as any).restoreWebSocket = restoreWebSocket;
      (win as any).restoreWebSocket();
    });
  });

  Cypress.Commands.add('getWebSocketMessages', () => {
    cy.window().then((win) => {
      return (win as any).__mockWebSocketMessages || [];
    });
  });

  Cypress.Commands.add('sendWebSocketMessage', (data: any) => {
    cy.window().then((win) => {
      const mockWs = (win as any).__mockWebSocket;
      if (mockWs) {
        mockWs.receiveMessage(data);
      } else {
        throw new Error('No mock WebSocket instance found');
      }
    });
  });

  Cypress.Commands.add('waitForWebSocketMessage', (predicate?: (msg: any) => boolean, timeout = 5000) => {
    return cy.window().then((win) => {
      return new Cypress.Promise((resolve) => {
        const startTime = Date.now();
        const checkMessages = () => {
          const messages = (win as any).__mockWebSocketMessages || [];
          const foundMessage = predicate 
            ? messages.find(predicate)
            : messages[messages.length - 1];
          
          if (foundMessage) {
            resolve(foundMessage);
          } else if (Date.now() - startTime > timeout) {
            throw new Error('Timeout waiting for WebSocket message');
          } else {
            setTimeout(checkMessages, 100);
          }
        };
        checkMessages();
      });
    });
  });
}