import { useLingui } from '@lingui/react/macro';
import { detectEmbeddedHostFromBrowser } from '@nedian0brien/synapsenote-core';
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AssetPreview } from '@/components/AssetPreview';
import type { PanelTab, PdfPanelTab } from '@/components/DocPanel';
import { EditorSkeleton } from '@/components/EditorSkeleton';
import { EmptyEditorState } from '@/components/EmptyEditorState';
import { FolderOverview } from '@/components/FolderOverview';
import { LargeFileEditorState } from '@/components/LargeFileEditorState';
import { MountStalledAffordance } from '@/components/MountStalledAffordance';
import { PropertyProvider, useProperties } from '@/components/PropertyContext';
import { useRightRail } from '@/components/RightRail';
import { ShareReceiveMissPanel } from '@/components/ShareReceiveMissPanel';
import { SkillFileViewer } from '@/components/SkillFileViewer';
import { SettingsDialogShell } from '@/components/settings/SettingsDialogShell';
import { useDocumentTransition } from '@/editor/DocumentContext';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { FindReplaceController } from '@/editor/find-replace/FindReplaceController';
import { mountPromiseHasResolved } from '@/editor/mount-promise';
import { syncPromiseHasResolved } from '@/editor/sync-promise';
import { useDocumentStats } from '@/hooks/use-document-stats';
import { useLifecycleStatus } from '@/hooks/use-lifecycle-status';
import { useSelectionStats } from '@/hooks/use-selection-stats';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import { ProfilerBoundary } from '@/lib/perf';
import {
  matchesShareReceiveMiss,
  pendingReceiveNavStore,
} from '@/lib/share/pending-receive-nav-store';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import { useSettingsRoute } from '@/lib/use-settings-route';
import { useSyncStatus } from '@/presence/use-sync-status';
import { BottomComposer } from './BottomComposer';
import { shouldShowBottomComposer, shouldShowFolderComposer } from './bottom-composer-gate';
import { EditorActivityPool } from './EditorActivityPool';
import { EditorFooter } from './EditorFooter';
import type { EditorMode } from './EditorPane';
import { EditorToolbar } from './EditorToolbar';
import { shouldPaintOverlay } from './editor-area-overlay';
import { TerminalDock } from './TerminalDock';

/**
 * Where + whether the terminal should attach right now. EditorArea computes this
 * (it knows the view kind and the bottom/right mount containers) and
 * reports it UP to EditorPane, which owns the long-lived session host. The host is
 * mounted above EditorArea so a dock toggle (which remounts EditorArea's subtree)
 * can't re-spawn the terminal — the VS Code / Zed pattern of owning the terminal
 * above the movable layout and re-attaching the view.
 */
export interface TerminalPlacement {
  /** The DOM container to portal the live terminal into (bottom dock or right region). */
  readonly container: HTMLElement | null;
  /** Whether the terminal is on screen (drives focus). */
  readonly isShowing: boolean;
  readonly dockPosition: TerminalDockPosition;
  /** Focus target for returning focus to the editor when the terminal hides. */
  readonly editorRegion: HTMLElement | null;
}

interface EditorAreaProps {
  editorMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  /** Selects which PDF tool the viewer mirrors; the rail owns the selection. */
  activeTab: PanelTab;
  /**
   * Desktop bridge for the docked terminal — `null` on the web host (no shell).
   * When present, the terminal docks either under the editor (bottom, via
   * `TerminalDock`'s vertical split) or as the Chat tool inside the right rail
   * (`#right-rail`). The live session host is owned by EditorPane and portals
   * into whichever container is active, so the PTY survives tab switches,
   * view-kind changes, and dock moves. State is owned by EditorPane and
   * threaded down via these props.
   */
  terminalBridge?: OkDesktopBridge | null;
  terminalVisible?: boolean;
  onTerminalVisibleChange?: (visible: boolean) => void;
  /** Terminal dock position (right default | bottom). When `'right'` the terminal
   *  is its own column to the right of the doc/agent panel (MD | PANE | TERMINAL)
   *  instead of docking under the editor. */
  terminalDock?: TerminalDockPosition;
  /** Report the terminal's attach point up to EditorPane (which owns the session
   *  host). See {@link TerminalPlacement}. */
  onTerminalPlacement?: (placement: TerminalPlacement) => void;
}

