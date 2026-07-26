import type { Dispatch, SetStateAction } from 'react';
// biome-ignore lint/style/noRestrictedImports: this hook publishes callbacks to long-lived subscriptions, so stable identities are part of its contract.
import { useCallback, useEffect, useRef, useState } from 'react';

export const DATABASE_REFRESH_COALESCE_MS = 75;

/**
 * Converts refresh invalidations into a generation consumed by the database
 * read model. Database commits are normally followed by both a local success
 * callback and a collaboration broadcast; a short quiet window lets those
 * equivalent invalidations produce one describe/query generation.
 *
 * `setRefresh` intentionally implements the React setter shape used by the
 * existing command modules, but treats every call as an invalidation rather
 * than applying the supplied arithmetic updater. Refresh generations carry no
 * domain data, so collapsing multiple increments is the desired behavior.
 */
export function useDatabaseRefreshScheduler(delayMs = DATABASE_REFRESH_COALESCE_MS) {
  const [refreshKey, setRefreshKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const cancelScheduledRefresh = useCallback(() => {
    if (timerRef.current === null) return;
    globalThis.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const refreshNow = useCallback(() => {
    cancelScheduledRefresh();
    setRefreshKey((current) => current + 1);
  }, [cancelScheduledRefresh]);

  const scheduleRefresh = useCallback(() => {
    cancelScheduledRefresh();
    timerRef.current = globalThis.setTimeout(() => {
      timerRef.current = null;
      setRefreshKey((current) => current + 1);
    }, delayMs);
  }, [cancelScheduledRefresh, delayMs]);

  const setRefresh = useCallback<Dispatch<SetStateAction<number>>>(
    () => scheduleRefresh(),
    [scheduleRefresh],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current);
    },
    [],
  );

  return { refreshKey, setRefresh, scheduleRefresh, refreshNow };
}
