// messages between the editor page and the native app, the only way either side reaches the other
import type { DocNode, PageId, PageMeta, WorkspaceState } from '../vendor/morrow/src/core/model';

export type Theme = 'light' | 'dark';

// sent by the native app through window.synapse.receive
export type InboundMessage =
  // the page to edit and the whole workspace, which link titles, link menus and embeds read from
  | { type: 'load'; pageId: PageId; state: WorkspaceState; editable: boolean }
  | { type: 'theme'; theme: Theme }
  | { type: 'flush' };

// posted to the native app through window.webkit.messageHandlers.editor
export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'docChanged'; pageId: PageId; doc: DocNode }
  | { type: 'openPage'; pageId: PageId }
  | { type: 'pageCreated'; page: PageMeta; doc: DocNode }
  | { type: 'openExternal'; url: string }
  | { type: 'log'; level: 'error' | 'warning'; message: string };

interface WebkitHandler {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { editor?: WebkitHandler } };
    synapse?: { receive(message: unknown): boolean };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDoc = (value: unknown): value is DocNode => isRecord(value) && value.type === 'doc';

const isState = (value: unknown): value is WorkspaceState =>
  isRecord(value) &&
  isRecord(value.pages) &&
  isRecord(value.docs) &&
  Object.entries(value.pages).every(([id, page]) => isRecord(page) && page.id === id) &&
  Object.values(value.docs).every(isDoc);

// anything that does not match a known message exactly is dropped
export function parseInbound(value: unknown): InboundMessage | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'load':
      if (typeof value.pageId !== 'string' || !isState(value.state)) return null;
      if (!value.state.pages[value.pageId] || !value.state.docs[value.pageId]) return null;
      return { type: 'load', pageId: value.pageId, state: value.state, editable: value.editable !== false };
    case 'theme':
      return value.theme === 'light' || value.theme === 'dark' ? { type: 'theme', theme: value.theme } : null;
    case 'flush':
      return { type: 'flush' };
    default:
      return null;
  }
}

export function post(message: OutboundMessage): void {
  globalThis.window?.webkit?.messageHandlers?.editor?.postMessage(message);
}

export function listen(handler: (message: InboundMessage) => void): void {
  window.synapse = {
    receive(raw: unknown) {
      const message = parseInbound(raw);
      if (message) handler(message);
      return message !== null;
    },
  };
}
