import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Trans, useLingui } from '@lingui/react/macro';
import { PlusIcon } from 'lucide-react';
import { useEffect, useRef, useState, type WheelEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createTabReorderModifier,
  measureTabReorderBounds,
  TAB_KEYBOARD_DRAG_CODES,
  TAB_REORDER_AUTO_SCROLL,
  type TabReorderBounds,
  tabRunCollisionDetection,
} from '../editor-tabs-chrome';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { EditorTabItem } from './EditorTabItem';
import { transitionTabReorder } from './editor-tab-model';
import type { EditorTabRenameController } from './useEditorTabRename';

export interface EditorTabStripProps {
  activeNewTabId: string | null;
  activeTabId: string | null;
  activeTabScrollKey: string;
  activateNewTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  closeNewTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeTabs: (tabIds: readonly string[]) => void;
  forceTabCloseVisible: boolean;
  newTabIdSet: ReadonlySet<string>;
  openNewTab: () => void;
  pageMeta: ReadonlyMap<string, { docExt?: string }>;
  pinTab: (tabId: string) => void;
  pinnedTabIds: readonly string[];
  rename: EditorTabRenameController;
  reorderTabs: (nextOrder: readonly string[], draggedTabId: string) => void;
  unpinTab: (tabId: string) => void;
  visibleTabIds: readonly string[];
}

function scrollTabListOnWheel(event: WheelEvent<HTMLDivElement>) {
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
  event.preventDefault();
  event.currentTarget.scrollLeft += event.deltaY;
}

/** Owns tab-strip geometry, drag transitions, and branch-specific tab rendering. */
export function EditorTabStrip({
  activeNewTabId,
  activeTabId,
  activeTabScrollKey,
  activateNewTab,
  activateTab,
  closeNewTab,
  closeTab,
  closeTabs,
  forceTabCloseVisible,
  newTabIdSet,
  openNewTab,
  pageMeta,
  pinTab,
  pinnedTabIds,
  rename,
  reorderTabs,
  unpinTab,
  visibleTabIds,
}: EditorTabStripProps) {
  const { t } = useLingui();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabReorderBounds, setTabReorderBounds] = useState<TabReorderBounds | null>(null);
  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const tabReorderModifiers = [createTabReorderModifier(tabReorderBounds)];

  useEffect(() => {
    if (!activeTabScrollKey) return;
    const activeTab = tabListRef.current?.querySelector<HTMLElement>('[data-active-tab="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabScrollKey]);

  function closeVisibleTabs(tabIds: readonly string[]) {
    const documentTabIds: string[] = [];
    const emptyTabIds: string[] = [];
    for (const tabId of tabIds) {
      if (newTabIdSet.has(tabId)) emptyTabIds.push(tabId);
      else documentTabIds.push(tabId);
    }
    if (documentTabIds.length > 0) closeTabs(documentTabIds);
    for (const tabId of emptyTabIds) closeNewTab(tabId);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: TAB_KEYBOARD_DRAG_CODES,
    }),
  );

  function handleDragStart() {
    setTabReorderBounds(measureTabReorderBounds(tabListRef.current, '[data-editor-tab-sortable]'));
  }
  function clearTabReorderBounds() {
    setTabReorderBounds(null);
  }
  function handleDragEnd(event: DragEndEvent) {
    clearTabReorderBounds();
    const transition = transitionTabReorder(visibleTabIds, {
      activeTabId: String(event.active.id),
      overTabId: event.over ? String(event.over.id) : null,
    });
    if (transition) reorderTabs(transition.orderedTabIds, transition.activeTabId);
  }

  return (
    <div
      ref={tabListRef}
      data-electron-drag={isElectronHost ? '' : undefined}
      className={cn(
        'pl-2 flex h-12 min-w-0 touch-manipulation flex-1 items-end overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-fade-mask-x [scrollbar-width:none]',
        isElectronHost && '[-webkit-app-region:drag]',
      )}
      onWheel={scrollTabListOnWheel}
    >
      <div className={cn('flex items-end gap-1', isElectronHost && '[-webkit-app-region:no-drag]')}>
        <DndContext
          sensors={sensors}
          autoScroll={TAB_REORDER_AUTO_SCROLL}
          collisionDetection={tabRunCollisionDetection}
          modifiers={tabReorderModifiers}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={clearTabReorderBounds}
          accessibility={{
            container: typeof document !== 'undefined' ? document.body : undefined,
          }}
        >
          <SortableContext items={[...visibleTabIds]} strategy={horizontalListSortingStrategy}>
            {visibleTabIds.map((tabId, tabIndex) => (
              <EditorTabItem
                key={tabId}
                activeNewTabId={activeNewTabId}
                activeTabId={activeTabId}
                activateNewTab={activateNewTab}
                activateTab={activateTab}
                closeNewTab={closeNewTab}
                closeTab={closeTab}
                closeVisibleTabs={closeVisibleTabs}
                forceTabCloseVisible={forceTabCloseVisible}
                newTabIdSet={newTabIdSet}
                pageMeta={pageMeta}
                pinTab={pinTab}
                pinnedTabIds={pinnedTabIds}
                rename={rename}
                tabId={tabId}
                tabIndex={tabIndex}
                unpinTab={unpinTab}
                visibleTabIds={visibleTabIds}
              />
            ))}
          </SortableContext>
        </DndContext>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t`New tab`}
              data-testid="editor-new-tab-button"
              className="first:mb-3 mb-1.5"
              onClick={openNewTab}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <Trans>New tab</Trans>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
