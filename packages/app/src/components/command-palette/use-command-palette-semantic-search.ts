import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSemanticSearchStatus } from '@/hooks/use-semantic-search-status';
import {
  fetchWorkspaceSearchEntries,
  SEMANTIC_RESULT_LIMIT,
  type WorkspaceSearchEntry,
} from '../command-palette-search';
import { computeSemanticModeView } from '../command-palette-semantic';
import { TAG_QUERY_PREFIX } from '../command-palette-tag-search';

const SEMANTIC_SEARCH_TIMEOUT_MS = 3000;

/** Owns explicit-submit semantic state, cancellation, and keyboard transitions. */
export function useCommandPaletteSemanticSearch({
  inputRef,
  open,
  pagesLoading,
  query,
  setQuery,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  open: boolean;
  pagesLoading: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
}) {
  const [isSemanticMode, setIsSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<WorkspaceSearchEntry[]>([]);
  const [semanticFiredQuery, setSemanticFiredQuery] = useState<string | null>(null);
  const [semanticStatus, setSemanticStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const semanticAbortRef = useRef<AbortController | null>(null);
  const semanticTimerRef = useRef<number | null>(null);
  const { status: semanticCapability, refresh: refreshSemanticStatus } = useSemanticSearchStatus({
    enabled: open,
  });
  const semanticCapable =
    (semanticCapability?.enabled ?? false) && (semanticCapability?.keyPresent ?? false);
  const semanticIndexedCount = semanticCapability?.embedded ?? 0;
  const semanticTotalCount = semanticCapability?.total ?? 0;
  const semanticIndexing =
    semanticCapable && semanticTotalCount > 0 && semanticIndexedCount < semanticTotalCount;
  const semanticView = isSemanticMode
    ? computeSemanticModeView({
        query: query.trim(),
        firedQuery: semanticFiredQuery,
        status: semanticStatus,
        resultCount: semanticResults.length,
      })
    : null;

  function resetSemanticState() {
    semanticAbortRef.current?.abort();
    semanticAbortRef.current = null;
    if (semanticTimerRef.current !== null) {
      window.clearTimeout(semanticTimerRef.current);
      semanticTimerRef.current = null;
    }
    setSemanticResults([]);
    setSemanticFiredQuery(null);
    setSemanticStatus('idle');
  }

  useEffect(() => {
    if (open) return;
    setIsSemanticMode(false);
    semanticAbortRef.current?.abort();
    semanticAbortRef.current = null;
    if (semanticTimerRef.current !== null) {
      window.clearTimeout(semanticTimerRef.current);
      semanticTimerRef.current = null;
    }
    setSemanticResults([]);
    setSemanticFiredQuery(null);
    setSemanticStatus('idle');
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the status refresher is stable; re-arm only while the semantic view needs progress.
  useEffect(() => {
    if (!open || !isSemanticMode || !semanticIndexing) return;
    const id = window.setInterval(() => refreshSemanticStatus(), 2500);
    return () => window.clearInterval(id);
  }, [isSemanticMode, open, semanticIndexing]);

  function clearThisFire(timeout: number, controller: AbortController) {
    window.clearTimeout(timeout);
    if (semanticTimerRef.current === timeout) semanticTimerRef.current = null;
    if (semanticAbortRef.current === controller) semanticAbortRef.current = null;
  }

  function fireSemanticSearch(raw: string) {
    const semanticQuery = raw.trim();
    if (!semanticQuery || pagesLoading) return;
    semanticAbortRef.current?.abort();
    if (semanticTimerRef.current !== null) window.clearTimeout(semanticTimerRef.current);
    const controller = new AbortController();
    semanticAbortRef.current = controller;
    setSemanticStatus('loading');
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setSemanticStatus('error');
    }, SEMANTIC_SEARCH_TIMEOUT_MS);
    semanticTimerRef.current = timeout;
    void fetchWorkspaceSearchEntries(semanticQuery, {
      signal: controller.signal,
      semantic: true,
      limit: SEMANTIC_RESULT_LIMIT,
    })
      .then(({ entries }) => {
        clearThisFire(timeout, controller);
        setSemanticResults(entries);
        setSemanticFiredQuery(semanticQuery);
        setSemanticStatus('success');
      })
      .catch((error: unknown) => {
        clearThisFire(timeout, controller);
        if (error instanceof Error && error.name === 'AbortError' && !timedOut) return;
        console.debug('[semantic-search] fire failed', { timedOut, error });
        setSemanticStatus('error');
      });
  }

  function enterSemanticMode() {
    setIsSemanticMode(true);
    if (query.startsWith(TAG_QUERY_PREFIX)) setQuery(query.slice(TAG_QUERY_PREFIX.length));
    resetSemanticState();
    inputRef.current?.focus();
  }

  function exitSemanticMode() {
    setIsSemanticMode(false);
    setQuery('');
    resetSemanticState();
    inputRef.current?.focus();
  }

  function leaveSemanticModeForTag() {
    setIsSemanticMode(false);
    resetSemanticState();
  }

  function onSemanticInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!isSemanticMode || event.key !== 'Enter') return;
    if (semanticView?.submit) {
      event.preventDefault();
      event.stopPropagation();
      fireSemanticSearch(semanticView.submit.query);
    } else if (semanticStatus === 'loading') {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onPaletteEscapeKeyDown(event: KeyboardEvent) {
    if (!isSemanticMode) return;
    event.preventDefault();
    exitSemanticMode();
  }

  return {
    enterSemanticMode,
    exitSemanticMode,
    fireSemanticSearch,
    isSemanticMode,
    leaveSemanticModeForTag,
    onPaletteEscapeKeyDown,
    onSemanticInputKeyDown,
    semanticCapable,
    semanticIndexedCount,
    semanticIndexing,
    semanticResults,
    semanticTotalCount,
    semanticView,
  };
}
