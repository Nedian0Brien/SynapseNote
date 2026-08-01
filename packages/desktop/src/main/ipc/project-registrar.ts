/**
 * Electron-free registration for project, recents, and worktree IPC.
 *
 * The entrypoint supplies adapters for the live WindowManager and app state.
 * Project-scoped handlers always derive their context from `event.sender`;
 * renderer payloads never choose the owning project window.
 */

import type { EntryPoint } from '../../shared/entry-point.ts';
import type { RecentProject } from '../../shared/ipc-channels.ts';
import type { createHandler } from '../../shared/ipc-handler.ts';
import type { sendToRenderer as sendToRendererImpl } from '../../shared/ipc-send.ts';
import type { BranchInfoProxyDeps } from '../branch-info-proxy.ts';
import type { AppState } from '../state-store.ts';
import type { ShareDeepLinkBranchSwitchPayload } from '../url-scheme.ts';
import type { BrowserWindowLike } from '../window-manager.ts';
import type { RecentGitInfo } from '../worktree-recents.ts';
import { registerProjectProxyIpcHandlers } from './project-proxy-registrar.ts';

type IpcHandle = ReturnType<typeof createHandler>;

interface ProjectContext {
  readonly projectPath: string;
  readonly projectName: string;
  readonly port: number;
  readonly apiOrigin: string;
  readonly ephemeral?: unknown;
}

type ProjectWindow = BrowserWindowLike;

interface IpcError {
  readonly event: 'ipc.error';
  readonly channel: string;
  readonly reason: string;
  readonly handler: string;
  readonly cause?: unknown;
}

type SessionState = ReturnType<typeof import('../state-store.ts').getProjectSessionState>;

/** Dependencies resolved by the main entrypoint. */
export interface ProjectRegistrarDeps {
  readonly handle: IpcHandle;
  readonly getWindowForWebContents: (sender: unknown) => ProjectWindow | undefined;
  readonly getProjectContext: (window: ProjectWindow | undefined) => ProjectContext | undefined;
  readonly getE2eSmoke: () => boolean;

  readonly getAppState: () => AppState;
  readonly setAppState: (state: AppState) => void;
  readonly saveAppState: (state: AppState) => void;
  readonly refreshApplicationMenu: () => void;
  readonly annotateMissing: (state: AppState) => RecentProject[];
  readonly classifyRecentGit: (projectPath: string) => Promise<RecentGitInfo>;
  readonly readWorktreeBranch: (projectPath: string) => Promise<string | null>;
  readonly removeRecentProject: (state: AppState, projectPath: string) => AppState;
  readonly getProjectSessionState: (state: AppState, projectPath: string) => SessionState;
  readonly setProjectSessionState: (
    state: AppState,
    projectPath: string,
    session: SessionState,
  ) => AppState;

  readonly isEntryPoint: (value: unknown) => value is EntryPoint;
  readonly openProject: (
    path: string,
    entryPoint: EntryPoint,
    pendingDeepLinkTarget?: { kind: 'doc' | 'folder'; path: string },
    pendingBranch?: string | null,
    pendingMultiCandidate?: boolean,
    pendingShareBranchSwitch?: ShareDeepLinkBranchSwitchPayload,
    pendingTargetMissing?: boolean,
  ) => Promise<void>;
  readonly focusWindowForProject: (projectPath: string) => ProjectWindow | null;
  readonly sendToRenderer: typeof sendToRendererImpl;
  readonly checkTargetExists: (
    projectPath: string,
    kind: 'doc' | 'folder',
    path: string,
  ) => 'exists' | 'missing' | 'unreadable';

  readonly realpath: (path: string) => string;
  readonly listWorktrees: (anchorPath: string, currentProjectPath: string) => Promise<unknown>;
  readonly checkoutWorktree: (args: { anchorPath: string; branch: string }) => Promise<unknown>;
  readonly createWorktree: (args: {
    anchorPath: string;
    branch: string;
    baseBranch?: string | null;
    baseRef?: string | null;
    remoteRef?: string | null;
    createBranch: boolean;
  }) => Promise<unknown>;

