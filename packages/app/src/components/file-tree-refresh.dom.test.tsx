import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { MouseEventHandler, ReactNode } from 'react';

type DocumentsChangedListener = (channels: string[]) => void;
type TemplatesChangedListener = () => void;

type MenuItemProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  [key: string]: unknown;
};

function PassThrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function MenuItem({ children, disabled, onSelect, variant: _variant, ...props }: MenuItemProps) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} {...props}>
      {children}
    </button>
  );
}

class StubModel {
  private readonly items = new Map<string, { isExpanded: () => boolean }>();

  getFocusedPath() {
    return null;
  }

  getFocusedIndex() {
    return -1;
  }

  getItemHeight() {
    return 24;
  }

  getSelectedPaths() {
    return [];
  }

  getItem(path: string) {
    return this.items.get(path) ?? null;
  }

  resetPaths(paths: string[]) {
    this.items.clear();
    for (const path of paths) {
      this.items.set(path, { isExpanded: () => false });
    }
  }

  subscribe() {
    return () => {};
  }

  onMutation() {
    return () => {};
  }

  isSearchOpen() {
    return false;
  }

  add() {}
  move() {}
  remove() {}
  focus() {}
}

let model = new StubModel();
let documentsChangedListener: DocumentsChangedListener | null = null;
let templatesChangedListener: TemplatesChangedListener | null = null;
let unsubscribeDocumentsChangedMock = mock(() => {});
let unsubscribeTemplatesChangedMock = mock(() => {});
let schedulerRequestMock = mock(() => {});
let schedulerDisposeMock = mock(() => {});
const createRefreshSchedulerMock = mock(() => ({
  request: schedulerRequestMock,
  dispose: schedulerDisposeMock,
}));
const fetchMock = mock(async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === '/api/workspace') {
    return new Response(
      JSON.stringify({
        contentDir: '/tmp/synapsenote',
        pathSeparator: '/',
        symlinkResolved: true,
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }
  throw new Error(`unexpected fetch: ${url}`);
});

mock.module('sonner', () => ({
  toast: {
    success: () => {},
    error: () => {},
  },
}));

mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => ({
    activeDocName: 'notes/source',
    activeTarget: { kind: 'doc', target: 'notes/source', docName: 'notes/source' },
    closeTabs: () => {},
    closeDocument: () => {},
    closeAndClearForRename: async () => {},
    getPoolActiveDocName: () => 'notes/source',
    isNewTabActive: false,
    openTarget: () => {},
    prewarm: () => {},
    remapTabsForRename: () => {},
  }),
  // Nullable variant of the hook above. `mock.module` replaces the WHOLE
  // module, so a consumer in this tree importing it by name gets an
  // unresolvable import and the file dies at load. Same stub: the provider
  // here is a passthrough, so the context reads as present.
  useOptionalDocumentContext: () => ({
    activeDocName: 'notes/source',
    activeTarget: { kind: 'doc', target: 'notes/source', docName: 'notes/source' },
    closeTabs: () => {},
    closeDocument: () => {},
    closeAndClearForRename: async () => {},
    getPoolActiveDocName: () => 'notes/source',
    isNewTabActive: false,
    openTarget: () => {},
    prewarm: () => {},
    remapTabsForRename: () => {},
  }),
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({ addPage: () => {} }),
  // Nullable variant of the hook above — see the DocumentContext note; an
  // omitted re-export fails the whole file at load, not just this query.
  useOptionalPageList: () => ({ addPage: () => {} }),
}));

mock.module('./ui/sidebar', () => ({
  useSidebar: () => ({ notifySidebarFileSelected: () => {} }),
}));

mock.module('@/lib/config-provider', () => ({
  useConfigContext: () => ({
    okignoreBinding: null,
    projectLocalBinding: null,
    merged: null,
  }),
}));

mock.module('@/hooks/use-conflicts', () => ({
  useConflicts: () => ({ conflicts: [], loading: false, error: null }),
}));

mock.module('./handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({ states: {} }),
}));

