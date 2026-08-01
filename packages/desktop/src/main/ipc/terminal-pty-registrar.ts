/** Sender-scoped terminal PTY IPC registrar. */

import { homedir as osHomedir } from 'node:os';
import { classifyExistingMcpEntry, EDITOR_TARGETS } from '@nedian0brien/synapsenote';
import { TERMINAL_CLIS, type TerminalCli } from '@nedian0brien/synapsenote-core';
import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { ClaudeReadiness, CliReadiness } from '../../shared/bridge-contract.ts';
import type { createHandler } from '../../shared/ipc-handler.ts';
import {
  buildCliChatCommand,
  buildCliChatShellCommand,
  isCliChatLaunchInput,
} from '../cli-chat-command.ts';
import { listNativeCliChatSessions } from '../cli-chat-sessions.ts';
import { getLogger } from '../desktop-logger.ts';
import { logIpcError } from '../ipc-log.ts';
import { isTerminalConsented, isTerminalConsentedWithGrace } from '../terminal-consent.ts';
import {
  clampPtyDimension,
  type createTerminalManager,
  DEFAULT_PTY_COLS,
  DEFAULT_PTY_ROWS,
} from '../terminal-manager.ts';

type TerminalManager = ReturnType<typeof createTerminalManager>;

export interface TerminalPtyRegistrarDeps {
  handle: ReturnType<typeof createHandler>;
  terminalManager: TerminalManager;
  /** Derives the caller's project root from main-owned window state. */
  resolveProjectRoot: (event: IpcMainInvokeEvent) => string | null;
  isProjectClaudeMcpOwn: (projectRoot: string | undefined) => boolean;
  resolveClaudeReadiness: (projectRoot: string | undefined) => Promise<ClaudeReadiness>;
  rewireClaudeMcp: (event: IpcMainInvokeEvent) => Promise<string | undefined>;
  getDockVisible: (windowId: number) => boolean;
  resolveCliOnPath: (cli: TerminalCli) => Promise<CliReadiness>;
  resolveCliInstalledMap: () => Promise<Record<TerminalCli, boolean>>;
}

export function registerTerminalPtyIpc(deps: TerminalPtyRegistrarDeps): void {
  const { handle, terminalManager } = deps;
  handle('ok:pty:create', async (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const projectRoot = deps.resolveProjectRoot(event);
    if (!win || !projectRoot) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:pty:create',
        reason: 'no-project',
        handler: 'createPty',
      });
      return { ok: false, reason: 'no-project' };
    }
    if (!isTerminalConsented(projectRoot) && !(await isTerminalConsentedWithGrace(projectRoot))) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:pty:create',
        reason: 'not-consented',
        handler: 'createPty',
      });
      return { ok: false, reason: 'not-consented' };
    }
    return terminalManager.create({
      windowId: win.id,
      webContents: win.webContents,
      projectRoot,
      cols: clampPtyDimension(opts.cols, DEFAULT_PTY_COLS),
      rows: clampPtyDimension(opts.rows, DEFAULT_PTY_ROWS),
      ...(opts.launchCommand === undefined ? {} : { launchCommand: opts.launchCommand }),
      ...(opts.privateHistory ? { privateHistory: true } : {}),
    });
  });
  handle('ok:pty:input', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (isCliChatLaunchInput(req.chat)) {
        const projectRoot = deps.resolveProjectRoot(event);
        const claudeMcpOwn =
          req.chat.cli === 'claude' && deps.isProjectClaudeMcpOwn(projectRoot ?? undefined);
        const autoApproveOkTools =
          req.chat.autoApproveOkTools !== false &&
          (claudeMcpOwn ||
            (req.chat.cli === 'codex' &&
              classifyExistingMcpEntry(EDITOR_TARGETS.codex, '', osHomedir()).kind === 'present'));
        const command = buildCliChatCommand(req.chat, {
          autoApproveOkTools,
          mcpPreApprove: claudeMcpOwn,
          dataPlaneOnlyWrites: process.env.SYNAPSENOTE_DATABASE_SANDBOX_MODE === 'data-plane-only',
        });
        terminalManager.input({
          windowId: win.id,
          ptyId: req.ptyId,
          data: `${buildCliChatShellCommand(command)}\r`,
        });
      } else if (typeof req.data === 'string') {
        terminalManager.input({ windowId: win.id, ptyId: req.ptyId, data: req.data });
      }
    }
    return undefined;
  });
  handle('ok:pty:resize', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win)
      terminalManager.resize({
        windowId: win.id,
        ptyId: req.ptyId,
        cols: clampPtyDimension(req.cols, DEFAULT_PTY_COLS),
        rows: clampPtyDimension(req.rows, DEFAULT_PTY_ROWS),
      });
    return undefined;
  });
  handle('ok:pty:kill', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) terminalManager.kill({ windowId: win.id, ptyId: req.ptyId });
    return undefined;
  });
  handle('ok:pty:drain', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) terminalManager.drain({ windowId: win.id, ptyId: req.ptyId, bytes: req.bytes });
    return undefined;
  });
  handle('ok:pty:list', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? terminalManager.listSessions(win.id) : [];
  });
  handle('ok:terminal:cli-chat-sessions', async (event) => {
    const projectRoot = deps.resolveProjectRoot(event);
    return projectRoot === null
      ? []
      : listNativeCliChatSessions({ homeDir: osHomedir(), projectRoot });
  });
  handle('ok:pty:adopt', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:pty:adopt',
        reason: 'unknown-session',
        handler: 'adoptPty',
      });
      return { ok: false, reason: 'unknown-session' };
    }
    return terminalManager.adoptSession({
      windowId: win.id,
      ptyId: req.ptyId,
      webContents: win.webContents,
    });
  });
  handle('ok:pty:set-meta', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win)
      terminalManager.setSessionMeta({
        windowId: win.id,
        ptyId: req.ptyId,
        customLabel: req.customLabel,
        ordinal: req.ordinal,
      });
    return undefined;
  });
  handle('ok:pty:set-order', async (event, req) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win)
      terminalManager.setSessionOrder({ windowId: win.id, orderedPtyIds: req.orderedPtyIds });
    return undefined;
  });
  handle('ok:terminal:claude-assist', async (event, req) => {
    const rewireError = req.action === 'rewire' ? await deps.rewireClaudeMcp(event) : undefined;
    const readiness = await deps.resolveClaudeReadiness(
      deps.resolveProjectRoot(event) ?? undefined,
    );
    return rewireError === undefined ? readiness : { ...readiness, rewireError };
  });
  handle('ok:terminal:cli-preflight', async (_event, req): Promise<CliReadiness> => {
    if (!(req.cli in TERMINAL_CLIS)) {
      getLogger('terminal').warn({ cli: req.cli }, 'cli-preflight: unknown cli discriminant');
      return { onPath: 'unknown' };
    }
    return deps.resolveCliOnPath(req.cli);
  });
  handle(
    'ok:terminal:cli-installed-map',
    async (): Promise<Record<TerminalCli, boolean>> => deps.resolveCliInstalledMap(),
  );
  handle('ok:terminal:dock-state', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { visible: win ? deps.getDockVisible(win.id) : false };
  });
}