export function EditorArea(props: EditorAreaProps) {
  return (
    <ProfilerBoundary name="editor-area">
      {/* PropertyProvider scopes the cross-tree property-panel signal bus
          to the editor surface — both the toolbar (button → dispatcher)
          and EditorActivityPool's PropertyPanel mounts (consumers) live
          underneath. Replaces the prior `BEGIN_ADD_EVENT` window event,
          whose global broadcast leaked across hidden Activity boundaries. */}
      <PropertyProvider>
        <EditorAreaInner {...props} />
        <SettingsDialogPortal />
      </PropertyProvider>
    </ProfilerBoundary>
  );
}

/**
 * Mounts the Settings dialog as a sibling overlay (Radix portal). Owns
 * the route subscription so EditorAreaInner doesn't have to thread
 * settings state through its render branches.
 *
 * The shell is synchronously imported so it lives in the main chunk
 * and mounts on initial render — when `open` flips to true the Dialog
 * primitive's portal content paints on the same frame as the trigger
 * (sidebar + content skeleton), and the heavy body chunk loads behind
 * the shell's own non-null Suspense fallback. The shell renders
 * trivially when closed (Radix Dialog's `Presence` short-circuits, the
 * body chunk is never fetched until first open), so eager-mounting is
 * cheap.
 *
 * `useSettingsRoute` wraps its open-state flip in `startTransition` so
 * on warm reopens — when the body chunk is already cached — React
 * commits the resolved tree directly with no Suspense fallback flash.
 * The user-scope ConfigBinding stays warm for the session via
 * ConfigProvider, so reopens are flash-free end-to-end.
 */
function SettingsDialogPortal() {
  const settingsRoute = useSettingsRoute();
  return (
    <SettingsDialogShell
      open={settingsRoute.open}
      onOpenChange={(next) => {
        if (!next) settingsRoute.close();
      }}
    />
  );
}

