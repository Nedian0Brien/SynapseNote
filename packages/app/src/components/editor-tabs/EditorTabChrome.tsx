// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> awaiting shadcn migration; tracked at https://github.com/Nedian0Brien/SynapseNote/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { useSortable } from '@dnd-kit/sortable';
import { Trans, useLingui } from '@lingui/react/macro';
import { AlertTriangle, PinIcon, XIcon } from 'lucide-react';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Kbd } from '@/components/ui/kbd';
import { filterClosableTabIds } from '@/editor/editor-tabs';
import { useLifecycleStatus } from '@/hooks/use-lifecycle-status';
import { cn } from '@/lib/utils';
import {
  getSortableTabClassName,
  getSortableTabKeyDownAction,
  getSortableTabStyle,
  getTabCloseButtonClass,
  getTabCloseButtonTabIndex,
} from '../editor-tabs-chrome';

export const TAB_BASE_CLASS =
  'group relative -mb-px flex h-10 min-w-28 max-w-64 shrink-0 cursor-pointer items-center overflow-hidden border border-transparent font-medium transition-colors';
export const TAB_ACTIVE_CLASS =
  'z-10 rounded-t-lg rounded-b-none border-border border-b-0 bg-background text-foreground';
export const TAB_INACTIVE_CLASS = cn(
  TAB_ACTIVE_CLASS,
  'bg-transparent hover:bg-muted focus-visible:bg-muted border-transparent hover:border-border focus-visible:border-border',
);
export const TAB_BUTTON_CLASS =
  'flex h-full min-w-0 flex-1 cursor-pointer items-center overflow-hidden px-3 text-left text-[13px]';

export function TabShortcutHint({ value }: { value: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="editor-tab-shortcut-hint"
      className={cn(
        getTabCloseButtonClass(true),
        'font-mono tabular-nums hover:bg-transparent animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none motion-reduce:duration-0',
      )}
    >
      <Kbd className="text-[10px]">{`⌘${value}`}</Kbd>
    </span>
  );
}

/** The sortable focus target wraps each branch-specific tab surface. */
export function SortableTab({
  activateFromKeyboard,
  className,
  tabId,
  disabled,
  contextMenuTrigger = false,
  onKeyDown,
  style: outerStyle,
  ...rest
}: {
  activateFromKeyboard?: () => void;
  tabId: string;
  disabled?: boolean;
  contextMenuTrigger?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const { attributes, listeners, rect, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tabId, disabled });
  const style = getSortableTabStyle({
    activeWidth: rect.current?.width,
    isDragging,
    outerStyle,
    transform,
    transition,
  });
  const sortableKeyDown = listeners?.onKeyDown;
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    const action = getSortableTabKeyDownAction({
      event,
      hasKeyboardActivation: Boolean(activateFromKeyboard),
      isDragging,
    });
    if (action === 'ignore') return;
    if (action === 'activate-tab' && activateFromKeyboard) {
      event.preventDefault();
      activateFromKeyboard();
      return;
    }
    sortableKeyDown?.(event);
  }
  const sortableTab = (
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit attributes inject role and tabIndex; this composes the sortable key listener.
    <div
      ref={setNodeRef}
      data-editor-tab-sortable=""
      className={getSortableTabClassName({ className, isDragging })}
      style={style}
      {...rest}
      {...attributes}
      {...listeners}
      onKeyDown={handleKeyDown}
    />
  );
  return contextMenuTrigger ? (
    <ContextMenuTrigger asChild>{sortableTab}</ContextMenuTrigger>
  ) : (
    sortableTab
  );
}

