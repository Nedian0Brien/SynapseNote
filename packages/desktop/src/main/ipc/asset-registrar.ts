/**
 * Electron-free registration of the project-scoped shell and asset IPC surface.
 *
 * The main entry resolves Electron values (windows, shell, dialogs, clipboard)
 * into the explicit dependencies below. This module owns the common security
 * invariant: every renderer-supplied asset path is scoped to the calling
 * window's project before it reaches an asset or Cursor operation.
 */

import { dirname } from 'node:path';
import type { RequestChannels } from '../../shared/ipc-channels.ts';
import { handleShellOpenExternal } from '../shell-allowlist.ts';
import { isExportPdfRequest, isHandoffStatsLine, isWebPreviewRequest } from './asset-request.ts';
import { registerAssetMenuIpc } from './asset-menu-registrar.ts';

type AssetIpcChannel =
  | 'ok:shell:open-external'
  | 'ok:shell:detect-protocol'
  | 'ok:shell:spawn-cursor'
  | 'ok:shell:record-handoff'
  | 'ok:shell:open-asset'
  | 'ok:shell:reveal-asset'
  | 'ok:shell:show-asset-menu'
  | 'ok:shell:show-item-in-folder'
  | 'ok:shell:reveal-external';

type OpenAssetResult = RequestChannels['ok:shell:open-asset']['result'];
type RevealAssetResult = RequestChannels['ok:shell:reveal-asset']['result'];
type SpawnCursorResult = RequestChannels['ok:shell:spawn-cursor']['result'];
type RevealExternalResult = RequestChannels['ok:shell:reveal-external']['result'];
type AssetMenuParams = RequestChannels['ok:shell:show-asset-menu']['args'][0];

export interface AssetIpcEvent {
  readonly sender: unknown;
}

export type AssetIpcHandler = (
  event: AssetIpcEvent,
  ...args: readonly unknown[]
) => unknown | Promise<unknown>;

export type AssetIpcRegistrar = (channel: AssetIpcChannel, handler: AssetIpcHandler) => void;

interface AssetMenuActions {
  readonly reveal: () => Promise<void>;
  readonly openInDefault: () => Promise<void>;
  readonly copyLink: () => void;
}

interface AssetMenuRegistration {
  readonly kind: AssetMenuParams['kind'];
  readonly platform: NodeJS.Platform;
  readonly actions: AssetMenuActions;
}

interface IpcError {
  readonly event: 'ipc.error';
  readonly channel: string;
  readonly reason: string;
  readonly handler: string;
}

interface Refusal {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Dependencies resolved by the Electron main entry. */
export interface AssetRegistrarDeps {
  readonly register: AssetIpcRegistrar;
  readonly platform: NodeJS.Platform;
  readonly getWindowForWebContents: (sender: unknown) => unknown | undefined;
  readonly getProjectPath: (window: unknown) => string | undefined;

  /** Raw Electron shell method; this registrar applies the URL allowlist. */
  readonly openExternal: (url: string) => Promise<void>;
  readonly fetchWebPreviewMetadata: (
    url: string,
  ) => Promise<RequestChannels['ok:shell:open-external']['result']>;
  readonly detectProtocol: (
    scheme: string,
  ) => Promise<RequestChannels['ok:shell:detect-protocol']['result']>;
  readonly spawnCursor: (
    projectPath: string | undefined,
    path: string,
  ) => Promise<SpawnCursorResult>;
  readonly recordHandoff: (
    line: RequestChannels['ok:shell:record-handoff']['args'][0],
  ) => Promise<void>;

