/** Startup-reclaim notification delivery and File-menu dispatch target selection. */
import { app, BrowserWindow } from 'electron';
import { sendToRenderer } from '../shared/ipc-send.ts';
import type { McpStartupRepairResult, McpWiringDispatchTarget } from './mcp-wiring.ts';
import { computePathLeg, type EnsureCliOnPathResult } from './path-install.ts';

export function pickLoadedRendererForMcpDialog(): McpWiringDispatchTarget | undefined {
  const isUsable = (window: BrowserWindow): boolean =>
    !window.isDestroyed() && !window.webContents.isLoading();
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && isUsable(focused)) return focused.webContents;
  return BrowserWindow.getAllWindows().find(isUsable)?.webContents;
}

export function dispatchStartupReclaimToastWhenReady(results: {
  readonly mcp: McpStartupRepairResult;
  readonly path: EnsureCliOnPathResult;
}): void {
  const path = computePathLeg(results.path);
  const mcp = results.mcp;
  if (mcp.status === 'failed') {
    dispatchToastWhenReady({
      kind: 'startup-reclaim',
      mcp: { status: 'failed', editors: mcp.failedEditors.map((failure) => failure.editor) },
      path,
    });
    return;
  }
  const repaired = mcp.status === 'repaired';
  if (!repaired && path.status === 'none') return;
  dispatchToastWhenReady({
    kind: 'startup-reclaim',
    mcp: repaired ? { status: 'repaired', editors: mcp.repairedEditors } : { status: 'none' },
    path,
  });
}

type StartupReclaimToast = {
  readonly kind: 'startup-reclaim';
  readonly mcp:
    | { readonly status: 'none' }
    | { readonly status: 'repaired'; readonly editors: readonly string[] }
    | { readonly status: 'failed'; readonly editors: readonly string[] };
  readonly path:
    | { readonly status: 'none' }
    | { readonly status: 'installed'; readonly summary: string }
    | { readonly status: 'failed'; readonly summary: string };
};

function dispatchToastWhenReady(payload: StartupReclaimToast): void {
  let dispatched = false;
  const send = (window: Electron.BrowserWindow): void => {
    if (dispatched || window.isDestroyed()) return;
    try {
      sendToRenderer(window.webContents, 'ok:onboarding:toast', payload);
      dispatched = true;
    } catch (error) {
      console.warn('[main] startup reclaim toast send failed', {
        err: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const tryDispatch = (window: Electron.BrowserWindow): void => {
    if (dispatched || window.isDestroyed()) return;
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', () => send(window));
      return;
    }
    send(window);
  };
  for (const window of BrowserWindow.getAllWindows()) {
    tryDispatch(window);
    if (dispatched) return;
  }
  const onCreated = (_event: Electron.Event, window: Electron.BrowserWindow) => {
    window.webContents.once('did-finish-load', () => {
      send(window);
      if (dispatched) app.off('browser-window-created', onCreated);
    });
  };
  app.on('browser-window-created', onCreated);
  setTimeout(() => app.off('browser-window-created', onCreated), 60_000);
}
