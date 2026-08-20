import { type SendableWebContents, sendToRenderer } from '../shared/ipc-send.ts';

interface AppCommandEventLike {
  preventDefault(): void;
}

export interface AppCommandWindowLike {
  on(event: 'app-command', listener: (event: AppCommandEventLike, command: string) => void): void;
  webContents: SendableWebContents;
}

/**
 * Forward Electron's Windows/Linux mouse Back/Forward app commands to the
 * renderer-owned content history. Chromium's navigation history is a different
 * stack because SynapseNote intentionally replaces some hash routes.
 */
export function attachDesktopNavigationCommands(window: AppCommandWindowLike): void {
  window.on('app-command', (event, command) => {
    const action =
      command === 'browser-backward'
        ? 'navigate-back'
        : command === 'browser-forward'
          ? 'navigate-forward'
          : null;
    if (action === null) return;

    event.preventDefault();
    sendToRenderer(window.webContents, 'ok:menu-action', action);
  });
}
