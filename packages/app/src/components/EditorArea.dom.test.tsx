import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

type SettingsDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

let settingsRouteOpen = false;
let closeSettingsRouteMock = mock(() => {});
let shellProps: SettingsDialogShellProps[] = [];

mock.module('@/lib/perf', () => ({
  mark: () => {},
  ProfilerBoundary: ({ children }: { children: ReactNode }) => children,
}));

mock.module('@/components/PropertyContext', () => ({
  PropertyProvider: ({ children }: { children: ReactNode }) => children,
  useProperties: () => ({ requestAddProperty: () => {} }),
}));

const FOLDER_DOC_CTX = {
  activeDocName: 'folder/index',
  activeProvider: null,
  activeTarget: { kind: 'folder', target: 'folder', folderPath: 'folder' },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const EMPTY_DOC_CTX = {
  activeDocName: null,
  activeProvider: null,
  activeTarget: null,
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const LARGE_FILE_DOC_CTX = {
  activeDocName: 'big',
  activeProvider: null,
  activeTarget: { kind: 'large-file', docName: 'big', size: 9_999_999, limit: 1_000_000 },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const ASSET_DOC_CTX = {
  activeDocName: null,
  activeProvider: null,
  activeTarget: { kind: 'asset', assetPath: 'images/diagram.png', mediaKind: 'image' },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const PDF_ASSET_DOC_CTX = {
  ...ASSET_DOC_CTX,
  activeTarget: { kind: 'asset', assetPath: 'reading/report.pdf', mediaKind: 'pdf' },
};
// A live-provider folder view: drives the EditorArea `everHadProvider` latch
// true (the effect only needs a non-null provider) through an already-mocked
// branch, so a later provider-null render counts as a mid-session navigation
// rather than a cold start.
const FOLDER_LIVE_CTX = { ...FOLDER_DOC_CTX, activeProvider: {} as never };
// A doc target whose provider has gone transiently null — the close→neighbor
// gap (the neighbor activates async via hashchange) or a switch to a cold tab.
// Reaches the hash-load skeleton branch (not large-file/folder/asset, and
// `!activeProvider || !activeDocName`).
const DOC_COLD_CTX = {
  activeDocName: null,
  activeProvider: null,
  activeTarget: { kind: 'doc', target: 'some-doc', docName: 'some-doc' },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
let docCtx:
  | typeof FOLDER_DOC_CTX
  | typeof FOLDER_LIVE_CTX
  | typeof EMPTY_DOC_CTX
  | typeof LARGE_FILE_DOC_CTX
  | typeof ASSET_DOC_CTX
  | typeof PDF_ASSET_DOC_CTX
  | typeof DOC_COLD_CTX = FOLDER_DOC_CTX;
mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => docCtx,
  useDocumentTransition: () => ({ openDocumentTransition: null }),
  // Nullable variant of the hook above. `mock.module` replaces the WHOLE
  // module, so a consumer in this tree importing it by name gets an
  // unresolvable import and the file dies at load. Same stub: the provider
  // here is a passthrough, so the context reads as present.
  useOptionalDocumentContext: () => docCtx,
}));

mock.module('@/components/EmptyEditorState', () => ({
  // Forward terminalDock so the EditorArea -> EmptyEditorState prop wiring is
  // observable (the empty state collapses to the header-only view whenever a
  // terminal is up, in either dock).
  EmptyEditorState: ({ terminalDock }: { terminalDock?: string | null }) => (
    <div data-testid="empty-editor-state" data-terminal-dock={String(terminalDock)} />
  ),
}));

// Counts TerminalDock mounts so a remount-on-view-switch regression (which
// would dispose xterm + kill the PTY) is observable in tests.
let terminalDockMounts = 0;
mock.module('@/components/EditorSkeleton', () => ({
  EditorSkeleton: () => <div data-testid="editor-skeleton" />,
}));

mock.module('./TerminalDock', () => ({
  TerminalDock: ({ children, visible }: { children: ReactNode; visible?: boolean }) => {
    useEffect(() => {
      terminalDockMounts += 1;
    }, []);
    return (
      <div data-testid="terminal-dock" data-visible={String(visible)}>
        {children}
      </div>
    );
  },
}));

// Spy substrate for the group-level layout assert (assertRightRailLayout).
// `groupLayout` is what the group "currently" holds (the assert derives the
// panel-ID set from it); `groupSetLayoutCalls` records every corrective write.
// A panel getSize of 340px at 25% fixes the px→% basis at 1360px.
// `panelIsCollapsed` drives the drag-to-close pointerup branch (the terminal
// handle hides the column when released with the panel snapped shut).
let groupLayout: Record<string, number> = {};
let groupSetLayoutCalls: Array<Record<string, number>> = [];
let panelIsCollapsed = false;
mock.module('react-resizable-panels', () => ({
  usePanelRef: () => ({
    current: {
      collapse: () => {},
      expand: () => {},
      getSize: () => ({ asPercentage: 25, inPixels: 340 }),
      isCollapsed: () => panelIsCollapsed,
    },
  }),
  useGroupRef: () => ({
    current: {
      getLayout: () => groupLayout,
      setLayout: (layout: Record<string, number>) => {
        groupSetLayoutCalls.push(layout);
      },
    },
  }),
}));

// Every view now renders inside the shared horizontal skeleton (group + left
// panel + optional right panel), so the resizable primitives must resolve in
// the DOM harness. Passthrough mocks render children without the real
// react-resizable-panels engine (which is stubbed).
mock.module('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div data-testid="resizable-group">{children}</div>
  ),
  // Forward `id` so the panel-ID set is observable: the rail's whole promise is
  // that the set does not move when the active tool changes.
  ResizablePanel: ({ children, id }: { children: ReactNode; id?: string }) => (
    <div data-panel-id={id}>{children}</div>
  ),
  // Forward onPointerDown so drag-lifecycle behavior (the terminal handle's
  // drag-to-close pointerup check) is exercisable; drop non-DOM props.
  ResizableHandle: ({ onPointerDown }: { onPointerDown?: (e: unknown) => void }) => (
    <div data-testid="resizable-handle" onPointerDown={onPointerDown} />
  ),
}));

