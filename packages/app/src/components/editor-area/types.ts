import type { PanelTab } from '@/components/DocPanel';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';

/** A terminal session host is owned above the movable editor layout. */
export interface TerminalPlacement {
  readonly container: HTMLElement | null;
  readonly isShowing: boolean;
  readonly dockPosition: TerminalDockPosition;
  readonly editorRegion: HTMLElement | null;
}

/** Public EditorArea contract; state and render ownership live below this facade. */
export interface EditorAreaProps {
  editorMode: 'wysiwyg' | 'source';
  onModeChange: (mode: 'wysiwyg' | 'source') => void;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  terminalBridge?: OkDesktopBridge | null;
  terminalVisible?: boolean;
  onTerminalVisibleChange?: (visible: boolean) => void;
  terminalDock?: TerminalDockPosition;
  onTerminalPlacement?: (placement: TerminalPlacement) => void;
}
