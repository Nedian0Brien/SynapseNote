import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { EditorSkeleton } from '../EditorSkeleton';
import { TerminalDock } from '../TerminalDock';
import { hasHashNavigationTarget, useEditorAreaState } from './EditorAreaStateProvider';
import { EditorAreaTerminalColumn } from './EditorAreaTerminalColumn';
import { EditorAreaPrimaryView, EditorAreaViewRightPanel } from './EditorAreaView';

/** Render owner for the stable three-column layout and movable bottom terminal shell. */
export function EditorAreaLayout() {
  const {
    props,
    rail,
    activeTarget,
    activeProvider,
    activeDocName,
    everHadProvider,
    docPanelMode,
    docPanelAgentId,
  } = useEditorAreaState();
  const isColdDocument = activeProvider == null || activeDocName == null;
  if (
    isColdDocument &&
    hasHashNavigationTarget() &&
    (props.terminalBridge == null || !everHadProvider)
  ) {
    return <EditorSkeleton />;
  }
  const hasRightPanel =
    !rail.terminalColumnPresent &&
    ((activeTarget?.kind === 'folder' && docPanelMode === 'agent' && docPanelAgentId !== null) ||
      (activeTarget?.kind === 'asset' && activeTarget.mediaKind === 'pdf') ||
      (isColdDocument && hasHashNavigationTarget()) ||
      (!isColdDocument &&
        activeTarget?.kind !== 'large-file' &&
        activeTarget?.kind !== 'skill-file'));
  const editorAbsorbsResidual =
    (hasRightPanel && !rail.initialRightCollapsed) || rail.terminalColumnPresent;
  const primaryView = <EditorAreaPrimaryView />;
  const leftColumn =
    props.terminalBridge != null ? (
      <TerminalDock
        visible={props.terminalVisible}
        onVisibleChange={props.onTerminalVisibleChange ?? (() => {})}
        dockPosition={rail.terminalDockPosition}
        onBottomContainer={rail.setBottomTerminalContainer}
        onEditorRegion={rail.setTerminalEditorRegion}
      >
        {primaryView}
      </TerminalDock>
    ) : (
      primaryView
    );
  return (
    <div className="relative flex min-h-0 flex-1" ref={rail.setGroupContainer}>
      <ResizablePanelGroup
        orientation="horizontal"
        groupRef={rail.groupRef}
        data-dragging={rail.isDraggingDocHandle || rail.isDraggingTerminalHandle || undefined}
      >
        <ResizablePanel
          minSize={rail.terminalColumnPresent ? '5%' : '30%'}
          {...(editorAbsorbsResidual ? {} : { defaultSize: '100%' })}
          className={cn(
            !(rail.isDraggingDocHandle || rail.isDraggingTerminalHandle) &&
              'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0',
          )}
        >
          {leftColumn}
        </ResizablePanel>
        <EditorAreaViewRightPanel />
        <EditorAreaTerminalColumn />
      </ResizablePanelGroup>
    </div>
  );
}
