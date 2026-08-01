import { describe, expect, test } from 'bun:test';
import { registerProjectIpcHandlers } from './project-registrar.ts';

describe('registerProjectIpcHandlers', () => {
  test('derives project information from the IPC sender window', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
    const sender = { id: 1 };

    registerProjectIpcHandlers({
      handle: (channel, handler) => handlers.set(channel, handler),
      getWindowForWebContents: (candidate) => (candidate === sender ? { id: 7 } : undefined),
      getProjectContext: (window) =>
        window === undefined
          ? undefined
          : {
              projectPath: '/projects/owned-by-sender',
              projectName: 'Owned',
              port: 4321,
              apiOrigin: 'http://localhost:4321',
            },
      getE2eSmoke: () => false,
      getAppState: () => ({ recentProjects: [] }) as never,
      setAppState: () => {},
      saveAppState: () => {},
      refreshApplicationMenu: () => {},
      annotateMissing: () => [],
      classifyRecentGit: async () => ({
        gitCommonDir: null,
        mainRoot: null,
        isLinkedWorktree: false,
      }),
      readWorktreeBranch: async () => null,
      removeRecentProject: (state) => state,
      getProjectSessionState: () => ({
        openTabs: [],
        pinnedTabIds: [],
        activeDocName: null,
        activeTabId: null,
        updatedAt: null,
      }),
      setProjectSessionState: (state) => state,
      isEntryPoint: () => false,
      openProject: async () => {},
      focusWindowForProject: () => null,
      sendToRenderer: () => {},
      checkTargetExists: () => false,
      realpath: (path) => path,
      listWorktrees: async () => ({ ok: false, reason: 'no-git' }),
      checkoutWorktree: async () => ({ ok: false, reason: 'no-git' }),
      createWorktree: async () => ({ ok: false, reason: 'no-git' }),
      validateLocalFolderForShare: async () => ({ ok: false, reason: 'not-git' }),
      readHeadBranch: () => ({ branch: null, detached: false }),
      branchInfoProxyDeps: {} as never,
      proxyFetchBranchInfo: async () => null,
      proxyRunCheckout: async () => null,
      proxyShareTargetStatus: async () => null,
      proxyAwaitBranchSwitched: async () => ({ ok: false, reason: 'timeout' }),
      runOkInit: async () => ({ ok: false, reason: 'unknown', message: 'unused' }),
      closeProjectWindow: () => false,
      restartAttachedServer: async () => ({ ok: false, reason: 'other' }),
      resolveLocalOpCliArgs: () => [],
      logIpcError: () => {},
    });

    await expect(handlers.get('ok:project:get-info')?.({ sender })).resolves.toMatchObject({
      projectPath: '/projects/owned-by-sender',
      projectName: 'Owned',
      collabUrl: 'ws://localhost:4321/collab',
    });
  });
});
