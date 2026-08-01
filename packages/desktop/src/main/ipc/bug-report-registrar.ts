/** Sender-context bug-report IPC composition. */
import { release as osRelease } from 'node:os';
import { dirname } from 'node:path';
import { defaultBugReportZipPath } from '@nedian0brien/synapsenote';
import { app, BrowserWindow } from 'electron';
import { channelFromVersion } from '../auto-updater.ts';
import type { DesktopIpcBindings, DesktopIpcHandler } from '../desktop-ipc-composition.ts';
import { getLogger } from '../desktop-logger.ts';
import type { BrowserWindowLike } from '../window-manager.ts';
import {
  handleBugReportCrashAck,
  handleBugReportCreate,
  handleBugReportSend,
} from './bug-report.ts';

interface BugReportIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerBugReportIpc({ handle, bindings }: BugReportIpcDeps): void {
  handle('ok:bug-report:dispatch', async (event, request) => {
    if (request.kind === 'crash-ack') {
      return handleBugReportCrashAck(
        { ackCrashEvent: (eventId) => bindings.getCrashDetection()?.ack(eventId) },
        request,
      );
    }
    if (request.kind === 'send') {
      return handleBugReportSend(
        {
          intakeBaseUrl: process.env.OK_BUG_REPORT_INTAKE_URL,
          appVersion: app.getVersion(),
          platform: `${process.platform} ${osRelease()}`,
          bugReportsRoot: dirname(defaultBugReportZipPath()),
        },
        request,
      );
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const context = window
      ? bindings.getWindowManager()?.getContextForBrowserWindow(window as BrowserWindowLike)
      : null;
    return handleBugReportCreate(
      {
        projectDir: context?.projectPath ?? null,
        desktopMeta: {
          version: app.getVersion(),
          packaged: app.isPackaged,
          channel: channelFromVersion(app.getVersion()),
        },
        newestMinidumpPath: () => bindings.getCrashDetection()?.newestMinidumpPath() ?? null,
        logger: getLogger('bug-report'),
      },
      request,
    );
  });
}
