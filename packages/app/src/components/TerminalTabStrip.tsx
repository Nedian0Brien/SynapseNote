import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { Trans, useLingui } from '@lingui/react/macro';
import type { TerminalCli } from '@nedian0brien/synapsenote-core';
import {
  Archive,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDownIcon,
  ChevronRightIcon,
  HistoryIcon,
  ListX,
  PanelBottomIcon,
  PanelRightIcon,
  XIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import { cn } from '@/lib/utils';
import {
  createTabReorderModifier,
  getSortableTabStyle,
  measureTabReorderBounds,
  TAB_REORDER_AUTO_SCROLL,
  type TabReorderBounds,
  tabRunCollisionDetection,
} from './editor-tabs-chrome';
import { cliIconTargetId } from './handoff/terminal-cli-display';
import { TerminalNewChatButton, type TerminalNewTabChoice } from './TerminalNewChatButton';

/** Attribute marking a terminal tab's sortable node — the surface-neutral chrome
 *  module measures the reorder bounds against this (editor tabs use their own). */
const TERMINAL_TAB_SORTABLE_SELECTOR = '[data-terminal-tab-sortable]';

/**
 * One terminal tab as a `@dnd-kit/sortable` node. Only the pointer listeners +
 * transform are wired (no `attributes` spread and no `KeyboardSensor`): dnd-kit's
 * `attributes` would inject `role="button"` + `tabIndex` onto this wrapper and
 * break the Radix tablist's roving-focus semantics, and keyboard reorder is a
 * dedicated ⌘⇧←/→ chord in the host rather than dnd-kit's Space-lift model. The
 * wrapper is not focusable, so its listeners never intercept Radix arrow keys or
 * the trigger's F2. `disabled` short-circuits sortable while any rename is open.
 */
function SortableTerminalTab({
  id,
  disabled,
  isActive,
  children,
}: {
  id: string;
  disabled: boolean;
  isActive: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, rect, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = getSortableTabStyle({
    activeWidth: rect.current?.width,
    isDragging,
    transform,
    transition,
  });
  return (
    // dnd-kit pointer listeners on a non-focusable wrapper; the role="tab" child
    // owns keyboard + a11y, so this div carries no interactive role of its own.
    <div
      ref={setNodeRef}
      data-terminal-tab-sortable=""
      style={style}
      className={cn(
        'group flex shrink-0 cursor-default items-center rounded-md pr-0.5 transition-colors',
        isActive ? 'bg-muted' : 'hover:bg-muted/50',
        isDragging && 'z-10',
      )}
      {...listeners}
    >
      {children}
    </div>
  );
}

/** One terminal session as the tab strip sees it: a stable id and a display label. */
export interface TerminalTabDescriptor {
  readonly id: string;
  readonly label: string;
  readonly cli?: TerminalCli | null;
  /** True when this tab is a native chat the host can put away — the context
   *  menu's Archive item appears only then (a bare shell has nothing to file). */
  readonly canArchive?: boolean;
}

/**
 * Right-click menu for one tab: the close family plus, for a native chat, the
 * archive action. The close items work on ids computed from the tab's position
 * in the current run, so "to the left" / "to the right" mean what the user sees
 * after a reorder, not the order the sessions were opened in.
 */
function TerminalTabContextMenu({
  children,
  session,
  sessions,
  onClose,
  onCloseMany,
  onArchive,
}: {
  children: ReactNode;
  session: TerminalTabDescriptor;
  sessions: readonly TerminalTabDescriptor[];
  onClose: (id: string) => void;
  onCloseMany?: (ids: readonly string[]) => void;
  onArchive?: (id: string) => void;
}) {
  const index = sessions.findIndex((candidate) => candidate.id === session.id);
  const ids = (subset: readonly TerminalTabDescriptor[]) => subset.map((entry) => entry.id);
  const others = ids(sessions.filter((candidate) => candidate.id !== session.id));
  const toTheLeft = index <= 0 ? [] : ids(sessions.slice(0, index));
  const toTheRight = index < 0 ? [] : ids(sessions.slice(index + 1));
  const canArchive = session.canArchive === true && onArchive != null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem
          data-testid="terminal-tab-context-close"
          onSelect={() => onClose(session.id)}
        >
          <XIcon aria-hidden="true" />
          <Trans>Close tab</Trans>
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="terminal-tab-context-close-others"
          disabled={onCloseMany == null || others.length === 0}
          onSelect={() => onCloseMany?.(others)}
        >
          <ListX aria-hidden="true" />
          <Trans>Close other tabs</Trans>
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="terminal-tab-context-close-left"
          disabled={onCloseMany == null || toTheLeft.length === 0}
          onSelect={() => onCloseMany?.(toTheLeft)}
        >
          <ArrowLeftToLine aria-hidden="true" />
          <Trans>Close tabs to the left</Trans>
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="terminal-tab-context-close-right"
          disabled={onCloseMany == null || toTheRight.length === 0}
          onSelect={() => onCloseMany?.(toTheRight)}
        >
          <ArrowRightToLine aria-hidden="true" />
          <Trans>Close tabs to the right</Trans>
        </ContextMenuItem>
        {canArchive ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              data-testid="terminal-tab-context-archive"
              onSelect={() => onArchive?.(session.id)}
            >
              <Archive aria-hidden="true" />
              <Trans>Archive chat</Trans>
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** One entry in the strip's "previous chats" menu. */
export interface PreviousChat {
  readonly id: string;
  readonly cli: TerminalCli;
  readonly title: string;
}

interface TerminalTabStripProps {
  /** Open sessions, in tab order. */
  readonly sessions: readonly TerminalTabDescriptor[];
  /** Currently active session id (controlled — the strip keeps no selection state). */
  readonly activeSessionId: string;
  /** Fires with a session id when the user activates a tab (click or arrow keys). */
  readonly onSelect: (id: string) => void;
  /**
   * Fires when a tab is activated by pointer or Enter (not by arrow-key
   * navigation), so the consumer can move focus into that session's terminal.
   * Keeping it pointer/Enter-only leaves arrow-key tab navigation intact — the
   * caret stays in the tablist while arrowing.
   */
  readonly onTabActivate?: (id: string) => void;
  /** The New-chat menu's current pick — a CLI (resolved by the host from the
   *  sticky pick + installed set) or `'terminal'` (a bare shell). Drives the
   *  dropdown checkmark. */
  readonly newChatSelected: TerminalNewTabChoice;
  /** Dropdown CLI pick — persist it as the new default AND open a tab in it. */
  readonly onNewChatPickCli: (cli: TerminalCli) => void;
  /** Dropdown "Terminal" — persist a bare shell as the default AND open one. */
  readonly onNewChatPickTerminal: () => void;
  /** CLIs to list in the New-chat dropdown — Claude plus PATH-detected CLIs
   *  (resolved by the host), so an uninstalled CLI doesn't appear unless
   *  detected. Optional: the button falls back to the full list. */
  readonly newChatVisibleClis?: readonly TerminalCli[];
  /** Fires with the session id when the user closes a tab. */
  readonly onClose: (id: string) => void;
  /**
   * Close several tabs at once (the context menu's close-others / close-left /
   * close-right). Separate from {@link onClose} because the host has to drop
   * them in ONE state update: closing ids in a loop makes every call after the
   * first read a pre-close snapshot. Without it those items stay hidden.
   */
  readonly onCloseMany?: (ids: readonly string[]) => void;
  /**
   * Put a chat away: it leaves the chat lists and its tab closes. Rendered only
   * for tabs that report {@link TerminalTabDescriptor.canArchive}.
   */
  readonly onArchive?: (id: string) => void;
  /**
   * Commit a manual tab rename: the trimmed label the user typed, or the empty
   * string to clear a previously-set custom name (revert to the program's OSC
   * title / positional default). Fires on Enter or blur, never on Escape. When
   * omitted, the rename affordance (double-click / F2) is inert — the host owns
   * whether a surface supports renaming.
   */
  readonly onRename?: (id: string, label: string) => void;
  /**
   * Commit a pointer-drag reorder: the new visual order of session ids after a
   * drop. When omitted, tabs are not draggable.
   */
  readonly onReorder?: (newOrderIds: readonly string[]) => void;
  /**
   * Reports whether a pointer drag is currently lifted, so the host can suppress
   * the ⌘⇧←/→ keyboard-reorder chord while a drag is in flight.
   */
  readonly onDragActiveChange?: (active: boolean) => void;
  /** Where the terminal is currently docked — drives the dock-toggle + collapse
   *  button icons/labels. Absent on the standalone terminal window (nothing to
   *  dock or collapse — the window is the terminal). */
  readonly dockPosition?: TerminalDockPosition;
  /** Fires when the user flips the dock between bottom and right. The toggle
   *  button renders only when provided. */
  readonly onToggleDock?: () => void;
  /**
   * Chats the user can return to — open sessions and resumable native ones.
   * Strip-level, not per-session: "load a previous chat" is a verb on the chat
   * surface as a whole. It used to live in each session's own header row, which
   * is what made the rail stack three header bands before any message.
   * The control renders only when {@link onSelectPreviousChat} is provided.
   */
  readonly previousChats?: readonly PreviousChat[];
  /** Re-read the native session list as the menu opens. */
  readonly onReloadPreviousChats?: () => void;
  readonly onSelectPreviousChat?: (id: string) => void;
  /** Fires when the user collapses (hides) the terminal — sessions stay alive.
   *  The collapse button renders only when provided. */
  readonly onCollapse?: () => void;
  /**
   * Tab panels, one per session. Rendered inside this component's `Tabs` root so
   * Radix can wire each trigger's `aria-controls` to its panel's `aria-labelledby`
   * — keeping the panels in a sibling root would leave those references dangling.
   * The consumer supplies `TabsContent` elements (it owns the panel content); the
   * strip only provides the shared root and the tablist.
   */
  readonly children?: ReactNode;
  readonly className?: string;
  /**
   * Standalone-terminal-window mode (macOS): the tab row doubles as the window
   * title bar. Tall enough (`h-[62px]`) to vertically center the tabs against the
   * traffic lights (taller than `EditorHeader`'s `h-12` — see the height note at
   * the row below), reserves the light footprint
   * (`--ok-titlebar-reserve-left`) so the first tab clears them, and makes the
   * empty bar area the `-webkit-app-region: drag` handle (controls opt out via
   * `no-drag`). The docked strip omits this (it sits at the editor's bottom).
   */
  readonly draggable?: boolean;
}

/**
 * Controlled tab widget for the terminal's concurrent sessions. Holds no
 * state of its own: the consumer owns the session list and active id and reacts
 * to the callbacks below (tab select/activate, new-chat launch/pick, close, dock,
 * collapse).
 *
 * Each tab pairs a Radix tab trigger (the roving-focus, arrow-navigable target)
 * with a sibling close button rather than nesting the close inside the trigger —
 * a button nested in a `role="tab"` button is invalid and unreachable. The
 * New-chat menu button sits outside the tablist so the list contains only tabs.
 *
 * The New-chat menu button ({@link TerminalNewChatButton}) hugs the last tab
 * (immediately right of the scrollable tablist, outside the scroll container so
 * the fade mask never clips it): its plus opens the CLI or bare-terminal picker.
 * A flex-1 spacer then pushes the
 * trailing controls to the far right: a dock-toggle that flips the terminal
 * between the bottom dock and the right column, and a collapse button that hides
 * the terminal (sessions stay alive). The consumer owns dock position +
 * visibility; this strip only fires the callbacks.
 *
 * The standalone terminal window is the second placement (via the session
 * host's window variant): it passes `draggable` (the row doubles as the macOS
 * title bar) and no dock/collapse handlers (the window is the terminal).
 *
 * The tablist is a thin bar; `children` (the consumer's tab panels) render below
 * it under the same `Tabs` root so the trigger↔panel a11y relationship resolves.
 */
export function TerminalTabStrip({
  sessions,
  activeSessionId,
  onSelect,
  onTabActivate,
  newChatSelected,
  onNewChatPickCli,
  onNewChatPickTerminal,
  newChatVisibleClis,
  onClose,
  onCloseMany,
  onArchive,
  onRename,
  onReorder,
  onDragActiveChange,
  dockPosition,
  onToggleDock,
  previousChats = [],
  onReloadPreviousChats,
  onSelectPreviousChat,
  onCollapse,
  children,
  className,
  draggable,
}: TerminalTabStripProps) {
  const { t } = useLingui();
  const rightDocked = dockPosition === 'right';

  // Inline rename is transient presentation state owned here; the host owns the
  // durable custom label and receives the commit via onRename. Mirrors the
  // editor file-tab rename contract (double-click / F2 to enter, Enter or blur
  // to commit, Escape to cancel) without any of its document-rename plumbing.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Set the instant Escape fires so the ensuing blur does not commit —
  // Escape-then-blur must cancel. Reset after each rename ends.
  const cancelRenameRef = useRef(false);
  const renameEnabled = onRename != null;

  // Focus + select-all when a rename opens so the user types over the label.
  useEffect(() => {
    if (renamingId == null) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  // A tab that closes (PTY exit, ⌘W) mid-rename auto-cancels — its descriptor is
  // gone from `sessions`, so there is nothing left to commit to.
  useEffect(() => {
    if (renamingId != null && !sessions.some((session) => session.id === renamingId)) {
      cancelRenameRef.current = false;
      setRenamingId(null);
      setRenameValue('');
    }
  }, [sessions, renamingId]);

  function enterRename(session: TerminalTabDescriptor) {
    if (!renameEnabled) return;
    cancelRenameRef.current = false;
    setRenamingId(session.id);
    setRenameValue(session.label);
  }

  // Return focus to the tab's trigger after the input unmounts so a keyboard
  // user who renamed is not stranded on the document body.
  function focusTrigger(id: string) {
    // Session ids are attribute-safe (`terminal-session-<n>`), but escape
    // defensively where `CSS.escape` exists (absent in the jsdom test preload).
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    queueMicrotask(() => {
      document.querySelector<HTMLElement>(`[role="tab"][data-tab-id="${safeId}"]`)?.focus();
    });
  }

  // Single exit point for commit AND cancel: Enter/Escape only blur the input,
  // and the input's blur is the sole caller — so a value is never committed
  // twice, and Escape's cancel flag suppresses the commit on the same blur.
  function endRename(id: string) {
    if (!cancelRenameRef.current) onRename?.(id, renameValue.trim());
    cancelRenameRef.current = false;
    setRenamingId(null);
    setRenameValue('');
    focusTrigger(id);
  }

  // Pointer-drag reorder. PointerSensor distance:8 keeps a plain click (activate
  // / double-click-to-rename) from starting a drag. No KeyboardSensor — keyboard
  // reorder is the host's ⌘⇧←/→ chord, so arrow keys stay with Radix roving focus.
  // Drag is disabled entirely while a rename is open. The chrome module (shared
  // with editor tabs) supplies the horizontal clamp, edge-snap collision, and
  // width stabilization; bounds are measured against the row on drag start.
  const rowRef = useRef<HTMLDivElement>(null);
  const [tabReorderBounds, setTabReorderBounds] = useState<TabReorderBounds | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const reorderEnabled = onReorder != null;
  const reorderModifiers = [createTabReorderModifier(tabReorderBounds)];

  function handleDragStart() {
    setTabReorderBounds(measureTabReorderBounds(rowRef.current, TERMINAL_TAB_SORTABLE_SELECTOR));
    onDragActiveChange?.(true);
  }
  function handleDragEnd(event: DragEndEvent) {
    setTabReorderBounds(null);
    onDragActiveChange?.(false);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const ids = sessions.map((session) => session.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    onReorder?.(arrayMove(ids, from, to));
  }
  function handleDragCancel() {
    setTabReorderBounds(null);
    onDragActiveChange?.(false);
  }
  return (
    <Tabs
      value={activeSessionId}
      onValueChange={onSelect}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
    >
      <div
        ref={rowRef}
        // Window mode: this row is the macOS title bar — h-[62px] to center the
        // tabs against the traffic lights, traffic-light reserve so the first tab
        // clears them, and a drag handle on the empty area (controls opt out via
        // no-drag below). The dock omits all of this.
        data-electron-drag={draggable ? '' : undefined}
        className={cn(
          'flex shrink-0 flex-row items-center gap-1 px-1.5 py-1',
          // h-[62px] centers the tab on the traffic-light row: the lights sit at
          // trafficLightPosition.y=24 with ~14px height (center ~y31), so an
          // items-center row must be ~62px tall (center 31) for the tab to line
          // up with the bubbles rather than floating above them.
          //
          // Left padding = the shared traffic-light reserve PLUS an extra 0.75rem:
          // the reserve (78px) is tuned for the editor's icon content, but a tab
          // is a background pill, so the bare reserve leaves its left edge touching
          // the green light. The extra gutter clears the bubbles cleanly.
          // pr-[22px] matches the traffic lights' own inset from the left edge
          // (trafficLightPosition.x=22) so the trailing "+" sits the same distance
          // from the right edge as the bubbles are from the left — a consistent
          // window gutter.
          draggable &&
            'h-[62px] [-webkit-app-region:drag] pr-[22px] pl-[calc(var(--ok-titlebar-reserve-left,1rem)+0.75rem)]',
        )}
      >
        <TabsList
          variant="line"
          aria-label={t`Terminal sessions`}
          // No `flex-1`: the list sizes to its tabs so "New chat" can hug the
          // last one. `min-w-0` + `overflow-x-auto` keep the tabs scrolling
          // internally when they overflow the space the trailing controls leave.
          // Window mode: the whole tab run (incl. inter-tab gaps) is `no-drag` so
          // a pointer drag crossing a gap reorders instead of moving the window;
          // the row's empty space outside the run stays a drag region.
          className={cn(
            'flex h-auto min-w-0 items-center justify-start gap-0.5 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] scroll-fade-mask-x',
            draggable && '[-webkit-app-region:no-drag]',
          )}
        >
          <DndContext
            sensors={sensors}
            autoScroll={TAB_REORDER_AUTO_SCROLL}
            collisionDetection={tabRunCollisionDetection}
            modifiers={reorderModifiers}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            // Portal dnd-kit's SR live-region/described-by helpers to the body so
            // they don't land inside the tablist flex flow (same as editor tabs).
            accessibility={{
              container: typeof document !== 'undefined' ? document.body : undefined,
            }}
          >
            <SortableContext
              items={sessions.map((session) => session.id)}
              strategy={horizontalListSortingStrategy}
            >
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <SortableTerminalTab
                    key={session.id}
                    id={session.id}
                    // Drag off while a rename is open (strip-wide) or when the host
                    // supplies no onReorder.
                    disabled={!reorderEnabled || renamingId != null}
                    isActive={isActive}
                  >
                    {renamingId === session.id ? (
                      // Rename mode: the input REPLACES the trigger inside this group
                      // div (never nested inside the `role="tab"` button — that is
                      // invalid interactive nesting). The close control is hidden
                      // while editing so a stray click can't kill the tab mid-rename.
                      <InputGroup
                        className={cn(
                          'h-7 w-40 rounded-md border-0 bg-transparent dark:bg-transparent',
                          draggable && '[-webkit-app-region:no-drag]',
                        )}
                      >
                        <InputGroupInput
                          ref={renameInputRef}
                          value={renameValue}
                          aria-label={t`Rename ${session.label}`}
                          data-testid="terminal-tab-rename-input"
                          className="h-7 px-2 text-xs"
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            // Enter/Escape only blur — endRename (the blur handler)
                            // is the single commit/cancel point.
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              renameInputRef.current?.blur();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelRenameRef.current = true;
                              renameInputRef.current?.blur();
                            }
                          }}
                          onBlur={() => endRename(session.id)}
                        />
                      </InputGroup>
                    ) : (
                      <>
                        {/* The label truncates at max-w-40, so a process-set title
                        (OSC 0/2) that overflows is hard-clipped in the tab — the
                        tooltip surfaces the full title on hover. */}
                        <Tooltip>
                          {/* Two `asChild` triggers over one element: the tab is
                            both the tooltip's anchor and the context menu's.
                            The context trigger has to sit OUTSIDE the tooltip
                            trigger — each `asChild` merges its props into the
                            next DOM-forwarding element, and only Radix's own
                            triggers forward. */}
                          <TerminalTabContextMenu
                            session={session}
                            sessions={sessions}
                            onClose={onClose}
                            onCloseMany={onCloseMany}
                            onArchive={onArchive}
                          >
                            <TooltipTrigger asChild>
                              <TabsTrigger
                                value={session.id}
                                // Anchor for focus-return after a rename ends.
                                data-tab-id={session.id}
                                // Pointer/Enter activation routes through onClick (arrow-key
                                // navigation does not fire it), so the consumer can focus the
                                // terminal on a deliberate select without stealing focus while
                                // the user arrows across tabs. The second click of a
                                // double-click is skipped (detail >= 2): otherwise its
                                // activation would focus the terminal and blur-commit the
                                // rename that same double-click is opening.
                                onClick={(event) => {
                                  if (event.detail >= 2) return;
                                  onTabActivate?.(session.id);
                                }}
                                // Double-click (pointer) and F2 (keyboard) enter rename —
                                // the same two idioms the editor file tabs use. Inert
                                // when the host supplies no onRename.
                                onDoubleClick={() => enterRename(session)}
                                onKeyDown={(event) => {
                                  if (event.key === 'F2') {
                                    event.preventDefault();
                                    enterRename(session);
                                  }
                                }}
                                className={cn(
                                  'h-7 flex-none rounded-md px-2 text-xs',
                                  draggable && '[-webkit-app-region:no-drag]',
                                )}
                              >
                                {session.cli != null ? (
                                  <TargetIcon
                                    id={cliIconTargetId(session.cli)}
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <span className="max-w-40 truncate">{session.label}</span>
                              </TabsTrigger>
                            </TooltipTrigger>
                          </TerminalTabContextMenu>
                          <TooltipContent side="bottom" sideOffset={8}>
                            {session.label}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t`Close ${session.label}`}
                          // Match the editor-tab pattern: only the active tab's close
                          // control sits in the tab order, so a keyboard user reaches a
                          // tab's close after activating it rather than tabbing past every
                          // inactive tab's close button.
                          tabIndex={isActive ? 0 : -1}
                          // Close reveals on tab hover or keyboard focus; the active tab
                          // keeps it persistently visible. Opacity (not unmount) keeps the
                          // control in layout + a11y tree so tabs don't reflow and the
                          // keyboard target stays reachable.
                          className={cn(
                            'text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100',
                            isActive && 'opacity-100',
                            draggable && '[-webkit-app-region:no-drag]',
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            onClose(session.id);
                          }}
                        >
                          <XIcon aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </SortableTerminalTab>
                );
              })}
            </SortableContext>
          </DndContext>
        </TabsList>
        {/* The single New-chat menu hugs the last tab, outside the tablist's
            scroll+fade so it is never clipped. */}
        <TerminalNewChatButton
          selected={newChatSelected}
          onPickCli={onNewChatPickCli}
          onPickTerminal={onNewChatPickTerminal}
          visibleClis={newChatVisibleClis}
          className={cn('shrink-0', draggable && '[-webkit-app-region:no-drag]')}
        />
        {/* Spacer pushes the trailing controls to the far right. */}
        <div className="flex-1" />
        {onSelectPreviousChat != null ? (
          <DropdownMenu onOpenChange={(open) => open && onReloadPreviousChats?.()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t`Load previous chat`}
                    className={cn(
                      'shrink-0 cursor-pointer text-muted-foreground hover:text-foreground',
                      draggable && '[-webkit-app-region:no-drag]',
                    )}
                  >
                    <HistoryIcon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <Trans>Load previous chat</Trans>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t`Previous chats`}</DropdownMenuLabel>
              {previousChats.length === 0 ? (
                <DropdownMenuItem disabled>{t`No previous chats`}</DropdownMenuItem>
              ) : (
                previousChats.map((chat) => (
                  <DropdownMenuItem key={chat.id} onSelect={() => onSelectPreviousChat(chat.id)}>
                    <TargetIcon
                      id={cliIconTargetId(chat.cli)}
                      className="size-4"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onToggleDock != null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                // Label names the resulting position, not the current one, so the
                // action reads as "move it there" to a screen-reader user.
                aria-label={
                  rightDocked ? t`Dock terminal to the bottom` : t`Dock terminal to the right`
                }
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={onToggleDock}
              >
                {rightDocked ? (
                  <PanelBottomIcon aria-hidden="true" />
                ) : (
                  <PanelRightIcon aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              {rightDocked ? (
                <Trans>Dock terminal to the bottom</Trans>
              ) : (
                <Trans>Dock terminal to the right</Trans>
              )}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {onCollapse != null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t`Collapse terminal`}
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={onCollapse}
              >
                {/* Chevron points the way the panel slides shut: down for the bottom
                    dock, right for the right column. */}
                {rightDocked ? (
                  <ChevronRightIcon aria-hidden="true" />
                ) : (
                  <ChevronDownIcon aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <Trans>Collapse terminal</Trans>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
    </Tabs>
  );
}
