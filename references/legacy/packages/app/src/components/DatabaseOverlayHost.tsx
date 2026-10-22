import { useEffect } from 'react';
import { DatabaseRecordPeek } from '@/components/DatabaseRecordPeek';
import { recordDatabaseInteractionTrace } from '@/lib/database-interaction-trace';
import { closeDatabaseRecordPeek, useDatabaseOverlayState } from '@/lib/database-overlay-store';

/**
 * App/editor-level owner for database overlays.
 *
 * This host deliberately lives outside Tiptap NodeViews and canonical table
 * renderers. A projection refresh or NodeView recycle can therefore replace
 * the table subtree without destroying a record peek that the user already
 * opened.
 */
export function DatabaseOverlayHost() {
  const { recordPeek } = useDatabaseOverlayState();
  useEffect(() => {
    if (!recordPeek) return;
    recordDatabaseInteractionTrace(recordPeek.interactionId ?? 'untracked', 'overlay_mounted', {
      recordId: recordPeek.record.id,
      mode: recordPeek.mode,
    });
  }, [recordPeek]);
  if (!recordPeek) return null;
  return (
    <DatabaseRecordPeek
      mode={recordPeek.mode}
      database={recordPeek.database}
      source={recordPeek.source}
      record={recordPeek.record}
      notionSurface={recordPeek.notionSurface}
      onClose={() => closeDatabaseRecordPeek('explicit')}
      onNavigateRecord={recordPeek.onNavigateRecord}
      onOpenFull={recordPeek.onOpenFull}
    />
  );
}