mock.module('@/hooks/use-doc-panel-layout', () => ({
  useDocPanelLayout: () => ({ layout: 'panel', autoCollapse: false }),
}));

mock.module('@/hooks/use-document-stats', () => ({
  useDocumentStats: () => null,
}));

mock.module('@/hooks/use-lifecycle-status', () => ({
  useLifecycleStatus: () => 'ready',
}));

mock.module('@/presence/use-sync-status', () => ({
  useSyncStatus: () => 'synced',
}));

mock.module('@/components/FolderOverview', () => ({
  FolderOverview: ({ folderPath }: { folderPath: string }) => (
    <div data-testid="folder-overview">{folderPath}</div>
  ),
}));

// The "Ask AI" composer now renders in both doc and folder views (it is no
// longer desktop-gated). Stub it here so these layout/skeleton tests don't drag
// in its config / workspace / TipTap dependency tree — the gate is unit-tested
// in bottom-composer-gate.test.ts and the composer itself in
// BottomComposer.dom.test.tsx.
mock.module('./BottomComposer', () => ({
  BottomComposer: ({ docName, folderPath }: { docName?: string | null; folderPath?: string }) => (
    <div data-testid="bottom-composer" data-doc={docName ?? ''} data-folder={folderPath ?? ''} />
  ),
}));

mock.module('@/components/AssetPreview', () => ({
  AssetPreview: ({
    assetPath,
    showViewerHeader,
  }: {
    assetPath: string;
    showViewerHeader?: boolean;
  }) => (
    <div data-testid="asset-preview" data-viewer-header={showViewerHeader ? 'true' : 'false'}>
      {assetPath}
    </div>
  ),
}));

mock.module('@/components/LargeFileEditorState', () => ({
  LargeFileEditorState: ({ docName }: { docName: string }) => (
    <div data-testid="large-file-state">{docName}</div>
  ),
}));