mock.module('./handoff/useHandoffDispatch', () => ({
  buildFolderHandoffInput: () => null,
  buildHandoffInput: () => null,
  useHandoffDispatch: () => ({ dispatch: async () => ({ ok: true as const }) }),
}));

mock.module('./handoff/OpenInAgentContextSubmenu', () => ({
  OpenInAgentContextSubmenu: () => null,
}));

mock.module('./sidebar-hover-prewarm', () => ({
  cancelHoverPrewarm: () => {},
  scheduleHoverPrewarm: () => {},
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/dialog', () => ({
  Dialog: PassThrough,
}));

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: PassThrough,
  DropdownMenuCheckboxItem: MenuItem,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: MenuItem,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: PassThrough,
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: MenuItem,
  DropdownMenuTrigger: PassThrough,
}));

mock.module('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <span className={className} />,
}));

mock.module('@/components/DeleteConfirmationDialog', () => ({
  DeleteConfirmationDialog: () => null,
}));

mock.module('@/components/TrashFailureModal', () => ({
  TrashFailureModal: () => null,
  coerceTrashFailureReason: (reason: string) => reason,
}));

mock.module('@/components/use-selection-mirror', () => ({
  asDirectoryHandle: () => null,
  useSelectionMirror: () => {},
}));

mock.module('@pierre/trees', () => ({
  FILE_TREE_TAG_NAME: 'ok-file-tree',
  themeToTreeStyles: () => ({}),
}));

mock.module('@pierre/trees/react', () => ({
  useFileTree: () => ({ model }),
  FileTree: ({
    onClickCapture,
    onMouseMove,
    onMouseLeave,
  }: {
    onClickCapture?: MouseEventHandler<HTMLDivElement>;
    onMouseMove?: MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  }) => (
    <div
      data-testid="fake-pierre-tree"
      role="tree"
      onClickCapture={onClickCapture}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    />
  ),
}));

mock.module('@/lib/documents-events', () => ({
  emitDocumentsChanged: () => {},
  emitTemplatesChanged: () => {},
  subscribeToDocumentsChanged: (listener: DocumentsChangedListener) => {
    documentsChangedListener = listener;
    return () => {
      if (documentsChangedListener === listener) {
        documentsChangedListener = null;
      }
      unsubscribeDocumentsChangedMock();
    };
  },
  subscribeToTemplatesChanged: (listener: TemplatesChangedListener) => {
    templatesChangedListener = listener;
    return () => {
      if (templatesChangedListener === listener) {
        templatesChangedListener = null;
      }
      unsubscribeTemplatesChangedMock();
    };
  },
}));

mock.module('@/lib/refresh-scheduler', () => ({
  createRefreshScheduler: createRefreshSchedulerMock,
}));

const { FileTree } = await import('./FileTree');

describe('FileTree document-list refresh scheduling', () => {
  let setIntervalSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    model = new StubModel();
    documentsChangedListener = null;
    templatesChangedListener = null;
    unsubscribeDocumentsChangedMock = mock(() => {});
    unsubscribeTemplatesChangedMock = mock(() => {});
    schedulerRequestMock = mock(() => {});
    schedulerDisposeMock = mock(() => {});
    createRefreshSchedulerMock.mockClear();
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setIntervalSpy = spyOn(globalThis, 'setInterval');
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    setIntervalSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('routes mount, focus, and files-channel refreshes through the bounded scheduler', () => {
    const { unmount } = render(<FileTree />);

    expect(createRefreshSchedulerMock).toHaveBeenCalledTimes(1);
    expect(schedulerRequestMock).toHaveBeenCalledTimes(1);
    expect(documentsChangedListener).not.toBeNull();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));
    expect(schedulerRequestMock).toHaveBeenCalledTimes(2);

    documentsChangedListener?.(['backlinks']);
    expect(schedulerRequestMock).toHaveBeenCalledTimes(2);

    documentsChangedListener?.(['files']);
    expect(schedulerRequestMock).toHaveBeenCalledTimes(3);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    unmount();

    expect(schedulerDisposeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeDocumentsChangedMock).toHaveBeenCalledTimes(1);
    expect(documentsChangedListener).toBeNull();
  });
});
