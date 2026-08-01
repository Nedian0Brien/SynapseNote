import { useLingui } from '@lingui/react/macro';
import type { FileTree as PierreFileTreeModel } from '@pierre/trees';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from 'react';
import type { FileEntry } from '@/components/file-tree-utils';
import { useFileTreeShowAll } from './useFileTreeShowAll';

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
  noteConnectivityRecovered: () => void;
  reportServerReachableError: (title: string) => void;
  reportConnectivityFailure: () => void;
  showHiddenFiles: boolean;
  showOnlyMarkdownFiles: boolean;
  showOkFolders: boolean;
  treePathsSignature: string;
  treePathsRef: MutableRefObject<string[]>;
  skipNextResetSignatureRef: MutableRefObject<string | null>;
  expandedPathsForReset: () => string[];
};

/** Owns listing refresh, visibility-triggered reloads, and Pierre path reset scheduling. */
export function useFileTreeRefresh({
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
  noteConnectivityRecovered,
  reportServerReachableError,
  reportConnectivityFailure,
  showHiddenFiles,
  showOnlyMarkdownFiles,
  showOkFolders,
  treePathsSignature,
  treePathsRef,
  skipNextResetSignatureRef,
  expandedPathsForReset,
}: Input) {
  const { t } = useLingui();
  useFileTreeShowAll({
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
    failedTitle: t`Failed to load documents`,
    mismatchTitle: t`Documents response did not match expected shape.`,
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
  });
  const isFirstVisibilityFlipEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: visibility changes trigger scheduling while fetch closures read the latest values through refs.
  useEffect(() => {
    if (isFirstVisibilityFlipEffectRunRef.current) {
      isFirstVisibilityFlipEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [showHiddenFiles, showOnlyMarkdownFiles, showOkFolders]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset paths and expansion policy deliberately read stable refs when this signature changes.
  useEffect(() => {
    if (skipNextResetSignatureRef.current === treePathsSignature) {
      skipNextResetSignatureRef.current = null;
      return;
    }
    model.resetPaths(treePathsRef.current, { initialExpandedPaths: expandedPathsForReset() });
  }, [model, treePathsSignature]);
}