function EditorAreaInner({
  editorMode,
  onModeChange,
  activeTab,
  terminalBridge,
  terminalVisible = false,
  onTerminalVisibleChange,
  terminalDock = 'right',
  onTerminalPlacement,
}: EditorAreaProps) {
  const { t } = useLingui();
  const { activeDocName, activeTarget } = useDocumentNavigation();
  const { activeProvider, recycleDocument } = useDocumentCollaboration();
  const activePdfAsset =
    activeTarget?.kind === 'asset' && activeTarget.mediaKind === 'pdf' ? activeTarget : null;
  const activePdfPanelTab: PdfPanelTab =
    activeTab === 'pages' ||
    activeTab === 'annotations' ||
    activeTab === 'outline' ||
    activeTab === 'links'
      ? activeTab
      : 'pages';
  const { openDocumentTransition } = useDocumentTransition();
  const { requestAddProperty } = useProperties();
  const stats = useDocumentStats(activeProvider, activeDocName);
  const selectionStats = useSelectionStats(
    activeDocName,
    editorMode === 'source' ? 'source' : 'wysiwyg',
  );
  const syncStatus = useSyncStatus(activeProvider);
  const isConnected = syncStatus === 'connected' || syncStatus === 'synced';
  const lifecycleStatus = useLifecycleStatus(activeDocName);
  const isConflict = lifecycleStatus === 'conflict';
  // Latches true once any provider has been active this session. It separates a
  // genuine cold start (group never mounted, no docked terminal alive yet) from
  // a mid-session navigation whose provider is transiently null — closing a tab
  // or switching to a not-yet-ready doc. Only the latter must keep the
  // persistent left column mounted so the docked terminal PTY survives.
  const [everHadProvider, setEverHadProvider] = useState(false);
  useEffect(() => {
    if (activeProvider != null && !everHadProvider) setEverHadProvider(true);
  }, [activeProvider, everHadProvider]);
  // Shell-snap decoupling: `activeDocName` updates urgently across the tree
  // (sidebar aria-current, header title, tab panels — all read the urgent
  // value via `useDocumentContext`). The editor subtree, however, pays a
  // heavy render cost on nav to mark-heavy / oversize docs — TipTap's
  // create-view + per-mark reconciliation can block the main thread for
  // 1-3s on docs above `BYTES_CACHE_THRESHOLD` (which refuse V2 cache
  // admission, forcing a fresh `new Editor()` on every warm visit).
  // Wrapping with `useDeferredValue` lets React commit the shell render
  // first (aria-current + header snap to the new doc) and defer the
  // editor-subtree re-render to a low-priority pass, letting the browser
  // paint the updated shell before the editor mount cost begins. The
  // shell-snap budget is ~250ms.
  const deferredActiveDocName = useDeferredValue(activeDocName);
  const isNewDoc = activeTarget?.kind === 'missing';
  const showStats = !!activeDocName && activeTarget?.kind !== 'folder';
  const editorPlaceholder = isNewDoc ? t`Start writing to create this page` : undefined;
  // A share-receive navigation that resolved to a missing target renders an
  // honest verdict panel instead of the create-mode editor, so a receiver can't
  // silently fork the doc at the shared path. A plain missing target — an
  // ordinary wiki-link create-on-navigate — leaves this null and keeps
  // create-mode reachable.
  const pendingReceiveNav = useSyncExternalStore(
    pendingReceiveNavStore.subscribe,
    pendingReceiveNavStore.getSnapshot,
    pendingReceiveNavStore.getSnapshot,
  );
  const shareReceiveMiss = matchesShareReceiveMiss(activeTarget, pendingReceiveNav);

  const [embeddedHost] = useState(() => detectEmbeddedHostFromBrowser());
  // Derive from the cached `embeddedHost` instead of calling
  // `useIsEmbedded()` (which would re-run `detectEmbeddedHostFromBrowser()`
  // a second time on mount — both are lazy-initializer stable, but the
  // double-detect was pure waste).
  const isEmbedded = embeddedHost !== null;

  // The toolbox lives OUTSIDE this component — it is a sibling of the whole
  // content column (header included), owned by `RightRailLayout`, and its
  // collapse control lives in `EditorHeader` beside the file-sidebar trigger.
  // All this view needs from it is the two portal targets it exposes.
  const { pdfPanelContainer, rightTerminalContainer } = useRightRail();

  // The bottom-dock mount + the editor-region focus target, reported up by
  // TerminalDock (the bottom shell). The session host portals into the active
  // container and returns focus to the editor region when the terminal hides.
  const [bottomTerminalContainer, setBottomTerminalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [terminalEditorRegion, setTerminalEditorRegion] = useState<HTMLDivElement | null>(null);

  // Terminal placement, computed early (before the view branches) so it can be
  // reported up to EditorPane regardless of which branch renders. When right-
  // docked the terminal is the rail's Chat tool, available across EVERY view
  // kind. This is why the dock stays on the right even when there's nothing
  // else to put there.
  const rightDocked = terminalDock === 'right';
  const terminalDockPosition: TerminalDockPosition = rightDocked ? 'right' : 'bottom';
  const rightTerminalShowing = rightDocked && terminalVisible && rightTerminalContainer != null;
  const activeTerminalContainer = rightTerminalShowing
    ? rightTerminalContainer
    : bottomTerminalContainer;
  const terminalShowing =
    (rightDocked ? rightTerminalShowing : terminalVisible) && activeTerminalContainer != null;
  // Report the attach point up to EditorPane (which owns the long-lived session
  // host). EditorArea only says where to attach — the VS Code / Zed pattern of
  // owning the terminal above the layout that moves.
  useEffect(() => {
    onTerminalPlacement?.({
      container: activeTerminalContainer,
      isShowing: terminalShowing,
      dockPosition: terminalDockPosition,
      editorRegion: terminalEditorRegion,
    });
  }, [
    onTerminalPlacement,
    activeTerminalContainer,
    terminalShowing,
    terminalDockPosition,
    terminalEditorRegion,
  ]);

  // Track the prior active docName for DocumentErrorBoundary's
  // "Back to previous document" affordance. Updated AFTER render (effect) so
  // the *current* render still sees the prior value — during an error, the
  // user sees "Back to <previous>" where <previous> is the last successfully
  // navigated-to doc, not the doc that just errored.
  const previousDocNameRef = useRef<string | null>(null);
  const [previousDocName, setPreviousDocName] = useState<string | null>(null);
  // Session-sticky dismissal of the bottom "Ask AI" composer. When dismissed the
  // field collapses and the footer shows a reopen badge; persists across doc
  // switches within this editor shell's lifetime.
  const [composerDismissed, setComposerDismissed] = useState(false);
  const activeDocumentHistoryName =
    activeTarget?.kind === 'large-file' ? activeTarget.docName : activeDocName;
  useEffect(() => {
    if (activeDocumentHistoryName && activeDocumentHistoryName !== previousDocNameRef.current) {
      // Capture prior ref value, then update ref + state for the next render.
      const prior = previousDocNameRef.current;
      previousDocNameRef.current = activeDocumentHistoryName;
      setPreviousDocName(prior);
    }
  }, [activeDocumentHistoryName]);

  function navigateBackToDoc(prev: string) {
    // Navigate via hash so the URL stays in sync with app state —
    // NavigationHandler's hashchange listener will call openDocumentTransition(prev).
    // If the hash is already at prev (rare — happens when back-nav is used after
    // agent nav without URL update), fall back to direct transition.
    const nextHash = hashFromDocName(prev);
    if (window.location.hash === nextHash) {
      openDocumentTransition(prev);
    } else {
      window.location.hash = nextHash;
    }
  }

  // Resolve what the CONTENT surface shows. These branches no longer build a
  // right-side panel of their own — the toolbox is assembled once below and is
  // the same panel whatever is on the left. The docked terminal lives in the
  // left column BELOW `viewContent`, so it sits beside the rail rather than
  // spanning under it, and stays at one stable React position across view kinds
  // so the PTY survives tab switches and view-kind changes.
  let viewContent: ReactNode;

  if (activeTarget?.kind === 'large-file') {
    viewContent = (
      <LargeFileEditorState
        docName={activeTarget.docName}
        size={activeTarget.size}
        limit={activeTarget.limit}
        backNav={
          previousDocName ? { previousDocName, onNavigateBack: navigateBackToDoc } : undefined
        }
      />
    );
  } else if (activeTarget?.kind === 'folder') {
    // The folder view gets the same "Ask AI" composer as the editor, scoped to
    // this folder (the folder is its top-row context chip + dispatch lead). It
    // docks in-flow below the folder list rather than as a scroll overlay — the
    // list is a discrete table, not a continuous document.
    const showFolderComposer = shouldShowFolderComposer({
      terminalVisible,
      isEmbedded,
    });
    viewContent = (
      <div className="relative flex h-full min-h-0 flex-col">
        {/* Wrap the folder list so the fade band can anchor to the bottom of the
            list region (the top of the in-flow composer) rather than the bottom
            of the whole column. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <FolderOverview folderPath={activeTarget.folderPath} />
          {/* Same footer fade as EditorFooter's sliver (identical gradient
              band): the list dissolves into the background above the composer
              instead of meeting a hard edge. Only while the Ask AI composer is
              shown. */}
          {showFolderComposer ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-linear-to-t from-background to-transparent"
            />
          ) : null}
        </div>
        {showFolderComposer ? <BottomComposer folderPath={activeTarget.folderPath} /> : null}
      </div>
    );
    // Agent activity is a tool in the rail (DocPanel's `'agent'` mode), not a
    // panel the folder view builds for itself. The old bespoke `agent-panel`
    // was the only right-side panel that could not be collapsed — an accident
    // of being owned by a view that had no toggle to offer it.
  } else if (activeTarget?.kind === 'asset') {
    // `key={assetPath}` forces a fresh `AssetPreview` instance on every asset
    // navigation so the in-pane `forceText` toggle (from the "View as text"
    // button) does not bleed across unrelated files. AssetPreview sits outside
    // the EditorActivityPool so there's no Activity-preserved subtree to rely
    // on; this remount is the simplest correct reset.
    viewContent = (
      <AssetPreview
        key={activeTarget.assetPath}
        assetPath={activeTarget.assetPath}
        mediaKind={activeTarget.mediaKind}
        showViewerHeader={activePdfAsset !== null && terminalBridge != null}
        pdfPanelContainer={pdfPanelContainer}
        activePdfPanelTab={activePdfPanelTab}
      />
    );
  } else if (activeTarget?.kind === 'skill-file') {
    // A skill bundle file (global refs + scripts of any scope). Read-only,
    // backed by the scope-aware `/api/skill-file` read. Keyed by the three
    // coordinates so navigating between bundle files re-fetches.
    viewContent = (
      <SkillFileViewer
        key={`${activeTarget.scope}/${activeTarget.name}/${activeTarget.path}`}
        scope={activeTarget.scope}
        name={activeTarget.name}
        path={activeTarget.path}
      />
    );
  } else if (shareReceiveMiss) {
    // Terminal state for a share-receive miss — replaces the create-mode editor
    // the missing target would otherwise open, before the phantom provider's
    // editor can paint. Keyed by path so a redirect to another miss remounts +
    // re-fetches its verdict.
    viewContent = <ShareReceiveMissPanel key={shareReceiveMiss.path} nav={shareReceiveMiss} />;
  } else if (!activeProvider || !activeDocName) {
    // On initial page load the URL hash tells us a doc is about to open — render
    // the skeleton instead of the "Select a document" empty state so the user
    // doesn't see a flash of the OkBlob screen before `NavigationHandler` wires
    // up the hash-driven nav.
    const hashDoc = typeof window !== 'undefined' ? docNameFromHash(window.location.hash) : null;
    if (hashDoc !== null) {
      if (terminalBridge != null && everHadProvider) {
        // Mid-session navigation to a not-yet-ready doc — closing a tab (the
        // neighbor activates async via the hashchange handler) or switching to a
        // cold/evicted one — transiently nulls the active provider while the hash
        // already names the next doc. Render the load skeleton THROUGH the shared
        // group (not a bare early return) so the persistent left column, and the
        // docked TerminalDock + its live PTY inside it, stay mounted across the
        // gap instead of unmounting and resetting the terminal.
        //
        // The rail needs no placeholder here any more: it is rendered once below
        // for every branch, so its id and pixel width are already continuous
        // across skeleton → doc. The old ref-free `doc-panel` stand-in existed
        // only to hold the panel count steady while the real panel was owned by
        // a branch that this one didn't reach.
        viewContent = <EditorSkeleton />;
      } else {
        // Genuine cold start: the group has never mounted and there is no docked
        // terminal to preserve, so a bare early return costs nothing and lets the
        // group mount fresh — with the rail already present — when the doc lands.
        return <EditorSkeleton />;
      }
    } else {
      // The empty state collapses to the header-only view while a terminal is
      // open in EITHER dock — the open terminal is its own AI entry point, so
      // the composer bubble + starter packs would compete with it. The dock
      // position picks the header pose (bottom-anchored above the bottom dock;
      // centered beside the right column).
      viewContent = (
        <EmptyEditorState terminalDock={terminalVisible ? terminalDockPosition : null} />
      );
    }
  } else {
    const isSourceMode = editorMode === 'source';
    const sourceDisabled = !isConnected;

    function openAddPropertyForm() {
      if (!activeDocName) return;
      requestAddProperty(activeDocName);
    }

    // Visibility for the open doc's "Ask AI" composer — the pure gate in
    // bottom-composer-gate.ts (hidden while the docked terminal is open, in
    // embedded webviews, and with no doc open). The folder overview mounts its
    // own instance under shouldShowFolderComposer. Positioning and the
    // --ask-composer-height scroll inset are documented at the render site
    // below.
    // Desktop chat now has one canonical entry point in the shared right rail.
    // Keep the compact bottom composer only for the web host, where no desktop
    // session rail exists.
    const showBottomComposer =
      terminalBridge == null &&
      shouldShowBottomComposer({
        terminalVisible,
        isEmbedded,
        activeDocName,
      });
    const editorContent = (
      <div className="relative flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          {/* Hybrid Activity + Suspense + ErrorBoundary render tree.
          EditorActivityPool keeps Tiptap eager and lazy-loads SourceEditor on
          the first source-mode visit for each doc, then preserves the per-doc
          display:none toggle after that initial load. Each Activity entry owns
          its own scroll container so scroll position is DOM-local to that
          doc's subtree and survives the Activity hidden-mode mount/unmount cycle.

          Error + Suspense scoping lives INSIDE EditorActivityPool — each
          Activity wraps its own DocumentErrorBoundary + Suspense so a
          hidden doc's cached rejected syncPromise cannot re-throw into
          the visible UI. See EditorActivityPool.tsx file
          docstring "ERROR + SUSPENSE SCOPING" for rationale. */}
          <div className="relative h-full">
            <EditorActivityPool
              // Fall back to the urgent `activeDocName` when the deferred
              // value is still null (initial load, before the first
              // deferred-commit pass populates it). The
              // `!activeProvider || !activeDocName` null-guard above already
              // short-circuits with skeleton/empty-state when `activeDocName`
              // itself is null, so we can assert non-null here.
              activeDocName={deferredActiveDocName ?? activeDocName}
              isSourceMode={isSourceMode}
              editorPlaceholder={editorPlaceholder}
              previousDocName={previousDocName ?? undefined}
              onNavigateBack={navigateBackToDoc}
              onRecycle={recycleDocument}
            />
            <FindReplaceController activeDocName={activeDocName} isSourceMode={isSourceMode} />
            {/* Nav-pending skeleton overlay. Rendered when the urgent
            `activeDocName` (shell state — driving sidebar highlight +
            header title) has moved past `deferredActiveDocName` (editor
            subtree prop), AND the upcoming deferred commit will pay a
            real Suspense suspension. The delta window is the interval
            between shell-snap and the editor subtree's deferred commit
            completing — 1-3s on mark-heavy docs that refuse V2 cache
            admission, sub-frame on warm reopens (both mount-promise
            and sync-promise resolved).
            Without this overlay the user sees the PREVIOUS doc's editor
            linger through a slow mount window, which looks like a
            "flash of the old editor" and contradicts the sidebar's
            now-updated highlight. The overlay is absolute + inset-0 on
            the positioned parent so it paints over the pool without
            unmounting it — Activity state (scroll, selection, editor
            instances) survives underneath.
            Warm-reopen bypass: skip the overlay when both the mount-
            promise and sync-promise caches have resolved entries for
            the new docName. In that state `use()` short-circuits
            synchronously, the deferred commit lands in 1 frame, and
            painting a skeleton during the urgent-paint → deferred-
            commit gap creates a perceptible "cold load" flash on a
            genuinely warm reopen. Reading module state during render
            is safe because resolution is a terminal cache-entry state
            (only invalidate clears it, and invalidate runs from
            park-uncached / evict effects that have already committed
            before this render reads the flag). */}
            {shouldPaintOverlay({
              activeDocName,
              deferredActiveDocName,
              mountResolved: activeDocName !== null && mountPromiseHasResolved(activeDocName),
              syncResolved: activeDocName !== null && syncPromiseHasResolved(activeDocName),
            }) ? (
              <div className="absolute inset-0 z-10 bg-background">
                <EditorSkeleton />
                {/* Mount-stalled affordance — surfaces a "Cancel" link
                  when the mount-promise substrate emits `ok/mount/stalled`
                  past MOUNT_STALLED_THRESHOLD_MS (10s default). Only
                  shown when the skeleton is already overlay-active, so a
                  fast mount never sees the affordance. */}
                {activeDocName !== null ? <MountStalledAffordance docName={activeDocName} /> : null}
              </div>
            ) : null}
          </div>
          {!isConflict && (
            <EditorToolbar
              activeDocName={activeDocName}
              isSourceMode={isSourceMode}
              sourceDisabled={sourceDisabled}
              onModeChange={onModeChange}
              showAddPropertyButton={!isSourceMode}
              onAddProperty={openAddPropertyForm}
            />
          )}
          {/* Floats over the bottom of the scroll area (an absolute overlay, like
              the toolbar at the top) so content scrolls under its faded top edge.
              BottomComposer publishes its measured height as `--ask-composer-height`
              and `styles/shell/editor-layout.css` pads the editor content by it so the last lines clear
              the card; the var clears on collapse, reclaiming the space. */}
          {showBottomComposer ? (
            <BottomComposer
              docName={activeDocName}
              surface={isSourceMode ? 'source' : 'wysiwyg'}
              dismissed={composerDismissed}
              onDismiss={() => setComposerDismissed(true)}
              onReopen={() => setComposerDismissed(false)}
            />
          ) : null}
        </div>
        <EditorFooter
          stats={stats}
          selectionStats={selectionStats}
          showStats={showStats}
          composerBadge={
            showBottomComposer && composerDismissed
              ? { onReopen: () => setComposerDismissed(false) }
              : null
          }
        />
      </div>
    );

    viewContent = editorContent;
  }

  // A single TerminalDock wraps the active view's left column. The skeleton
  // below is structurally identical for every view kind, so the dock keeps one
  // React position and its PTY survives tab switches and view-kind changes.
  // Desktop-only — the web host passes no bridge and renders the column bare.
  // The live terminal session host lives in EditorPane (above this component) so a
  // dock toggle — which remounts EditorArea's subtree — can't re-spawn it. Here we
  // render only the bottom layout shell, which reports its mount + editor region up
  // (the placement is reported to EditorPane via onTerminalPlacement above).
  const leftColumn =
    terminalBridge != null ? (
      <TerminalDock
        visible={terminalVisible}
        onVisibleChange={onTerminalVisibleChange ?? (() => {})}
        dockPosition={terminalDockPosition}
        onBottomContainer={setBottomTerminalContainer}
        onEditorRegion={setTerminalEditorRegion}
      >
        {viewContent}
      </TerminalDock>
    ) : (
      viewContent
    );

  // The content surface, and nothing else. The toolbox is a sibling of this
  // component's whole column — header included — assembled by `RightRailLayout`
  // one level up, which is what lets it run the full height of the window like
  // the file sidebar opposite it.
  return <div className="relative flex min-h-0 flex-1 flex-col">{leftColumn}</div>;
}