mock.module('@/components/settings/SettingsDialogShell', () => ({
  SettingsDialogShell: (props: SettingsDialogShellProps) => {
    shellProps.push(props);
    return <div data-testid="settings-shell" data-open={String(props.open)} />;
  },
}));

mock.module('@/lib/use-settings-route', () => ({
  useSettingsRoute: () => ({
    open: settingsRouteOpen,
    close: closeSettingsRouteMock,
  }),
}));

const { EditorArea: EditorAreaView } = await import('./EditorArea');
const { RightRailLayout } = await import('./RightRail');

/**
 * EditorArea reads the rail's collapse state and portal targets from
 * `useRightRail()`, so it only renders under the layout that owns them. Every
 * test here drives the pair — which is also what makes the panel-ID set
 * observable, since the rail (not the view) builds the panel group.
 */
function EditorArea(props: Record<string, unknown>) {
  return (
    // The rail is always mounted now, so its tool strip (and the tooltips on
    // it) render in every test — including the ones that used to get a bare
    // tree because no rail existed on the web host. Nested providers are inert,
    // so the handful of tests that wrap explicitly still work.
    <TooltipProvider>
      <RightRailLayout
        activeTab={(props.activeTab as never) ?? 'timeline'}
        onActiveTabChange={(props.onActiveTabChange as never) ?? (() => {})}
        isSourceMode={props.editorMode === 'source'}
        terminalBridge={props.terminalBridge as never}
        terminalVisible={props.terminalVisible as never}
        onTerminalVisibleChange={props.onTerminalVisibleChange as never}
        terminalDock={props.terminalDock as never}
      >
        <EditorAreaView {...(props as never)} />
      </RightRailLayout>
    </TooltipProvider>
  );
}

function renderEditorArea() {
  return render(
    <EditorArea
      editorMode="wysiwyg"
      onModeChange={() => {}}
      activeTab="timeline"
      onActiveTabChange={() => {}}
    />,
  );
}

describe('EditorArea SettingsDialogPortal runtime wiring', () => {
  beforeEach(() => {
    cleanup();
    docCtx = FOLDER_DOC_CTX;
    settingsRouteOpen = false;
    closeSettingsRouteMock = mock(() => {});
    shellProps = [];
  });

  test('mounts the Settings shell while closed and delegates close to useSettingsRoute', () => {
    renderEditorArea();

    expect(screen.getByTestId('folder-overview').textContent).toBe('folder');
    expect(screen.getByTestId('settings-shell').getAttribute('data-open')).toBe('false');
    expect(shellProps.at(-1)?.open).toBe(false);

    act(() => {
      shellProps.at(-1)?.onOpenChange(true);
    });
    expect(closeSettingsRouteMock).not.toHaveBeenCalled();

    act(() => {
      shellProps.at(-1)?.onOpenChange(false);
    });
    expect(closeSettingsRouteMock).toHaveBeenCalledTimes(1);
  });
});

