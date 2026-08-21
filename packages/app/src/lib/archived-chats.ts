/**
 * Chats the user has put away.
 *
 * Archiving hides a native CLI conversation from the surfaces that offer it
 * back — the sidebar's Chat list and the tab strip's "previous chats" menu —
 * without touching the transcript the CLI owns on disk. That keeps the action
 * reversible (unarchive restores the row) and keeps SynapseNote out of the
 * business of moving files another program is still writing.
 *
 * The set is per device, like the other view preferences: which chats a person
 * wants out of the way on this machine says nothing about the project itself.
 *
 * Surfaces that read the set subscribe to {@link subscribeToArchivedChats},
 * following the same window-event idiom as `create-file-events` — a tab's
 * context menu and the sidebar live in different trees, so the write has to
 * reach the reader without threading state through their common ancestor.
 */

export type ArchivedChatCli = 'codex' | 'claude';

const ARCHIVED_CHATS_STORAGE_KEY = 'synapsenote:archived-chats:v1';
const ARCHIVED_CHATS_EVENT = 'synapsenote:archived-chats-changed';

/** Identity of one archived chat. The CLI is part of the key because the two
 *  CLIs mint session ids independently. */
export function archivedChatKey(cli: ArchivedChatCli, sessionId: string): string {
  return `${cli}:${sessionId}`;
}

export function loadArchivedChats(): ReadonlySet<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ARCHIVED_CHATS_STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((key): key is string => typeof key === 'string'));
  } catch {
    return new Set();
  }
}

function save(keys: ReadonlySet<string>): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(ARCHIVED_CHATS_STORAGE_KEY, JSON.stringify([...keys]));
    } catch {
      // A full or blocked store costs the preference, never the session.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ARCHIVED_CHATS_EVENT));
  }
}

/** Put a chat away. Returns the set as it now stands. */
export function archiveChat(cli: ArchivedChatCli, sessionId: string): ReadonlySet<string> {
  const next = new Set(loadArchivedChats());
  next.add(archivedChatKey(cli, sessionId));
  save(next);
  return next;
}

/** Bring a chat back into the lists. */
export function unarchiveChat(cli: ArchivedChatCli, sessionId: string): ReadonlySet<string> {
  const next = new Set(loadArchivedChats());
  next.delete(archivedChatKey(cli, sessionId));
  save(next);
  return next;
}

export function subscribeToArchivedChats(
  onChange: (archived: ReadonlySet<string>) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = () => onChange(loadArchivedChats());
  window.addEventListener(ARCHIVED_CHATS_EVENT, listener);
  // A second window (the standalone terminal) writes to the same store; its
  // `storage` event is how this one hears about it.
  const storageListener = (event: StorageEvent) => {
    if (event.key === null || event.key === ARCHIVED_CHATS_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(ARCHIVED_CHATS_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}
