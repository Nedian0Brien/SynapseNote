import { join } from 'node:path';
import type { App, BrowserWindow, CrashReporter } from 'electron';
import type { sendToRenderer } from '../shared/ipc-send.ts';
import type { CrashDetection } from './crash-detection.ts';
import type { getLogger } from './desktop-logger.ts';
import type { attachRendererConsoleCapture } from './renderer-console-capture.ts';

export interface BootPreReadyDeps {
  app: Pick<App, 'getPath' | 'on'>;
  browserWindows: Pick<typeof BrowserWindow, 'getFocusedWindow' | 'getAllWindows'>;
  crashReporter: CrashReporter;
  startLocalCrashReporter: (crashReporter: CrashReporter) => void;
  createCrashDetection: (
    opts: Parameters<typeof import('./crash-detection.ts').createCrashDetection>[0],
  ) => CrashDetection;
  setCrashDetection: (crashDetection: CrashDetection) => void;
  sendToRenderer: typeof sendToRenderer;
  getLogger: typeof getLogger;
  attachRendererConsoleCapture: typeof attachRendererConsoleCapture;
}

/** Install crash reporting and renderer listeners before Electron becomes ready. */
export function installBootPreReady(deps: BootPreReadyDeps): void {
  deps.startLocalCrashReporter(deps.crashReporter);
  const crashDetection = deps.createCrashDetection({
    sentinelPath: join(deps.app.getPath('userData'), 'bug-report-dirty-shutdown.json'),
    ackStorePath: join(deps.app.getPath('userData'), 'bug-report-crash-acks.json'),
    crashDumpsDir: deps.app.getPath('crashDumps'),
    emit: (event) => {
      const focused = deps.browserWindows.getFocusedWindow();
      const candidates = focused
        ? [focused, ...deps.browserWindows.getAllWindows()]
        : deps.browserWindows.getAllWindows();
      for (const win of candidates) {
        const contents = win.webContents;
        if (contents.isDestroyed() || contents.isCrashed() || contents.isLoading()) continue;
        deps.sendToRenderer(contents, 'ok:bug-report:crash-detected', event);
        return true;
      }
      return false;
    },
    now: () => new Date(),
    logger: deps.getLogger('crash-detection'),
  });
  deps.setCrashDetection(crashDetection);
  crashDetection.detectBootCrash();
  deps.app.on('child-process-gone', (_event, details) => {
    crashDetection.handleChildProcessGone(details);
  });

  deps.app.on('web-contents-created', (_event, contents) => {
    deps.attachRendererConsoleCapture(contents);
    contents.on('render-process-gone', (_event, details) => {
      crashDetection.handleRenderProcessGone(details);
    });
    const retryDelivery = () => crashDetection.notifyRendererReady();
    contents.on('did-finish-load', retryDelivery);
    contents.on('did-stop-loading', retryDelivery);
  });

  deps.app.on('accessibility-support-changed', (_event, screenReaderActive) => {
    for (const win of deps.browserWindows.getAllWindows()) {
      if (win.webContents.isDestroyed()) continue;
      deps.sendToRenderer(win.webContents, 'ok:accessibility:changed', { screenReaderActive });
    }
  });
}