describe('EditorArea empty-state terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = EMPTY_DOC_CTX;
  });

  // Regression: an empty-state launch (e.g. the create composer's "Create with
  // Claude CLI") needs the docked terminal mounted on the empty state too — it
  // used to render only in the open-doc branch, so the launch silently no-opped.
  test('hosts the docked terminal on the empty state when a terminal bridge is present', () => {
    render(
      <TooltipProvider>
        <EditorArea
          editorMode="wysiwyg"
          onModeChange={() => {}}
          activeTab="timeline"
          onActiveTabChange={() => {}}
          terminalBridge={{} as never}
          terminalVisible
          onTerminalVisibleChange={() => {}}
          terminalDock="bottom"
        />
      </TooltipProvider>,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    const emptyState = dock.querySelector('[data-testid="empty-editor-state"]');
    expect(emptyState).not.toBeNull();
    // EditorArea forwards the dock position so the empty state collapses to the
    // header-only view (composer bubble dropped) while the terminal is up.
    expect(emptyState?.getAttribute('data-terminal-dock')).toBe('bottom');
  });

  test('collapses the empty state to the header-only view when the terminal is right-docked', () => {
    render(
      <TooltipProvider>
        <EditorArea
          editorMode="wysiwyg"
          onModeChange={() => {}}
          activeTab="timeline"
          onActiveTabChange={() => {}}
          terminalBridge={{} as never}
          terminalVisible
          onTerminalVisibleChange={() => {}}
          // Right is the default dock. Either dock position collapses the empty
          // state — the open terminal is its own AI entry point, so the composer
          // bubble must not compete with it.
          terminalDock="right"
        />
      </TooltipProvider>,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    const emptyState = dock.querySelector('[data-testid="empty-editor-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.getAttribute('data-terminal-dock')).toBe('right');
  });

  test('renders the empty state with no terminal dock on the web host (no bridge)', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
      />,
    );

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    // Pins the `terminalVisible ? position : null` forwarding: without an open
    // terminal the empty state must receive null, or it would collapse to
    // header-only on every new tab.
    expect(screen.getByTestId('empty-editor-state').getAttribute('data-terminal-dock')).toBe(
      'null',
    );
  });
});

describe('EditorArea right rail is one stable panel across tool changes', () => {
  // react-resizable-panels caches layouts per panel-ID set and restores the
  // cached layout whenever the set changes. That is why showing/hiding the
  // right-docked terminal used to resurrect a doc panel the user had closed —
  // chat and the document tools were two panels (`terminal-column` and
  // `doc-panel`) swapping places, so every toggle moved the set and needed a
  // corrective full-layout write to undo the library's restore.
  //
  // The rail is now one panel whose CONTENT changes. These pin that: the
  // panel-ID set is invariant across tool changes and across content-surface
  // changes, so there is no stale layout to correct and no correction fires.
  const setViewportWidth = (px: number) => {
    Object.defineProperty(window, 'innerWidth', {
      value: px,
      configurable: true,
      writable: true,
    });
  };

  const baseProps = {
    editorMode: 'wysiwyg',
    onModeChange: () => {},
    activeTab: 'timeline',
    onActiveTabChange: () => {},
    terminalBridge: {} as never,
    terminalDock: 'right',
    onTerminalVisibleChange: () => {},
  } as const;

  beforeEach(() => {
    cleanup();
    docCtx = EMPTY_DOC_CTX;
    groupLayout = {};
    groupSetLayoutCalls = [];
    panelIsCollapsed = false;
  });

  const railIds = () =>
    Array.from(document.querySelectorAll('[data-panel-id]')).map((el) =>
      el.getAttribute('data-panel-id'),
    );

  test('showing and hiding chat leaves the panel-ID set untouched', async () => {
    setViewportWidth(1400);
    const view = render(<EditorArea {...baseProps} terminalVisible />);
    expect(railIds()).toEqual(['right-rail']);
    expect(groupSetLayoutCalls).toHaveLength(0);

    // The layout the library would restore if the set moved. It must never be
    // consulted: hiding chat swaps the rail's CONTENT, not the panel.
    groupLayout = { 'editor-main': 70, 'right-rail': 30 };
    view.rerender(<EditorArea {...baseProps} terminalVisible={false} />);
    // Flush the microtask the presence-change assert would have deferred.
    await act(async () => {});

    expect(railIds()).toEqual(['right-rail']);
    // No panel-set change means no stale restore, so no correction is written.
    expect(groupSetLayoutCalls).toHaveLength(0);
  });

  test('the rail keeps its id while the content surface changes underneath it', async () => {
    setViewportWidth(1400);
    docCtx = FOLDER_LIVE_CTX;
    const view = render(<EditorArea {...baseProps} terminalVisible />);
    // The toolbox is available over the folder view too — it used to be built
    // per view kind, and the folder branch built none unless an agent was
    // scoped (and then a bespoke, uncollapsible `agent-panel`).
    expect(railIds()).toEqual(['right-rail']);

    docCtx = DOC_COLD_CTX;
    view.rerender(<EditorArea {...baseProps} terminalVisible />);
    await act(async () => {});
    // Mid-session cold navigation used to need a ref-free `doc-panel`
    // placeholder here purely to hold the panel count steady.
    expect(railIds()).toEqual(['right-rail']);
    expect(groupSetLayoutCalls).toHaveLength(0);
  });

  test('releasing a rail drag with the panel snapped shut stands the chat session down', async () => {
    // Drag-to-close: the pointerup handler checks the rail's isCollapsed() and
    // turns a snapped-shut rail into a real hide of the live chat session.
    setViewportWidth(1400);
    const visibleChanges: boolean[] = [];
    render(
      <EditorArea
        {...baseProps}
        terminalVisible
        onTerminalVisibleChange={(visible: boolean) => {
          visibleChanges.push(visible);
        }}
      />,
    );
    // One rail means one handle, whatever the content surface is.
    const handle = screen.getByTestId('resizable-handle');
    act(() => {
      fireEvent.pointerDown(handle);
    });
    panelIsCollapsed = true;
    act(() => {
      fireEvent.pointerUp(window);
    });
    expect(visibleChanges.at(-1)).toBe(false);
  });

  test('releasing a rail drag with the panel still open does NOT hide the terminal', async () => {
    setViewportWidth(1400);
    const visibleChanges: boolean[] = [];
    render(
      <EditorArea
        {...baseProps}
        terminalVisible
        onTerminalVisibleChange={(visible: boolean) => {
          visibleChanges.push(visible);
        }}
      />,
    );
    const handle = screen.getByTestId('resizable-handle');
    act(() => {
      fireEvent.pointerDown(handle);
    });
    act(() => {
      fireEvent.pointerUp(window);
    });
    expect(visibleChanges).toHaveLength(0);
  });
});

