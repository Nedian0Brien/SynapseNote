import { useEffectEvent, useRef, useState } from 'react';
import type { DatabaseTableProps, DatabaseTableViewState } from './database-table-types';

type ViewStateOptions = Pick<DatabaseTableProps, 'initialViewState' | 'onViewStateChange'>;

/** Owns scroll restoration and the stable DOM refs used by table navigation. */
export function useDatabaseTableViewState({
  initialViewState,
  onViewStateChange,
}: ViewStateOptions) {
  const [scrollTop, setScrollTop] = useState(initialViewState?.scrollTop ?? 0);
  const [, setScrollLeft] = useState(initialViewState?.scrollLeft ?? 0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewStateRef = useRef<DatabaseTableViewState>({
    scrollTop: initialViewState?.scrollTop ?? 0,
    scrollLeft: initialViewState?.scrollLeft ?? 0,
    ...(initialViewState?.focusedCell ? { focusedCell: initialViewState.focusedCell } : {}),
  });
  const autoFocusNewRecordConsumedRef = useRef<string | number | null>(null);
  const restoredViewStateRef = useRef(false);

  const updateViewState = useEffectEvent((patch: Partial<DatabaseTableViewState>) => {
    const next = { ...viewStateRef.current, ...patch };
    viewStateRef.current = next;
    onViewStateChange?.(next);
  });

  return {
    scrollTop,
    viewportHeight,
    setScrollTop,
    setScrollLeft,
    setViewportHeight,
    tableHostRef,
    scrollContainerRef,
    viewStateRef,
    autoFocusNewRecordConsumedRef,
    restoredViewStateRef,
    updateViewState,
  };
}

export type DatabaseTableViewStateModel = ReturnType<typeof useDatabaseTableViewState>;
