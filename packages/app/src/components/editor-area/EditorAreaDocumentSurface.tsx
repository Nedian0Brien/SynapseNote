import { useLingui } from '@lingui/react/macro';
import { useSyncExternalStore } from 'react';
import { useProperties } from '@/components/PropertyContext';
import { FindReplaceController } from '@/editor/find-replace/FindReplaceController';
import { mountPromiseHasResolved, subscribeMountPromiseResolution } from '@/editor/mount-promise';
import { subscribeSyncPromiseResolution, syncPromiseHasResolved } from '@/editor/sync-promise';
import { useDocumentStats } from '@/hooks/use-document-stats';
import { useLifecycleStatus } from '@/hooks/use-lifecycle-status';
import { useSelectionStats } from '@/hooks/use-selection-stats';
import { useSyncStatus } from '@/presence/use-sync-status';
import { BottomComposer } from '../BottomComposer';
import { shouldShowBottomComposer } from '../bottom-composer-gate';
import { EditorActivityPool } from '../EditorActivityPool';
import { EditorFooter } from '../EditorFooter';
import { EditorSkeleton } from '../EditorSkeleton';
import { EditorToolbar } from '../EditorToolbar';
import { shouldPaintOverlay } from '../editor-area-overlay';
import { MountStalledAffordance } from '../MountStalledAffordance';
import { useEditorAreaState } from './EditorAreaStateProvider';

/** Render owner for the live document editor, toolbar, overlay, composer, and footer. */
export function EditorAreaDocumentSurface() {
  const { t } = useLingui();
  const { requestAddProperty } = useProperties();
  const {
    props,
    rail,
    activeDocName,
    activeTarget,
    activeProvider,
    recycleDocument,
    deferredActiveDocName,
    previousDocName,
    navigateBackToDoc,
    composerDismissed,
    setComposerDismissed,
  } = useEditorAreaState();
  const isSourceMode = props.editorMode === 'source';
  const syncStatus = useSyncStatus(activeProvider);
  const sourceDisabled = syncStatus !== 'connected' && syncStatus !== 'synced';
  const isConflict = useLifecycleStatus(activeDocName) === 'conflict';
  const stats = useDocumentStats(activeProvider, activeDocName);
  const selectionStats = useSelectionStats(activeDocName, isSourceMode ? 'source' : 'wysiwyg');
  const showStats = activeDocName != null && activeTarget?.kind !== 'folder';
  const placeholder =
    activeTarget?.kind === 'missing' ? t`Start writing to create this page` : undefined;
  const showComposer =
    props.terminalBridge == null &&
    shouldShowBottomComposer({
      terminalVisible: props.terminalVisible,
      isEmbedded: rail.isEmbedded,
      activeDocName,
    });
  const openAddPropertyForm = () => {
    if (activeDocName != null) requestAddProperty(activeDocName);
  };
  const editorActivityDocName = deferredActiveDocName ?? activeDocName;
  const mountResolved = useSyncExternalStore(
    subscribeMountPromiseResolution,
    () => activeDocName !== null && mountPromiseHasResolved(activeDocName),
    () => false,
  );
  const syncResolved = useSyncExternalStore(
    subscribeSyncPromiseResolution,
    () => activeDocName !== null && syncPromiseHasResolved(activeDocName),
    () => false,
  );
  // EditorAreaPrimaryView only mounts this surface for a live document.
  if (activeDocName == null || editorActivityDocName == null) return null;

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div className="relative h-full">
          <EditorActivityPool
            activeDocName={editorActivityDocName}
            isSourceMode={isSourceMode}
            editorPlaceholder={placeholder}
            previousDocName={previousDocName ?? undefined}
            onNavigateBack={navigateBackToDoc}
            onRecycle={recycleDocument}
          />
          <FindReplaceController activeDocName={activeDocName} isSourceMode={isSourceMode} />
          {shouldPaintOverlay({
            activeDocName,
            deferredActiveDocName,
            mountResolved,
            syncResolved,
          }) ? (
            <div className="absolute inset-0 z-10 bg-background">
              <EditorSkeleton />
              {activeDocName !== null ? <MountStalledAffordance docName={activeDocName} /> : null}
            </div>
          ) : null}
        </div>
        {!isConflict ? (
          <EditorToolbar
            activeDocName={activeDocName}
            isSourceMode={isSourceMode}
            sourceDisabled={sourceDisabled}
            onModeChange={props.onModeChange}
            showAddPropertyButton={!isSourceMode}
            onAddProperty={openAddPropertyForm}
            isPanelCollapsed={rail.terminalColumnPresent ? false : rail.isCollapsed}
            onTogglePanel={rail.toggleDocumentRightPanel}
            panelControlsId={rail.terminalColumnPresent ? 'terminal-column' : 'doc-panel'}
          />
        ) : null}
        {showComposer ? (
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
          showComposer && composerDismissed ? { onReopen: () => setComposerDismissed(false) } : null
        }
      />
    </div>
  );
}