describe('EditorArea folder-view terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = FOLDER_DOC_CTX;
  });

  // Regression: the docked terminal must be mountable while a folder is the
  // active view too. The folder branch used to return <FolderOverview> bare, so
  // an "Open in terminal" launch (or ⌘J) set terminalVisible but had no dock to
  // open — the terminal never appeared.
  test('hosts the docked terminal in folder view when a terminal bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    // The folder overview is wrapped by the dock so the terminal can open
    // beneath it.
    expect(dock.querySelector('[data-testid="folder-overview"]')).not.toBeNull();
  });

  test('renders the folder view with no terminal dock on the web host (no bridge)', () => {
    renderEditorArea();

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('folder-overview').textContent).toBe('folder');
  });
});

// The single hoisted dock (left column of the shared skeleton) must host every
// view. The asset and large-file views had no terminal coverage; these pin that
// the dock wraps each one, so a future regression that drops a view out of the
// skeleton (e.g. a bare early-return during a merge) turns the suite red.
describe('EditorArea large-file-view terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = LARGE_FILE_DOC_CTX;
  });

  test('hosts the docked terminal in the large-file view when a bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    expect(dock.querySelector('[data-testid="large-file-state"]')).not.toBeNull();
  });

  test('renders the large-file view with no terminal dock on the web host (no bridge)', () => {
    renderEditorArea();

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('large-file-state')).toBeTruthy();
  });
});

