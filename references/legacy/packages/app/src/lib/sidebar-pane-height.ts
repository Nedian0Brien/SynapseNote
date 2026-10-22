/**
 * Per-device height of the sidebar's Chat pane.
 *
 * The sidebar stacks two lists in one column — native chats over the project
 * file tree — and how that column is split is a viewing preference of this
 * window, not project content. It therefore lives in localStorage beside the
 * other layout preferences instead of the synced project config.
 *
 * The stored value is the height the user asked for. What renders is that
 * height clamped against what the list and the viewport can actually give
 * (see {@link resolveChatPaneHeight}), so a short chat list never leaves a
 * dead gap above the file tree and a tall one never eats the whole sidebar.
 */

/** Matches the pane's previous fixed `max-h-52` cap, so an untouched sidebar
 * keeps the exact height it had before the split became adjustable. */
export const CHAT_PANE_DEFAULT_HEIGHT = 208;
/** Two rows plus padding — below this the list stops being a list. */
export const CHAT_PANE_MIN_HEIGHT = 72;
/** Share of the sidebar column the chat pane may claim, leaving the file tree
 * a usable remainder no matter how far the handle is dragged. */
const CHAT_PANE_MAX_VIEWPORT_RATIO = 0.6;

export const CHAT_PANE_HEIGHT_STORAGE_KEY = 'synapsenote:sidebar-chat-pane-height:v1';

/** Largest height the chat pane may take inside a column of `viewportHeight`
 * pixels. Never returns less than the minimum, so the range stays valid even
 * in a very short window. */
export function chatPaneMaxHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return CHAT_PANE_DEFAULT_HEIGHT;
  return Math.max(CHAT_PANE_MIN_HEIGHT, Math.round(viewportHeight * CHAT_PANE_MAX_VIEWPORT_RATIO));
}

export function clampChatPaneHeight(height: number, viewportHeight: number): number {
  if (!Number.isFinite(height)) return CHAT_PANE_DEFAULT_HEIGHT;
  return Math.min(
    chatPaneMaxHeight(viewportHeight),
    Math.max(CHAT_PANE_MIN_HEIGHT, Math.round(height)),
  );
}

/**
 * Height the pane actually renders at: the requested height, but never taller
 * than the list it holds. Dragging past the last chat would otherwise open a
 * gap of empty pane, which reads as a rendering bug rather than a setting.
 */
export function resolveChatPaneHeight(options: {
  readonly requestedHeight: number;
  readonly contentHeight: number | null;
  readonly viewportHeight: number;
}): number {
  const requested = clampChatPaneHeight(options.requestedHeight, options.viewportHeight);
  const { contentHeight } = options;
  if (contentHeight === null || !Number.isFinite(contentHeight) || contentHeight <= 0) {
    return requested;
  }
  // A list shorter than the request wins outright: the pane hugs its rows
  // rather than padding itself out to a height nothing fills.
  return Math.min(requested, Math.round(contentHeight));
}

export function loadChatPaneHeight(): number {
  if (typeof localStorage === 'undefined') return CHAT_PANE_DEFAULT_HEIGHT;
  try {
    const raw = localStorage.getItem(CHAT_PANE_HEIGHT_STORAGE_KEY);
    if (raw === null) return CHAT_PANE_DEFAULT_HEIGHT;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed)
      ? Math.max(CHAT_PANE_MIN_HEIGHT, parsed)
      : CHAT_PANE_DEFAULT_HEIGHT;
  } catch {
    return CHAT_PANE_DEFAULT_HEIGHT;
  }
}

export function saveChatPaneHeight(height: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CHAT_PANE_HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // A full or blocked store only costs the preference, never the session.
  }
}
