// messages between the editor page and the native app, the only way either side reaches the other
import type { PageId, PageMeta } from '../vendor/morrow/src/core/model';
import type { SaveState } from '../vendor/morrow/src/storage/saveQueue';
import type { VaultChange } from '../vendor/morrow/src/storage/vaultBridge';

export type Theme = 'light' | 'dark';

// sent by the native app through window.synapse.receive
export type InboundMessage =
  // opens the vault the app has access to, name is shown wherever the vault is named
  | { type: 'openVault'; name: string }
  | { type: 'show'; pageId: PageId | null }
  | { type: 'rpcResult'; id: number; ok: true; value: unknown }
  | { type: 'rpcResult'; id: number; ok: false; error: string }
  | { type: 'vaultChanges'; changes: VaultChange[] }
  | { type: 'createPage'; parentId: PageId | null }
  | { type: 'trashPage'; pageId: PageId }
  | { type: 'theme'; theme: Theme };

// posted to the native app through window.webkit.messageHandlers.editor
export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: number; method: string; params: unknown[] }
  | { type: 'workspace'; pages: Record<PageId, PageMeta>; saveState: SaveState; saveError: string | null }
  | { type: 'openPage'; pageId: PageId | null }
  | { type: 'vaultFailed'; message: string }
  | { type: 'openExternal'; url: string }
  | { type: 'log'; level: 'error' | 'warning'; message: string };

interface WebkitHandler {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { editor?: WebkitHandler } };
    synapse?: { receive(message: unknown): boolean; flush(): Promise<boolean> };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isChange = (value: unknown): value is VaultChange =>
  isRecord(value) &&
  typeof value.path === 'string' &&
  (typeof value.text === 'string' || value.text === null) &&
  typeof value.mtime === 'number' &&
  typeof value.birthtime === 'number';

// anything that does not match a known message exactly is dropped
export function parseInbound(value: unknown): InboundMessage | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'openVault':
      return typeof value.name === 'string' ? { type: 'openVault', name: value.name } : null;
    case 'show':
      return value.pageId === null || isId(value.pageId) ? { type: 'show', pageId: value.pageId } : null;
    case 'rpcResult':
      if (typeof value.id !== 'number') return null;
      if (value.ok === true) return { type: 'rpcResult', id: value.id, ok: true, value: value.value };
      return { type: 'rpcResult', id: value.id, ok: false, error: String(value.error ?? 'The app could not finish.') };
    case 'vaultChanges':
      return Array.isArray(value.changes) && value.changes.every(isChange)
        ? { type: 'vaultChanges', changes: value.changes }
        : null;
    case 'createPage':
      return value.parentId === null || isId(value.parentId)
        ? { type: 'createPage', parentId: value.parentId }
        : null;
    case 'trashPage':
      return isId(value.pageId) ? { type: 'trashPage', pageId: value.pageId } : null;
    case 'theme':
      return value.theme === 'light' || value.theme === 'dark' ? { type: 'theme', theme: value.theme } : null;
    default:
      return null;
  }
}

export function post(message: OutboundMessage): void {
  globalThis.window?.webkit?.messageHandlers?.editor?.postMessage(message);
}

export function listen(handler: (message: InboundMessage) => void, flush: () => Promise<boolean>): void {
  window.synapse = {
    receive(raw: unknown) {
      const message = parseInbound(raw);
      if (message) handler(message);
      return message !== null;
    },
    flush,
  };
}