describe('EditorArea asset-view terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = ASSET_DOC_CTX;
  });

  test('hosts the docked terminal in the asset view when a bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        // Revealing a right-docked terminal selects the Chat tool — EditorPane
        // does this on every path that opens it. The chat host is rendered by
        // the selected tool's slot, so the pair has to be stated together. It
        // used to be implicit: an asset view had no document, so every other
        // tool was filtered out of the rail and Chat won by default.
        activeTab="chat"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    expect(dock.querySelector('[data-testid="asset-preview"]')).not.toBeNull();
    expect(screen.getByTestId('right-chat-host')).toBeTruthy();
  });

  test('renders the asset view with no terminal dock on the web host (no bridge)', () => {
    renderEditorArea();

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('asset-preview')).toBeTruthy();
  });

  test('renders the five PDF rail tabs and opens Chat from its first tab', () => {
    docCtx = PDF_ASSET_DOC_CTX;
    const requestedTabs: string[] = [];
    render(
      <TooltipProvider>
        <EditorArea
          editorMode="wysiwyg"
          onModeChange={() => {}}
          activeTab="pages"
          onActiveTabChange={(tab) => requestedTabs.push(tab)}
          terminalBridge={{} as never}
          terminalVisible={false}
          onTerminalVisibleChange={() => {}}
        />
      </TooltipProvider>,
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Chat',
      'Pages',
      'Annotations',
      'Outline',
      'Links',
    ]);
    expect(screen.getByTestId('pdf-panel-host')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(requestedTabs).toEqual(['chat']);
  });

  test('marks the PDF viewer as the route-level one so it renders its identity row', () => {
    // The rail's collapse control now lives in the editor header beside the
    // file-sidebar trigger, so the viewer takes a plain flag instead of an
    // open-state + toggle pair. Standing the chat session down on close is
    // covered by the rail's own drag-to-close test above.
    docCtx = PDF_ASSET_DOC_CTX;
    render(
      <TooltipProvider>
        <EditorArea
          editorMode="wysiwyg"
          onModeChange={() => {}}
          activeTab="chat"
          onActiveTabChange={() => {}}
          terminalBridge={{} as never}
          terminalVisible
          onTerminalVisibleChange={() => {}}
        />
      </TooltipProvider>,
    );

    expect(screen.getByTestId('asset-preview').getAttribute('data-viewer-header')).toBe('true');
    expect(screen.getByTestId('right-chat-host')).toBeTruthy();
  });
});

// The dock is hoisted to one stable position in the EditorArea wrapper, so it
// must NOT remount as the active view kind changes underneath it. A remount
// would dispose xterm and kill the running PTY — the session reset users hit
// when switching/closing tabs.
describe('EditorArea terminal persists across view-kind switches', () => {
  beforeEach(() => {
    cleanup();
    terminalDockMounts = 0;
    docCtx = FOLDER_DOC_CTX;
  });

  test('keeps a single TerminalDock instance mounted while the active view kind changes', () => {
    const props = {
      editorMode: 'wysiwyg' as const,
      onModeChange: () => {},
      activeTab: 'timeline' as const,
      onActiveTabChange: () => {},
      terminalBridge: {} as never,
      terminalVisible: true,
      onTerminalVisibleChange: () => {},
    };
    const { rerender } = render(<EditorArea {...props} />);
    const mountsAfterInitial = terminalDockMounts;
    expect(mountsAfterInitial).toBeGreaterThan(0);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="folder-overview"]'),
    ).not.toBeNull();

    // folder -> asset -> large-file: the view inside the dock changes, but the
    // dock stays at the same wrapper position, so it must not remount.
    docCtx = ASSET_DOC_CTX;
    rerender(<EditorArea {...props} />);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="asset-preview"]'),
    ).not.toBeNull();

    docCtx = LARGE_FILE_DOC_CTX;
    rerender(<EditorArea {...props} />);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="large-file-state"]'),
    ).not.toBeNull();

    // No additional mounts across the two view-kind switches.
    expect(terminalDockMounts).toBe(mountsAfterInitial);
  });
});

