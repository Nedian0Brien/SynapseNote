import {
  mediaKindForSidebarAssetExtension,
  SHOW_INSTALL_SKILL,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseContextInspectionScope } from '@nedian0brien/synapsenote-server';
import { lazy, type ReactNode, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ConnectingBanner } from '@/components/ConnectingBanner';
import { CreateProjectMenuTrigger } from '@/components/CreateProjectMenuTrigger';
import type { ChatContextChip } from '@/components/chat/cli-chat-types';
import { DailyNoteHandler } from '@/components/DailyNoteHandler';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import { EditorPane } from '@/components/EditorPane';
import { FileSidebar } from '@/components/FileSidebar';
import {
  type TerminalLaunchContextValue,
  TerminalLaunchProvider,
} from '@/components/handoff/TerminalLaunchContext';
import { requestTerminalLaunch } from '@/components/handoff/terminal-launch-events';
import {
  composeTerminalLaunchPrompt,
  type HandoffDispatchInput,
} from '@/components/handoff/useHandoffDispatch';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { McpConsentDialog } from '@/components/McpConsentDialog';
import {
  downgradeFolderIndexForHashNav,
  type ResolvedNavigationTarget,
  resolveNavigationTarget,
  withLargeFileOpenGuard,
} from '@/components/navigation-targets';
import { PageListProvider, usePageList } from '@/components/PageListContext';
import { ReportBugMenuTrigger } from '@/components/ReportBugMenuTrigger';
import { SystemDocSubscriber } from '@/components/SystemDocSubscriber';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  DocumentProvider,
  useDocumentContext,
  useDocumentTransition,
} from '@/editor/DocumentContext';
import { parseEditorTabId } from '@/editor/editor-tabs';
import { useInstalledClis } from '@/hooks/use-installed-clis';
import { useReconcileSkillTabs } from '@/hooks/use-reconcile-skill-tabs';
import { ConfigProvider } from '@/lib/config-provider';
import { emitCreateTopLevelFile } from '@/lib/create-file-events';
import { DATABASE_SLASH_COMMAND_EVENT, type DatabaseSlashCommand } from '@/lib/database-events';
import {
  DATABASE_CREATION_HASH,
  DATABASE_NAVIGATION_CHANGE_EVENT,
  databasePageTargetFromHash,
  isDatabaseCreationHash,
  isDatabasePageHash,
  navigateToDatabaseHash,
  replaceDatabaseHash,
} from '@/lib/database-navigation';
import { DatabaseOverlayProvider } from '@/lib/database-overlay-store';
import {
  assetPathFromHash,
  CHAT_HASH,
  docNameFromHash,
  GRAPH_HASH,
  isChatHash,
  isContentRootHash,
  isGraphHash,
  ROUTE_NAVIGATION_CHANGE_EVENT,
  skillFileFromHash,
} from '@/lib/doc-hash';
import { isNewItemShortcut } from '@/lib/keyboard-shortcuts';
import { mark, ProfilerBoundary } from '@/lib/perf';
import { SingleFileModeProvider, useSingleFileMode } from '@/lib/single-file-mode';
import { useGraphShortcut } from '@/lib/use-graph-route';
import { useServerKeepalive } from '@/lib/use-server-keepalive';
import { isSettingsShortcut, SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';

// Cold-path receive surface: only mounts when main routes a
// 'project-branch-switch' payload. Lazy so its branch-info / checkout / variant
// code (and the target-status client it pulls in) splits out of the main bundle.
const ShareBranchSwitchDialog = lazy(() =>
  import('@/components/ShareBranchSwitchDialog').then((m) => ({
    default: m.ShareBranchSwitchDialog,
  })),
);

// Cold-path receive surface: the honest verdict modal for a share deep link
// whose target is absent on the receiver's branch. Self-gates on
// `missDialogStore`; lazy so its verdict-fetch code splits out of the main
// bundle until a miss actually occurs.
const ShareReceiveMissDialog = lazy(() =>
  import('@/components/ShareReceiveMissDialog').then((m) => ({
    default: m.ShareReceiveMissDialog,
  })),
);

const LazyDatabaseContextInspectorDialog = lazy(() =>
  import('@/components/DatabaseContextInspectorDialog').then((module) => ({
    default: module.DatabaseContextInspectorDialog,
  })),
);
const LazyDatabaseAgentRunsDialog = lazy(() =>
  import('@/components/DatabaseAgentRunsDialog').then((module) => ({
    default: module.DatabaseAgentRunsDialog,
  })),
);
const LazyDatabaseTableDialog = lazy(() =>
  import('@/components/DatabaseTableDialog').then((module) => ({
    default: module.DatabaseTableDialog,
  })),
);
const LazyDatabaseWorkspacePage = lazy(() =>
  import('@/components/DatabaseTableDialog').then((module) => ({
    default: module.DatabaseWorkspacePage,
  })),
);
const LazyDatabaseDiagnosticsDialog = lazy(() =>
  import('@/components/DatabaseDiagnosticsDialog').then((module) => ({
    default: module.DatabaseDiagnosticsDialog,
  })),
);

/**
 * Hashes that open overlay dialogs (Settings, Install Claude Desktop)
 * rather than navigate to a document. NavigationHandler treats these as
 * no-ops so the dialog can mount over the existing editor without
 * `clearTarget()` blowing away the underlying document — the dialog
 * portals atop whatever's already there. Hoisted here (above
 * NavigationHandler) so the predicate can reference both constants;
 * `INSTALL_DIALOG_HASH`'s definition stays where it's used by the
 * trigger component to keep that locality.
 */
const INSTALL_DIALOG_HASH = '#install-claude-desktop';
const DATABASE_CREATION_HISTORY_KEY = '__synapsenote_database_creation__';
const MARKDOWN_EXTENSION_QUALIFIED_DOC_PATTERN = /\.(md|mdx)$/i;
function isAuxiliaryDialogHash(hash: string): boolean {
  return (
    hash === SETTINGS_OPEN_HASH ||
    hash === INSTALL_DIALOG_HASH ||
    isDatabasePageHash(hash) ||
    isDatabaseCreationHash(hash)
  );
}

/**
 * Database workspaces are route-level content, not a command-palette modal.
 * The hash keeps reload/back-forward behavior deterministic. Canonical targets
 * render in the main `SidebarInset`; the regular editor is returned only when
 * there is no database page target.
 */
function DatabasePageRoute({
  children,
  onOpenAgentRuns,
}: {
  children: ReactNode;
  onOpenAgentRuns?: () => void;
}) {
  const [target, setTarget] = useState(() => databasePageTargetFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setTarget(databasePageTargetFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(ROUTE_NAVIGATION_CHANGE_EVENT, onHashChange);
    window.addEventListener(DATABASE_NAVIGATION_CHANGE_EVENT, onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(ROUTE_NAVIGATION_CHANGE_EVENT, onHashChange);
      window.removeEventListener(DATABASE_NAVIGATION_CHANGE_EVENT, onHashChange);
    };
  }, []);

  if (!target) return children;
  return (
    <LazyDatabaseWorkspacePage
      open
      initialTarget={target}
      onOpenAgentRuns={onOpenAgentRuns}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && databasePageTargetFromHash(window.location.hash)) {
          navigateToDatabaseHash('');
        }
      }}
    />
  );
}

