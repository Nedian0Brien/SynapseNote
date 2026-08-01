/** Sender-window-scoped sharing posture IPC. */
import { BrowserWindow } from 'electron';
import type { DesktopIpcBindings, DesktopIpcHandler } from '../desktop-ipc-composition.ts';
import type { BrowserWindowLike } from '../window-manager.ts';
import { handleSharingSetMode, handleSharingStatus } from './sharing.ts';

interface SharingIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerSharingIpc({ handle, bindings }: SharingIpcDeps): void {
  handle('ok:sharing:dispatch', async (event, request) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('webContents has no parent BrowserWindow');
    const context = bindings
      .getWindowManager()
      ?.getContextForBrowserWindow(window as BrowserWindowLike);
    if (!context) throw new Error('No project context for this window');
    if (request.kind === 'status') return handleSharingStatus(context.projectPath);
    const mode = request.mode === 'local-only' ? 'local-only' : 'shared';
    return handleSharingSetMode(context.projectPath, mode);
  });
}
