import { useEffect, useRef, useState } from 'react';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { getOffsetTabId, getTabJumpIndex } from './editor-tab-model';

const TAB_SHORTCUT_HINT_DELAY_MS = 1000;

export interface UseEditorTabKeyboardShortcutsOptions {
  activeNewTabId: string | null;
  activeTabId: string | null;
  activateNewTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  isNewTabActive: boolean;
  newTabIds: readonly string[];
  openNewTab: () => void;
  reopenClosedTab: () => void;
  visibleTabIds: readonly string[];
}

/** Owns global shortcut transitions and the delayed shortcut-hint presentation. */
export function useEditorTabKeyboardShortcuts({
  activeNewTabId,
  activeTabId,
  activateNewTab,
  activateTab,
  isNewTabActive,
  newTabIds,
  openNewTab,
  reopenClosedTab,
  visibleTabIds,
}: UseEditorTabKeyboardShortcutsOptions) {
  const [showTabShortcutHints, setShowTabShortcutHints] = useState(false);
  const tabShortcutHintTimerRef = useRef<number | null>(null);
  const isTabShortcutModifierHeldRef = useRef(false);
  const showTabShortcutHintsRef = useRef(false);

  useEffect(() => {
    return () => {
      if (tabShortcutHintTimerRef.current === null) return;
      window.clearTimeout(tabShortcutHintTimerRef.current);
      tabShortcutHintTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const currentNewTabIds = new Set(newTabIds);
    function clearTabShortcutHintTimer() {
      if (tabShortcutHintTimerRef.current === null) return;
      window.clearTimeout(tabShortcutHintTimerRef.current);
      tabShortcutHintTimerRef.current = null;
    }
    function setTabShortcutModifierHeld(nextValue: boolean) {
      if (isTabShortcutModifierHeldRef.current === nextValue) return;
      isTabShortcutModifierHeldRef.current = nextValue;
    }
    function setTabShortcutHintsVisible(nextValue: boolean) {
      if (showTabShortcutHintsRef.current === nextValue) return;
      showTabShortcutHintsRef.current = nextValue;
      setShowTabShortcutHints(nextValue);
    }
    function scheduleTabShortcutHintReveal() {
      setTabShortcutModifierHeld(true);
      if (showTabShortcutHintsRef.current || tabShortcutHintTimerRef.current !== null) return;
      tabShortcutHintTimerRef.current = window.setTimeout(() => {
        tabShortcutHintTimerRef.current = null;
        if (!isTabShortcutModifierHeldRef.current) return;
        setTabShortcutHintsVisible(true);
      }, TAB_SHORTCUT_HINT_DELAY_MS);
    }
    function clearShortcutHints() {
      clearTabShortcutHintTimer();
      setTabShortcutModifierHeld(false);
      setTabShortcutHintsVisible(false);
    }
    function activateVisibleTab(tabId: string) {
      if (currentNewTabIds.has(tabId)) activateNewTab(tabId);
      else activateTab(tabId);
    }
    function activateTabByOffset(offset: number) {
      const nextTabId = getOffsetTabId({
        activeTabId: isNewTabActive ? activeNewTabId : activeTabId,
        offset,
        visibleTabIds,
      });
      if (nextTabId) activateVisibleTab(nextTabId);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) scheduleTabShortcutHintReveal();
      if (matchesKeyboardShortcut(event, 'tab-new')) {
        event.preventDefault();
        openNewTab();
        return;
      }
      if (matchesKeyboardShortcut(event, 'tab-reopen-closed')) {
        event.preventDefault();
        reopenClosedTab();
        return;
      }
      if (matchesKeyboardShortcut(event, 'tab-next')) {
        event.preventDefault();
        activateTabByOffset(1);
        return;
      }
      if (matchesKeyboardShortcut(event, 'tab-previous')) {
        event.preventDefault();
        activateTabByOffset(-1);
        return;
      }
      const jumpIndex = getTabJumpIndex(event, visibleTabIds.length);
      if (jumpIndex === null) return;
      const nextTabId = visibleTabIds[jumpIndex];
      if (!nextTabId) return;
      event.preventDefault();
      activateVisibleTab(nextTabId);
    }
    function onKeyUp(event: globalThis.KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) clearShortcutHints();
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', clearShortcutHints);
    document.addEventListener('visibilitychange', clearShortcutHints);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', clearShortcutHints);
      document.removeEventListener('visibilitychange', clearShortcutHints);
    };
  }, [
    activeNewTabId,
    activeTabId,
    activateNewTab,
    activateTab,
    isNewTabActive,
    newTabIds,
    openNewTab,
    reopenClosedTab,
    visibleTabIds,
  ]);

  return showTabShortcutHints;
}
