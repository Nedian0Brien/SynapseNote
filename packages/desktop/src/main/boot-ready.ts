import type { App, BrowserWindow } from 'electron';
import type { EntryPoint } from '../shared/entry-point.ts';
import type { sendToRenderer } from '../shared/ipc-send.ts';
import type { buildAboutPanelOptions } from './about-panel.ts';
import type { StartAutoUpdaterHandle } from './auto-updater.ts';
import type { BootProtocolControl } from './boot-protocol.ts';
import type { resolveBootRestoreDecision } from './boot-restore-decision.ts';
import type { getLogger } from './desktop-logger.ts';
import type { AppState, SchemaIncompatibilityDiagnostic } from './state-store.ts';
import type { ShareDeepLinkBranchSwitchPayload, ShareNavigatorPayload } from './url-scheme.ts';
import type { migrateLegacyUserDataDir } from './userdata-migration.ts';
import type { BrowserWindowLike } from './window-manager.ts';

interface AppStateStore {
  get: () => AppState;
  set: (state: AppState) => void;
  save: (state: AppState) => boolean;
}

interface WindowManagerForBootRestore {
  getWindowFor: (projectPath: string) =>
    | {
        window: BrowserWindowLike;
      }
    | undefined;
  focusWindowForProject: (projectPath: string) => unknown;
}

type OpenProjectOrFallbackToNavigator = (
  projectPath: string,
  entryPoint: EntryPoint,
  pendingDeepLinkTarget?: { kind: 'doc' | 'folder'; path: string },
  pendingBranch?: string | null,
  pendingMultiCandidate?: boolean,
  pendingShareBranchSwitch?: ShareDeepLinkBranchSwitchPayload,
  pendingTargetMissing?: boolean,
) => Promise<void>;

export interface BootReadyDeps {
  app: App;
  browserWindows: Pick<typeof BrowserWindow, 'getFocusedWindow' | 'getAllWindows'>;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  argv: readonly string[];
  startupWaterfall: { mark: (mark: 'appReady' | 'bootstrapDone') => void; otelEnabled: boolean };
  beginRoot: () => boolean;
  migrateLegacyUserDataDir: typeof migrateLegacyUserDataDir;
  getLogger: typeof getLogger;
  buildAboutPanelOptions: typeof buildAboutPanelOptions;
  runBootstrap: () => Promise<{
    appState: AppState;
    pendingSchemaIncompatibility: SchemaIncompatibilityDiagnostic | null;
  }>;
  state: AppStateStore;
  setPendingSchemaIncompatibility: (diagnostic: SchemaIncompatibilityDiagnostic | null) => void;
  sendToRenderer: typeof sendToRenderer;
  getAutoUpdaterHandle: () => StartAutoUpdaterHandle | null;
  armMcpWiring: () => void;
  startStartupReclaim: () => void;
  resolveBootRestoreDecision: typeof resolveBootRestoreDecision;
  pathExists: (path: string) => boolean;
  preflightGit: () => Promise<'ready' | 'aborted'>;
  openProjectOrFallbackToNavigator: OpenProjectOrFallbackToNavigator;
  getWindowManager: () => WindowManagerForBootRestore | null;
  openNavigator: (payload?: ShareNavigatorPayload) => void;
  reclaimUserSkillsOnLaunch: () => Promise<unknown>;
  bootAutoUpdater: () => Promise<void>;
  refreshApplicationMenu: () => void;
}

