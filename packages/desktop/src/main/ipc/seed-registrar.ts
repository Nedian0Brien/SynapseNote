/** Sender-project-scoped seed planning and application IPC. */
import { BrowserWindow } from 'electron';
import type { DesktopIpcBindings, DesktopIpcHandler } from '../desktop-ipc-composition.ts';
import { logIpcError } from '../ipc-log.ts';
import type { BrowserWindowLike } from '../window-manager.ts';
import { handleSeedApply, handleSeedListPacks, handleSeedPlan } from './seed.ts';

interface SeedIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerSeedIpc({ handle, bindings }: SeedIpcDeps): void {
  const resolveProjectRoot = (event: Electron.IpcMainInvokeEvent): string | undefined => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window
      ? bindings.getWindowManager()?.getContextForBrowserWindow(window as BrowserWindowLike)
          ?.projectPath
      : undefined;
  };
  handle('ok:seed:plan', async (event, options) => {
    const result = await handleSeedPlan(
      { resolveProjectRoot: () => resolveProjectRoot(event) },
      options,
    );
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:seed:plan',
        reason: result.error.kind,
        handler: 'handleSeedPlan',
        cause: { message: result.error.message },
      });
    }
    return result;
  });
  handle('ok:seed:apply', async (event, plan, options) => {
    const result = await handleSeedApply(
      { resolveProjectRoot: () => resolveProjectRoot(event) },
      plan,
      options,
    );
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:seed:apply',
        reason: result.error.kind,
        handler: 'handleSeedApply',
        cause: { message: result.error.message },
      });
    }
    return result;
  });
  handle('ok:seed:list-packs', async () => handleSeedListPacks());
}
