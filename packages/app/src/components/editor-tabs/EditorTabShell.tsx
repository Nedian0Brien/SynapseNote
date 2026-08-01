import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  EditorTabContextMenu,
  SortableTab,
  TAB_ACTIVE_CLASS,
  TAB_BASE_CLASS,
  TAB_INACTIVE_CLASS,
} from './EditorTabChrome';

/** Shared sortable/context-menu frame for every tab presentation branch. */
export function TabShell({
  activateFromKeyboard,
  active,
  canPin = true,
  children,
  closeTab,
  closeVisibleTabs,
  disabled = false,
  isPinned = false,
  onActivate,
  openTabs,
  tabId,
  pinnedTabIds,
  pinTab,
  unpinTab,
  ariaKeyShortcuts,
  renameError,
}: {
  activateFromKeyboard: () => void;
  active: boolean;
  ariaKeyShortcuts?: string;
  canPin?: boolean;
  children: ReactNode;
  closeTab: (tabId: string) => void;
  closeVisibleTabs: (tabIds: readonly string[]) => void;
  disabled?: boolean;
  isPinned?: boolean;
  onActivate: () => void;
  openTabs: readonly string[];
  pinnedTabIds: readonly string[];
  pinTab: (tabId: string) => void;
  renameError?: string | null;
  tabId: string;
  unpinTab: (tabId: string) => void;
}) {
  return (
    <EditorTabContextMenu
      tabId={tabId}
      canPin={canPin}
      disabled={disabled}
      openTabs={openTabs}
      closeTab={closeTab}
      closeTabs={closeVisibleTabs}
      pinTab={pinTab}
      pinnedTabIds={pinnedTabIds}
      unpinTab={unpinTab}
    >
      <SortableTab
        tabId={tabId}
        activateFromKeyboard={activateFromKeyboard}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        aria-keyshortcuts={ariaKeyShortcuts}
        data-active-tab={active ? 'true' : undefined}
        className={cn(
          TAB_BASE_CLASS,
          active ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
          disabled && renameError && 'border-destructive',
        )}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          if (!canPin || !isPinned) closeTab(tabId);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onActivate();
        }}
      >
        {children}
      </SortableTab>
    </EditorTabContextMenu>
  );
}
