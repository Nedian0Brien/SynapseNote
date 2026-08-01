import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaceSearchEntries, type WorkspaceSearchEntry } from '../command-palette-search';

const SEARCH_TIMEOUT_MS = 3000;
const SEARCH_WARMING_POLL_MS = 600;
const SEARCH_MAX_WARMING_POLLS = 20;

export type CommandPaletteSearchStatus = 'idle' | 'loading' | 'success' | 'error';

/** Owns deferred lexical query execution, warming retry, and stale-result state. */
export function useCommandPaletteLexicalSearch({
  inExclusiveMode,
  open,
  pagesLoading,
  query,
  deferredQuery,
}: {
  deferredQuery: string;
  inExclusiveMode: boolean;
  open: boolean;
  pagesLoading: boolean;
  query: string;
}) {
  const trimmedDeferredQuery = deferredQuery.trim();
  const [searchResults, setSearchResults] = useState<WorkspaceSearchEntry[]>([]);
  const [searchStatus, setSearchStatus] = useState<CommandPaletteSearchStatus>('idle');
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searchIndexWarming, setSearchIndexWarming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void query;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  useEffect(() => {
    if (!open || !trimmedDeferredQuery || inExclusiveMode || pagesLoading) {
      setSearchResults([]);
      setSearchStatus('idle');
      setSearchTruncated(false);
      setSearchIndexWarming(false);
      return;
    }
    let cancelled = false;
    let everWarming = false;
    let warmingPolls = 0;
    let activeController: AbortController | null = null;
    let timeoutTimer: number | undefined;
    let retryTimer: number | undefined;
    setSearchStatus('loading');

    const scheduleWarmingRetry = (): boolean => {
      if (cancelled || warmingPolls >= SEARCH_MAX_WARMING_POLLS) return false;
      warmingPolls += 1;
      retryTimer = window.setTimeout(run, SEARCH_WARMING_POLL_MS);
      return true;
    };
    const settleErrorOrRetry = () => {
      if (cancelled) return;
      if (everWarming && scheduleWarmingRetry()) return;
      setSearchResults([]);
      setSearchStatus('error');
      setSearchTruncated(false);
      setSearchIndexWarming(false);
    };
    function run() {
      const controller = new AbortController();
      activeController = controller;
      timeoutTimer = window.setTimeout(() => {
        controller.abort();
        settleErrorOrRetry();
      }, SEARCH_TIMEOUT_MS);
      void fetchWorkspaceSearchEntries(trimmedDeferredQuery, { signal: controller.signal })
        .then(({ entries, truncated, ready }) => {
          window.clearTimeout(timeoutTimer);
          if (cancelled) return;
          if (!ready) {
            if (!everWarming) {
              everWarming = true;
              setSearchResults([]);
              setSearchTruncated(false);
              setSearchIndexWarming(true);
              setSearchStatus('success');
            }
            if (!scheduleWarmingRetry()) setSearchIndexWarming(false);
            return;
          }
          setSearchResults(entries);
          setSearchTruncated(truncated);
          setSearchIndexWarming(false);
          setSearchStatus('success');
        })
        .catch((error: unknown) => {
          window.clearTimeout(timeoutTimer);
          if (cancelled) return;
          if (error instanceof Error && error.name === 'AbortError') return;
          settleErrorOrRetry();
        });
    }
    run();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutTimer);
      window.clearTimeout(retryTimer);
      activeController?.abort();
    };
  }, [inExclusiveMode, open, pagesLoading, trimmedDeferredQuery]);

  return {
    deferredQuery,
    listRef,
    searchIndexWarming,
    searchResults,
    searchStatus,
    searchTruncated,
    trimmedDeferredQuery,
  };
}
