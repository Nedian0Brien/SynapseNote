import { Trans } from '@lingui/react/macro';
import { lazy, type ReactNode, Suspense } from 'react';
import { DocPanel } from '@/components/DocPanel';
import { ResizableHandle, ResizablePanel } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { useEditorAreaState } from './EditorAreaStateProvider';
import { DOC_PANEL_MAX_SIZE, DOC_PANEL_MIN_SIZE } from './useEditorAreaRightRail';

const LazyActivityModeContent = lazy(async () => {
  const mod = await import('@/components/ActivityModeContent');
  return { default: mod.ActivityModeContent };
});

function RightPanelFrame({ children }: { children: ReactNode }) {
  const { rail } = useEditorAreaState();
  return (
    <>
      <ResizableHandle
        withHandle={!rail.isCollapsed}
        disabled={rail.isCollapsed}
        onPointerDown={rail.onDocPanelHandlePointerDown}
      />
      <ResizablePanel
        id="doc-panel"
        panelRef={rail.panelRef}
        defaultSize={rail.initialRightCollapsed ? 0 : `${rail.initialDocPanelWidthPx}px`}
        minSize={DOC_PANEL_MIN_SIZE}
        maxSize={DOC_PANEL_MAX_SIZE}
        collapsible
        collapsedSize={0}
        onResize={rail.onDocPanelResize}
        inert={rail.isCollapsed}
        className={cn(
          'flex flex-col bg-muted/20',
          !rail.isDraggingDocHandle &&
            'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0',
        )}
      >
        {children}
      </ResizablePanel>
    </>
  );
}

/** Render owner for a document's timeline, document tools, and agent panel. */
export function EditorAreaDocumentRightPanel() {
  const { props, rail, activeDocName, docPanelMode } = useEditorAreaState();
  if (rail.terminalColumnPresent) return null;
  return (
    <RightPanelFrame>
      <DocPanel
        docName={activeDocName}
        isSourceMode={props.editorMode === 'source'}
        activeTab={props.activeTab}
        onActiveTabChange={props.onActiveTabChange}
        mode={docPanelMode}
        showChatTab={props.terminalBridge != null}
      />
    </RightPanelFrame>
  );
}

/** Render owner for the PDF document-information rail and its portal host. */
export function EditorAreaPdfRightPanel() {
  const { props, rail } = useEditorAreaState();
  const { setPdfPanelContainer, terminalColumnPresent } = rail;
  if (terminalColumnPresent) return null;
  const activePdfPanelTab =
    props.activeTab === 'pages' ||
    props.activeTab === 'annotations' ||
    props.activeTab === 'outline' ||
    props.activeTab === 'links'
      ? props.activeTab
      : 'pages';
  return (
    <RightPanelFrame>
      <DocPanel
        docName={null}
        isSourceMode={false}
        activeTab={props.activeTab}
        onActiveTabChange={props.onActiveTabChange}
        mode="doc"
        surface="pdf"
        showChatTab={props.terminalBridge != null}
        pdfContent={
          <div
            ref={setPdfPanelContainer}
            data-testid="pdf-panel-host"
            data-panel-tab={activePdfPanelTab}
            className="h-full min-h-0 overflow-hidden bg-background"
          />
        }
      />
    </RightPanelFrame>
  );
}

/** Render owner for the optional activity rail on folder overview. */
export function EditorAreaFolderAgentPanel() {
  const { rail, docPanelMode, docPanelAgentId } = useEditorAreaState();
  if (rail.terminalColumnPresent || docPanelMode !== 'agent' || docPanelAgentId === null)
    return null;
  return (
    <>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="agent-panel"
        defaultSize="25%"
        minSize="300px"
        maxSize="40%"
        className="flex flex-col bg-muted/20"
      >
        <Suspense
          fallback={
            <div
              role="status"
              aria-busy="true"
              className="flex h-full items-center justify-center text-sm text-muted-foreground"
            >
              <Trans>Loading agent activity</Trans>
            </div>
          }
        >
          <LazyActivityModeContent showBackButton={false} />
        </Suspense>
      </ResizablePanel>
    </>
  );
}

/** Preserves the document panel identity across mid-session cold navigation. */
export function EditorAreaSkeletonRightPanel() {
  const { rail } = useEditorAreaState();
  if (rail.terminalColumnPresent) return null;
  return (
    <>
      <ResizableHandle withHandle disabled />
      <ResizablePanel
        id="doc-panel"
        defaultSize={rail.initialRightCollapsed ? 0 : `${rail.initialDocPanelWidthPx}px`}
        minSize={DOC_PANEL_MIN_SIZE}
        maxSize={DOC_PANEL_MAX_SIZE}
        collapsible
        collapsedSize={0}
        inert
        className="flex flex-col bg-muted/20"
      >
        <div className="min-h-0 flex-1" />
      </ResizablePanel>
    </>
  );
}
