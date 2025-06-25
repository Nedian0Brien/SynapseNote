import { createContext, useContext } from 'react';

export const GridRowContext = createContext<{
  isSticky?: boolean;
  resizeRow: () => void;
}>({
  isSticky: false,
  resizeRow: () => undefined,
});

export function useGridRowContext () {
  const context = useContext(GridRowContext);

  if (!context) {
    throw new Error('useGridRowContext must be used within a GridRowProvider');
  }

  return context;
}

export const GridRowProvider = GridRowContext.Provider;