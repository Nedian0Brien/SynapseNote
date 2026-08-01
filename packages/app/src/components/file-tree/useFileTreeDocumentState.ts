import { useRef, useState } from 'react';
import { fileEntryToTreePath } from '@/components/file-tree-adapter';
import { type FileEntry, isAssetEntry } from '@/components/file-tree-utils';

/** Owns fetched document listing state and the stable refs used by refresh and mutation flows. */
export function useFileTreeDocumentState() {
  const [documents, setDocuments] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncatedShownCount, setTruncatedShownCount] = useState<number | null>(null);
  const [unfilteredRootEntryCount, setUnfilteredRootEntryCount] = useState(0);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const documentsRef = useRef(documents);
  const assetTreePaths = new Set(
    documents.filter(isAssetEntry).map((entry) => fileEntryToTreePath(entry)),
  );
  const assetTreePathsRef = useRef(assetTreePaths);
  const busyPathRef = useRef<string | null>(null);
  const recentLocalAddsRef = useRef<Map<string, number>>(new Map());
  const lazyLoadedDirTreePathsRef = useRef<Set<string>>(new Set());
  const lazyChildFetchControllersRef = useRef<Map<string, AbortController>>(new Map());
  const lazyChildFetchGenerationRef = useRef(0);
  const prevExpandedFolderTreePathsRef = useRef<ReadonlySet<string>>(new Set());
  const showHiddenFilesRef = useRef(false);
  const showOnlyMarkdownFilesRef = useRef(false);
  const showOkFoldersRef = useRef(false);
  const treeVisibilityFromRefs = () => ({
    showHiddenFiles: showHiddenFilesRef.current,
    showOnlyMarkdownFiles: showOnlyMarkdownFilesRef.current,
    showOkFolders: showOkFoldersRef.current,
  });
  const refreshDocsScheduleRef = useRef<(() => void) | null>(null);
  return {
    documents,
    setDocuments,
    loading,
    setLoading,
    error,
    setError,
    truncatedShownCount,
    setTruncatedShownCount,
    unfilteredRootEntryCount,
    setUnfilteredRootEntryCount,
    busyPath,
    setBusyPath,
    documentsRef,
    assetTreePaths,
    assetTreePathsRef,
    busyPathRef,
    recentLocalAddsRef,
    lazyLoadedDirTreePathsRef,
    lazyChildFetchControllersRef,
    lazyChildFetchGenerationRef,
    prevExpandedFolderTreePathsRef,
    showHiddenFilesRef,
    showOnlyMarkdownFilesRef,
    showOkFoldersRef,
    treeVisibilityFromRefs,
    refreshDocsScheduleRef,
  };
}
