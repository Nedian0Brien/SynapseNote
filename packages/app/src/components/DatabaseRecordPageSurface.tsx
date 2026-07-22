import type { ReactNode } from 'react';

export type DatabaseRecordPageSurfaceMode = 'side_peek' | 'center_peek' | 'full_page';

/**
 * Shared structural surface for every canonical database record presentation.
 *
 * The surrounding host owns the navigation primitive (Sheet, Dialog, or the
 * ordinary editor canvas), while this component keeps the record-page identity
 * and sizing contract in one place. `contents` preserves the existing full
 * page editor layout; peek modes provide the flex column needed by the body.
 */
export function DatabaseRecordPageSurface({
  mode,
  databaseId,
  sourceId,
  viewId,
  recordId,
  children,
}: {
  mode: DatabaseRecordPageSurfaceMode;
  databaseId?: string | null;
  sourceId?: string | null;
  viewId?: string | null;
  recordId?: string | null;
  children: ReactNode;
}) {
  return (
    <div
      data-database-record-page-surface
      data-record-page-mode={mode}
      data-database-id={databaseId ?? undefined}
      data-source-id={sourceId ?? undefined}
      data-view-id={viewId ?? undefined}
      data-record-id={recordId ?? undefined}
      data-database-machine-ids="stable"
      className={mode === 'full_page' ? 'contents' : 'flex min-h-0 flex-1 flex-col'}
    >
      {children}
    </div>
  );
}
