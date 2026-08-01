import { DocumentListSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react';
import { treeDirectoryPathToFolderPath } from '@/components/file-tree-adapter';
import {
  type FileEntry,
  filterVisibleEntries,
  isFolderEntry,
  toFileEntries,
} from '@/components/file-tree-utils';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse } from '@/lib/parse-server-response';
import { createRefreshScheduler } from '@/lib/refresh-scheduler';
import {
  consumeShowAllStream,
  isNdjsonResponse,
  SHOW_ALL_NDJSON_ACCEPT,
  ShowAllStreamError,
} from '@/lib/show-all-stream';
import { mergeRootEntriesAdditive, spliceLazyFolderChildren } from '../file-tree-merge';

type ListingResult =
  | { kind: 'entries'; entries: FileEntry[]; truncated: boolean }
  | { kind: 'http-error'; title: string }
  | { kind: 'network-error'; cause: unknown };

function showAllDepth1Url(dir: string, showOk: boolean): string {
  return `/api/documents?showAll=true${showOk ? '&showOk=true' : ''}&dir=${encodeURIComponent(dir)}&depth=1`;
}

async function fetchDepthOne(
  dir: string,
  showOk: boolean,
  signal: AbortSignal,
  failedTitle: string,
  mismatchTitle: string,
): Promise<ListingResult> {
  try {
    const response = await fetch(showAllDepth1Url(dir, showOk), {
      signal,
      headers: SHOW_ALL_NDJSON_ACCEPT,
    });
    if (isNdjsonResponse(response)) {
      const stream = await consumeShowAllStream(response);
      return {
        kind: 'entries',
        entries: toFileEntries(stream.entries),
        truncated: stream.truncated,
      };
    }
    const parsed = await parseServerResponse(response, failedTitle);
    if (!parsed.ok) return { kind: 'http-error', title: parsed.title };
    const success = DocumentListSuccessSchema.safeParse(parsed.body);
    if (!success.success) return { kind: 'http-error', title: mismatchTitle };
    return {
      kind: 'entries',
      entries: toFileEntries(success.data.documents),
      truncated: success.data.truncated === true,
    };
  } catch (cause) {
    return cause instanceof ShowAllStreamError
      ? { kind: 'http-error', title: cause.message }
      : { kind: 'network-error', cause };
  }
}

