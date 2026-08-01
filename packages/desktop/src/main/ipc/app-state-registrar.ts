/** Main-owned shell state channels: menu snapshots, theme, and startup marks. */
import type { IpcMainInvokeEvent } from 'electron';
import type { RequestChannels } from '../../shared/ipc-channels.ts';
import type { createHandler } from '../../shared/ipc-handler.ts';

export interface AppStateRegistrarDeps {
  readonly handle: ReturnType<typeof createHandler>;
  readonly activeTargetChanged: (
    target: RequestChannels['ok:editor:active-target-changed']['args'][0],
  ) => void;
  readonly viewMenuStateChanged: (
    event: IpcMainInvokeEvent,
    state: RequestChannels['ok:editor:view-menu-state-changed']['args'][0],
  ) => void;
  readonly writeClipboard: (text: string) => void;
  readonly setThemeSource: (
    source: RequestChannels['ok:theme:set-source']['args'][0]['source'],
  ) => { ok: true };
  readonly themeApplied: (
    event: IpcMainInvokeEvent,
    options: RequestChannels['ok:theme:applied']['args'][0],
  ) => void;
  readonly ingestRendererStartupMarks: (
    marks: RequestChannels['ok:startup:renderer-marks']['args'][0],
  ) => void;
}

export function registerAppStateIpc(deps: AppStateRegistrarDeps): void {
  deps.handle('ok:editor:active-target-changed', async (_event, target) => {
    deps.activeTargetChanged(target);
    return undefined;
  });
  deps.handle('ok:editor:view-menu-state-changed', async (event, state) => {
    deps.viewMenuStateChanged(event, state);
    return undefined;
  });
  deps.handle('ok:clipboard:write-text', async (_event, text) => {
    deps.writeClipboard(text);
    return undefined;
  });
  deps.handle('ok:theme:set-source', async (_event, request) =>
    deps.setThemeSource(request.source),
  );
  deps.handle('ok:theme:applied', async (event, options) => {
    deps.themeApplied(event, options);
    return undefined;
  });
  deps.handle('ok:startup:renderer-marks', async (_event, marks) => {
    if (Number.isFinite(marks?.pageListReadyMs) && Number.isFinite(marks?.firstContentMs)) {
      deps.ingestRendererStartupMarks(marks);
    }
    return undefined;
  });
}
