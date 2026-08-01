/** Persistent compatibility state and debug-only main IPC registration. */
import type { DesktopIpcBindings, DesktopIpcHandler } from '../desktop-ipc-composition.ts';
import { applyResetIncompatible, applyStateQuery } from '../update-state-handlers.ts';

interface StateDebugIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerStateDebugIpc({ handle, bindings }: StateDebugIpcDeps): void {
  const updateStateDeps = () => ({
    getAppState: bindings.getAppState,
    setAppState: bindings.setAppState,
    saveAppState: bindings.saveAppState,
    getBuildChannel: bindings.getBuildChannel,
    getPendingSchemaIncompatibility: bindings.getPendingSchemaIncompatibility,
    clearPendingSchemaIncompatibility: bindings.clearPendingSchemaIncompatibility,
  });
  handle('ok:state:reset-incompatible', async () => applyResetIncompatible(updateStateDeps()));
  handle('ok:state:query', async () => applyStateQuery(updateStateDeps()));
  handle('ok:debug:keyring-smoke', async (event) => bindings.requestKeyringSmoke(event.sender));
}
