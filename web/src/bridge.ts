// messages between the editor page and the native app, the only way either side reaches the other
import type { Command } from '../vendor/morrow/src/core/commands';
import type { PageId, PageMeta } from '../vendor/morrow/src/core/model';
import type { SaveState } from '../vendor/morrow/src/storage/saveQueue';
import type { VaultChange } from '../vendor/morrow/src/storage/vaultBridge';

export type Theme = 'light' | 'dark';

// sent by the native app through window.synapse.receive
export type InboundMessage =
  // opens the vault the app has access to, name is shown wherever the vault is named
  | { type: 'openVault'; name: string }
  // find is text to select once the page is open, such as the words a search matched
  | { type: 'show'; pageId: PageId | null; find: string | null }
  | { type: 'rpcResult'; id: number; ok: true; value: unknown }
  | { type: 'rpcResult'; id: number; ok: false; error: string }
  | { type: 'vaultChanges'; changes: VaultChange[] }
  | { type: 'createPage'; parentId: PageId | null }
  | { type: 'trashPage'; pageId: PageId }
  // a morrow Command from a native screen, checked by morrow's applyCommand like any other
  | { type: 'command'; command: Command }
  | { type: 'theme'; theme: Theme }
  // the open page's top level heading at this position is scrolled into view
  | { type: 'scrollToHeading'; index: number }
  // opens the open page's find bar
  | { type: 'find' };

// posted to the native app through window.webkit.messageHandlers.editor
export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: number; method: string; params: unknown[] }
  | { type: 'workspace'; pages: Record<PageId, PageMeta>; saveState: SaveState; saveError: string | null }
  // newTab when the page was opened with a ctrl or cmd click
  | { type: 'openPage'; pageId: PageId | null; newTab?: boolean; find?: string | null }
  | { type: 'chooseIcon'; pageId: PageId }
  | { type: 'vaultFailed'; message: string }
  | { type: 'openExternal'; url: string }
  | { type: 'log'; level: 'error' | 'warning'; message: string }
  // a key the page received that belongs to the app, such as escape leaving focus mode
  | { type: 'shortcut'; id: 'escape' };

interface WebkitHandler {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { editor?: WebkitHandler } };
    synapse?: { receive(message: unknown): boolean } & HostApi;
  }
}

// what the app calls directly, for answers it waits for
export interface HostApi {
  flush(): Promise<boolean>;
  pathOf(id: string): string | null;
  // a workspace answer as JSON text, null while no vault is open or for a query that is not known
  query(name: string, params: Record<string, unknown>): string | null;
  // opens the link editor when text is selected in the editor, as cmd k does there; false when nothing is selected
  linkSelection(): boolean;
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
      if (value.pageId !== null && !isId(value.pageId)) return null;
      if (value.find !== undefined && value.find !== null && typeof value.find !== 'string') return null;
      return { type: 'show', pageId: value.pageId, find: value.find || null };
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
    case 'command':
      // the shape is checked by morrow's applyCommand, this only makes sure there is a command to check
      return isRecord(value.command) && typeof value.command.type === 'string'
        ? { type: 'command', command: value.command as unknown as Command }
        : null;
    case 'theme':
      return value.theme === 'light' || value.theme === 'dark' ? { type: 'theme', theme: value.theme } : null;
    case 'scrollToHeading':
      return Number.isInteger(value.index) && (value.index as number) >= 0
        ? { type: 'scrollToHeading', index: value.index as number }
        : null;
    case 'find':
      return { type: 'find' };
    default:
      return null;
  }
}

export function post(message: OutboundMessage): void {
  globalThis.window?.webkit?.messageHandlers?.editor?.postMessage(message);
}

export function listen(handler: (message: InboundMessage) => void, api: HostApi): void {
  window.synapse = {
    receive(raw: unknown) {
      const message = parseInbound(raw);
      if (message) handler(message);
      return message !== null;
    },
    ...api,
  };
}