/** Run the ordered app-ready work after the protocol handlers are already armed. */
export async function runBootReady(
  deps: BootReadyDeps,
  protocol: BootProtocolControl,
): Promise<void> {
  deps.startupWaterfall.mark('appReady');
  deps.startupWaterfall.otelEnabled = deps.beginRoot();

  const userDataMigrationLog = deps.getLogger('userdata-migration');
  const userDataMigration = await deps.migrateLegacyUserDataDir({
    userDataDir: deps.app.getPath('userData'),
    platform: deps.platform,
    logger: { event: (payload) => userDataMigrationLog.info(payload, payload.event) },
  });
  if (userDataMigration.status === 'failed') {
    userDataMigrationLog.warn(
      { status: userDataMigration.status, error: userDataMigration.error },
      'userData migration failed; starting as first run',
    );
  }

  deps.app.setAboutPanelOptions(deps.buildAboutPanelOptions(deps.app.getVersion()));
  const bootstrap = await deps.runBootstrap();
  deps.state.set(bootstrap.appState);
  deps.setPendingSchemaIncompatibility(bootstrap.pendingSchemaIncompatibility);
  deps.startupWaterfall.mark('bootstrapDone');

  deps.app.on('browser-window-created', (_event, win) => {
    win.webContents.once('did-finish-load', () => {
      if (!(deps.app.isPackaged || deps.env.OK_UPDATER_FORCE_DEV === '1')) return;
      const pending = deps.state.get().versionPendingInstall;
      if (pending)
        deps.sendToRenderer(win.webContents, 'ok:update:downloaded', { version: pending });
      const whatsNew = deps.getAutoUpdaterHandle()?.getActiveWhatsNew();
      if (whatsNew) deps.sendToRenderer(win.webContents, 'ok:update:whats-new', whatsNew);
    });
  });

  deps.armMcpWiring();
  deps.startStartupReclaim();

  let appState = deps.state.get();
  const decision = await deps.resolveBootRestoreDecision({
    pendingRestore: appState.pendingWindowRestore,
    lastOpenedProject: appState.lastOpenedProject,
    optionHeld: deps.argv.includes('--navigator'),
    pathExists: deps.pathExists,
    urlLaunchOwnsWindow: protocol.urlLaunchOwnsWindow,
    waitForUrlLaunchSettled: protocol.waitForUrlLaunchSettled,
  });
  deps
    .getLogger('startup')
    .info(
      { urlLaunch: protocol.urlLaunchOwnsWindow(), action: decision.action },
      'boot-restore decision',
    );
  if (decision.clearSnapshot) {
    appState = { ...appState, pendingWindowRestore: null };
    deps.state.set(appState);
    if (!deps.state.save(appState)) {
      console.warn('[main] failed to persist cleared window-restore snapshot', {
        projectCount: decision.action === 'restore' ? decision.projects.length : 0,
      });
    }
  }

  const skipGitPreflight = decision.action === 'none' && protocol.singleFileLaunch();
  if (!skipGitPreflight && (await deps.preflightGit()) === 'aborted') {
    deps.app.quit();
    return;
  }

  if (decision.action === 'restore') {
    const opens = decision.projects.map((projectPath) =>
      deps.openProjectOrFallbackToNavigator(projectPath, 'recents'),
    );
    const lastActiveProject = decision.projects[decision.projects.length - 1];
    void Promise.allSettled(opens).then(() => {
      if (lastActiveProject === undefined) return;
      const context = deps.getWindowManager()?.getWindowFor(lastActiveProject);
      if (!context || context.window.isDestroyed?.() === true) return;
      const raise = () => {
        if (context.window.isDestroyed?.() !== true) {
          deps.getWindowManager()?.focusWindowForProject(lastActiveProject);
        }
      };
      if (context.window.isVisible?.() === true) raise();
      else (context.window as unknown as BrowserWindow).once('show', raise);
    });
  } else if (decision.action === 'lastOpened') {
    void deps.openProjectOrFallbackToNavigator(decision.project, 'recents');
  } else if (decision.action === 'navigator') {
    deps.openNavigator();
  } else {
    protocol.drainQueuedUrls();
  }

  void deps.reclaimUserSkillsOnLaunch().catch((err) => {
    console.warn('[main] user-skill reclaim failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  });
  await deps.bootAutoUpdater();
  deps.refreshApplicationMenu();
}
