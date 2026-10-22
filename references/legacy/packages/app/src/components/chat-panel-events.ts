/**
 * Window-scoped pub/sub that asks the Chat panel to come forward and take
 * focus — the single open+focus path behind ⌘L, the editor's "Ask AI" bubble
 * affordance (when there is no passage to send), and source mode's ⌘⇧I.
 *
 * Two hosts subscribe, each owning half of the intent: `EditorPane` reveals the
 * right rail's Chat surface (seeding a first session when none exists), and
 * `TerminalSessionsHost` moves focus into the active session's message box.
 * Splitting it that way keeps both halves where the state already lives — the
 * pane owns dock placement, the host owns which session is active — instead of
 * lifting either one just to serve a keyboard shortcut.
 *
 * Mirrors the `terminal-launch-events` / `terminal-input-events` idiom: the
 * callers live inside the editor subtree while the chat surface is a sibling
 * under the app shell, so a context alone cannot thread the intent between
 * them. The signal is intent-only — no payload.
 */

const OPEN_CHAT_PANEL_EVENT = 'synapsenote:open-chat-panel';

export function emitOpenChatPanel(
  target: Pick<Window, 'dispatchEvent'> | EventTarget = typeof window === 'undefined'
    ? new EventTarget()
    : window,
): void {
  target.dispatchEvent(new CustomEvent(OPEN_CHAT_PANEL_EVENT));
}

export function subscribeToOpenChatPanel(
  onRequest: () => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = () => onRequest();
  target.addEventListener(OPEN_CHAT_PANEL_EVENT, listener as EventListener);
  return () => target.removeEventListener(OPEN_CHAT_PANEL_EVENT, listener as EventListener);
}
