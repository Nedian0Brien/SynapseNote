import { useTheme } from 'next-themes';
import { DocPanel } from '@/components/DocPanel';
import { ResizableHandle, ResizablePanel } from '@/components/ui/resizable';
import { MIN_TERMINAL_WIDTH } from '@/lib/terminal-width-store';
import { cn } from '@/lib/utils';
import { xtermThemeForMode } from '../terminal-theme';
import { useEditorAreaState } from './EditorAreaStateProvider';

/** Render owner for the right-docked terminal/chat column. */
export function EditorAreaTerminalColumn() {
  const { resolvedTheme } = useTheme();
  const { props, rail, activeDocName, activeProvider, activeTarget } = useEditorAreaState();
  if (!rail.terminalColumnPresent) return null;
  const hasDocument =
    activeProvider != null &&
    activeDocName != null &&
    (activeTarget?.kind === 'doc' || activeTarget?.kind === 'missing');
  const isPdf = activeTarget?.kind === 'asset' && activeTarget.mediaKind === 'pdf';
  return (
    <>
      <ResizableHandle withHandle onPointerDown={rail.onTerminalHandlePointerDown} />
      <ResizablePanel
        id="terminal-column"
        panelRef={rail.terminalColumnPanelRef}
        style={{ backgroundColor: xtermThemeForMode(resolvedTheme).background }}
        defaultSize={`${rail.initialTerminalWidthPx}px`}
        minSize={`${MIN_TERMINAL_WIDTH}px`}
        maxSize="95%"
        collapsible
        collapsedSize={0}
        onResize={rail.onTerminalPanelResize}
        className={cn(
          'flex flex-col',
          !rail.isDraggingTerminalHandle &&
            'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0',
        )}
      >
        <DocPanel
          docName={hasDocument ? activeDocName : null}
          isSourceMode={props.editorMode === 'source'}
          activeTab={props.activeTab}
          onActiveTabChange={props.onActiveTabChange}
          mode="doc"
          surface={isPdf ? 'pdf' : 'document'}
          showChatTab
          chatContent={
            <div
              ref={rail.setRightTerminalContainer}
              data-testid="right-chat-host"
              className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background"
            />
          }
        />
      </ResizablePanel>
    </>
  );
}
