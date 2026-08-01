/** Native file-picker and destructive shell IPC, scoped to the sender window. */

import { realpathSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { classifyFsPath, normalizeFsPath, withSpan } from '@nedian0brien/synapsenote-server';
import { BrowserWindow, dialog, shell } from 'electron';
import type { DesktopIpcBindings, DesktopIpcHandler } from '../desktop-ipc-composition.ts';
import { promptForExistingFolder } from '../dialog-helpers.ts';
import { trashItem } from '../ipc-handlers.ts';
import { recordTrashItemDuration, recordTrashItemFailure } from '../shell-trash-telemetry.ts';
import type { BrowserWindowLike } from '../window-manager.ts';

interface NativeShellIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerNativeShellIpc({ handle, bindings }: NativeShellIpcDeps): void {
  handle('ok:dialog:open-folder', async (_event, options) =>
    promptForExistingFolder(dialog, options),
  );
  handle('ok:shell:trash-item', async (event, absolutePath) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const projectPath = window
      ? bindings.getWindowManager()?.getContextForBrowserWindow(window as BrowserWindowLike)
          ?.projectPath
      : undefined;
    const startedAt = performance.now();
    const result = await withSpan(
      'ok.shell.trash_item',
      {
        attributes: {
          'ok.shell.path': normalizeFsPath(absolutePath),
          'ok.shell.path.role': classifyFsPath(absolutePath),
        },
      },
      async (span) => {
        const outcome = await trashItem(
          {
            platform: process.platform,
            projectPath,
            realpath: realpathSync,
            trashItem: (path) => shell.trashItem(path),
          },
          absolutePath,
        );
        span.setAttribute('ok.shell.outcome', outcome.ok ? 'ok' : 'failure');
        if (!outcome.ok) span.setAttribute('ok.shell.reason', outcome.reason);
        return outcome;
      },
    );
    recordTrashItemDuration(performance.now() - startedAt, result.ok ? 'ok' : 'failure');
    if (!result.ok) {
      recordTrashItemFailure(result.reason);
      console.warn('[main] trash-item refused', { reason: result.reason, detail: result.detail });
    }
    return result;
  });
}
