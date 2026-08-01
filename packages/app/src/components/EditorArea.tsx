import { ProfilerBoundary } from '@/lib/perf';
import { EditorAreaLayout } from './editor-area/EditorAreaLayout';
import { EditorAreaStateProvider } from './editor-area/EditorAreaStateProvider';
import { SettingsDialogPortal } from './editor-area/SettingsDialogPortal';
import type { EditorAreaProps } from './editor-area/types';
import { PropertyProvider } from './PropertyContext';

export type { TerminalPlacement } from './editor-area/types';

/**
 * Public editor-area facade. State ownership lives in EditorAreaStateProvider;
 * active-target, right-rail, and layout rendering each live in focused leaves.
 */
export function EditorArea(props: EditorAreaProps) {
  return (
    <ProfilerBoundary name="editor-area">
      <PropertyProvider>
        <EditorAreaStateProvider {...props}>
          <EditorAreaLayout />
        </EditorAreaStateProvider>
        <SettingsDialogPortal />
      </PropertyProvider>
    </ProfilerBoundary>
  );
}
