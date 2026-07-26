import type { DatabaseQueryResult, ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import type * as React from 'react';
import { useState } from 'react';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';

export interface DatabaseTableReorderState {
  reorderEnabled: boolean;
  draggedRecordId: string | null;
  dropTarget: { recordId: string; edge: 'before' | 'after' } | null;
  clearRowDrag: () => void;
  startRecordDrag: (recordId: string) => void;
  onRowDragOver: (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => void;
  onRowDragLeave: (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => void;
  onRowDrop: (record: ProjectedDatabaseRecord, event: React.DragEvent<HTMLTableRowElement>) => void;
}

export function useDatabaseTableReorder({
  result,
  onReorderRecords,
  mutationLocked,
  ghost,
  setGridAnnouncement,
}: {
  result: DatabaseQueryResult;
  onReorderRecords?: (recordIds: readonly string[]) => void;
  mutationLocked: boolean;
  ghost: DatabaseGhostState | null;
  setGridAnnouncement: React.Dispatch<React.SetStateAction<string>>;
}): DatabaseTableReorderState {
  const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    recordId: string;
    edge: 'before' | 'after';
  } | null>(null);
  const reorderEnabled = Boolean(onReorderRecords && !mutationLocked && !ghost);

  const clearRowDrag = () => {
    setDraggedRecordId(null);
    setDropTarget(null);
  };

  const startRecordDrag = (recordId: string) => {
    if (!reorderEnabled) return;
    setDraggedRecordId(recordId);
    setDropTarget(null);
  };

  const onRowDragOver = (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => {
    if (!reorderEnabled || !draggedRecordId || draggedRecordId === record.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget((current) =>
      current?.recordId === record.id && current.edge === edge
        ? current
        : { recordId: record.id, edge },
    );
  };

  const onRowDragLeave = (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDropTarget((current) => (current?.recordId === record.id ? null : current));
  };

  const onRowDrop = (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => {
    if (!reorderEnabled || !draggedRecordId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (draggedRecordId === record.id || !onReorderRecords) {
      clearRowDrag();
      return;
    }
    const currentIds = result.records.map((candidate) => candidate.id);
    if (!currentIds.includes(draggedRecordId) || !currentIds.includes(record.id)) {
      clearRowDrag();
      return;
    }
    const nextIds = currentIds.filter((recordId) => recordId !== draggedRecordId);
    const targetIndex = nextIds.indexOf(record.id);
    nextIds.splice(targetIndex + (edge === 'after' ? 1 : 0), 0, draggedRecordId);
    onReorderRecords(nextIds);
    setGridAnnouncement(
      `Page moved ${edge} ${record.id}. ${nextIds.length} pages in manual order.`,
    );
    clearRowDrag();
  };

  return {
    reorderEnabled,
    draggedRecordId,
    dropTarget,
    clearRowDrag,
    startRecordDrag,
    onRowDragOver,
    onRowDragLeave,
    onRowDrop,
  };
}
