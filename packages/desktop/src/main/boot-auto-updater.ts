import { dirname, join } from 'node:path';
import type { App, BrowserWindow, Dialog, IpcMain } from 'electron';
import type { bootAutoUpdater, StartAutoUpdaterHandle } from './auto-updater.ts';
import type {
  BundleReplaceWatcherHandle,
  startBundleReplaceWatcher,
} from './bundle-replace-detector.ts';
import type { getLogger } from './desktop-logger.ts';
import type { AppState, UpdateChannel } from './state-store.ts';
import type { WindowManager } from './window-manager.ts';
import { sortByFocusSequence } from './window-placement.ts';

interface AppStateStore {
  get: () => AppState;
  set: (state: AppState) => void;
  save: (state: AppState) => boolean;
}

export interface BootAutoUpdaterDeps {
  app: App;
  browserWindows: Pick<typeof BrowserWindow, 'getFocusedWindow' | 'getAllWindows'>;
  dialog: Dialog;
  ipcMain: IpcMain;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  bootAutoUpdater: typeof bootAutoUpdater;
  getLogger: typeof getLogger;
  state: AppStateStore;
  getWindowManager: () => WindowManager | null;
  projectFocusSeq: ReadonlyMap<string, number>;
  freezeFocusTracking: (reason: string) => void;
  flushDesktopLogger: () => void;
  setAutoUpdaterHandle: (handle: StartAutoUpdaterHandle | null) => void;
  startBundleReplaceWatcher: typeof startBundleReplaceWatcher;
  setBundleReplaceWatcherHandle: (handle: BundleReplaceWatcherHandle | null) => void;
}

/** Start updates after a window path is selected, then arm drag-replace detection. */
export async function bootAutoUpdaterForPrimaryInstance(deps: BootAutoUpdaterDeps): Promise<void> {
  const handle = await deps.bootAutoUpdater(() => import('electron-updater'), {
    logger: {
      info: (msg: string, ctx?: object) =>
        deps.getLogger('updater').info((ctx ?? {}) as Record<string, unknown>, msg),
      warn: (msg: string, ctx?: object) =>
        deps.getLogger('updater').warn((ctx ?? {}) as Record<string, unknown>, msg),
      error: (msg: string, ctx?: object) =>
        deps.getLogger('updater').error((ctx ?? {}) as Record<string, unknown>, msg),
      debug: (msg: string, ctx?: object) =>
        deps.getLogger('updater').debug((ctx ?? {}) as Record<string, unknown>, msg),
    },
    ipcMain: deps.ipcMain,
    readState: deps.state.get,
    writeState: (next) => {
      const previous = deps.state.get();
      deps.state.set(next);
      if (!deps.state.save(next)) {
        deps.state.set(previous);
        throw new Error('saveAppState failed — rolled back in-memory state');
      }
    },
    getPrimaryWindow: () =>
      deps.browserWindows.getFocusedWindow() ?? deps.browserWindows.getAllWindows()[0] ?? null,
    getAllWindows: () => deps.browserWindows.getAllWindows(),
    getAppVersion: () => deps.app.getVersion(),
    isPackaged: deps.app.isPackaged,
    forceDevBypass: deps.env.OK_UPDATER_FORCE_DEV === '1',
    feedUrl: deps.env.OK_UPDATER_FEED_URL || undefined,
    proxyFeed: {
      base: 'https://synapse.lawdigest.kr/updates',
      channels: new Set<UpdateChannel>(['beta', 'latest']),
    },
    whenRendererReady: (fn) => {
      const tryFire = (win: BrowserWindow): void => {
        if (win.webContents.isLoading() || win.webContents.getURL() === '') {
          win.webContents.once('did-finish-load', fn);
        } else {
          fn();
        }
      };
      const existing =
        deps.browserWindows.getFocusedWindow() ?? deps.browserWindows.getAllWindows()[0];
      if (existing) {
        tryFire(existing);
        return;
      }
      deps.app.once('browser-window-created', (_event, createdWin) => {
        tryFire(createdWin);
      });
    },
    prepareForRelaunch: async () => {
      deps.freezeFocusTracking('prepare-for-relaunch');
      const openProjects = sortByFocusSequence(
        deps.getWindowManager()?.getOpenProjectPaths() ?? [],
        deps.projectFocusSeq,
      );
      const next = { ...deps.state.get(), pendingWindowRestore: openProjects };
      deps.state.set(next);
      if (!deps.state.save(next)) {
        console.warn('[main] failed to persist window-restore snapshot before relaunch', {
          projectCount: openProjects.length,
        });
      }
      await deps.getWindowManager()?.stopAllOwnedServers();
      deps.flushDesktopLogger();
    },
    showCheckNowResult: (result) => {
      const target =
        deps.browserWindows.getFocusedWindow() ?? deps.browserWindows.getAllWindows()[0];
      if (!target) return;
      if (result.kind === 'not-available') {
        void deps.dialog.showMessageBox(target, {
          type: 'info',
          buttons: ['OK'],
          defaultId: 0,
          title: 'Up to Date',
          message: "You're on the latest version of SynapseNote.",
          detail: `SynapseNote ${result.currentVersion} is the most current version available.`,
        });
      } else if (result.kind === 'available') {
        void deps.dialog.showMessageBox(target, {
          type: 'info',
          buttons: ['OK'],
          defaultId: 0,
          title: 'Update Available',
          message: `SynapseNote ${result.latestVersion} is available.`,
          detail:
            "It's downloading in the background. You'll be prompted to relaunch when the install is ready.",
        });
      } else {
        void deps.dialog.showMessageBox(target, {
          type: 'warning',
          buttons: ['OK'],
          defaultId: 0,
          title: "Couldn't Check for Updates",
          message: "SynapseNote couldn't check for updates right now.",
          detail: result.message,
        });
      }
    },
  });
  deps.setAutoUpdaterHandle(handle);

  if (deps.platform === 'darwin' && deps.app.isPackaged) {
    const exePath = deps.app.getPath('exe');
    deps.setBundleReplaceWatcherHandle(
      deps.startBundleReplaceWatcher({
        infoPlistPath: join(dirname(dirname(exePath)), 'Info.plist'),
        getCurrentVersion: () => deps.app.getVersion(),
        dialog: deps.dialog,
        app: deps.app,
      }),
    );
  }
}
