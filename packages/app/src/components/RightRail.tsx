import { detectEmbeddedHostFromBrowser } from '@nedian0brien/synapsenote-core';
import { useTheme } from 'next-themes';
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useGroupRef, usePanelRef } from 'react-resizable-panels';
import { DocPanel, type PanelTab } from '@/components/DocPanel';
import {
  consumePendingDocPanelTabRequest,
  subscribeToDocPanelTabRequests,
} from '@/components/doc-panel-events';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { useDocumentPanels } from '@/editor/document-context/useDocumentPanels';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import {
  getInitialRightRailWidth,
  MAX_RIGHT_RAIL_WIDTH,
  MIN_RIGHT_RAIL_WIDTH,
  writeRightRailWidth,
} from '@/lib/right-rail-width-store';
import { RIGHT_COLLAPSE_THRESHOLD, resolvePartition } from '@/lib/sidebar-partition';
import { applyToggle, readPins, resolveEffectiveState } from '@/lib/sidebar-pin-store';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import { cn } from '@/lib/utils';
import { computeStickyRepinLayout } from './editor-area-sticky-repin';
import { xtermThemeForMode } from './terminal-theme';

/**
 * The right rail is a TOOLBOX, not a view.
 *
 * It sits beside the whole content column — header included — the mirror of the
 * left file sidebar, and it spans the window top to bottom. It is ALWAYS
 * mounted: a tool with nothing to describe renders its own empty state (see
 * `DocPanel`) rather than leaving the box. That makes the panel-ID set
 * immutable for the life of the app, which is what retires the whole class of
 * doc-panel/terminal-column resurrection bugs — react-resizable-panels caches
 * layouts keyed by that set and restores the cached one whenever it changes.
 * Collapse, not unmount, is how the rail gets out of the way.
 *
 * The content column is the residual absorber and intentionally has no id (an
 * explicit id on it changes how the library redistributes an imperative
 * resize), so the layout assert finds it as the one live panel id that is not
 * this one.
 */
const RIGHT_RAIL_ID = 'right-rail';

// One floor and one ceiling for the whole toolbox, both owned by the width
// store alongside the persisted value they clamp.
const RAIL_MIN_SIZE = `${MIN_RIGHT_RAIL_WIDTH}px`;
const RAIL_MAX_SIZE = `${MAX_RIGHT_RAIL_WIDTH}px`;

interface RightRailContextValue {
  /** Whether the toolbox is put away. Drives the viewer toggles' pressed state. */
  readonly isCollapsed: boolean;
  /** Put the toolbox away, or take it out. The single verb. */
  readonly toggle: () => void;
  /** `aria-controls` target for any control that toggles the rail. */
  readonly controlsId: string;
  /** Portal target the PDF engine fills when the PDF tools are on screen. */
  readonly pdfPanelContainer: HTMLElement | null;
  /** Portal target the terminal session host fills when Chat is the live tool. */
  readonly rightTerminalContainer: HTMLDivElement | null;
}

const RightRailContext = createContext<RightRailContextValue | null>(null);

export function useRightRail(): RightRailContextValue {
  const value = use(RightRailContext);
  if (value == null) throw new Error('useRightRail must be used within RightRailLayout');
  return value;
}

interface RightRailLayoutProps {
  /** The content column — editor header plus the active view. */
  readonly children: ReactNode;
  readonly activeTab: PanelTab;
  readonly onActiveTabChange: (tab: PanelTab) => void;
  readonly isSourceMode: boolean;
  readonly terminalBridge?: OkDesktopBridge | null;
  readonly terminalVisible?: boolean;
  readonly onTerminalVisibleChange?: (visible: boolean) => void;
  readonly terminalDock?: TerminalDockPosition;
}

