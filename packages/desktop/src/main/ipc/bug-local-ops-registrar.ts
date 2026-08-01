/** Navigator-local operation and skill-install IPC registrar. */
import type { App, Shell } from 'electron';
import type { createHandler } from '../../shared/ipc-handler.ts';
import { logIpcError } from '../ipc-log.ts';
import { handleBuildAndOpen, handleDetectClaudeDesktop } from './install-skill.ts';
import {
  createLocalOpState,
  handleAuthCancel,
  handleAuthRepos,
  handleAuthStart,
  handleAuthStatus,
  handleCloneCancel,
  handleCloneStart,
  type LocalOpDeps,
} from './local-op.ts';

export interface BugLocalOpsRegistrarDeps {
  handle: ReturnType<typeof createHandler>;
  app: Pick<App, 'getPath' | 'getVersion'>;
  shell: Pick<Shell, 'openPath'>;
  resolveCliArgs: LocalOpDeps['resolveCliArgs'];
}

/**
 * This surface deliberately owns a fresh local-op state object. It serves the
 * Navigator (which has no API server), so it must not read renderer state or
 * borrow an editor-window singleton.
 */
export function registerBugLocalOpsIpc(deps: BugLocalOpsRegistrarDeps): void {
  const localOpDeps: LocalOpDeps = {
    resolveCliArgs: deps.resolveCliArgs,
    state: createLocalOpState(),
  };

  deps.handle('ok:skill:detect-claude-desktop', async () => handleDetectClaudeDesktop());
  deps.handle('ok:skill:build-and-open', async (_event, opts) => {
    const result = await handleBuildAndOpen({
      app: deps.app,
      shell: deps.shell,
      force: opts?.force,
    });
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:skill:build-and-open',
        reason: result.reason,
        handler: 'handleBuildAndOpen',
        cause: result.message !== undefined ? { message: result.message } : undefined,
      });
    }
    return result;
  });
  deps.handle('ok:local-op:auth:start', async (event) => {
    const result = handleAuthStart(localOpDeps, event.sender);
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:local-op:auth:start',
        reason: result.error,
        handler: 'handleAuthStart',
      });
    }
    return result;
  });
  deps.handle('ok:local-op:auth:cancel', async (_event, streamId) => {
    handleAuthCancel(localOpDeps, streamId);
    return undefined;
  });
  deps.handle('ok:local-op:clone:start', async (event, request) => {
    const result = handleCloneStart(localOpDeps, event.sender, request);
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:local-op:clone:start',
        reason: result.error,
        handler: 'handleCloneStart',
      });
    }
    return result;
  });
  deps.handle('ok:local-op:clone:cancel', async (_event, streamId) => {
    handleCloneCancel(localOpDeps, streamId);
    return undefined;
  });
  deps.handle('ok:local-op:auth:status', async (_event, request) =>
    handleAuthStatus(localOpDeps, request),
  );
  deps.handle('ok:local-op:auth:repos', async (_event, request) =>
    handleAuthRepos(localOpDeps, request),
  );
}
