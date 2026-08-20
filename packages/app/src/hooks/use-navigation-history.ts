import { useSyncExternalStore } from 'react';
import {
  APP_NAVIGATION_REPLACED_EVENT,
  type AppNavigationReplacedDetail,
} from '@/lib/app-navigation-events';

const MAX_NAVIGATION_ENTRIES = 100;

export interface NavigationHistorySnapshot {
  canGoBack: boolean;
  canGoForward: boolean;
}

const EMPTY_SNAPSHOT: NavigationHistorySnapshot = {
  canGoBack: false,
  canGoForward: false,
};

let entries: string[] = [];
let currentIndex = -1;
let snapshot = EMPTY_SNAPSHOT;
let listening = false;
let unsubscribeDesktopNavigation: (() => void) | null = null;
const listeners = new Set<() => void>();

const MOUSE_NAVIGATION_BACK_BUTTON = 3;
const MOUSE_NAVIGATION_FORWARD_BUTTON = 4;

/**
 * Keep only app content routes. A second `#` is a document/folder anchor, so
 * it is intentionally excluded from navigation history: jumping between
 * headings in one document should not consume Back/Forward entries.
 */
function navigationRouteFromHash(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const anchorIndex = hash.indexOf('#', 1);
  return anchorIndex < 0 ? hash : hash.slice(0, anchorIndex);
}

function updateSnapshot(): void {
  const next: NavigationHistorySnapshot = {
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex >= 0 && currentIndex < entries.length - 1,
  };
  if (next.canGoBack === snapshot.canGoBack && next.canGoForward === snapshot.canGoForward) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function recordNavigation(hash: string): void {
  const route = navigationRouteFromHash(hash);
  if (!route || entries[currentIndex] === route) return;

  entries = entries.slice(0, currentIndex + 1);
  entries.push(route);
  if (entries.length > MAX_NAVIGATION_ENTRIES) {
    entries = entries.slice(entries.length - MAX_NAVIGATION_ENTRIES);
  }
  currentIndex = entries.length - 1;
  updateSnapshot();
}

function handleHashChange(): void {
  recordNavigation(window.location.hash);
}

function handleNavigationReplaced(event: Event): void {
  const { detail } = event as CustomEvent<AppNavigationReplacedDetail>;
  recordNavigation(detail.hash);
}

function navigationOffsetForMouseButton(button: number): -1 | 1 | null {
  if (button === MOUSE_NAVIGATION_BACK_BUTTON) return -1;
  if (button === MOUSE_NAVIGATION_FORWARD_BUTTON) return 1;
  return null;
}

function handleNavigationMouseDown(event: MouseEvent): void {
  if (navigationOffsetForMouseButton(event.button) === null) return;
  // Chromium otherwise traverses its page-level history, which intentionally
  // differs from the editor's content-history stack (file-tree navigation can
  // use replaceState). Consume the gesture at the window boundary.
  event.preventDefault();
}

function handleNavigationMouseUp(event: MouseEvent): void {
  const offset = navigationOffsetForMouseButton(event.button);
  if (offset === null) return;
  event.preventDefault();
  moveTo(currentIndex + offset);
}

function handleNavigationAuxClick(event: MouseEvent): void {
  if (navigationOffsetForMouseButton(event.button) === null) return;
  // `auxclick` follows mouseup in Chromium. Navigation already happened in
  // handleNavigationMouseUp; this only cancels the remaining native default.
  event.preventDefault();
}

function handleDesktopNavigation(action: string): void {
  if (action === 'navigate-back') moveTo(currentIndex - 1);
  if (action === 'navigate-forward') moveTo(currentIndex + 1);
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  recordNavigation(window.location.hash);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener(APP_NAVIGATION_REPLACED_EVENT, handleNavigationReplaced);
  window.addEventListener('mousedown', handleNavigationMouseDown, true);
  window.addEventListener('mouseup', handleNavigationMouseUp, true);
  window.addEventListener('auxclick', handleNavigationAuxClick, true);
  unsubscribeDesktopNavigation = window.okDesktop?.onMenuAction(handleDesktopNavigation) ?? null;
}

function stopListening(): void {
  if (!listening || typeof window === 'undefined') return;
  listening = false;
  window.removeEventListener('hashchange', handleHashChange);
  window.removeEventListener(APP_NAVIGATION_REPLACED_EVENT, handleNavigationReplaced);
  window.removeEventListener('mousedown', handleNavigationMouseDown, true);
  window.removeEventListener('mouseup', handleNavigationMouseUp, true);
  window.removeEventListener('auxclick', handleNavigationAuxClick, true);
  unsubscribeDesktopNavigation?.();
  unsubscribeDesktopNavigation = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startListening();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopListening();
  };
}

function getSnapshot(): NavigationHistorySnapshot {
  return snapshot;
}

function moveTo(nextIndex: number): void {
  const nextHash = entries[nextIndex];
  if (nextHash === undefined || nextIndex === currentIndex) return;
  currentIndex = nextIndex;
  updateSnapshot();
  window.location.hash = nextHash;
}

export function useNavigationHistory(): NavigationHistorySnapshot & {
  goBack: () => void;
  goForward: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
  return {
    ...state,
    goBack: () => moveTo(currentIndex - 1),
    goForward: () => moveTo(currentIndex + 1),
  };
}

/** Test-only reset for the module-level, per-window session store. */
export function resetNavigationHistoryForTesting(): void {
  entries = [];
  currentIndex = -1;
  snapshot = EMPTY_SNAPSHOT;
}