// Locks the COLD-START path: on first load (no provider has ever been active),
// a hash-driven doc load renders the skeleton as a standalone early-return with
// no terminal dock around it — nothing spawns a PTY that the landing document
// would inherit. (The e2e qa-sidebar also covers this; this is the fast guard.)
// The MID-SESSION counterpart — where the dock must persist — is the next
// describe block.
describe('EditorArea hash-load skeleton renders bare on cold start', () => {
  beforeEach(() => {
    cleanup();
    // A doc target whose provider has not loaded — the actual hash-load scenario
    // (not the empty state). `everHadProvider` stays false on this single render
    // (DOC_COLD_CTX has a null provider), so the branch still takes the
    // cold-start bare early-return.
    docCtx = DOC_COLD_CTX;
  });
  afterEach(() => {
    window.location.hash = '';
  });

  test('renders the load skeleton directly, not inside the terminal dock or panel group', () => {
    // A hash naming a doc + a not-yet-ready provider, with no provider ever
    // active, is the cold-start load path.
    window.location.hash = '#/some-doc';
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    expect(screen.getByTestId('editor-skeleton')).toBeTruthy();
    // Early return: no terminal dock around it, so nothing spawns a PTY the
    // landing document would immediately have to inherit. The panel group is no
    // longer part of this claim — the rail owns it one level up and is a sibling
    // of the whole content column, so it is present on every render.
    expect(screen.queryByTestId('terminal-dock')).toBeNull();
  });
});

// The mid-session counterpart to the cold-start guard. Once a provider has
// been active, a transient provider-null render (closing a tab, or switching to
// a not-yet-ready doc) must keep the persistent left column — and the docked
// TerminalDock + its live PTY — mounted, instead of early-returning a bare
// skeleton that unmounts the dock and resets the terminal. The skeleton renders
// INSIDE the dock; the dock does not remount.
describe('EditorArea terminal persists across a mid-session cold navigation', () => {
  beforeEach(() => {
    cleanup();
    terminalDockMounts = 0;
    window.location.hash = '';
    docCtx = FOLDER_LIVE_CTX;
  });
  afterEach(() => {
    window.location.hash = '';
  });

  test('keeps the dock mounted when a tab close/switch transiently nulls the provider', () => {
    const props = {
      editorMode: 'wysiwyg' as const,
      onModeChange: () => {},
      activeTab: 'timeline' as const,
      onActiveTabChange: () => {},
      terminalBridge: {} as never,
      terminalVisible: true,
      onTerminalVisibleChange: () => {},
    };
    // First render with a live provider latches `everHadProvider` true (its
    // effect flushes inside RTL's act wrapper).
    const { rerender } = render(<EditorArea {...props} />);
    const mountsAfterInitial = terminalDockMounts;
    expect(mountsAfterInitial).toBeGreaterThan(0);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="folder-overview"]'),
    ).not.toBeNull();

    // Now the provider goes null while the hash already names the next doc — the
    // close→neighbor gap. The bare-early-return regression would drop the dock
    // here (terminal-dock absent). The fix routes the skeleton through the dock.
    act(() => {
      docCtx = DOC_COLD_CTX;
      window.location.hash = '#/some-doc';
    });
    rerender(<EditorArea {...props} />);

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.querySelector('[data-testid="editor-skeleton"]')).not.toBeNull();
    // No remount across the cold navigation — the PTY survives.
    expect(terminalDockMounts).toBe(mountsAfterInitial);
    // The shared group is present throughout — the rail owns it, above the
    // view branches, so a mid-session provider gap can't change the panel set.
    expect(screen.getByTestId('resizable-group')).toBeTruthy();
  });

  test('web host keeps the bare early-return on mid-session cold nav (no dock to preserve)', () => {
    // No terminalBridge → the mid-session route-through gate
    // (`terminalBridge != null && everHadProvider`) is false regardless of
    // `everHadProvider`, so the skeleton stays a bare early-return with no dock
    // around it. Pins that the desktop-only fix does not change web-host
    // behavior.
    const webProps = {
      editorMode: 'wysiwyg' as const,
      onModeChange: () => {},
      activeTab: 'timeline' as const,
      onActiveTabChange: () => {},
      // terminalBridge intentionally omitted (web host has no shell).
    };
    // FOLDER_LIVE_CTX (from beforeEach) has a live provider → `everHadProvider`
    // latches true after the first render.
    const { rerender } = render(<EditorArea {...webProps} />);
    act(() => {
      docCtx = DOC_COLD_CTX;
      window.location.hash = '#/some-doc';
    });
    rerender(<EditorArea {...webProps} />);

    expect(screen.getByTestId('editor-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('terminal-dock')).toBeNull();
  });
});