export function RightRailLayout({
  children,
  activeTab,
  onActiveTabChange,
  isSourceMode,
  terminalBridge,
  terminalVisible = false,
  onTerminalVisibleChange,
  terminalDock = 'right',
}: RightRailLayoutProps) {
  const { resolvedTheme } = useTheme();
  const xtermBackground = xtermThemeForMode(resolvedTheme).background;
  const { activeDocName, activeTarget } = useDocumentNavigation();
  const { activeProvider } = useDocumentCollaboration();
  const { docPanelMode, docPanelAgentId, docPanelExpandSignal } = useDocumentPanels();

  const activePdfAsset =
    activeTarget?.kind === 'asset' && activeTarget.mediaKind === 'pdf' ? activeTarget : null;
  const [pdfPanelContainer, setPdfPanelContainer] = useState<HTMLElement | null>(null);
  const [rightTerminalContainer, setRightTerminalContainer] = useState<HTMLDivElement | null>(null);

  // Whether the rail's Chat tool currently holds a live right-docked session.
  // Not a layout question — chat and the document tools share one panel — but it
  // still gates the portal target and the stand-down on close.
  const chatToolLive = terminalBridge != null && terminalDock === 'right' && terminalVisible;
  const chatToolLiveRef = useRef(chatToolLive);
  useEffect(() => {
    chatToolLiveRef.current = chatToolLive;
  }, [chatToolLive]);

  // The document the rail's doc-scoped tools describe. Folder, skill-file and
  // large-file views have no document, so those tools render their own empty
  // state (see `DocPanel`) rather than being removed from the box.
  const railDocName =
    activeTarget?.kind === 'doc' || activeTarget?.kind === 'missing' ? activeDocName : null;

  const [embeddedHost] = useState(() => detectEmbeddedHostFromBrowser());
  const isEmbedded = embeddedHost !== null;
  const [rightPartition, setRightPartition] = useState(() =>
    resolvePartition(embeddedHost, window.innerWidth, 'right'),
  );
  // Read in callbacks (toggle, ResizeObserver) so we always see the live
  // partition value even if `toggle` is re-bound from an effect that hasn't
  // re-subscribed with the latest closure yet. Mirrors the openRef pattern.
  const rightPartitionRef = useRef(rightPartition);
  useEffect(() => {
    rightPartitionRef.current = rightPartition;
  }, [rightPartition]);

  // One ref for the one rail. Chat and the document tools are two tools in the
  // same box, not two columns — they no longer need independent panel handles.
  const panelRef = usePanelRef();
  const [initialRightCollapsed] = useState(() => {
    const pins = readPins();
    return resolveEffectiveState('right', rightPartition, pins) === 'collapsed';
  });
  const [isCollapsed, setIsCollapsed] = useState(initialRightCollapsed);
  // Ref mirror so the ResizeObserver callback can gate without re-creating
  // the observer on every isCollapsed flip.
  const isCollapsedRef = useRef(isCollapsed);
  useEffect(() => {
    isCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  const [isDraggingRail, setIsDraggingRail] = useState(false);
  // Ref mirror so the ResizeObserver callback can skip while the user is
  // actively dragging (would otherwise race the in-flight drag).
  const isDraggingRailRef = useRef(false);

  // Sticky pixel width. The library is percent-based internally; without
  // correction the rail would grow proportionally with the container. We track
  // the user's last-set pixel width in a ref and re-apply it whenever the
  // container resizes (window resize, left sidebar collapse). Persisted to
  // localStorage so the value survives reload.
  //
  // Pattern: `useState` lazy initializer snapshots the initial pixel width
  // (read once at mount, stable across renders — React Compiler forbids reading
  // refs during render, so we cannot use the ref in the `defaultSize` JSX
  // below). The ref carries the running value updated by `onResize` during a
  // user drag; only callbacks/effects read it.
  const [initialRailWidthPx] = useState(() => getInitialRightRailWidth());
  const railWidthPxRef = useRef(initialRailWidthPx);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function rememberRailWidth(px: number) {
    railWidthPxRef.current = px;
    if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      writeRightRailWidth(px);
      writeTimerRef.current = null;
    }, 100);
  }

  useEffect(
    () => () => {
      if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
    },
    [],
  );

  // Group container element — the ResizeObserver target. Container width
  // changes when the WINDOW resizes or the LEFT sidebar collapses/expands; it
  // does NOT change when the rail collapses (that's internal flex
  // redistribution). State-callback ref (not useRef) so the RO effect re-runs
  // when the element mounts.
  const [groupContainerEl, setGroupContainerEl] = useState<HTMLDivElement | null>(null);
  // Plain-ref mirror for callbacks created before the element mounts (event
  // subscribers with narrow deps would otherwise close over the initial null).
  const groupContainerElRef = useRef<HTMLDivElement | null>(null);

  // Group-level imperative handle. With one rail the panel's flex neighbor IS
  // the content column, so the per-panel APIs are correct for plain
  // expand/collapse — but the sticky-width re-pin still needs a full-layout
  // write to route the container delta to the content column rather than
  // re-balancing the rail against it. The layout math lives in
  // `computeStickyRepinLayout` (unit-tested).
  const groupRef = useGroupRef();

  // Pixel basis for px→% conversion in `assertRailLayout`. Layout percentages
  // are relative to the group's panel space; derive the basis from the rail
  // when its percentage and pixel width are both known (immune to the separator
  // widths the container includes), falling back to the container.
  function resolveGroupPxWidth(): number | null {
    const size = panelRef.current?.getSize();
    // The `> 1` floor excludes a collapsed/near-zero rail: px / ~0% diverges
    // (Infinity at exactly 0), which would corrupt every layout assertion.
    if (size != null && size.asPercentage > 1 && size.inPixels > 0) {
      return (size.inPixels / size.asPercentage) * 100;
    }
    const el = groupContainerElRef.current;
    return el != null && el.offsetWidth > 0 ? el.offsetWidth : null;
  }

  // Write the intended layout in one `setLayout` call: the rail at its
  // persisted width (or pinned shut at 0 when collapsed) and the content column
  // absorbing the remainder.
  function assertRailLayout(railCollapsed: boolean) {
    if (isDraggingRailRef.current) return;
    const group = groupRef.current;
    if (group == null) return;
    // The imperative handles throw once their group/panel has unregistered, and
    // this can run from a deferred microtask racing a remount — a torn-down
    // group just means there is no layout left to correct.
    try {
      const containerPx = resolveGroupPxWidth();
      if (containerPx == null) return;
      const layout = group.getLayout();
      const ids = Object.keys(layout);
      if (ids.length === 0) return;
      const residualId = ids.find((id) => id !== RIGHT_RAIL_ID);
      if (residualId == null) return;
      if (!(RIGHT_RAIL_ID in layout)) return;
      const next = computeStickyRepinLayout({
        currentLayout: layout,
        containerPx,
        pinnedPx: { [RIGHT_RAIL_ID]: railCollapsed ? 0 : railWidthPxRef.current },
        residualId,
      });
      if (next !== layout) group.setLayout(next);
    } catch {
      // Group or panel unregistered mid-flight — nothing to assert against.
    }
  }

  // Latest-ref mirror of the assert for effects that must NOT re-run on render
  // (a ResizeObserver re-fires on `observe()` — recreating it per render would
  // re-assert the layout on every render instead of only on container resizes).
  const assertRailLayoutRef = useRef(assertRailLayout);
  useEffect(() => {
    assertRailLayoutRef.current = assertRailLayout;
  });

  // Open the toolbox from a non-toggle path (tab request, avatar click,
  // width-threshold crossing).
  function expandRail() {
    panelRef.current?.expand();
  }

  // Closing the toolbox also stands the live chat session down. The PTY itself
  // survives in EditorPane's session host, but the portal target must not
  // linger inside a collapsed `inert` panel — xterm's fit addon misreads a
  // 0-width container and the session would reopen mis-sized.
  function standDownChatIfLive() {
    if (chatToolLiveRef.current) onTerminalVisibleChange?.(false);
  }

  function toggle() {
    // The rail is unmounted on hosts with no tools at all (web, no doc open).
    // Bail before applyToggle so the global ⌥⌘B handler doesn't write a
    // spurious 'right' pin for a panel that can't move.
    if (panelRef.current == null) return;
    // Read partition from the ref (live value) — `rightPartition` captured by
    // the closure at render time goes stale if the user crosses the 1280px
    // threshold and immediately invokes the toggle before React commits the
    // new partition.
    const partition = rightPartitionRef.current;
    if (isCollapsed) {
      applyToggle('right', partition, 'open');
      panelRef.current.expand();
    } else {
      applyToggle('right', partition, 'collapsed');
      standDownChatIfLive();
      panelRef.current.collapse();
    }
  }

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${RIGHT_COLLAPSE_THRESHOLD}px)`);
    const onChange = () => {
      const newPartition = resolvePartition(embeddedHost, window.innerWidth, 'right');
      setRightPartition(newPartition);
      const pins = readPins();
      const effective = resolveEffectiveState('right', newPartition, pins);
      const nextCollapsed = effective === 'collapsed';
      // Sync React state imperatively (mirrors sidebar.tsx's _setOpen pattern
      // for the left toggle). The library's onResize will also fire eventually,
      // but until it does any effect reading `isCollapsed` (focus-safety,
      // notifyViewMenuStateChanged) would see the pre-collapse value.
      setIsCollapsed(nextCollapsed);
      if (nextCollapsed) {
        standDownChatIfLive();
        panelRef.current?.collapse();
      } else {
        panelRef.current?.expand();
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [
    embeddedHost,
    panelRef,
    // biome-ignore lint/correctness/useExhaustiveDependencies: standDownChatIfLive is render-bound; re-subscribing keeps the handler fresh
    standDownChatIfLive,
  ]);

  // Sticky pixel-width re-pin on container-size changes. The container widens on
  // a window resize or a LEFT-sidebar collapse — not on a rail collapse, which
  // is internal flex redistribution. react-resizable-panels sizes every panel as
  // a percentage of the group, so without correction the pixel-sized rail grows
  // proportionally with the container. Gates: skip the embedded host (drag is
  // disabled there); the assert skips during a live drag (the drag owns the
  // width).
  useEffect(() => {
    if (groupContainerEl == null) return;
    if (isEmbedded) return;
    // Reads the assert through its latest-ref: a ResizeObserver fires once on
    // `observe()`, so this effect must have STABLE deps.
    const ro = new ResizeObserver(() => {
      assertRailLayoutRef.current(isCollapsedRef.current);
    });
    ro.observe(groupContainerEl);
    return () => ro.disconnect();
  }, [groupContainerEl, isEmbedded]);

  // Tab requests (agent handoff, memo navigation) select a tool and take the
  // box out.
  useEffect(() => {
    const openRequestedTab = (tab: PanelTab) => {
      onActiveTabChange(tab);
      expandRail();
    };

    const pendingTab = consumePendingDocPanelTabRequest();
    if (pendingTab) openRequestedTab(pendingTab);

    return subscribeToDocPanelTabRequests((tab) => {
      consumePendingDocPanelTabRequest();
      openRequestedTab(tab);
    });
  }, [
    onActiveTabChange,
    // biome-ignore lint/correctness/useExhaustiveDependencies: expandRail is render-bound; re-subscribing keeps the handler fresh
    expandRail,
  ]);

  // Expand-on-avatar-click. `docPanelExpandSignal` is a monotonic counter
  // incremented by `DocumentContext.openActivityPanel`. Initial 0 → 0 (mount) is
  // harmless — expanding an already-expanded panel is a no-op.
  useEffect(() => {
    if (docPanelExpandSignal === 0) return;
    expandRail();
  }, [
    docPanelExpandSignal,
    // biome-ignore lint/correctness/useExhaustiveDependencies: expandRail is render-bound; re-running keeps the closure fresh
    expandRail,
  ]);

  // Focus safety: a collapsed panel keeps its subtree in the DOM (the library
  // applies no inert of its own), so move focus out before `inert` strands it.
  useLayoutEffect(() => {
    if (!isCollapsed) return;
    const panelEl = document.getElementById(RIGHT_RAIL_ID);
    if (!panelEl?.contains(document.activeElement)) return;
    const toggleEl = document.querySelector<HTMLElement>('[data-doc-panel-toggle]');
    if (toggleEl) {
      toggleEl.focus();
      return;
    }
    document.querySelector<HTMLElement>('[data-sidebar="trigger"]')?.focus();
  }, [isCollapsed]);

  useEffect(() => {
    if (window.okDesktop == null) return;
    window.okDesktop.editor.notifyViewMenuStateChanged({ docPanelVisible: !isCollapsed });
  }, [isCollapsed]);

  useEffect(() => {
    if (window.okDesktop == null) return;
    return window.okDesktop.onMenuAction((action) => {
      if (action === 'toggle-doc-panel') toggle();
    });
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: toggle is render-bound; re-subscribing keeps the handler fresh (mirrors sidebar.tsx ⌥⌘S effect)
    toggle,
  ]);

  useEffect(() => {
    if (window.okDesktop != null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesKeyboardShortcut(event, 'toggle-document-panel')) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: toggle is render-bound; re-subscribing keeps the handler fresh (mirrors sidebar.tsx ⌥⌘S effect)
    toggle,
  ]);

  // The content column absorbs the residual width whenever the rail claims space.
  const contentAbsorbsResidual = !initialRightCollapsed;

  return (
    <RightRailContext
      value={{
        isCollapsed,
        toggle,
        controlsId: RIGHT_RAIL_ID,
        pdfPanelContainer,
        rightTerminalContainer,
      }}
    >
      <div
        // The shell tint, painted behind both columns. It is what makes the rail
        // read as a PEER of the file sidebar rather than a region of the content
        // card: the content column floats on this as its own rounded surface,
        // and the rail simply lets it through — exactly how the left sidebar
        // sits on the same tint outside the card.
        className="relative flex min-h-0 flex-1 bg-sidebar"
        ref={(el) => {
          setGroupContainerEl(el);
          groupContainerElRef.current = el;
        }}
      >
        <ResizablePanelGroup
          orientation="horizontal"
          groupRef={groupRef}
          data-dragging={isDraggingRail || undefined}
        >
          <ResizablePanel
            // No explicit id: an id here changed how react-resizable-panels
            // redistributes on imperative resize and broke the rail's
            // pixel-width sticky restore. The content column is always the
            // first child, so React keeps it mounted across rail toggles
            // without one.
            //
            // A flat 30% floor now that the rail is capped in pixels: the
            // content surface is never squeezed to a sliver, whichever tool is
            // open.
            minSize="30%"
            {...(contentAbsorbsResidual ? {} : { defaultSize: '100%' })}
            className={cn(
              // The content card. The rounding used to live on `SidebarInset`,
              // which wrapped the rail too — so the seam against the file
              // sidebar was a rounded edge while the seam against the rail was a
              // hard 1px line through the middle of one surface. Owning it here
              // makes the card a discrete surface with the same treatment on
              // both sides.
              'flex min-w-0 flex-col overflow-hidden rounded-xl bg-background shadow-sm',
              !isDraggingRail &&
                'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0',
            )}
          >
            {children}
          </ResizablePanel>

          <ResizableHandle
            // No visible grip while collapsed — there is nothing to drag. A
            // collapsed rail is not drag-resizable either: the toolbar
            // toggle and ⌥⌘B are its single open mechanism. Disabling it
            // while collapsed also keeps it from being a misclick target
            // under embedded AI-editor hosts whose own container chrome sits
            // at the iframe edge.
            withHandle={!isCollapsed}
            disabled={isCollapsed}
            // A gutter, not a rule. The default 1px `bg-border` line was the
            // hard seam that gave away that content and rail were one
            // surface; an 8px transparent gap matches the gutter between the
            // file sidebar and the card on the other side.
            className="w-2 bg-transparent"
            onPointerDown={() => {
              setIsDraggingRail(true);
              isDraggingRailRef.current = true;
              const handleUp = () => {
                setIsDraggingRail(false);
                isDraggingRailRef.current = false;
                window.removeEventListener('pointerup', handleUp);
                // Drag-to-close: releasing with the rail snapped shut stands
                // the live chat session down, the same as closing it from
                // the toggle. Deferred to pointerup — reacting mid-drag
                // would pull the separator out from under the pointer.
                if (panelRef.current?.isCollapsed()) standDownChatIfLive();
              };
              window.addEventListener('pointerup', handleUp);
            }}
          />
          <ResizablePanel
            id={RIGHT_RAIL_ID}
            panelRef={panelRef}
            // Paint the surface with the xterm canvas color while chat is
            // the live tool so its tab strip reads as one surface with the
            // terminal (mirrors TerminalDock's bottom panel); the document
            // tools keep the app tint.
            style={chatToolLive ? { backgroundColor: xtermBackground } : undefined}
            defaultSize={initialRightCollapsed ? 0 : `${initialRailWidthPx}px`}
            minSize={RAIL_MIN_SIZE}
            maxSize={RAIL_MAX_SIZE}
            collapsible
            collapsedSize={0}
            onResize={(size) => {
              setIsCollapsed(size.asPercentage === 0);
              // Persist only when this resize came from a user drag —
              // RO-driven recomputes (sticky width restoration) also fire
              // onResize, but they're replaying the persisted value and must
              // NOT overwrite it.
              if (size.inPixels > 0 && isDraggingRailRef.current) {
                rememberRailWidth(size.inPixels);
              }
            }}
            // react-resizable-panels does NOT apply
            // inert/aria-hidden/display:none when a panel collapses
            // (verified against the installed runtime) — children stay in
            // DOM, in Tab order, and announced by screen readers. `inert`
            // removes the collapsed subtree from the a11y tree and focus
            // order without remounting.
            inert={isCollapsed}
            className={cn(
              // Flat, on the shell tint — the same treatment as the file
              // sidebar. No card, no shadow, no rounding: the rail is
              // chrome, and only the content surface is a card.
              'flex flex-col',
              !chatToolLive && 'bg-sidebar',
              !isDraggingRail &&
                'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0',
            )}
          >
            <DocPanel
              docName={activeProvider != null ? railDocName : null}
              isSourceMode={isSourceMode}
              activeTab={activeTab}
              onActiveTabChange={onActiveTabChange}
              // Agent activity is a drill-in on the whole box, so it applies
              // over any content surface — not just the folder view that
              // used to own its own panel. Falls back to the tool rail when
              // no agent is scoped.
              mode={docPanelMode === 'agent' && docPanelAgentId !== null ? 'agent' : 'doc'}
              surface={activePdfAsset !== null ? 'pdf' : 'document'}
              showChatTab={terminalBridge != null}
              chatContent={
                chatToolLive ? (
                  <div
                    ref={setRightTerminalContainer}
                    data-testid="right-chat-host"
                    className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background"
                  />
                ) : null
              }
              pdfContent={
                activePdfAsset !== null ? (
                  <div
                    ref={setPdfPanelContainer}
                    data-testid="pdf-panel-host"
                    className="h-full min-h-0 overflow-hidden bg-background"
                  />
                ) : null
              }
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </RightRailContext>
  );
}
