import { autoUpdate } from '@floating-ui/dom';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { createInteractionHandleElement } from '@/editor/interaction-handle/create-interaction-handle-element';
import {
  INTERACTION_HANDLE_HEIGHT,
  INTERACTION_HANDLE_TABLE_GAP,
} from '@/lib/interaction-handle-geometry';
import {
  DATABASE_SELECTION_CONTROL_GAP,
  DATABASE_SELECTION_CONTROL_SIZE,
  DATABASE_SELECTION_RAIL_SLOP,
} from './database-table-selection-geometry';
import { DATABASE_RECORD_DRAG_MIME } from './database-table-types';

const DATABASE_INTERACTION_HANDLE_WIDTH = 64;

export interface DatabaseTableInteractionLayerProps {
  enabled: boolean;
  tableHostRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  mutationLocked: boolean;
  reorderEnabled: boolean;
  canCreatePage: boolean;
  selectedRecordIds: ReadonlySet<string>;
  rowMenuRecordId?: string;
  onAddPage?: () => void;
  onToggleSelection?: (recordId: string) => void;
  onOpenRecordMenu?: (recordId: string, recordLabel: string, anchor: HTMLButtonElement) => void;
  onRecordDragStart?: (recordId: string, event: DragEvent) => void;
  onRecordDragEnd?: () => void;
}

/**
 * One native interaction rail for the whole table. It is a sibling of the
 * scroll owner, so hovering a row never adds a selector column or changes the
 * table's width. The same imperative handle factory is used by TipTap's
 * BlockDragHandle extension.
 */