  readonly validateLocalFolderForShare: (
    folderPath: string,
    repo: {
      owner: string;
      repo: string;
    },
  ) => Promise<unknown>;
  readonly readHeadBranch: (projectPath: string) => unknown;
  readonly branchInfoProxyDeps: BranchInfoProxyDeps;
  readonly proxyFetchBranchInfo: (
    request: {
      projectPath: string;
      branch: string;
      kind: 'doc' | 'folder';
      path: string;
    },
    deps: BranchInfoProxyDeps,
  ) => Promise<unknown>;
  readonly proxyRunCheckout: (
    request: {
      projectPath: string;
      branch: string;
      fastForward?: boolean;
    },
    deps: BranchInfoProxyDeps,
  ) => Promise<unknown>;
  readonly proxyShareTargetStatus: (
    request: {
      projectPath: string;
      branch: string;
      path: string;
      kind: 'doc' | 'folder';
    },
    deps: BranchInfoProxyDeps,
  ) => Promise<unknown>;
  readonly proxyAwaitBranchSwitched: (
    request: {
      projectPath: string;
      branch: string;
      timeoutMs: number;
    },
    deps: BranchInfoProxyDeps,
  ) => Promise<unknown>;
  readonly runOkInit: (projectPath: string) => Promise<unknown>;
  readonly closeProjectWindow: (projectPath: string) => boolean;
  readonly restartAttachedServer: (
    projectPath: string,
    opts: { localOpCliArgs?: string[] },
  ) => Promise<{ ok: boolean; reason?: 'eperm' | 'other' }>;
  readonly resolveLocalOpCliArgs: () => string[];
  readonly logIpcError: (payload: IpcError) => void;
}

