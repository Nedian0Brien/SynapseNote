import type { ComponentProps, RefObject } from 'react';
import { DatabaseTableCanvas } from './DatabaseTableCanvas';
import { DatabaseTableCellMenu } from './DatabaseTableCellMenu';
import { DatabaseTableControls } from './DatabaseTableControls';
import { DatabaseTableInteractionLayer } from './DatabaseTableInteractionLayer';
import { DatabaseTableRowMenu } from './DatabaseTableRowMenu';
import { DatabaseTableSelectionLayer } from './DatabaseTableSelectionLayer';

export interface DatabaseTableCompositionProps {
  notionSurface: boolean;
  tableHostRef: RefObject<HTMLDivElement | null>;
  controlsProps: ComponentProps<typeof DatabaseTableControls>;
  canvasProps: ComponentProps<typeof DatabaseTableCanvas>;
  interactionProps: ComponentProps<typeof DatabaseTableInteractionLayer>;
  cellMenuProps: ComponentProps<typeof DatabaseTableCellMenu>;
  rowMenuProps: ComponentProps<typeof DatabaseTableRowMenu>;
}

/**
 * Presentation-only table composition. Runtime state and command handlers
 * stay in the coordinator; this module owns the DOM order and the single
 * table surface boundary.
 */
export function DatabaseTableComposition({
  notionSurface,
  tableHostRef,
  controlsProps,
  canvasProps,
  interactionProps,
  cellMenuProps,
  rowMenuProps,
}: DatabaseTableCompositionProps) {
  return (
    <div
      ref={tableHostRef}
      className="relative"
      data-database-table-surface={notionSurface ? 'inline' : 'canonical'}
    >
      <DatabaseTableControls {...controlsProps} />
      <DatabaseTableCanvas {...canvasProps} />
      <DatabaseTableSelectionLayer
        enabled={notionSurface}
        tableHostRef={tableHostRef}
        scrollContainerRef={canvasProps.scrollContainerRef}
        mutationLocked={interactionProps.mutationLocked}
        recordIds={canvasProps.headerProps.recordIds}
        selectedRecordIds={interactionProps.selectedRecordIds}
        onSelectionChange={canvasProps.headerProps.onSelectionChange}
      />
      <DatabaseTableInteractionLayer {...interactionProps} />
      <DatabaseTableCellMenu {...cellMenuProps} />
      <DatabaseTableRowMenu {...rowMenuProps} />
    </div>
  );
}