function exactOpenMarkdownTabTarget(
  docName: string,
  openTabs: ReadonlyArray<string>,
): ResolvedNavigationTarget | null {
  if (!MARKDOWN_EXTENSION_QUALIFIED_DOC_PATTERN.test(docName)) return null;
  for (const tabId of openTabs) {
    const tab = parseEditorTabId(tabId);
    if (tab.kind === 'doc' && tab.docName === docName) {
      return { kind: 'doc', target: docName, docName };
    }
  }
  return null;
}

function knownTargetsSignature(
  pages: ReadonlySet<string>,
  folderPaths: ReadonlySet<string>,
  assetPaths: ReadonlySet<string>,
  filePaths: ReadonlySet<string>,
): string {
  return [pages, folderPaths, assetPaths, filePaths]
    .map((values) => [...values].sort().join('\u0000'))
    .join('\u0001');
}

/** Hash is the source of truth for navigation; all navigation sets the hash;
 *  this handler is the single place that resolves the active navigation target
 *  and calls openTargetTransition(). The transition wrapper keeps the
 *  already-revealed doc visible while the next entry suspends on syncPromise
 *  (fast/warm path); on cold paths `openTargetTransition` drops the transition
 *  and lets `<Suspense fallback={<EditorSkeleton />}>` paint immediately.
 *  Agent-driven nav via SystemDocSubscriber flows through
 *  `window.location.hash`, so it inherits the same UX without a separate code
 *  path. Target resolution (asset / doc / folder-index / folder / missing)
 *  lives here plus resolveNavigationTarget. */
