import { createContext, useContext } from 'react';

import { RenderRow } from '@/components/database/components/grid/grid-row';

export const GridContext = createContext<{
  hoverRowId?: string;
  setHoverRowId: (hoverRowId?: string) => void;
  rows: RenderRow[];
  setRows: (rows: RenderRow[]) => void;
  activePropertyId?: string;
  setActivePropertyId: (activePropertyId?: string) => void;
  activeCell?: {
    rowId: string;
    fieldId: string;
  };
  setActiveCell: (activeCell?: { rowId: string; fieldId: string }) => void;
  resizeRows?: Map<string, number>;
  setResizeRow: (resizeRow: { rowId: string; maxCellHeight: number }) => void;
  onResizeRowEnd: (id: string) => void;
}>({
  rows: [],
  setRows: (_rows: RenderRow[]) => undefined,
  setHoverRowId: (_hoverRowId?: string) => undefined,
  setActivePropertyId: (_activePropertyId?: string) => undefined,
  setActiveCell: (_activeCell?: { rowId: string; fieldId: string }) => undefined,
  setResizeRow: () => undefined,
  onResizeRowEnd: () => undefined,
});

export function useGridContext() {
  const context = useContext(GridContext);

  if (!context) {
    throw new Error('useGridContext must be used within the context');
  }

  return context;
}