  readonly openAsset: (projectPath: string, relPath: string) => Promise<OpenAssetResult>;
  readonly savePdfAsset: (
    projectPath: string,
    relPath: string,
    bytes: Uint8Array,
  ) => Promise<OpenAssetResult>;
  readonly exportPdf: (sender: unknown, suggestedName: string) => Promise<OpenAssetResult>;
  readonly revealAsset: (projectPath: string, relPath: string) => Promise<RevealAssetResult>;
  readonly popAssetMenu: (window: unknown, params: AssetMenuRegistration) => void;
  readonly copyText: (text: string) => void;
  readonly showItemInFolder: (
    projectPath: string | undefined,
    allowedRoots: readonly string[],
    path: string,
  ) => Refusal;
  readonly defaultBugReportZipPath: () => string;
  readonly revealExternal: (
    absPath: string,
    callerWindow: unknown | undefined,
  ) => Promise<RevealExternalResult>;
  readonly logIpcError: (payload: IpcError) => void;
  readonly warn: (message: string, details: { readonly reason: string | undefined }) => void;
}

function projectPathForEvent(deps: AssetRegistrarDeps, event: AssetIpcEvent): string | undefined {
  const callerWindow = deps.getWindowForWebContents(event.sender);
  return callerWindow === undefined ? undefined : deps.getProjectPath(callerWindow);
}

function logFailure(
  deps: AssetRegistrarDeps,
  channel: string,
  handler: string,
  outcome: Refusal,
): void {
  if (!outcome.ok) {
    deps.logIpcError({
      event: 'ipc.error',
      channel,
      reason: outcome.reason ?? 'unknown',
      handler,
    });
  }
}

/**
 * Register the shell/asset IPC handlers without importing Electron. The
 * controller supplies the narrow Electron adapters, while this helper keeps
 * project-scope derivation and all refusal logging co-located.
 */
export function registerAssetIpcHandlers(deps: AssetRegistrarDeps): void {
  const shellOpenExternal = handleShellOpenExternal({ openExternal: deps.openExternal });

  deps.register('ok:shell:open-external', async (_event, request) => {
    if (typeof request !== 'string') {
      if (!isWebPreviewRequest(request)) {
        return undefined;
      }
      return deps.fetchWebPreviewMetadata(request.url);
    }
    await shellOpenExternal(request);
    return undefined;
  });

  deps.register('ok:shell:detect-protocol', async (_event, scheme) => {
    return typeof scheme === 'string' ? deps.detectProtocol(scheme) : { installed: false };
  });

  deps.register('ok:shell:spawn-cursor', async (event, path) => {
    if (typeof path !== 'string') return { ok: false, reason: 'invalid-path' } as const;
    const outcome = await deps.spawnCursor(projectPathForEvent(deps, event), path);
    logFailure(deps, 'ok:shell:spawn-cursor', 'spawnCursor', outcome);
    return outcome;
  });

  deps.register('ok:shell:record-handoff', async (_event, line) => {
    if (!isHandoffStatsLine(line)) return undefined;
    await deps.recordHandoff(line);
    return undefined;
  });

  deps.register('ok:shell:open-asset', async (event, relPathOrRequest, pdfBytes) => {
    const callerWindow = deps.getWindowForWebContents(event.sender);
    if (typeof relPathOrRequest !== 'string') {
      if (
        !isExportPdfRequest(relPathOrRequest) ||
        pdfBytes !== undefined ||
        callerWindow === undefined
      ) {
        return { ok: false, reason: 'print-failed' } as const;
      }
      const outcome = await deps.exportPdf(event.sender, relPathOrRequest.suggestedName);
      logFailure(deps, 'ok:shell:open-asset', 'exportPdf', outcome);
      return outcome;
    }

    const relPath = relPathOrRequest;
    const projectPath = callerWindow === undefined ? undefined : deps.getProjectPath(callerWindow);
    if (!projectPath) {
      const reason = pdfBytes ? 'invalid-path' : 'path-escape';
      deps.logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:open-asset',
        reason,
        handler: pdfBytes ? 'savePdf' : 'openAsset',
      });
      return { ok: false, reason } as const;
    }

    if (pdfBytes !== undefined && !(pdfBytes instanceof Uint8Array)) {
      return { ok: false, reason: 'invalid-pdf' } as const;
    }
    const outcome = pdfBytes
      ? await deps.savePdfAsset(projectPath, relPath, pdfBytes)
      : await deps.openAsset(projectPath, relPath);
    logFailure(deps, 'ok:shell:open-asset', pdfBytes ? 'savePdf' : 'openAsset', outcome);
    return outcome;
  });

  deps.register('ok:shell:reveal-asset', async (event, relPath) => {
    if (typeof relPath !== 'string') return { ok: false, reason: 'path-escape' } as const;
    const projectPath = projectPathForEvent(deps, event);
    if (!projectPath) {
      deps.logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:reveal-asset',
        reason: 'path-escape',
        handler: 'revealAsset',
      });
      return { ok: false, reason: 'path-escape' } as const;
    }
    const outcome = await deps.revealAsset(projectPath, relPath);
    logFailure(deps, 'ok:shell:reveal-asset', 'revealAsset', outcome);
    return outcome;
  });

  registerAssetMenuIpc(deps);

  deps.register('ok:shell:show-item-in-folder', async (event, path) => {
    if (typeof path !== 'string') return undefined;
    const result = deps.showItemInFolder(
      projectPathForEvent(deps, event),
      [dirname(deps.defaultBugReportZipPath())],
      path,
    );
    if (!result.ok) {
      deps.warn('[main] show-item-in-folder refused', { reason: result.reason });
    }
    return undefined;
  });

  deps.register('ok:shell:reveal-external', async (event, absPath) => {
    if (typeof absPath !== 'string') return { ok: false, reason: 'invalid-path' } as const;
    const callerWindow = deps.getWindowForWebContents(event.sender);
    const result = await deps.revealExternal(absPath, callerWindow);
    if (!result.ok) {
      deps.warn('[main] reveal-external refused', { reason: result.reason });
    }
    return result;
  });
}
