import { detectEmbeddedHostFromBrowser } from '@nedian0brien/synapsenote-core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGroupRef, usePanelRef } from 'react-resizable-panels';
import type { PanelTab } from '@/components/DocPanel';
import {
  consumePendingDocPanelTabRequest,
  subscribeToDocPanelTabRequests,
} from '@/components/doc-panel-events';
import { getInitialDocPanelWidth, writeDocPanelWidth } from '@/lib/doc-panel-width-store';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { RIGHT_COLLAPSE_THRESHOLD, resolvePartition } from '@/lib/sidebar-partition';
import { applyToggle, readPins, resolveEffectiveState } from '@/lib/sidebar-pin-store';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import { writeTerminalWidth } from '@/lib/terminal-width-store';
import { computeStickyRepinLayout } from '../editor-area-sticky-repin';
import type { EditorAreaProps } from './types';

export const DOC_PANEL_MIN_SIZE = '300px';
export const DOC_PANEL_MAX_SIZE = '600px';

const RIGHT_PANEL_IDS = new Set(['doc-panel', 'terminal-column', 'agent-panel']);

type ResizeSize = { asPercentage: number; inPixels: number };

export interface EditorAreaRightRail {
  readonly isEmbedded: boolean;
  readonly isCollapsed: boolean;
  readonly initialRightCollapsed: boolean;
  readonly initialDocPanelWidthPx: number;
  readonly initialTerminalWidthPx: number;
  readonly isDraggingDocHandle: boolean;
  readonly isDraggingTerminalHandle: boolean;
  readonly terminalDockPosition: TerminalDockPosition;
  readonly terminalColumnPresent: boolean;
  readonly panelRef: ReturnType<typeof usePanelRef>;
  readonly terminalColumnPanelRef: ReturnType<typeof usePanelRef>;
  readonly groupRef: ReturnType<typeof useGroupRef>;
  readonly rightTerminalContainer: HTMLDivElement | null;
  readonly pdfPanelContainer: HTMLElement | null;
  readonly bottomTerminalContainer: HTMLDivElement | null;
  readonly terminalEditorRegion: HTMLDivElement | null;
  setRightTerminalContainer: (node: HTMLDivElement | null) => void;
  setPdfPanelContainer: (node: HTMLElement | null) => void;
  setBottomTerminalContainer: (node: HTMLDivElement | null) => void;
  setTerminalEditorRegion: (node: HTMLDivElement | null) => void;
  setGroupContainer: (node: HTMLDivElement | null) => void;
  toggleDocumentRightPanel: () => void;
  onDocPanelHandlePointerDown: () => void;
  onDocPanelResize: (size: ResizeSize) => void;
  onTerminalHandlePointerDown: () => void;
  onTerminalPanelResize: (size: ResizeSize) => void;
}

interface Options {
  readonly terminalBridge: EditorAreaProps['terminalBridge'];
  readonly terminalVisible: boolean;
  readonly terminalDock: TerminalDockPosition;
  readonly onTerminalVisibleChange: EditorAreaProps['onTerminalVisibleChange'];
  readonly docPanelExpandSignal: number;
  readonly onActiveTabChange: (tab: PanelTab) => void;
}