function contextForEvent(
  deps: ProjectRegistrarDeps,
  event: { sender: unknown },
): ProjectContext | undefined {
  return deps.getProjectContext(deps.getWindowForWebContents(event.sender));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

function isProjectOpenRequest(value: unknown): value is Record<string, unknown> {
  if (!hasStringFields(value, ['path', 'entryPoint']) || value.target !== 'new-window')
    return false;
  if (
    value.pendingDeepLinkTarget !== undefined &&
    (!hasStringFields(value.pendingDeepLinkTarget, ['path']) ||
      (value.pendingDeepLinkTarget.kind !== 'doc' && value.pendingDeepLinkTarget.kind !== 'folder'))
  ) {
    return false;
  }
  return (
    value.pendingBranch === undefined ||
    value.pendingBranch === null ||
    typeof value.pendingBranch === 'string'
  );
}

const EMPTY_SESSION: SessionState = {
  openTabs: [],
  pinnedTabIds: [],
  activeDocName: null,
  activeTabId: null,
  updatedAt: null,
};

/** Register the project/recents/worktree static IPC surface. */
export function registerProjectIpcHandlers(deps: ProjectRegistrarDeps): void {
  const { handle } = deps;

  handle('ok:project:get-info', async (event) => {
    const ctx = contextForEvent(deps, event);
    if (!deps.getWindowForWebContents(event.sender)) {
      throw new Error('webContents has no parent BrowserWindow');
    }
    if (!ctx) throw new Error('No project context for this window');
    return {
      collabUrl: `ws://localhost:${ctx.port}/collab`,
      apiOrigin: ctx.apiOrigin,
      projectPath: ctx.projectPath,
      projectName: ctx.projectName,
      mode: 'editor' as const,
      e2eSmoke: deps.getE2eSmoke(),
      singleFile: ctx.ephemeral !== undefined,
      initialDoc: null,
      freshlyCreated: false,
    };
  });

  handle('ok:project:list-recent', async () =>
    Promise.all(
      deps.annotateMissing(deps.getAppState()).map(async (entry): Promise<RecentProject> => {
        if (entry.missing) return entry;
        const [git, branch] = await Promise.all([
          deps.classifyRecentGit(entry.path),
          deps.readWorktreeBranch(entry.path),
        ]);
        if (git.gitCommonDir === null) return entry;
        return {
          ...entry,
          gitCommonDir: git.gitCommonDir,
          mainRoot: git.mainRoot ?? undefined,
          isLinkedWorktree: git.isLinkedWorktree,
          branch,
        };
      }),
    ),
  );

  handle('ok:project:remove-recent', async (_event, projectPath) => {
    if (typeof projectPath !== 'string' || projectPath.length === 0) {
      throw new Error('ok:project:remove-recent rejected: invalid projectPath');
    }
    const state = deps.removeRecentProject(deps.getAppState(), projectPath);
    deps.setAppState(state);
    deps.saveAppState(state);
    deps.refreshApplicationMenu();
    return undefined;
  });

  handle('ok:project:get-session-state', async (event) => {
    const ctx = contextForEvent(deps, event);
    return ctx ? deps.getProjectSessionState(deps.getAppState(), ctx.projectPath) : EMPTY_SESSION;
  });

  handle('ok:project:set-session-state', async (event, state) => {
    const ctx = contextForEvent(deps, event);
    if (!ctx) return undefined;
    if (!isRecord(state) || !Array.isArray(state.openTabs) || !Array.isArray(state.pinnedTabIds)) {
      return undefined;
    }
    const next = deps.setProjectSessionState(deps.getAppState(), ctx.projectPath, state);
    deps.setAppState(next);
    deps.saveAppState(next);
    return undefined;
  });

  handle('ok:project:open', async (_event, request) => {
    if (!isProjectOpenRequest(request)) return undefined;
    if (!deps.isEntryPoint(request.entryPoint)) {
      throw new Error(
        `ok:project:open rejected: invalid entryPoint '${String(request.entryPoint)}'`,
      );
    }
    const targetMissing =
      request.pendingDeepLinkTarget !== undefined &&
      deps.checkTargetExists(
        request.path,
        request.pendingDeepLinkTarget.kind,
        request.pendingDeepLinkTarget.path,
      ) === 'missing';
    if (request.pendingDeepLinkTarget !== undefined) {
      const existing = deps.focusWindowForProject(request.path);
      if (existing) {
        deps.sendToRenderer(existing.webContents, 'ok:deep-link', {
          doc: request.pendingDeepLinkTarget.path,
          kind: request.pendingDeepLinkTarget.kind,
          branch: request.pendingBranch ?? null,
          multiCandidate: request.pendingMultiCandidate === true,
          ...(targetMissing ? { targetMissing: true } : {}),
        });
        return undefined;
      }
    }
    if (request.pendingShareBranchSwitch !== undefined) {
      const existing = deps.focusWindowForProject(request.path);
      if (existing) {
        deps.sendToRenderer(existing.webContents, 'ok:share:received', {
          kind: 'project-branch-switch',
          share: request.pendingShareBranchSwitch.share,
          projectPath: request.pendingShareBranchSwitch.projectPath,
          currentBranch: request.pendingShareBranchSwitch.currentBranch,
        });
        return undefined;
      }
    }
    await deps.openProject(
      request.path,
      request.entryPoint,
      request.pendingDeepLinkTarget,
      request.pendingBranch,
      request.pendingMultiCandidate,
      request.pendingShareBranchSwitch,
      targetMissing || undefined,
    );
    return undefined;
  });

  handle('ok:worktree:dispatch', async (event, request) => {
    const rawRequest: unknown = request;
    if (
      !isRecord(rawRequest) ||
      (rawRequest.kind !== 'list' && rawRequest.kind !== 'checkout' && rawRequest.kind !== 'create')
    ) {
      return { ok: false, reason: 'no-git' } as const;
    }
    const projectPath = contextForEvent(deps, event)?.projectPath;
    if (!projectPath) {
      deps.logIpcError({
        event: 'ipc.error',
        channel: 'ok:worktree:dispatch',
        reason: 'no-git',
        handler: 'worktreeDispatch',
      });
      return { ok: false, reason: 'no-git' } as const;
    }
    let anchor: string;
    try {
      anchor = deps.realpath(projectPath);
    } catch {
      anchor = projectPath;
    }
    if (request.kind === 'list') return deps.listWorktrees(anchor, anchor) as never;
    if (request.kind === 'checkout') {
      return deps.checkoutWorktree({ anchorPath: anchor, branch: request.branch }) as never;
    }
    return deps.createWorktree({ anchorPath: anchor, ...request }) as never;
  });

  registerProjectProxyIpcHandlers(deps);

  handle('ok:project:close', async (event) => {
    const ctx = contextForEvent(deps, event);
    if (ctx) deps.closeProjectWindow(ctx.projectPath);
    return undefined;
  });

  handle('ok:project:restart-server', async (_event, projectPath) => {
    if (typeof projectPath !== 'string') return { ok: false, reason: 'other' };
    try {
      const outcome = await deps.restartAttachedServer(projectPath, {
        localOpCliArgs: deps.resolveLocalOpCliArgs(),
      });
      if (!outcome.ok) {
        deps.logIpcError({
          event: 'ipc.error',
          channel: 'ok:project:restart-server',
          reason: outcome.reason ?? 'other',
          handler: 'restartServer',
        });
      }
      return outcome as never;
    } catch (cause) {
      deps.logIpcError({
        event: 'ipc.error',
        channel: 'ok:project:restart-server',
        reason: 'other',
        handler: 'restartServer',
        cause,
      });
      return { ok: false, reason: 'other' };
    }
  });
}