export function DatabaseTableInteractionLayer({
  enabled,
  tableHostRef,
  scrollContainerRef,
  mutationLocked,
  reorderEnabled,
  canCreatePage,
  selectedRecordIds,
  rowMenuRecordId,
  onAddPage,
  onToggleSelection,
  onOpenRecordMenu,
  onRecordDragStart,
  onRecordDragEnd,
}: DatabaseTableInteractionLayerProps) {
  'use no memo';
  const gripElementRef = useRef<HTMLButtonElement | null>(null);
  const activeRecordIdRef = useRef<string | null>(null);
  const latest = useRef({
    mutationLocked,
    reorderEnabled,
    canCreatePage,
    selectedRecordIds,
    rowMenuRecordId,
    onAddPage,
    onToggleSelection,
    onOpenRecordMenu,
    onRecordDragStart,
    onRecordDragEnd,
  });
  latest.current = {
    mutationLocked,
    reorderEnabled,
    canCreatePage,
    selectedRecordIds,
    rowMenuRecordId,
    onAddPage,
    onToggleSelection,
    onOpenRecordMenu,
    onRecordDragStart,
    onRecordDragEnd,
  };

  useEffect(() => {
    if (!enabled) return;
    const host = tableHostRef.current;
    const scrollOwner = scrollContainerRef.current;
    if (!host || !scrollOwner) return;

    const { container, addButton, grip, selectionButton } = createInteractionHandleElement({
      addLabel: 'Add page below',
      gripLabel: 'Select page',
      selectionLabel: 'Select page checkbox',
    });
    container.classList.add('database-table-interaction-layer');
    container.dataset.databaseTableInteractionLayer = '';
    container.style.pointerEvents = 'none';
    grip.dataset.databaseRowDragHandle = '';
    gripElementRef.current = grip;
    host.append(container);

    let activeRow: HTMLTableRowElement | null = null;
    let hideTimer: number | undefined;
    let stopAutoUpdate: (() => void) | undefined;

    const clearHide = () => {
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = undefined;
    };

    const hide = () => {
      clearHide();
      stopAutoUpdate?.();
      stopAutoUpdate = undefined;
      activeRow = null;
      activeRecordIdRef.current = null;
      container.style.visibility = 'hidden';
      container.style.pointerEvents = 'none';
      container.removeAttribute('data-record-id');
    };

    const scheduleHide = () => {
      clearHide();
      hideTimer = window.setTimeout(() => {
        if (
          activeRow?.dataset.recordId &&
          latest.current.rowMenuRecordId === activeRow.dataset.recordId
        ) {
          return;
        }
        hide();
      }, 100);
    };

    const rowForTarget = (target: EventTarget | null): HTMLTableRowElement | null => {
      if (!(target instanceof Element)) return null;
      const row = target.closest<HTMLTableRowElement>('tr[data-record-id]');
      if (!row || row.dataset.canonical === 'false' || !row.isConnected) return null;
      return row;
    };

    const rowForSelectionRailPoint = (
      clientX: number,
      clientY: number,
    ): HTMLTableRowElement | null => {
      const viewportRect = scrollOwner.getBoundingClientRect();
      const railLeft =
        viewportRect.left -
        DATABASE_SELECTION_CONTROL_GAP -
        DATABASE_SELECTION_CONTROL_SIZE -
        DATABASE_SELECTION_RAIL_SLOP;
      const railRight =
        viewportRect.left - DATABASE_SELECTION_CONTROL_GAP + DATABASE_SELECTION_RAIL_SLOP;
      if (
        clientX < railLeft ||
        clientX > railRight ||
        clientY < viewportRect.top ||
        clientY > viewportRect.bottom
      ) {
        return null;
      }
      return (
        Array.from(host.querySelectorAll<HTMLTableRowElement>('tbody tr[data-record-id]')).find(
          (row) => {
            if (row.dataset.canonical === 'false' || !row.isConnected) return false;
            const rowRect = row.getBoundingClientRect();
            return clientY >= rowRect.top && clientY <= rowRect.bottom;
          },
        ) ?? null
      );
    };

    const updatePosition = () => {
      if (!activeRow?.isConnected) {
        hide();
        return;
      }
      const row = activeRow;
      const hostRect = host.getBoundingClientRect();
      const viewportRect = scrollOwner.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const handleRect = container.getBoundingClientRect();
      const handleWidth = handleRect.width || DATABASE_INTERACTION_HANDLE_WIDTH;
      const handleHeight = handleRect.height || INTERACTION_HANDLE_HEIGHT;
      // The rail and its pointer hit-testing share the same left gutter. Use
      // host-relative geometry directly so an overflow boundary can never
      // shift the controls over the sticky title column.
      container.style.left = `${Math.round(
        viewportRect.left - hostRect.left - handleWidth - INTERACTION_HANDLE_TABLE_GAP,
      )}px`;
      container.style.top = `${Math.round(
        rowRect.top - hostRect.top + Math.max(0, (rowRect.height - handleHeight) / 2),
      )}px`;
    };

    const show = (row: HTMLTableRowElement) => {
      clearHide();
      activeRow = row;
      const recordId = row.dataset.recordId;
      if (!recordId) return;
      const recordLabel = row.dataset.recordLabel || recordId;
      container.dataset.recordId = recordId;
      activeRecordIdRef.current = recordId;
      const selected = latest.current.selectedRecordIds.has(recordId);
      container.dataset.state = selected ? 'selected' : 'unselected';
      const menuOpen = latest.current.rowMenuRecordId === recordId;
      grip.setAttribute('aria-label', `Open page actions for ${recordLabel}`);
      grip.setAttribute('aria-haspopup', 'menu');
      grip.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
      grip.dataset.state = menuOpen ? 'open' : 'closed';
      grip.title = latest.current.reorderEnabled
        ? 'Drag to move · Click for menu'
        : 'Click for menu';
      grip.tabIndex = latest.current.onOpenRecordMenu ? 0 : -1;
      grip.disabled = !latest.current.onOpenRecordMenu && !latest.current.reorderEnabled;
      grip.draggable = latest.current.reorderEnabled;
      if (selectionButton) {
        selectionButton.setAttribute('aria-label', `Select page checkbox ${recordId}`);
        selectionButton.setAttribute('aria-checked', selected ? 'true' : 'false');
        selectionButton.dataset.state = selected ? 'checked' : 'unchecked';
        selectionButton.disabled =
          !latest.current.onToggleSelection || latest.current.mutationLocked;
        selectionButton.hidden = !latest.current.onToggleSelection;
      }
      addButton.hidden = !latest.current.canCreatePage;
      container.style.visibility = 'visible';
      container.style.pointerEvents = 'auto';
      stopAutoUpdate?.();
      stopAutoUpdate = autoUpdate(row, container, updatePosition);
      updatePosition();
    };

    const onPointerOver = (event: PointerEvent) => {
      const row = rowForTarget(event.target);
      if (row) show(row);
    };
    const onDocumentPointerMove = (event: PointerEvent) => {
      const railRow = rowForSelectionRailPoint(event.clientX, event.clientY);
      if (railRow) {
        if (railRow === activeRow) clearHide();
        else show(railRow);
        return;
      }
      const targetRow = rowForTarget(event.target);
      if (targetRow) {
        if (targetRow === activeRow) clearHide();
        return;
      }
      if (activeRow && event.target instanceof Node && !container.contains(event.target)) {
        scheduleHide();
      }
    };
    const onPointerOut = (event: PointerEvent) => {
      const row = rowForTarget(event.target);
      if (!row) return;
      const related = event.relatedTarget;
      if (related instanceof Node && (row.contains(related) || container.contains(related))) return;
      scheduleHide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const row = rowForTarget(event.target);
      if (row) show(row);
    };
    const onFocusOut = (event: FocusEvent) => {
      const related = event.relatedTarget;
      if (
        related instanceof Node &&
        (activeRow?.contains(related) || container.contains(related))
      ) {
        return;
      }
      scheduleHide();
    };
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();

    const onAdd = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      latest.current.onAddPage?.();
    };
    const onGripClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const recordId = activeRow?.dataset.recordId;
      if (!recordId || !latest.current.onOpenRecordMenu) return;
      const recordLabel = activeRow?.dataset.recordLabel || recordId;
      grip.setAttribute('aria-expanded', 'true');
      grip.dataset.state = 'open';
      latest.current.onOpenRecordMenu(recordId, recordLabel, grip);
    };
    const onGripDragStart = (event: DragEvent) => {
      const recordId = activeRow?.dataset.recordId;
      if (!recordId || !latest.current.reorderEnabled || latest.current.mutationLocked) {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      if (!event.dataTransfer) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DATABASE_RECORD_DRAG_MIME, recordId);
      latest.current.onRecordDragStart?.(recordId, event);
    };
    const onGripDragEnd = () => latest.current.onRecordDragEnd?.();
    const onSelectionClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const recordId = activeRow?.dataset.recordId;
      if (!recordId || !latest.current.onToggleSelection || latest.current.mutationLocked) return;
      const selected = !latest.current.selectedRecordIds.has(recordId);
      container.dataset.state = selected ? 'selected' : 'unselected';
      selectionButton?.setAttribute('aria-checked', selected ? 'true' : 'false');
      selectionButton?.setAttribute('data-state', selected ? 'checked' : 'unchecked');
      latest.current.onToggleSelection(recordId);
    };

    host.addEventListener('pointerover', onPointerOver);
    host.addEventListener('pointerout', onPointerOut);
    host.ownerDocument.addEventListener('pointermove', onDocumentPointerMove);
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('focusout', onFocusOut);
    scrollOwner.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    container.addEventListener('pointerenter', clearHide);
    container.addEventListener('pointerleave', scheduleHide);
    addButton.addEventListener('click', onAdd);
    grip.addEventListener('click', onGripClick);
    grip.addEventListener('dragstart', onGripDragStart);
    grip.addEventListener('dragend', onGripDragEnd);
    selectionButton?.addEventListener('click', onSelectionClick);

    return () => {
      clearHide();
      stopAutoUpdate?.();
      stopAutoUpdate = undefined;
      host.removeEventListener('pointerover', onPointerOver);
      host.removeEventListener('pointerout', onPointerOut);
      host.ownerDocument.removeEventListener('pointermove', onDocumentPointerMove);
      host.removeEventListener('focusin', onFocusIn);
      host.removeEventListener('focusout', onFocusOut);
      scrollOwner.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('pointerenter', clearHide);
      container.removeEventListener('pointerleave', scheduleHide);
      addButton.removeEventListener('click', onAdd);
      grip.removeEventListener('click', onGripClick);
      grip.removeEventListener('dragstart', onGripDragStart);
      grip.removeEventListener('dragend', onGripDragEnd);
      selectionButton?.removeEventListener('click', onSelectionClick);
      gripElementRef.current = null;
      activeRecordIdRef.current = null;
      container.remove();
    };
  }, [enabled, scrollContainerRef, tableHostRef]);

  useEffect(() => {
    const grip = gripElementRef.current;
    if (!grip) return;
    const menuOpen = rowMenuRecordId === activeRecordIdRef.current;
    grip.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    grip.dataset.state = menuOpen ? 'open' : 'closed';
  }, [rowMenuRecordId]);

  return null;
}