/** State owner for persisted right-rail geometry and terminal placement targets. */
export function useEditorAreaRightRail({
  terminalBridge,
  terminalVisible,
  terminalDock,
  onTerminalVisibleChange,
  docPanelExpandSignal,
  onActiveTabChange,
}: Options): EditorAreaRightRail {
  const [embeddedHost] = useState(() => detectEmbeddedHostFromBrowser());
  const isEmbedded = embeddedHost !== null;
  const [rightPartition, setRightPartition] = useState(() =>
    resolvePartition(embeddedHost, window.innerWidth, 'right'),
  );
  const rightPartitionRef = useRef(rightPartition);
  useEffect(() => {
    rightPartitionRef.current = rightPartition;
  }, [rightPartition]);

  const panelRef = usePanelRef();
  const terminalColumnPanelRef = usePanelRef();
  const [initialRightCollapsed] = useState(() => {
    const pins = readPins();
    return resolveEffectiveState('right', rightPartition, pins) === 'collapsed';
  });
  const [isCollapsed, setIsCollapsed] = useState(initialRightCollapsed);
  const isCollapsedRef = useRef(isCollapsed);
  useEffect(() => {
    isCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  const rightDocked = terminalDock === 'right';
  const terminalDockPosition: TerminalDockPosition = rightDocked ? 'right' : 'bottom';
  const terminalColumnPresent = terminalBridge != null && rightDocked && terminalVisible;
  const terminalColumnPresentRef = useRef(terminalColumnPresent);
  useEffect(() => {
    terminalColumnPresentRef.current = terminalColumnPresent;
  }, [terminalColumnPresent]);

  const [rightTerminalContainer, setRightTerminalContainer] = useState<HTMLDivElement | null>(null);
  const [pdfPanelContainer, setPdfPanelContainer] = useState<HTMLElement | null>(null);
  const [bottomTerminalContainer, setBottomTerminalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [terminalEditorRegion, setTerminalEditorRegion] = useState<HTMLDivElement | null>(null);
  const [isDraggingDocHandle, setIsDraggingDocHandle] = useState(false);
  const isDraggingDocHandleRef = useRef(false);
  const [isDraggingTerminalHandle, setIsDraggingTerminalHandle] = useState(false);
  const isDraggingTerminalHandleRef = useRef(false);

  const [initialDocPanelWidthPx] = useState(() => getInitialDocPanelWidth());
  const initialTerminalWidthPx = initialDocPanelWidthPx;
  const docPanelWidthPxRef = useRef(initialDocPanelWidthPx);
  const terminalWidthPxRef = useRef(initialDocPanelWidthPx);
  const docWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [groupContainerEl, setGroupContainerEl] = useState<HTMLDivElement | null>(null);
  const groupContainerElRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useGroupRef();

  const writeSharedRightRailWidth = (px: number) => {
    docPanelWidthPxRef.current = px;
    terminalWidthPxRef.current = px;
    if (docWriteTimerRef.current != null) clearTimeout(docWriteTimerRef.current);
    if (terminalWriteTimerRef.current != null) clearTimeout(terminalWriteTimerRef.current);
    docWriteTimerRef.current = setTimeout(() => {
      writeDocPanelWidth(px);
      docWriteTimerRef.current = null;
    }, 100);
    terminalWriteTimerRef.current = setTimeout(() => {
      writeTerminalWidth(px);
      terminalWriteTimerRef.current = null;
    }, 100);
  };
  useEffect(
    () => () => {
      if (docWriteTimerRef.current != null) clearTimeout(docWriteTimerRef.current);
      if (terminalWriteTimerRef.current != null) clearTimeout(terminalWriteTimerRef.current);
    },
    [],
  );

  const resolveGroupPxWidth = () => {
    for (const ref of [panelRef, terminalColumnPanelRef]) {
      const size = ref.current?.getSize();
      if (size != null && size.asPercentage > 1 && size.inPixels > 0) {
        return (size.inPixels / size.asPercentage) * 100;
      }
    }
    const el = groupContainerElRef.current;
    return el != null && el.offsetWidth > 0 ? el.offsetWidth : null;
  };

  const assertRightRailLayout = (docCollapsed: boolean) => {
    if (isDraggingDocHandleRef.current || isDraggingTerminalHandleRef.current) return;
    const group = groupRef.current;
    if (group == null) return;
    try {
      const containerPx = resolveGroupPxWidth();
      if (containerPx == null) return;
      const layout = group.getLayout();
      const ids = Object.keys(layout);
      const residualId = ids.find((id) => !RIGHT_PANEL_IDS.has(id));
      if (residualId == null) return;
      const pinnedPx: Record<string, number> = {};
      if ('doc-panel' in layout)
        pinnedPx['doc-panel'] = docCollapsed ? 0 : docPanelWidthPxRef.current;
      if ('terminal-column' in layout) pinnedPx['terminal-column'] = terminalWidthPxRef.current;
      if (Object.keys(pinnedPx).length === 0) return;
      const next = computeStickyRepinLayout({
        currentLayout: layout,
        containerPx,
        pinnedPx,
        residualId,
      });
      if (next !== layout) group.setLayout(next);
    } catch {
      // A view-kind change can unregister the group while an effect is pending.
    }
  };
  const assertRightRailLayoutRef = useRef(assertRightRailLayout);
  useEffect(() => {
    assertRightRailLayoutRef.current = assertRightRailLayout;
  });

  const expandDocPanel = () => {
    if (terminalColumnPresentRef.current) assertRightRailLayout(false);
    else panelRef.current?.expand();
  };
  const togglePanel = () => {
    if (panelRef.current == null) return;
    const partition = rightPartitionRef.current;
    if (isCollapsed) {
      applyToggle('right', partition, 'open');
      if (terminalColumnPresentRef.current) assertRightRailLayout(false);
      else panelRef.current.expand();
    } else {
      applyToggle('right', partition, 'collapsed');
      if (terminalColumnPresentRef.current) assertRightRailLayout(true);
      else panelRef.current.collapse();
    }
  };
  const toggleDocumentRightPanel = () => {
    if (terminalColumnPresent) onTerminalVisibleChange?.(false);
    else togglePanel();
  };

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${RIGHT_COLLAPSE_THRESHOLD}px)`);
    const onChange = () => {
      const partition = resolvePartition(embeddedHost, window.innerWidth, 'right');
      setRightPartition(partition);
      const collapsed = resolveEffectiveState('right', partition, readPins()) === 'collapsed';
      setIsCollapsed(collapsed);
      if (terminalColumnPresentRef.current) assertRightRailLayout(collapsed);
      else if (collapsed) panelRef.current?.collapse();
      else panelRef.current?.expand();
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [
    embeddedHost,
    panelRef,
    // biome-ignore lint/correctness/useExhaustiveDependencies: handlers re-subscribe to retain current geometry closures
    assertRightRailLayout,
  ]);

  useEffect(() => {
    if (groupContainerEl == null || isEmbedded) return;
    const observer = new ResizeObserver(() => {
      assertRightRailLayoutRef.current(isCollapsedRef.current);
    });
    observer.observe(groupContainerEl);
    return () => observer.disconnect();
  }, [groupContainerEl, isEmbedded]);

  useEffect(() => {
    const openRequestedTab = (tab: PanelTab) => {
      onActiveTabChange(tab);
      expandDocPanel();
    };
    const pendingTab = consumePendingDocPanelTabRequest();
    if (pendingTab) openRequestedTab(pendingTab);
    return subscribeToDocPanelTabRequests((tab) => {
      consumePendingDocPanelTabRequest();
      openRequestedTab(tab);
    });
  }, [
    onActiveTabChange,
    // biome-ignore lint/correctness/useExhaustiveDependencies: subscription keeps the current panel action
    expandDocPanel,
  ]);
  useEffect(() => {
    if (docPanelExpandSignal !== 0) expandDocPanel();
  }, [
    docPanelExpandSignal,
    // biome-ignore lint/correctness/useExhaustiveDependencies: effect must use the current panel action
    expandDocPanel,
  ]);

  const previousTerminalColumnPresentRef = useRef(terminalColumnPresent);
  useLayoutEffect(() => {
    if (previousTerminalColumnPresentRef.current === terminalColumnPresent) return;
    previousTerminalColumnPresentRef.current = terminalColumnPresent;
    queueMicrotask(() => assertRightRailLayoutRef.current(isCollapsed));
  }, [terminalColumnPresent, isCollapsed]);
  useLayoutEffect(() => {
    if (!isCollapsed) return;
    const panel = document.getElementById('doc-panel');
    if (!panel?.contains(document.activeElement)) return;
    const toggle = document.querySelector<HTMLElement>('[data-doc-panel-toggle]');
    if (toggle) toggle.focus();
    else document.querySelector<HTMLElement>('[data-sidebar="trigger"]')?.focus();
  }, [isCollapsed]);
  useEffect(() => {
    if (window.okDesktop != null) {
      window.okDesktop.editor.notifyViewMenuStateChanged({ docPanelVisible: !isCollapsed });
      return window.okDesktop.onMenuAction((action) => {
        if (action === 'toggle-doc-panel') togglePanel();
      });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesKeyboardShortcut(event, 'toggle-document-panel')) {
        event.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isCollapsed,
    // biome-ignore lint/correctness/useExhaustiveDependencies: desktop and keyboard handlers re-subscribe for current state
    togglePanel,
  ]);

  const onDocPanelHandlePointerDown = () => {
    setIsDraggingDocHandle(true);
    isDraggingDocHandleRef.current = true;
    const onPointerUp = () => {
      setIsDraggingDocHandle(false);
      isDraggingDocHandleRef.current = false;
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointerup', onPointerUp);
  };
  const onDocPanelResize = (size: ResizeSize) => {
    setIsCollapsed(size.asPercentage === 0);
    if (size.inPixels > 0 && isDraggingDocHandleRef.current)
      writeSharedRightRailWidth(size.inPixels);
  };
  const onTerminalHandlePointerDown = () => {
    setIsDraggingTerminalHandle(true);
    isDraggingTerminalHandleRef.current = true;
    const onPointerUp = () => {
      setIsDraggingTerminalHandle(false);
      isDraggingTerminalHandleRef.current = false;
      window.removeEventListener('pointerup', onPointerUp);
      if (terminalColumnPanelRef.current?.isCollapsed()) onTerminalVisibleChange?.(false);
    };
    window.addEventListener('pointerup', onPointerUp);
  };
  const onTerminalPanelResize = (size: ResizeSize) => {
    if (size.inPixels > 0 && isDraggingTerminalHandleRef.current)
      writeSharedRightRailWidth(size.inPixels);
  };

  return {
    isEmbedded,
    isCollapsed,
    initialRightCollapsed,
    initialDocPanelWidthPx,
    initialTerminalWidthPx,
    isDraggingDocHandle,
    isDraggingTerminalHandle,
    terminalDockPosition,
    terminalColumnPresent,
    panelRef,
    terminalColumnPanelRef,
    groupRef,
    rightTerminalContainer,
    pdfPanelContainer,
    bottomTerminalContainer,
    terminalEditorRegion,
    setRightTerminalContainer,
    setPdfPanelContainer,
    setBottomTerminalContainer,
    setTerminalEditorRegion,
    setGroupContainer: (node) => {
      setGroupContainerEl(node);
      groupContainerElRef.current = node;
    },
    toggleDocumentRightPanel,
    onDocPanelHandlePointerDown,
    onDocPanelResize,
    onTerminalHandlePointerDown,
    onTerminalPanelResize,
  };
}
