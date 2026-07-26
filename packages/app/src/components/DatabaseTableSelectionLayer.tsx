import { Check, Minus } from 'lucide-react';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DATABASE_SELECTION_CONTROL_GAP,
  DATABASE_SELECTION_CONTROL_SIZE,
} from './database-table-selection-geometry';

export interface DatabaseTableSelectionLayerProps {
  enabled: boolean;
  tableHostRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  mutationLocked: boolean;
  recordIds: readonly string[];
  selectedRecordIds: ReadonlySet<string>;
  onSelectionChange?: (recordIds: Set<string>) => void;
}

/**
 * Keeps selected-page checkboxes visible in the same document-side rail as
 * the hover controls. The rail remains outside the table tracks so selection
 * never shifts the sticky Title column or changes horizontal scroll geometry.
 */
export function DatabaseTableSelectionLayer({
  enabled,
  tableHostRef,
  scrollContainerRef,
  mutationLocked,
  recordIds,
  selectedRecordIds,
  onSelectionChange,
}: DatabaseTableSelectionLayerProps) {
  const selectionActive = enabled && selectedRecordIds.size > 0;
  const controlRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!selectionActive) return;
    const host = tableHostRef.current;
    const scrollOwner = scrollContainerRef.current;
    if (!host || !scrollOwner) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const hostRect = host.getBoundingClientRect();
      const viewportRect = scrollOwner.getBoundingClientRect();
      const viewportHasArea = viewportRect.width > 0 || viewportRect.height > 0;
      const left = Math.round(
        viewportRect.left -
          hostRect.left -
          DATABASE_SELECTION_CONTROL_GAP -
          DATABASE_SELECTION_CONTROL_SIZE,
      );
      const rows = new Map(
        Array.from(host.querySelectorAll<HTMLTableRowElement>('tbody tr[data-record-id]')).map(
          (row) => [row.dataset.recordId, row],
        ),
      );
      for (const recordId of selectedRecordIds) {
        const row = rows.get(recordId);
        const control = controlRefs.current.get(recordId);
        if (!control) continue;
        if (!row) {
          control.style.visibility = 'hidden';
          continue;
        }
        const rowRect = row.getBoundingClientRect();
        if (
          viewportHasArea &&
          (rowRect.bottom < viewportRect.top || rowRect.top > viewportRect.bottom)
        ) {
          control.style.visibility = 'hidden';
          continue;
        }
        control.style.left = `${left}px`;
        control.style.top = `${Math.round(
          rowRect.top -
            hostRect.top +
            Math.max(0, (rowRect.height - DATABASE_SELECTION_CONTROL_SIZE) / 2),
        )}px`;
        control.style.visibility = 'visible';
        control.setAttribute('aria-label', `Deselect page ${row.dataset.recordLabel || recordId}`);
      }

      const header = host.querySelector<HTMLTableRowElement>('thead tr');
      const headerControl = controlRefs.current.get('__all__');
      if (header && headerControl) {
        const headerRect = header.getBoundingClientRect();
        if (
          !viewportHasArea ||
          (headerRect.bottom >= viewportRect.top && headerRect.top <= viewportRect.bottom)
        ) {
          headerControl.style.left = `${left}px`;
          headerControl.style.top = `${Math.round(
            headerRect.top -
              hostRect.top +
              Math.max(0, (headerRect.height - DATABASE_SELECTION_CONTROL_SIZE) / 2),
          )}px`;
          headerControl.style.visibility = 'visible';
        } else {
          headerControl.style.visibility = 'hidden';
        }
      }
    };
    const scheduleMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    scrollOwner.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(host);
    resizeObserver.observe(scrollOwner);
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(scrollOwner, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      scrollOwner.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollContainerRef, selectedRecordIds, selectionActive, tableHostRef]);

  if (!selectionActive) return null;
  const allLoadedSelected =
    recordIds.length > 0 && recordIds.every((recordId) => selectedRecordIds.has(recordId));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[46] overflow-visible"
      data-database-table-selection-layer
    >
      {['__all__', ...selectedRecordIds].map((recordId) => {
        const header = recordId === '__all__';
        return (
          <Button
            key={recordId}
            ref={(control) => {
              if (control) controlRefs.current.set(recordId, control);
              else controlRefs.current.delete(recordId);
            }}
            type="button"
            role="checkbox"
            aria-label={header ? 'Select all loaded pages' : `Deselect page ${recordId}`}
            aria-checked={header && !allLoadedSelected ? 'mixed' : true}
            data-state="checked"
            data-selection-scope={header ? 'all' : 'record'}
            data-record-id={header ? undefined : recordId}
            className="ok-row-selection-btn ok-row-selection-btn--persistent pointer-events-auto absolute"
            style={{ visibility: 'hidden' }}
            disabled={!onSelectionChange || mutationLocked}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (header) {
                onSelectionChange?.(allLoadedSelected ? new Set() : new Set(recordIds));
                return;
              }
              const next = new Set(selectedRecordIds);
              next.delete(recordId);
              onSelectionChange?.(next);
            }}
          >
            {header && !allLoadedSelected ? (
              <Minus className="size-3.5" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        );
      })}
    </div>
  );
}
