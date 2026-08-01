/** Electron capability adapters for the project-scoped asset IPC registrar. */
import { spawn } from 'node:child_process';
import { promises as fsPromises, statSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import { basename } from 'node:path';
import { defaultBugReportZipPath } from '@nedian0brien/synapsenote';
import type { MessageBoxOptions } from 'electron';
import { app, BrowserWindow, clipboard, dialog, Menu, shell } from 'electron';
import { openAssetSafely, revealAssetSafely } from './asset-allowlist.ts';
import { popAssetMenu } from './asset-menu.ts';
import type { DesktopIpcBindings, DesktopIpcHandler } from './desktop-ipc-composition.ts';
import { registerAssetIpcHandlers } from './ipc/asset-registrar.ts';
import { detectProtocol, recordHandoff, showItemInFolder, spawnCursor } from './ipc-handlers.ts';
import { logIpcError } from './ipc-log.ts';
import { savePdfAssetSafely } from './pdf-asset-save.ts';
import { exportWebContentsToPdf } from './pdf-export.ts';
import { handleRevealExternal } from './reveal-external.ts';
import { fetchWebPreviewMetadata } from './web-preview-metadata.ts';
import type { BrowserWindowLike } from './window-manager.ts';

interface DesktopAssetIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerDesktopAssetIpc({ handle, bindings }: DesktopAssetIpcDeps): void {
  registerAssetIpcHandlers({
    register: handle as unknown as import('./ipc/asset-registrar.ts').AssetIpcRegistrar,
    platform: process.platform,
    getWindowForWebContents: (sender) =>
      BrowserWindow.fromWebContents(sender as Electron.WebContents) ?? undefined,
    getProjectPath: (window) =>
      bindings.getWindowManager()?.getContextForBrowserWindow(window as BrowserWindowLike)
        ?.projectPath,
    openExternal: (url) => shell.openExternal(url),
    fetchWebPreviewMetadata,
    detectProtocol: (scheme) =>
      detectProtocol(
        {
          platform: process.platform,
          getApplicationInfoForProtocol: (url) => app.getApplicationInfoForProtocol(url),
        },
        scheme,
      ),
    spawnCursor: async (projectPath, path) =>
      spawnCursor(
        {
          platform: process.platform,
          projectPath,
          getApplicationInfoForProtocol: (url) => app.getApplicationInfoForProtocol(url),
          spawn: (command, args, timeout) =>
            new Promise((resolve) => {
              try {
                const child = spawn(command, [...args], {
                  shell: false,
                  timeout,
                  stdio: ['ignore', 'ignore', 'pipe'],
                });
                child.stderr?.on('data', () => {});
                child.once('spawn', () => resolve({ ok: true }));
                child.once('error', () => resolve({ ok: false, reason: 'spawn-error' }));
              } catch {
                resolve({ ok: false, reason: 'spawn-error' });
              }
            }),
        },
        path,
      ),
    recordHandoff: (line) =>
      recordHandoff(
        {
          homedir: osHomedir,
          appendFile: (path, content) => fsPromises.appendFile(path, content, 'utf-8'),
          mkdir: (path) => fsPromises.mkdir(path, { recursive: true }).then(() => undefined),
        },
        line,
      ),
    openAsset: (projectPath, relativePath) =>
      openAssetSafely(
        { projectPath, platform: process.platform, openPath: (path) => shell.openPath(path) },
        relativePath,
      ),
    savePdfAsset: (projectPath, relativePath, bytes) =>
      savePdfAssetSafely({ projectPath, platform: process.platform }, relativePath, bytes),
    exportPdf: (sender, suggestedName) => {
      const window = BrowserWindow.fromWebContents(sender as Electron.WebContents);
      if (!window) return Promise.resolve({ ok: false, reason: 'print-failed' } as const);
      return exportWebContentsToPdf(
        {
          showSaveDialog: (options) => dialog.showSaveDialog(window, options),
          printToPDF: (options) => (sender as Electron.WebContents).printToPDF(options),
          writeFile: (path, bytes) => fsPromises.writeFile(path, bytes),
        },
        suggestedName,
      );
    },
    revealAsset: (projectPath, relativePath) =>
      revealAssetSafely(
        { projectPath, platform: process.platform, showItemInFolder: shell.showItemInFolder },
        relativePath,
      ),
    popAssetMenu: (window, params) =>
      popAssetMenu({ Menu, window: window as Electron.BrowserWindow }, params),
    copyText: clipboard.writeText,
    showItemInFolder: (projectPath, allowedRoots, path) =>
      showItemInFolder(
        {
          projectPath,
          allowedRoots,
          platform: process.platform,
          showItemInFolder: shell.showItemInFolder,
        },
        path,
      ),
    defaultBugReportZipPath,
    revealExternal: (absolutePath, callerWindow) =>
      handleRevealExternal(absolutePath, {
        probe: (path) => {
          try {
            statSync(path);
            return 'exists';
          } catch (error) {
            return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable';
          }
        },
        confirmReveal: async (path) => {
          const options: MessageBoxOptions = {
            type: 'question',
            buttons: ['Reveal in Finder', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            message: `"${basename(path)}" is outside your project`,
            detail: `${path}\n\nReveal it in Finder?`,
          };
          const window = callerWindow as Electron.BrowserWindow | undefined;
          const { response } = window
            ? await dialog.showMessageBox(window, options)
            : await dialog.showMessageBox(options);
          return response === 0;
        },
        showItemInFolder: shell.showItemInFolder,
      }),
    logIpcError,
    warn: (message, details) => console.warn(message, details),
  });
}
