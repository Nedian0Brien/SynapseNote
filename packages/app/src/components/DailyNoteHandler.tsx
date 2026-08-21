import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePageList } from '@/components/PageListContext';
import { openOrCreateDailyNote } from '@/lib/daily-note';
import { subscribeToOpenTodayDailyNote } from '@/lib/daily-note-events';
import { emitDocumentsChanged } from '@/lib/documents-events';

/** One app-level owner keeps every daily-note entry point on one action path. */
export function DailyNoteHandler() {
  const { t } = useLingui();
  const { addPage } = usePageList();
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(
    () =>
      subscribeToOpenTodayDailyNote(() => {
        if (inFlightRef.current) return;

        const task = openOrCreateDailyNote()
          .then(({ docName, created }) => {
            addPage(docName);
            if (created) {
              emitDocumentsChanged(['files', 'backlinks', 'graph']);
              toast.success(t`Daily note created`, { description: docName });
            }
            window.location.hash = `#/${docName}`;
          })
          .catch((error: unknown) => {
            toast.error(t`Could not open today's daily note`, {
              description: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => {
            if (inFlightRef.current === task) inFlightRef.current = null;
          });

        inFlightRef.current = task;
      }),
    [addPage, t],
  );

  return null;
}
