/** Main-owned terminal capability construction and sender-scoped IPC wiring. */
import { randomUUID } from 'node:crypto';
import { homedir as osHomedir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow, utilityProcess } from 'electron';
import { sendToRenderer } from '../shared/ipc-send.ts';
import type { DesktopIpcBindings, DesktopIpcHandler } from './desktop-ipc-composition.ts';
import { getLogger } from './desktop-logger.ts';
import { registerTerminalPtyIpc } from './ipc/terminal-pty-registrar.ts';
import { createTerminalManager, type PtyUtilityLike } from './terminal-manager.ts';
import {
  recordConcurrentSessions,
  recordShellExit,
  recordTerminalSession,
} from './terminal-telemetry.ts';
import { getTerminalWindowContext, resolvePtyProjectRoot } from './terminal-window-registry.ts';
import type { BrowserWindowLike } from './window-manager.ts';

interface DesktopTerminalIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

/**
 * Builds the main-owned PTY manager once and exposes only sender-derived roots
 * to the terminal registrar. The renderer never supplies a project path.
 */
export function registerDesktopTerminalIpc({ handle, bindings }: DesktopTerminalIpcDeps): void {
  const terminalManager = createTerminalManager({
    forkPtyHost: () =>
      utilityProcess.fork(join(__dirname, 'utility/pty-host.js')) as unknown as PtyUtilityLike,
    sendData: (webContents, payload) => sendToRenderer(webContents, 'ok:pty:data', payload),
    sendExit: (webContents, payload) => sendToRenderer(webContents, 'ok:pty:exit', payload),
    newPtyId: randomUUID,
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (token) => clearTimeout(token as ReturnType<typeof setTimeout>),
    logger: { warn: (data) => getLogger('terminal').warn(data, 'unexpected pty-host message') },
    recordShellExit,
    recordTerminalSession,
    recordConcurrentSessions,
  });
  bindings.setTerminalReaper(terminalManager);

  registerTerminalPtyIpc({
    handle,
    terminalManager,
    resolveProjectRoot: (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const editorContext = window
        ? bindings.getWindowManager()?.getContextForBrowserWindow(window as BrowserWindowLike)
        : null;
      return resolvePtyProjectRoot({
        editorProjectPath: editorContext?.projectPath ?? null,
        terminalWindow: window ? getTerminalWindowContext(window.id) : undefined,
        homedir: osHomedir(),
      });
    },
    isProjectClaudeMcpOwn: bindings.isProjectClaudeMcpOwn,
    resolveClaudeReadiness: bindings.resolveClaudeReadiness,
    rewireClaudeMcp: bindings.rewireClaudeMcp,
    getDockVisible: bindings.getDockVisible,
    resolveCliOnPath: bindings.resolveCliOnPath,
    resolveCliInstalledMap: bindings.resolveCliInstalledMap,
  });
}
