import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import type { FileEntry } from '@/components/file-tree-utils';
import { useFileTreeShowAll } from './useFileTreeShowAll';

const setDocuments = mock(() => {});
const setLoading = mock(() => {});
const setError = mock(() => {});
const setTruncatedShownCount = mock(() => {});
const setUnfilteredRootEntryCount = mock(() => {});

function ShowAllHarness() {
  const documentsRef = useRef<FileEntry[]>([]);
  const recentLocalAddsRef = useRef(new Map<string, number>());
  const loadedRef = useRef(new Set<string>());
  const childControllersRef = useRef(new Map<string, AbortController>());
  const generationRef = useRef(0);
  const previousExpandedRef = useRef<ReadonlySet<string>>(new Set());
  const showOkRef = useRef(false);
  const refreshRef = useRef<(() => void) | null>(null);
  const model = useRef({ subscribe: mock(() => () => {}), getItem: mock(() => null) }).current;

  useFileTreeShowAll({
    model: model as never,
    documentsRef,
    setDocuments: setDocuments as never,
    setLoading: setLoading as never,
    setError: setError as never,
    setTruncatedShownCount: setTruncatedShownCount as never,
    setUnfilteredRootEntryCount: setUnfilteredRootEntryCount as never,
    recentLocalAddsRef,
    lazyLoadedDirTreePathsRef: loadedRef,
    lazyChildFetchControllersRef: childControllersRef,
    lazyChildFetchGenerationRef: generationRef,
    prevExpandedFolderTreePathsRef: previousExpandedRef,
    showOkFoldersRef: showOkRef,
    treeVisibilityFromRefs: () => ({
      showHiddenFiles: false,
      showOnlyMarkdownFiles: false,
      showOkFolders: false,
    }),
    collectExpandedFolderTreePaths: () => new Set(),
    refreshDocsScheduleRef: refreshRef,
    failedTitle: 'Failed to load documents',
    mismatchTitle: 'Documents response did not match expected shape.',
    noteConnectivityRecovered: () => {},
    reportServerReachableError: () => {},
    reportConnectivityFailure: () => {},
  });
  return null;
}

describe('useFileTreeShowAll', () => {
  afterEach(() => {
    cleanup();
    setDocuments.mockClear();
    setLoading.mockClear();
    setError.mockClear();
    setTruncatedShownCount.mockClear();
    setUnfilteredRootEntryCount.mockClear();
  });

  test('starts the sidebar with one depth-one root listing', async () => {
    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify({ documents: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ShowAllHarness />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/documents?showAll=true&dir=&depth=1');
    expect(setTruncatedShownCount).toHaveBeenCalledWith(null);
    expect(setUnfilteredRootEntryCount).toHaveBeenCalledWith(0);
  });
});
