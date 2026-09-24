import type { App, BrowserWindow } from 'electron';
import type { EntryPoint } from '../shared/entry-point.ts';
import type { sendToRenderer } from '../shared/ipc-send.ts';
import type { checkTargetExists } from './check-target-exists.ts';
import type { resolveShareTarget } from './resolve-share-target.ts';
import type { AppState, annotateMissing } from './state-store.ts';
import type {
  registerProtocolHandler,
  ScreenTarget,
  ShareDeepLinkBranchSwitchPayload,
  ShareNavigatorPayload,
} from './url-scheme.ts';
import type { BrowserWindowLike } from './window-manager.ts';

type PendingDeepLinkTarget = { kind: 'doc' | 'folder'; path: string };
export type BootProtocolControl = ReturnType<typeof registerProtocolHandler>;

interface WindowManagerForProtocol {
  focusWindowForProject: (projectPath: string) => BrowserWindowLike | null;
  getWindowFor: (projectPath: string) => { window: BrowserWindowLike } | undefined;
}

export interface BootProtocolDeps {
  app: Pick<
    App,
    | 'on'
    | 'whenReady'
    | 'isPackaged'
    | 'setAsDefaultProtocolClient'
    | 'removeAsDefaultProtocolClient'
  >;
  browserWindows: Pick<typeof BrowserWindow, 'getFocusedWindow' | 'getAllWindows'>;
  registerProtocolHandler: typeof registerProtocolHandler;
  getWindowManager: () => WindowManagerForProtocol | null;
  openProjectOrFallbackToNavigator: (
    projectPath: string,
    entryPoint: EntryPoint,
    pendingDeepLinkTarget?: PendingDeepLinkTarget,
    pendingBranch?: string | null,
    pendingMultiCandidate?: boolean,
    pendingShareBranchSwitch?: ShareDeepLinkBranchSwitchPayload,
    pendingTargetMissing?: boolean,
  ) => Promise<void>;
  openEphemeralFile: (filePath: string) => Promise<void>;
  sendToRenderer: typeof sendToRenderer;
  resolveShareTarget: typeof resolveShareTarget;
  getAppState: () => AppState;
  annotateMissing: typeof annotateMissing;
  checkShareTargetExists: typeof checkTargetExists;
  openNavigator: (payload?: ShareNavigatorPayload) => void;
  initialArgv: readonly string[];
  console: Pick<Console, 'info' | 'warn'>;
}

/** Register URL routing synchronously, before Electron can deliver cold-start events. */
export function registerBootProtocol(deps: BootProtocolDeps): BootProtocolControl {
  return deps.registerProtocolHandler({
    app: {
      on: (event, callback) => {
        deps.app.on(
          event as Parameters<typeof deps.app.on>[0],
          callback as Parameters<typeof deps.app.on>[1],
        );
      },
      whenReady: () => deps.app.whenReady(),
      isPackaged: deps.app.isPackaged,
      setAsDefaultProtocolClient: (scheme) => deps.app.setAsDefaultProtocolClient(scheme),
      removeAsDefaultProtocolClient: (scheme) => deps.app.removeAsDefaultProtocolClient(scheme),
    },
    focusWindowForProject: (projectPath) =>
      deps.getWindowManager()?.focusWindowForProject(projectPath) ?? null,
    openProject: async (projectPath, options) => {
      await deps.openProjectOrFallbackToNavigator(
        projectPath,
        'deep-link',
        options?.pendingDeepLinkTarget,
        options?.pendingBranch,
        options?.pendingMultiCandidate,
        options?.pendingShareBranchSwitch,
        options?.pendingTargetMissing,
      );
      return deps.getWindowManager()?.getWindowFor(projectPath)?.window ?? null;
    },
    openEphemeralFile: deps.openEphemeralFile,
    sendDeepLink: (win, payload) => {
      deps.sendToRenderer((win as BrowserWindowLike).webContents, 'ok:deep-link', payload);
    },
    sendShareDeepLink: (win, payload) => {
      deps.sendToRenderer((win as BrowserWindowLike).webContents, 'ok:share:received', payload);
    },
    resolveShareTarget: (share) =>
      deps.resolveShareTarget(share, {
        listRecent: () => deps.annotateMissing(deps.getAppState()),
      }),
    checkShareTargetExists: deps.checkShareTargetExists,
    routeShareToNavigator: deps.openNavigator,
    openScreen: (win, screen) => {
      const hashByScreen: Record<ScreenTarget, string> = {
        settings: '#settings',
        'install-claude': '#install-claude-desktop',
      };
      (win as BrowserWindowLike).webContents.executeJavaScript(
        `window.location.hash = '${hashByScreen[screen]}'; undefined`,
      );
    },
    getFocusedWindow: () => deps.browserWindows.getFocusedWindow() ?? null,
    getAnyReadyWindow: () => deps.browserWindows.getAllWindows()[0] ?? null,
    getInitialArgv: () => deps.initialArgv,
    log: {
      warn: (obj, msg) => deps.console.warn(msg, obj),
      info: (obj, msg) => deps.console.info(msg, obj),
    },
  });
}
