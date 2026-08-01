import type { FileTreeDropResult, FileTreeRenameEvent } from '@pierre/trees';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import type { PageMeta } from '@/components/PageListContext';
import type { TrashFailedTarget } from '@/components/TrashFailureModal';
import type { PageHeaderRenameResult } from '@/lib/page-header-rename-events';

export type FileTreeDeleteRequest = { targets: FileTreeTarget[] };

export type TrashFailureRequest = {
  failed: TrashFailedTarget[];
  originalTargets: FileTreeTarget[];
};

type ModelCallbacks = {
  uploadExternalFiles: (files: readonly File[], parentDir: string, busyPath: string) => void;
  handleRenameError: (message: string) => void;
  handleRename: (event: FileTreeRenameEvent) => Promise<PageHeaderRenameResult>;
  handleDropComplete: (event: FileTreeDropResult) => void;
};

type Input = {
  pageMeta: ReadonlyMap<string, PageMeta>;
  activeDocName: string | null;
  activeTarget: ResolvedNavigationTarget | null;
};

/** Owns ephemeral selection, drag, dialog, and model-callback state for one mounted tree. */
export function useFileTreeInteractionState({ pageMeta, activeDocName, activeTarget }: Input) {
  const [deleteRequest, setDeleteRequest] = useState<FileTreeDeleteRequest | null>(null);
  const [trashFailure, setTrashFailure] = useState<TrashFailureRequest | null>(null);
  const [creationDirCleared, setCreationDirCleared] = useState(false);
  const creationDirClearedRef = useRef(creationDirCleared);
  const [userCollapsedActiveAncestorPaths, setUserCollapsedActiveAncestorPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const userCollapsedActiveAncestorPathsRef = useRef<ReadonlySet<string>>(new Set());
  const handleListenersRef = useRef<Set<() => void>>(new Set());
  const pageMetaRef = useRef(pageMeta);
  const pendingExactFileSelectionRef = useRef<string | null>(null);
  const activeDocNameRef = useRef(activeDocName);
  const hoveredPrewarmDocRef = useRef<string | null>(null);
  const suppressSelectionRef = useRef(false);
  const sidebarDragInProgressRef = useRef(false);
  const sidebarDragClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const externalFileDropTargetRef = useRef<{ row: HTMLElement | null; root: HTMLElement | null }>({
    row: null,
    root: null,
  });
  const uploadExternalFilesRef = useRef<
    (files: readonly File[], parentDir: string, busyPath: string) => void
  >(() => {});
  const copiedKeyboardTargetRef = useRef<FileTreeTarget | null>(null);
  const fileTreeHostRef = useRef<HTMLDivElement | null>(null);
  const handleSelectionChangeRef = useRef<(selectedPaths: readonly string[]) => void>(() => {});
  const handleRenameRef = useRef<(event: FileTreeRenameEvent) => Promise<PageHeaderRenameResult>>(
    async () => ({ ok: false, message: 'Rename is unavailable' }),
  );
  const handleRenameErrorRef = useRef<(message: string) => void>((message) => toast.error(message));
  const handleDropCompleteRef = useRef<(event: FileTreeDropResult) => void>(() => {});
  const activeTargetRef = useRef(activeTarget);
  const [emptyExternalFileDropActive, setEmptyExternalFileDropActive] = useState(false);
  useEffect(() => {
    creationDirClearedRef.current = creationDirCleared;
    for (const listener of handleListenersRef.current) listener();
  }, [creationDirCleared]);
  useLayoutEffect(() => {
    pageMetaRef.current = pageMeta;
    activeDocNameRef.current = activeDocName;
    activeTargetRef.current = activeTarget;
    userCollapsedActiveAncestorPathsRef.current = userCollapsedActiveAncestorPaths;
  }, [activeDocName, activeTarget, pageMeta, userCollapsedActiveAncestorPaths]);
  const syncModelCallbacks = ({
    uploadExternalFiles,
    handleRenameError,
    handleRename,
    handleDropComplete,
  }: ModelCallbacks) => {
    uploadExternalFilesRef.current = uploadExternalFiles;
    handleRenameErrorRef.current = handleRenameError;
    handleRenameRef.current = handleRename;
    handleDropCompleteRef.current = handleDropComplete;
  };
  return {
    deleteRequest,
    setDeleteRequest,
    trashFailure,
    setTrashFailure,
    creationDirCleared,
    setCreationDirCleared,
    creationDirClearedRef,
    userCollapsedActiveAncestorPaths,
    setUserCollapsedActiveAncestorPaths,
    userCollapsedActiveAncestorPathsRef,
    handleListenersRef,
    pageMetaRef,
    pendingExactFileSelectionRef,
    activeDocNameRef,
    hoveredPrewarmDocRef,
    suppressSelectionRef,
    sidebarDragInProgressRef,
    sidebarDragClearTimerRef,
    externalFileDropTargetRef,
    uploadExternalFilesRef,
    copiedKeyboardTargetRef,
    fileTreeHostRef,
    handleSelectionChangeRef,
    handleRenameRef,
    handleRenameErrorRef,
    handleDropCompleteRef,
    activeTargetRef,
    syncModelCallbacks,
    emptyExternalFileDropActive,
    setEmptyExternalFileDropActive,
  };
}
