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
  const {
    groupRef,
    initialRightCollapsed,
    isDraggingDocHandle,
    isDraggingTerminalHandle,
    setBottomTerminalContainer,
    setGroupContainer,
    setTerminalEditorRegion,
    terminalColumnPresent,
    terminalDockPosition,
  } = rail;
  const isColdDocument = activeProvider == null || activeDocName == null;
  if (
    isColdDocument &&
    hasHashNavigationTarget() &&
    (props.terminalBridge == null || !everHadProvider)
  ) {
    return <EditorSkeleton />;
  }
  const hasRightPanel =
    !terminalColumnPresent &&
    ((activeTarget?.kind === 'folder' && docPanelMode === 'agent' && docPanelAgentId !== null) ||
      (activeTarget?.kind === 'asset' && activeTarget.mediaKind === 'pdf') ||
      (isColdDocument && hasHashNavigationTarget()) ||
      (!isColdDocument &&
        activeTarget?.kind !== 'large-file' &&
        activeTarget?.kind !== 'skill-file'));
  const editorAbsorbsResidual = (hasRightPanel && !initialRightCollapsed) || terminalColumnPresent;
  const primaryView = <EditorAreaPrimaryView />;
  const leftColumn =
    props.terminalBridge != null ? (
      <TerminalDock
        visible={props.terminalVisible}
        onVisibleChange={props.onTerminalVisibleChange ?? (() => {})}
        dockPosition={terminalDockPosition}
        onBottomContainer={setBottomTerminalContainer}
        onEditorRegion={setTerminalEditorRegion}
      >
        {primaryView}
      </TerminalDock>
    ) : (
      primaryView
    );
  return (
    <div className="relative flex min-h-0 flex-1" ref={setGroupContainer}>
      <ResizablePanelGroup
        orientation="horizontal"
        groupRef={groupRef}
        data-dragging={isDraggingDocHandle || isDraggingTerminalHandle || undefined}
      >
        <ResizablePanel
          minSize={terminalColumnPresent ? '5%' : '30%'}
          {...(editorAbsorbsResidual ? {} : { defaultSize: '100%' })}
          className={cn(
            !(isDraggingDocHandle || isDraggingTerminalHandle) &&
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