export function EditorTabContextMenu({
  children,
  closeTab,
  closeTabs,
  canPin = true,
  disabled = false,
  openTabs,
  pinTab,
  pinnedTabIds,
  tabId,
  unpinTab,
}: {
  children: ReactNode;
  canPin?: boolean;
  closeTab: (tabId: string) => void;
  closeTabs: (tabIds: readonly string[]) => void;
  disabled?: boolean;
  openTabs: readonly string[];
  pinTab: (tabId: string) => void;
  pinnedTabIds: readonly string[];
  tabId: string;
  unpinTab: (tabId: string) => void;
}) {
  if (disabled) return children;
  const isPinned = canPin && pinnedTabIds.includes(tabId);
  const otherTabIds = filterClosableTabIds(
    openTabs.filter((openTabId) => openTabId !== tabId),
    pinnedTabIds,
  );
  const closableTabIds = filterClosableTabIds(openTabs, pinnedTabIds);
  return (
    <ContextMenu>
      {children}
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem disabled={isPinned} onSelect={() => closeTab(tabId)}>
          <Trans>Close</Trans>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={otherTabIds.length === 0}
          onSelect={() => closeTabs(otherTabIds)}
        >
          <Trans>Close others</Trans>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={closableTabIds.length === 0}
          data-testid="editor-tab-context-close-all"
          onSelect={() => closeTabs(closableTabIds)}
        >
          {pinnedTabIds.length ? <Trans>Close all unpinned</Trans> : <Trans>Close all</Trans>}
        </ContextMenuItem>
        {canPin && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              data-testid="editor-tab-context-pin-toggle"
              onSelect={() => (isPinned ? unpinTab(tabId) : pinTab(tabId))}
            >
              {isPinned ? <Trans>Unpin tab</Trans> : <Trans>Pin tab</Trans>}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function TabPinOrCloseButton({
  accessibleLabel,
  closeTab,
  forceCloseVisible = false,
  isActive,
  isPinned,
  shortcutHint = null,
  tabId,
  unpinTab,
}: {
  accessibleLabel: string;
  closeTab: (tabId: string) => void;
  forceCloseVisible?: boolean;
  isActive: boolean;
  isPinned: boolean;
  shortcutHint?: string | null;
  tabId: string;
  unpinTab: (tabId: string) => void;
}) {
  const { t } = useLingui();
  if (shortcutHint) return <TabShortcutHint value={shortcutHint} />;
  if (isPinned) {
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        aria-label={t({ message: `Unpin ${accessibleLabel}` })}
        data-testid="editor-tab-unpin-button"
        className="mr-1.5 text-primary! hover:bg-primary/10!"
        onClick={(event) => {
          event.stopPropagation();
          unpinTab(tabId);
        }}
      >
        <PinIcon aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={t({ message: `Close ${accessibleLabel}` })}
      data-testid="editor-tab-close-button"
      className={getTabCloseButtonClass(forceCloseVisible || isActive)}
      tabIndex={getTabCloseButtonTabIndex(isActive)}
      onClick={(event) => {
        event.stopPropagation();
        closeTab(tabId);
      }}
    >
      <XIcon aria-hidden="true" />
    </Button>
  );
}

function TabConflictBadge({ hasConflict }: { hasConflict: boolean }) {
  if (!hasConflict) return null;
  return (
    <AlertTriangle
      aria-hidden="true"
      data-testid="editor-tab-conflict-badge"
      className="mr-1 size-3.5 shrink-0 text-amber-500"
    />
  );
}

export function DocumentTabButton({
  accessibleLabel,
  activateTab,
  baseName,
  docName,
  enterRenameMode,
  extension,
  hideDocExtension,
  tabId,
}: {
  accessibleLabel: string;
  activateTab: (tabId: string) => void;
  baseName: string;
  docName: string;
  enterRenameMode: (tabId: string, docName: string) => void;
  extension: string;
  hideDocExtension: boolean;
  tabId: string;
}) {
  const { t } = useLingui();
  const lifecycleStatus = useLifecycleStatus(docName);
  const hasConflict = lifecycleStatus === 'conflict';
  const buttonAccessibleLabel = hasConflict
    ? t({ message: `${accessibleLabel} (conflict)` })
    : accessibleLabel;
  return (
    <button
      type="button"
      aria-label={buttonAccessibleLabel}
      title={buttonAccessibleLabel}
      className={TAB_BUTTON_CLASS}
      onClick={() => activateTab(tabId)}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        enterRenameMode(tabId, docName);
      }}
      tabIndex={-1}
    >
      <TabConflictBadge hasConflict={hasConflict} />
      <span className="flex min-w-0 flex-1 items-center">
        <span className="min-w-0 truncate">{baseName}</span>
        {!hideDocExtension && <span className="shrink-0">{extension}</span>}
      </span>
    </button>
  );
}
