import type { App, BrowserWindow } from 'electron';
import type { CrashDetection } from './crash-detection.ts';
import type { getLogger } from './desktop-logger.ts';

interface Destroyable {
  destroy: () => void;
}

interface Stoppable {
  stop: () => void;
}

interface TerminalReaper {
  killAll: () => void;
}

interface WindowManagerForLifecycle {
  signalStopAllOwnedServers: () => void;
}

export interface BootLifecycleDeps {
  app: Pick<App, 'on' | 'quit'>;
  nativeAutoUpdater: { on: (event: 'before-quit-for-update', listener: () => void) => unknown };
  browserWindows: Pick<typeof BrowserWindow, 'getAllWindows'>;
  platform: NodeJS.Platform;
  getLogger: typeof getLogger;
  freezeFocusTracking: (reason: string) => void;
  emitStartupWaterfall: () => void;
  endRoot: () => void;
  flushDesktopLogger: () => void;
  getWindowManager: () => WindowManagerForLifecycle | null;
  getCrashDetection: () => CrashDetection | null;
  getTerminalReaper: () => TerminalReaper | null;
  clearDockVisibility: () => void;
  getAutoUpdaterHandle: () => Destroyable | null;
  clearAutoUpdaterHandle: () => void;
  getBundleReplaceWatcherHandle: () => Stoppable | null;
  clearBundleReplaceWatcherHandle: () => void;
  getMcpWiringHandle: () => Destroyable | null;
  clearMcpWiringHandle: () => void;
  openNavigator: () => void;
}

/** Register app shutdown and activation listeners after primary boot is armed. */
export function installBootLifecycle(deps: BootLifecycleDeps): void {
  deps.app.on('before-quit', () => {
    deps.getLogger('lifecycle').info({}, 'before-quit');
    deps.freezeFocusTracking('before-quit');
    deps.emitStartupWaterfall();
    deps.endRoot();
    deps.flushDesktopLogger();
  });

  deps.nativeAutoUpdater.on('before-quit-for-update', () => {
    deps
      .getLogger('updater')
      .info({}, 'before-quit-for-update — update install will relaunch the app');
    deps.freezeFocusTracking('before-quit-for-update');
    deps.getWindowManager()?.signalStopAllOwnedServers();
    deps.flushDesktopLogger();
  });

  deps.app.on('will-quit', () => {
    deps.getLogger('lifecycle').info({}, 'will-quit');
    deps.getCrashDetection()?.markCleanQuit();
    deps.getTerminalReaper()?.killAll();
    deps.clearDockVisibility();
    deps.getAutoUpdaterHandle()?.destroy();
    deps.clearAutoUpdaterHandle();
    deps.getBundleReplaceWatcherHandle()?.stop();
    deps.clearBundleReplaceWatcherHandle();
    deps.getMcpWiringHandle()?.destroy();
    deps.clearMcpWiringHandle();
    deps.flushDesktopLogger();
  });

  deps.app.on('window-all-closed', () => {
    if (deps.platform !== 'darwin') deps.app.quit();
  });

  deps.app.on('activate', () => {
    if (deps.browserWindows.getAllWindows().length === 0) deps.openNavigator();
  });
}