type Input = {
  model: PierreFileTreeModel;
  documentsRef: MutableRefObject<FileEntry[]>;
  setDocuments: Dispatch<SetStateAction<FileEntry[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setTruncatedShownCount: Dispatch<SetStateAction<number | null>>;
  setUnfilteredRootEntryCount: Dispatch<SetStateAction<number>>;
  recentLocalAddsRef: MutableRefObject<Map<string, number>>;
  lazyLoadedDirTreePathsRef: MutableRefObject<Set<string>>;
  lazyChildFetchControllersRef: MutableRefObject<Map<string, AbortController>>;
  lazyChildFetchGenerationRef: MutableRefObject<number>;
  prevExpandedFolderTreePathsRef: MutableRefObject<ReadonlySet<string>>;
  showOkFoldersRef: MutableRefObject<boolean>;
  treeVisibilityFromRefs: () => {
    showHiddenFiles: boolean;
    showOnlyMarkdownFiles: boolean;
    showOkFolders: boolean;
  };
  collectExpandedFolderTreePaths: () => Set<string>;
  refreshDocsScheduleRef: MutableRefObject<(() => void) | null>;
  failedTitle: string;
  mismatchTitle: string;
  noteConnectivityRecovered: () => void;
  reportServerReachableError: (title: string) => void;
  reportConnectivityFailure: () => void;
};

/** Owns Show All depth-one loading, lazy child traversal, and refresh supersession. */
export function useFileTreeShowAll({
  model,
  documentsRef,
  setDocuments,
  setLoading,
  setError,
  setTruncatedShownCount,
  setUnfilteredRootEntryCount,
  recentLocalAddsRef,
  lazyLoadedDirTreePathsRef,
  lazyChildFetchControllersRef,
  lazyChildFetchGenerationRef,
  prevExpandedFolderTreePathsRef,
  showOkFoldersRef,
  treeVisibilityFromRefs,
  collectExpandedFolderTreePaths,
  refreshDocsScheduleRef,
  failedTitle,
  mismatchTitle,
  noteConnectivityRecovered,
  reportServerReachableError,
  reportConnectivityFailure,
}: Input) {
  const fetchLazyFolderChildren = async (folderTreePath: string) => {
    const generation = lazyChildFetchGenerationRef.current;
    const controller = new AbortController();
    lazyChildFetchControllersRef.current.set(folderTreePath, controller);
    const result = await fetchDepthOne(
      treeDirectoryPathToFolderPath(folderTreePath),
      showOkFoldersRef.current,
      controller.signal,
      failedTitle,
      mismatchTitle,
    );
    if (lazyChildFetchControllersRef.current.get(folderTreePath) === controller) {
      lazyChildFetchControllersRef.current.delete(folderTreePath);
    }
    if (controller.signal.aborted || generation !== lazyChildFetchGenerationRef.current) return;
    if (result.kind === 'network-error') {
      reportConnectivityFailure();
      console.warn('[FileTree] lazy folder children fetch failed:', folderTreePath, result.cause);
      return;
    }
    if (result.kind === 'http-error') {
      console.warn('[FileTree] lazy folder children http error:', folderTreePath, result.title);
      reportServerReachableError(result.title);
      return;
    }
    const children = filterVisibleEntries(result.entries, treeVisibilityFromRefs());
    lazyLoadedDirTreePathsRef.current.add(folderTreePath);
    setDocuments((current) =>
      spliceLazyFolderChildren(current, folderTreePath, children, recentLocalAddsRef.current),
    );
    setError(null);
    noteConnectivityRecovered();
    if (result.truncated) setTruncatedShownCount(result.entries.length);
  };

  const revalidateExpandedLazyDirs = () => {
    for (const folderTreePath of collectExpandedFolderTreePaths()) {
      if (lazyLoadedDirTreePathsRef.current.has(folderTreePath)) continue;
      if (lazyChildFetchControllersRef.current.has(folderTreePath)) continue;
      void fetchLazyFolderChildren(folderTreePath);
    }
  };

  const detectLazyFolderExpansions = () => {
    const expanded = collectExpandedFolderTreePaths();
    const previous = prevExpandedFolderTreePathsRef.current;
    prevExpandedFolderTreePathsRef.current = expanded;
    for (const folderTreePath of expanded) {
      if (previous.has(folderTreePath)) continue;
      if (lazyLoadedDirTreePathsRef.current.has(folderTreePath)) continue;
      if (lazyChildFetchControllersRef.current.has(folderTreePath)) continue;
      const folderPath = treeDirectoryPathToFolderPath(folderTreePath);
      const entry = documentsRef.current.find(
        (candidate): candidate is Extract<FileEntry, { kind: 'folder' }> =>
          isFolderEntry(candidate) && candidate.path === folderPath,
      );
      if (entry?.hasChildren === false) continue;
      void fetchLazyFolderChildren(folderTreePath);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: listener lifetime follows the Pierre model; mutable listing state is intentionally read through refs.
  useEffect(() => model.subscribe(detectLazyFolderExpansions), [model]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one scheduler owns listing cancellation; its dependencies are stable refs and state setters.
  useEffect(() => {
    let active = true;
    let refreshController: AbortController | null = null;
    const refreshDocs = async () => {
      refreshController?.abort();
      const controller = new AbortController();
      refreshController = controller;
      lazyChildFetchGenerationRef.current += 1;
      for (const child of lazyChildFetchControllersRef.current.values()) child.abort();
      lazyChildFetchControllersRef.current.clear();
      lazyLoadedDirTreePathsRef.current.clear();
      try {
        const response = await fetch(showAllDepth1Url('', showOkFoldersRef.current), {
          signal: controller.signal,
          headers: SHOW_ALL_NDJSON_ACCEPT,
        });
        if (isNdjsonResponse(response)) {
          const visibility = treeVisibilityFromRefs();
          let paintedFirstBatch = false;
          const { entries, truncated } = await consumeShowAllStream(response, {
            onBatch: (batch) => {
              if (!active || controller.signal.aborted) return;
              const visible = filterVisibleEntries(toFileEntries(batch), visibility);
              if (visible.length === 0) return;
              setDocuments((current) => mergeRootEntriesAdditive(current, visible));
              if (!paintedFirstBatch) {
                paintedFirstBatch = true;
                setError(null);
                noteConnectivityRecovered();
                setLoading(false);
              }
            },
          });
          if (!active) return;
          const rootEntries = toFileEntries(entries);
          setDocuments((current) =>
            spliceLazyFolderChildren(
              current,
              '',
              filterVisibleEntries(rootEntries, visibility),
              recentLocalAddsRef.current,
            ),
          );
          setError(null);
          noteConnectivityRecovered();
          setTruncatedShownCount(truncated ? entries.length : null);
          setUnfilteredRootEntryCount(rootEntries.length);
          revalidateExpandedLazyDirs();
        } else {
          const parsed = await parseServerResponse(response, failedTitle);
          if (!active) return;
          if (!parsed.ok) {
            reportServerReachableError(parsed.title);
            setTruncatedShownCount(null);
          } else {
            const success = DocumentListSuccessSchema.safeParse(parsed.body);
            if (!success.success) {
              reportServerReachableError(mismatchTitle);
              setTruncatedShownCount(null);
            } else {
              const rootEntries = toFileEntries(success.data.documents);
              setDocuments((current) =>
                spliceLazyFolderChildren(
                  current,
                  '',
                  filterVisibleEntries(rootEntries, treeVisibilityFromRefs()),
                  recentLocalAddsRef.current,
                ),
              );
              setError(null);
              noteConnectivityRecovered();
              setTruncatedShownCount(success.data.truncated === true ? rootEntries.length : null);
              setUnfilteredRootEntryCount(rootEntries.length);
              revalidateExpandedLazyDirs();
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (active) {
          if (error instanceof ShowAllStreamError) reportServerReachableError(error.message);
          else reportConnectivityFailure();
        }
        console.warn('[FileTree] fetch failed:', error);
      }
      if (active) setLoading(false);
    };
    const scheduler = createRefreshScheduler(refreshDocs, () => refreshController?.abort());
    refreshDocsScheduleRef.current = () => scheduler.request();
    scheduler.request();
    const onResume = () => {
      if (document.visibilityState === 'visible') scheduler.request();
    };
    window.addEventListener('focus', onResume);
    window.addEventListener('visibilitychange', onResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) scheduler.request();
    });
    return () => {
      active = false;
      refreshDocsScheduleRef.current = null;
      scheduler.dispose();
      for (const child of lazyChildFetchControllersRef.current.values()) child.abort();
      lazyChildFetchControllersRef.current.clear();
      window.removeEventListener('focus', onResume);
      window.removeEventListener('visibilitychange', onResume);
      unsubscribe();
    };
  }, [failedTitle, mismatchTitle]);
}
