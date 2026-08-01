/**
 * Typed `ipcMain.handle` wrapper (main-side usage).
 *
 * Consumers: `packages/desktop/src/main/ipc-main.ts` or equivalent — the
 * main-process entry where request handlers live. The Biome GritQL rule
 * `no-loosely-typed-webcontents-ipc` forbids raw `ipcMain.handle` outside
 * allowlisted IPC wrapper files; this helper is the canonical path.
 */

import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { RequestChannels } from './ipc-channels.ts';

/**
 * Per-channel boundary parser for renderer-controlled Electron arguments.
 *
 * Keep schemas with their owning registrar. This adapter only guarantees that
 * a registrar parser runs before the typed handler receives its tuple.
 */
export interface IpcHandlerValidation<K extends keyof RequestChannels> {
  readonly parse: (rawArgs: readonly unknown[]) => RequestChannels[K]['args'] | undefined;
  readonly onInvalid: (
    event: IpcMainInvokeEvent,
    rawArgs: readonly unknown[],
  ) => RequestChannels[K]['result'] | Promise<RequestChannels[K]['result']>;
}

/**
 * Build a typed registrar bound to an `ipcMain` instance.
 *
 * Usage:
 * ```ts
 * const register = createHandler(ipcMain);
 * register('ok:dialog:open-folder', async (_event) => {
 *   const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
 *   return r.canceled ? null : (r.filePaths[0] ?? null);
 * });
 * ```
 *
 * The handler receives the full `IpcMainInvokeEvent` as its first arg so
 * handlers can access `event.sender` (webContents) when needed.
 */
export function createHandler(ipc: IpcMain) {
  return <K extends keyof RequestChannels>(
    channel: K,
    handler: (
      event: IpcMainInvokeEvent,
      ...args: RequestChannels[K]['args']
    ) => RequestChannels[K]['result'] | Promise<RequestChannels[K]['result']>,
    validation?: IpcHandlerValidation<K>,
  ): void => {
    ipc.handle(channel, (event, ...rawArgs: unknown[]) => {
      if (validation) {
        const args = validation.parse(rawArgs);
        return args === undefined
          ? validation.onInvalid(event, rawArgs)
          : handler(event, ...args);
      }
      return handler(event, ...(rawArgs as RequestChannels[K]['args']));
    });
  };
}