function NavigationHandler() {
  const { clearTarget, openTabs, syncOpenTabsWithKnownTargets, tabSessionLoaded } =
    useDocumentContext();
  const { openTargetTransition } = useDocumentTransition();
  // ⌘G sets the graph hash; the hash handler below is what resolves it. Bound
  // here because this component is already the single mount point for
  // hash-is-the-route navigation.
  useGraphShortcut();
  // Reconcile open skill tabs against the live skills list: an agent/MCP/server-
  // side scope move only broadcasts `files` (never retargets the client tab),
  // leaving an open skill tab pointing at a doc that no longer exists.
  useReconcileSkillTabs();
  const {
    assetPaths,
    filePaths,
    folderPaths,
    loading,
    pageMeta,
    pages,
    pagesBySlug,
    pagesByBasename,
  } = usePageList();
  const lastSyncedTargetsSignatureRef = useRef<string | null>(null);
  const targetsSignature = knownTargetsSignature(pages, folderPaths, assetPaths, filePaths);

  useEffect(() => {
    if (
      loading ||
      !tabSessionLoaded ||
      lastSyncedTargetsSignatureRef.current === targetsSignature
    ) {
      return;
    }
    lastSyncedTargetsSignatureRef.current = targetsSignature;
    syncOpenTabsWithKnownTargets({ pages, folderPaths, assetPaths, filePaths });
  }, [
    assetPaths,
    filePaths,
    folderPaths,
    loading,
    pages,
    syncOpenTabsWithKnownTargets,
    tabSessionLoaded,
    targetsSignature,
  ]);

  useEffect(() => {
    onHashChange();

    function onHashChange() {
      // Overlay-dialog hashes (settings, install) don't replace the
      // active document — they portal a Dialog over it. Skipping
      // here keeps the editor mounted underneath; without this guard
      // the no-doc-name branch below would call `clearTarget()` and
      // the editor would flash to <EmptyEditorState> behind the
      // dialog on every Cmd-,.
      if (isAuxiliaryDialogHash(window.location.hash)) {
        return;
      }
      // The graph is a surface with no document behind it, so it resolves
      // before every path-shaped branch below — `docNameFromHash` returns null
      // for it, which would otherwise land it in the `clearTarget()` branch.
      if (isGraphHash(window.location.hash)) {
        mark('ok/nav/hash-change', { docName: null, kind: 'graph' });
        openTargetTransition({ kind: 'graph', target: GRAPH_HASH });
        return;
      }
      if (isChatHash(window.location.hash)) {
        mark('ok/nav/hash-change', { docName: null, kind: 'chat' });
        openTargetTransition({ kind: 'chat', target: CHAT_HASH });
        return;
      }
      const assetPath = assetPathFromHash(window.location.hash);
      if (assetPath) {
        const assetExt = assetPath.split('.').pop() ?? '';
        const mediaKind = mediaKindForSidebarAssetExtension(assetExt);
        mark('ok/nav/hash-change', { docName: null, kind: 'asset' });
        openTargetTransition({
          kind: 'asset',
          target: assetPath,
          assetPath,
          mediaKind,
        });
        return;
      }
      const skillFile = skillFileFromHash(window.location.hash);
      if (skillFile) {
        mark('ok/nav/hash-change', { docName: null, kind: 'skill-file' });
        openTargetTransition({
          kind: 'skill-file',
          target: `${skillFile.scope}/${skillFile.name}/${skillFile.path}`,
          scope: skillFile.scope,
          name: skillFile.name,
          path: skillFile.path,
        });
        return;
      }
      // Content-root sentinel `#/` (the form a root-folder share deep link
      // navigates to, and `hashFromFolderPath('')` emits) → the content-root
      // folder overview. Distinct from an EMPTY hash (`''`), which falls
      // through to the no-doc-name `clearTarget()` branch below. Both
      // `docNameFromHash('#/')` and `docNameFromHash('')` return null, so the
      // sentinel check must run BEFORE the null-docName clear.
      if (isContentRootHash(window.location.hash)) {
        mark('ok/nav/hash-change', { docName: null, kind: 'folder' });
        openTargetTransition({ kind: 'folder', target: '', folderPath: '' });
        return;
      }
      const docName = docNameFromHash(window.location.hash);
      if (!docName) {
        mark('ok/nav/hash-change', { docName: null, kind: 'clear' });
        clearTarget();
        return;
      }
      if (loading) {
        mark('ok/nav/hash-change', { docName, kind: 'deferred-loading' });
        return;
      }
      const resolved =
        exactOpenMarkdownTabTarget(docName, openTabs) ??
        resolveNavigationTarget(docName, {
          pages,
          folderPaths,
          pagesBySlug,
          pagesByBasename,
        });
      if (resolved.kind === 'missing' && /\/+$/.test(docName.trim())) {
        mark('ok/nav/hash-change', { docName, kind: 'deferred-missing-folder' });
        return;
      }
      const target = withLargeFileOpenGuard(downgradeFolderIndexForHashNav(resolved), pageMeta);
      mark('ok/nav/hash-change', { docName, kind: target.kind });
      openTargetTransition(target);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [
    clearTarget,
    folderPaths,
    loading,
    openTargetTransition,
    openTabs,
    pageMeta,
    pages,
    pagesBySlug,
    pagesByBasename,
  ]);

  return null;
}

/**
 * Mounts `InstallInClaudeDesktopDialog` at the App root and opens it when
 * `window.location.hash === '#install-claude-desktop'`. Docs and in-app CTAs
 * link to the hash to deep-link into the dialog. The hash clears when the
 * dialog closes so it reopens only if the user navigates back to the URL
 * fragment.
 *
 * `INSTALL_DIALOG_HASH` is declared above (alongside `isAuxiliaryDialogHash`)
 * so NavigationHandler can short-circuit on it.
 */
function InstallInClaudeDesktopTrigger() {
  const [open, setOpen] = useState(
    typeof window !== 'undefined' && window.location.hash === INSTALL_DIALOG_HASH,
  );

  useEffect(() => {
    function onHashChange() {
      if (window.location.hash === INSTALL_DIALOG_HASH) setOpen(true);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next && window.location.hash === INSTALL_DIALOG_HASH) {
      // Clear the fragment so closing doesn't instantly re-open on refresh.
      // Uses history.replaceState to avoid adding a history entry.
      const { pathname, search } = window.location;
      window.history.replaceState(null, '', `${pathname}${search}`);
    }
  }

  return <InstallInClaudeDesktopDialog open={open} onOpenChange={handleOpenChange} />;
}

/**
 * Cmd-, / Ctrl-, opens the Settings dialog. Sibling to
 * `NewItemShortcutHandler` — global keydown listener at App scope, suppresses
 * inside text inputs (`isSettingsShortcut`), routes to the canonical hash so
 * `useSettingsRoute` (mounted by EditorArea) reacts and renders SettingsDialog.
 *
 * Browser-mode-only in practice: Electron's menu accelerator (`CmdOrCtrl+,`
 * on the App / File menu Settings… item) captures the keypress before it
 * reaches the renderer, so this handler firing inside Electron is a no-op
 * because the menu's executeJavaScript already set the same hash. Both code
 * paths produce identical end state.
 */
function SettingsShortcutHandler() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (
        isSettingsShortcut({
          target,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          key: e.key,
        })
      ) {
        e.preventDefault();
        if (window.location.hash !== SETTINGS_OPEN_HASH) {
          window.location.hash = SETTINGS_OPEN_HASH;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

/**
 * Pushes the editor area's active target to main via
 * `bridge.editor.notifyActiveTargetChanged`. Drives the macOS File menu's
 * state-aware enable/disable for items like Rename / Move to Trash / Send
 * to AI. Web-host short-circuits when the desktop bridge is absent.
 *
 * Lives at the App-tier where `useDocumentContext()` is already mounted —
 * exactly one push site keeps the last-write-wins semantics main relies on
 * (`editorActiveTarget` is module-scope, singleton across windows). Effect
 * deps are narrowed to the discriminator + identifier so a render that
 * re-creates an equal `activeTarget` reference doesn't re-fire the push —
 * the snapshot main consumes is normalized to the same four shapes.
 *
 * Snapshot shape mirrors `EditorActiveTargetSnapshot`'s discriminated union
 * (doc / folder / asset / null). `folder-index` and `missing` collapse to
 * `kind: null` because main doesn't need state-aware enable for those
 * scopes today — File menu items either always-enable (Reveal in Finder
 * for contentDir, New File) or always-disable (Rename / Move to Trash
 * with no concrete target).
 */
function ActiveTargetBridgePush() {
  const { activeTarget } = useDocumentContext();
  const bridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;

  // Narrow the unbounded ResolvedNavigationTarget union to the shapes the
  // menu surface understands. doc / folder / asset are enable-bearing
  // scopes; everything else (folder-index, missing, null) renders as the
  // project-scope state.
  const kind =
    activeTarget?.kind === 'doc' ||
    activeTarget?.kind === 'folder' ||
    activeTarget?.kind === 'asset'
      ? activeTarget.kind
      : null;
  const identifier =
    activeTarget?.kind === 'doc'
      ? activeTarget.docName
      : activeTarget?.kind === 'folder'
        ? activeTarget.folderPath
        : activeTarget?.kind === 'asset'
          ? activeTarget.assetPath
          : null;

  useEffect(() => {
    if (!bridge) return;
    if (kind === null) {
      bridge.editor.notifyActiveTargetChanged({ kind: null });
      return;
    }
    if (identifier === null) return;
    bridge.editor.notifyActiveTargetChanged({ kind, identifier });
  }, [bridge, kind, identifier]);

  return null;
}

function NewItemShortcutHandler() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // KeyboardEvent.target is EventTarget|null — widen to the duck-typed
      // ShortcutEventLike shape used by the pure predicate.
      const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (
        isNewItemShortcut({
          target,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          key: e.key,
        })
      ) {
        e.preventDefault();
        // No folder argument: the sidebar creates where its own toolbar would
        // (active folder / active doc's folder, root after an empty-space
        // deselect), so ⌘N and the toolbar button can never disagree.
        emitCreateTopLevelFile();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

/**
 * App-tier host that reads `collabUrl` from DocumentContext and passes it to
 * `ConfigProvider` as a prop, keeping `ConfigProvider` (in `lib/`) free of any
 * `editor/` import. That layering inversion is what closed the DocumentContext
 * value-import cycle behind the CI "export not found" flake — don't collapse it
 * back into `<ConfigProvider>` reading `useDocumentContext()` directly.
 */
function ConfigProviderHost({ children }: { children: ReactNode }) {
  const { collabUrl } = useDocumentContext();
  // App-lifetime keepalive so an open tab keeps its `ok start` server alive
  // even with no document open. Independent of the per-doc provider pool;
  // self-gates to non-desktop. Mounted here because this host already owns the
  // single app-root `collabUrl` read.
  useServerKeepalive(collabUrl);
  return <ConfigProvider collabUrl={collabUrl}>{children}</ConfigProvider>;
}

export function App() {
  return (
    <ProfilerBoundary name="app">
      <DatabaseOverlayProvider value>
        <DocumentProvider>
          <ConfigProviderHost>
            <SingleFileModeProvider>
              <AppBody />
            </SingleFileModeProvider>
          </ConfigProviderHost>
        </DocumentProvider>
      </DatabaseOverlayProvider>
    </ProfilerBoundary>
  );
}

/**
 * App chrome body. Split out from `App` so it sits BELOW `SingleFileModeProvider`
 * and can read `useSingleFileMode()` — the no-project ephemeral session
 * (`ok <file>`) drops project chrome (file sidebar / tabs / project switcher /
 * Settings) here while the editor itself (`EditorPane` → `EditorArea`) stays
 * fully editable.
 */
function terminalChatContext(input: HandoffDispatchInput): readonly ChatContextChip[] {
  if (input.compose?.scope === 'doc') {
    return [
      { kind: 'document', label: input.compose.docRelativePath },
      ...(input.compose.selection === undefined
        ? []
        : [{ kind: 'selection' as const, label: 'Selection' }]),
      ...input.compose.mentions.map((label) => ({ kind: 'mention' as const, label })),
    ];
  }
  if (input.compose?.scope === 'folder') {
    return [
      { kind: 'folder', label: input.compose.folderRelativePath },
      ...input.compose.mentions.map((label) => ({ kind: 'mention' as const, label })),
    ];
  }
  if (input.compose?.scope === 'project') {
    return [
      { kind: 'project', label: 'Project' },
      ...input.compose.mentions.map((label) => ({ kind: 'mention' as const, label })),
    ];
  }
  if (input.selection !== undefined) {
    return [
      { kind: 'document', label: input.selection.relativePath },
      { kind: 'selection', label: 'Selection' },
    ];
  }
  if (input.ask !== undefined) return [{ kind: 'document', label: input.ask.relativePath }];
  if (input.docContext !== null) {
    return [{ kind: 'document', label: input.docContext.relativePath }];
  }
  if (input.folderRelativePath) return [{ kind: 'folder', label: input.folderRelativePath }];
  return [{ kind: 'project', label: 'Project' }];
}

function terminalChatDisplayPrompt(input: HandoffDispatchInput): string {
  return (
    input.compose?.instruction ??
    input.selection?.instruction ??
    input.ask?.instruction ??
    input.createDescription ??
    input.instruction ??
    'Open the current context'
  );
}

function AppBody() {
  // Workspace omnibar: shared across web and Electron for file/folder
  // navigation and command dispatch. Electron additionally surfaces
  // project-level commands when the desktop bridge exists.
  // Mounted at the App root so Cmd/Ctrl+K works regardless of focus.
  const desktopBridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;
  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dataInspectorOpen, setDataInspectorOpen] = useState(false);
  const [dataInspectorScope, setDataInspectorScope] = useState<DatabaseContextInspectionScope>();
  const [agentRunsOpen, setAgentRunsOpen] = useState(false);
  const [databasesOpen, setDatabasesOpen] = useState(false);
  const [databaseOpenAction, setDatabaseOpenAction] = useState<'create' | null>(null);
  const [databasePresentation, setDatabasePresentation] = useState<'dialog' | 'page'>('dialog');
  const [databaseDiagnosticsOpen, setDatabaseDiagnosticsOpen] = useState(false);
  const databaseCreationRouteActive = isDatabaseCreationHash(window.location.hash);
  // Keep the page presentation stable for the lifetime of the creation
  // action. Some navigation handlers normalize the ephemeral hash before the
  // mutation resolves; the action state is the durable source of truth until
  // the canonical page route is ready.
  const databaseCreationPageActive = databaseCreationRouteActive || databaseOpenAction === 'create';
  const openDataInspector = (scope?: DatabaseContextInspectionScope) => {
    setDataInspectorScope(scope);
    setDataInspectorOpen(true);
  };
  const singleFile = useSingleFileMode();
  const databaseCreationRouteOpenRef = useRef(isDatabaseCreationHash(window.location.hash));

  const resetDatabaseSurface = useEffectEvent(() => {
    setDatabasesOpen(false);
    setDatabaseOpenAction(null);
    setDatabasePresentation('dialog');
  });

  const openDatabaseCreationRoute = useEffectEvent(() => {
    if (!isDatabaseCreationHash(window.location.hash)) {
      const currentState =
        window.history.state && typeof window.history.state === 'object'
          ? window.history.state
          : {};
      window.history.pushState(
        { ...currentState, [DATABASE_CREATION_HISTORY_KEY]: true },
        '',
        `${window.location.pathname}${window.location.search}${DATABASE_CREATION_HASH}`,
      );
    }
    databaseCreationRouteOpenRef.current = true;
    setDatabaseOpenAction('create');
    setDatabasePresentation('page');
    setDatabasesOpen(true);
  });

  const closeDatabaseCreationRoute = useEffectEvent(() => {
    if (!isDatabaseCreationHash(window.location.hash)) return;
    const currentState = window.history.state;
    if (
      currentState &&
      typeof currentState === 'object' &&
      DATABASE_CREATION_HISTORY_KEY in currentState
    ) {
      window.history.back();
      return;
    }
    databaseCreationRouteOpenRef.current = false;
    replaceDatabaseHash('');
  });

  useEffect(() => {
    const onDatabaseSlashCommand = (event: Event) => {
      const command = (event as CustomEvent<DatabaseSlashCommand>).detail;
      if (command !== 'new') return;
      openDatabaseCreationRoute();
    };
    window.addEventListener(DATABASE_SLASH_COMMAND_EVENT, onDatabaseSlashCommand);
    return () => window.removeEventListener(DATABASE_SLASH_COMMAND_EVENT, onDatabaseSlashCommand);
  }, []);

  useEffect(() => {
    const syncDatabaseCreationHistory = () => {
      if (isDatabaseCreationHash(window.location.hash)) {
        databaseCreationRouteOpenRef.current = true;
        setDatabaseOpenAction('create');
        setDatabasePresentation('page');
        setDatabasesOpen(true);
        return;
      }
      if (databaseCreationRouteOpenRef.current) {
        databaseCreationRouteOpenRef.current = false;
        resetDatabaseSurface();
      }
    };
    syncDatabaseCreationHistory();
    window.addEventListener('popstate', syncDatabaseCreationHistory);
    return () => window.removeEventListener('popstate', syncDatabaseCreationHistory);
  }, []);

  // A successful creation replaces the ephemeral `#database/new` route with
  // the canonical page route without causing a native hashchange. Let the
  // page route take over and unmount the temporary creation surface so the
  // creation form cannot reopen over the newly created inline database.
  useEffect(() => {
    const onDatabaseNavigation = () => {
      if (!isDatabasePageHash(window.location.hash)) return;
      databaseCreationRouteOpenRef.current = false;
      setDatabasesOpen(false);
      setDatabaseOpenAction(null);
      setDatabasePresentation('dialog');
    };
    window.addEventListener(DATABASE_NAVIGATION_CHANGE_EVENT, onDatabaseNavigation);
    return () => window.removeEventListener(DATABASE_NAVIGATION_CHANGE_EVENT, onDatabaseNavigation);
  }, []);

  // A normal document navigation can happen while the database surface is
  // open (for example, clicking New file in the sidebar). The database route
  // owns its canvas, but the creation/admin surface is App-level state; close
  // it as soon as the hash leaves the database namespace so a stale table
  // cannot remain mounted over the newly opened page.
  useEffect(() => {
    const onHashNavigation = () => {
      const hash = window.location.hash;
      if (isDatabaseCreationHash(hash) || isDatabasePageHash(hash)) return;
      if (!databasesOpen && databaseOpenAction === null) return;
      databaseCreationRouteOpenRef.current = false;
      resetDatabaseSurface();
    };
    window.addEventListener('hashchange', onHashNavigation);
    window.addEventListener('popstate', onHashNavigation);
    window.addEventListener(ROUTE_NAVIGATION_CHANGE_EVENT, onHashNavigation);
    return () => {
      window.removeEventListener('hashchange', onHashNavigation);
      window.removeEventListener('popstate', onHashNavigation);
      window.removeEventListener(ROUTE_NAVIGATION_CHANGE_EVENT, onHashNavigation);
    };
  }, [databaseOpenAction, databasesOpen]);

  // "Open in terminal" launcher — desktop-only. Routes a scope-derived prompt
  // to the docked terminal in EditorPane. `composeTerminalLaunchPrompt` drops
  // the "Open the OK editor in web view." trailer the web deep-link handoff
  // carries: the terminal launches next to an already-open editor, so that
  // directive would point the agent at a surface the user is already viewing.
  // Null on the web host (no real OS shell) so the menu rows that consume it
  // render nothing.
  // Which launchable CLIs are on PATH — each launch surface gates its rows from
  // this map via `visibleTerminalClis` so a CLI that isn't installed (e.g.
  // Antigravity) doesn't clutter the menu once the probe confirms it absent.
  const installedClis = useInstalledClis();
  const terminalLaunch: TerminalLaunchContextValue | null = desktopBridge
    ? {
        launchInTerminal: (input, cli) => {
          requestTerminalLaunch(composeTerminalLaunchPrompt(input, cli), cli, {
            displayPrompt: terminalChatDisplayPrompt(input),
            context: terminalChatContext(input),
          });
        },
        installedClis,
      }
    : null;

  return (
    <>
      <ConnectingBanner />
      <DatabaseOverlayHost />
      <PageListProvider>
        <SystemDocSubscriber />
        <DailyNoteHandler />
        <NavigationHandler />
        <ActiveTargetBridgePush />
        <NewItemShortcutHandler />
        {/* Settings is unavailable in single-file mode (config editing is
            inert), so the Cmd-, route handler isn't mounted. */}
        {!singleFile && <SettingsShortcutHandler />}
        {SHOW_INSTALL_SKILL && <InstallInClaudeDesktopTrigger />}
        {/* File → New project… opens CreateProjectDialog here.
            Desktop-only — the `new-project` menu action never fires in
            the web host, so the dialog stays unmounted there. */}
        {desktopBridge ? <CreateProjectMenuTrigger bridge={desktopBridge} /> : null}
        {/* Help → Report a Bug… opens ReportBugDialog here — same
            desktop-only App-root trigger pattern as CreateProjectMenuTrigger. */}
        {desktopBridge ? <ReportBugMenuTrigger bridge={desktopBridge} /> : null}
        {/* First-launch consent dialog — host-agnostic. Self-gates on
            the shared `mcpConsentStore` snapshot; renders nothing until
            main fires `ok:mcp-wiring:show`. Mounted identically in
            NavigatorApp. */}
        <McpConsentDialog />
        {/* Project-scoped branch-switch surface. Self-gates on the
            shared shareReceiveStore — mounts only when main routes a
            'project-branch-switch' payload to this editor window.
            Clone / locate / consent surfaces live on the Navigator,
            never in an editor (see NavigatorApp). */}
        {desktopBridge ? (
          <Suspense fallback={null}>
            <ShareBranchSwitchDialog bridge={desktopBridge} />
            <ShareReceiveMissDialog />
          </Suspense>
        ) : null}
        <CommandPalette
          bridge={desktopBridge}
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onOpenDataInspector={() => openDataInspector()}
          onOpenAgentRuns={() => setAgentRunsOpen(true)}
          onOpenDatabases={() => {
            // Database discovery is a workspace destination, not a transient
            // global modal. Keep the management surface available for the
            // existing reviewed controls, but enter it through the
            // no-overlay page presentation from the command palette.
            setDatabasePresentation('page');
            setDatabasesOpen(true);
          }}
          onOpenDatabaseDiagnostics={() => setDatabaseDiagnosticsOpen(true)}
        />
        <Suspense fallback={null}>
          <LazyDatabaseContextInspectorDialog
            open={dataInspectorOpen}
            scope={dataInspectorScope}
            onOpenChange={(nextOpen) => {
              setDataInspectorOpen(nextOpen);
              if (!nextOpen) setDataInspectorScope(undefined);
            }}
          />
          <LazyDatabaseAgentRunsDialog open={agentRunsOpen} onOpenChange={setAgentRunsOpen} />
          <LazyDatabaseTableDialog
            open={databasesOpen || databaseCreationPageActive}
            onOpenContextInspector={openDataInspector}
            onOpenAgentRuns={() => setAgentRunsOpen(true)}
            initialAction={
              databaseOpenAction ?? (databaseCreationPageActive ? 'create' : undefined)
            }
            creationExperience={databaseCreationPageActive ? 'notion' : 'admin'}
            presentation={databaseCreationPageActive ? 'page' : databasePresentation}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && isDatabaseCreationHash(window.location.hash)) {
                closeDatabaseCreationRoute();
              } else if (!nextOpen && isDatabasePageHash(window.location.hash)) {
                navigateToDatabaseHash('');
              }
              if (nextOpen) {
                setDatabasesOpen(true);
              } else {
                resetDatabaseSurface();
              }
            }}
            onCreationCancelled={() => {
              closeDatabaseCreationRoute();
              resetDatabaseSurface();
            }}
          />
          <LazyDatabaseDiagnosticsDialog
            open={databaseDiagnosticsOpen}
            onOpenChange={setDatabaseDiagnosticsOpen}
          />
        </Suspense>
        {/* Electron BrowserWindow renders with `titleBarStyle: 'hiddenInset'` +
            `transparent: true` + `vibrancy: 'sidebar'`, so the renderer owns
            window-drag affordance. Existing chrome rows (EditorHeader,
            SidebarHeader, EditorTabs) cover y=8..y=56; this 8px strip covers
            the y=0..y=8 vibrancy band above them. */}
        {isElectronHost && (
          <div
            aria-hidden="true"
            data-testid="editor-window-chrome-drag-strip"
            data-electron-drag=""
            className="pointer-events-none fixed inset-x-0 top-0 z-50 h-2 [-webkit-app-region:drag]"
          />
        )}
        {/* The "Open in terminal" entry point spans both the FileSidebar
            menus and the EditorHeader/EditorPane, which are siblings here —
            so the provider wraps both. Its value is desktop-gated; the docked
            terminal that consumes the launch lives in EditorPane. */}
        <TerminalLaunchProvider value={terminalLaunch}>
          <SidebarProvider className="h-screen overflow-hidden">
            {/* No-project single-file mode drops the file sidebar (file tree +
                project switcher); the editor inset takes the full width. */}
            {!singleFile && (
              <FileSidebar
                onOpenSearch={() => setCommandPaletteOpen(true)}
                onNewDatabase={openDatabaseCreationRoute}
              />
            )}
            <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
              <DatabasePageRoute onOpenAgentRuns={() => setAgentRunsOpen(true)}>
                <EditorPane onOpenSearch={() => setCommandPaletteOpen(true)} />
              </DatabasePageRoute>
            </SidebarInset>
          </SidebarProvider>
        </TerminalLaunchProvider>
      </PageListProvider>
    </>
  );
}
