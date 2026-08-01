/** Global and project integrations-settings IPC capability construction. */
import { homedir as osHomedir } from 'node:os';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { DesktopIpcBindings, DesktopIpcHandler } from './desktop-ipc-composition.ts';
import { getLogger } from './desktop-logger.ts';
import {
  registerIntegrationsSettingsIpc,
  registerProjectIntegrationsSettingsIpc,
} from './ipc/integrations-settings-registrar.ts';
import type { BrowserWindowLike } from './window-manager.ts';

interface DesktopIntegrationsIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerDesktopIntegrationsIpc({ bindings }: DesktopIntegrationsIpcDeps): void {
  const deps = {
    app,
    ipcMain,
    platform: process.platform,
    env: process.env,
    homeDir: osHomedir,
    getLogger,
    pathInstallLogger: bindings.pathInstallLogger,
    buildEnsureCliOnPathOpts: bindings.buildEnsureCliOnPathOpts,
    buildReclaimUserSkillsOpts: bindings.buildReclaimUserSkillsOpts,
    getWindowForWebContents: BrowserWindow.fromWebContents,
    getProjectPath: (window: BrowserWindow) =>
      bindings.getWindowManager()?.getContextForBrowserWindow(window as BrowserWindowLike)
        ?.projectPath,
  };
  registerIntegrationsSettingsIpc(deps);
  registerProjectIntegrationsSettingsIpc(deps);
}
