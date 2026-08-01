/** Main-owned menu and theme adapters for the app-state IPC registrar. */
import { clipboard } from 'electron';
import type { DesktopIpcBindings, DesktopIpcHandler } from './desktop-ipc-composition.ts';
import { registerAppStateIpc } from './ipc/app-state-registrar.ts';

interface DesktopAppStateIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerDesktopAppStateIpc({ handle, bindings }: DesktopAppStateIpcDeps): void {
  registerAppStateIpc({
    handle,
    activeTargetChanged: bindings.activeTargetChanged,
    viewMenuStateChanged: bindings.viewMenuStateChanged,
    writeClipboard: clipboard.writeText,
    setThemeSource: bindings.setThemeSource,
    themeApplied: bindings.themeApplied,
    ingestRendererStartupMarks: bindings.ingestRendererStartupMarks,
  });
}
